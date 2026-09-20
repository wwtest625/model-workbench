package model

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"regexp"
	"strings"

	"metax-workbench/internal/config"
	"metax-workbench/internal/host"
	"metax-workbench/internal/runner"
)

type ModelCard struct {
	Name          string `json:"name"`
	ServiceName   string `json:"service_name"`
	ContainerName string `json:"container_name"`
	Engine        string `json:"engine"` // vLLM / SGLang
	MacaVersion   string `json:"maca_version,omitempty"`
	TP            int    `json:"tp"`
	Port          int    `json:"port"`
	Script        string `json:"script"`
	Image         string `json:"image"`
	Status        string `json:"status"` // READY, WARMING_UP, LOADING_WEIGHTS, INIT, FAILED, STOPPED
	StatusDetail  string `json:"status_detail,omitempty"`
	PingMs        int64  `json:"ping_ms,omitempty"`
	Uptime        string `json:"uptime,omitempty"`
	PID           string `json:"pid"`
}

var macaVerRegex = regexp.MustCompile(`(maca\.ai\d+(?:\.\d+)+|ai\d+(?:\.\d+)+)`)

func extractMacaVersion(image string) string {
	if image == "" {
		return ""
	}
	return macaVerRegex.FindString(image)
}

type ModelManager struct{}

var defaultModelManager *ModelManager

func GetModelManager() *ModelManager {
	if defaultModelManager == nil {
		defaultModelManager = &ModelManager{}
	}
	return defaultModelManager
}

type smartProbeItem struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Detail  string `json:"detail"`
	PingMs  int64  `json:"ping_ms"`
	Uptime  string `json:"uptime"`
	Port    int    `json:"port"`
	PID     string `json:"pid"`
	TP      int    `json:"tp"`
	Engine  string `json:"engine"`
	Script  string `json:"script"`
}

func (m *ModelManager) DiscoverModels() ([]ModelCard, string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return nil, "", err
	}

	workspace := h.Workspace
	if workspace == "" {
		workspace = "/home/workspace"
	}

	portMap := buildPortMap(h.Models)
	portMapBytes, _ := json.Marshal(portMap)
	portMapJSON := string(portMapBytes)

	sh := fmt.Sprintf(`python3 -c '
import subprocess, json, re, time, urllib.request, glob, os

workspace = "%s"
port_map = %s

result = {
    "docker_ps": [],
    "probe": {},
    "scripts": [],
    "compose_services": [],
    "running_cmd": ""
}

try:
    ps_out = subprocess.check_output(["docker", "ps", "-a", "--format", "{{.Names}}|||{{.Image}}|||{{.Status}}|||{{.Ports}}"], text=True)
    for line in ps_out.strip().split("\n"):
        if not line.strip() or "|||" not in line:
            continue
        parts = line.strip().split("|||")
        c_name = parts[0].strip()
        c_img = parts[1].strip() if len(parts) > 1 else ""
        c_status = parts[2].strip() if len(parts) > 2 else ""
        c_ports = parts[3].strip() if len(parts) > 3 else ""
        result["docker_ps"].append({
            "name": c_name,
            "image": c_img,
            "status": c_status,
            "ports": c_ports
        })

        name_lower = c_name.lower()
        is_up = c_status.lower().startswith("up")

        info = {
            "name": c_name,
            "status": "STOPPED",
            "detail": "",
            "ping_ms": 0,
            "uptime": c_status,
            "port": 0,
            "pid": "",
            "tp": 0,
            "engine": "",
            "script": ""
        }

        if is_up:
            target_port = port_map.get(name_lower)
            if not target_port:
                for k, p in port_map.items():
                    if k in name_lower or name_lower in k:
                        target_port = p
                        break

            insp_cmd = ""
            insp_img = ""
            try:
                insp_raw = subprocess.check_output(["docker", "inspect", "-f", "{{.State.Pid}}|||{{.Config.Cmd}}|||{{.Config.Image}}", c_name], text=True).strip()
                if "|||" in insp_raw:
                    iparts = insp_raw.split("|||")
                    if iparts[0].strip() and iparts[0].strip() != "0":
                        info["pid"] = iparts[0].strip()
                    if len(iparts) > 1:
                        insp_cmd = iparts[1].strip()
                    if len(iparts) > 2:
                        insp_img = iparts[2].strip()
            except Exception:
                pass

            logs_tail = ""
            try:
                logs_tail = subprocess.check_output(["docker", "logs", "--tail", "150", c_name], text=True, stderr=subprocess.STDOUT)
            except Exception:
                pass

            cmd_and_logs = (insp_cmd + " " + logs_tail + " " + insp_img).lower()

            if not target_port:
                m_p = re.search(r"port[=:\s]+(\d+)", logs_tail, re.I) or re.search(r"running on http://[^:]+:(\d+)", logs_tail) or re.search(r"--port[=\s]+(\d+)", insp_cmd)
                if m_p:
                    target_port = int(m_p.group(1))

            if target_port:
                info["port"] = target_port

            if "vllm" in name_lower or "vllm" in insp_cmd.lower():
                info["engine"] = "vLLM"
            elif "sglang" in name_lower or "sglang" in insp_cmd.lower():
                info["engine"] = "SGLang"
            elif "lmdeploy" in cmd_and_logs:
                info["engine"] = "LMDeploy"
            elif "tgi" in cmd_and_logs:
                info["engine"] = "TGI"
            elif "ollama" in cmd_and_logs:
                info["engine"] = "Ollama"
            elif "sglang" in cmd_and_logs and "vllm" not in cmd_and_logs:
                info["engine"] = "SGLang"
            elif "vllm" in cmd_and_logs:
                info["engine"] = "vLLM"

            m_tp = re.search(r"(?:-tp|--tensor-parallel-size)[=\s]+(\d+)", cmd_and_logs) or re.search(r"\btp[=:\s]+(\d+)", cmd_and_logs)
            if m_tp:
                info["tp"] = int(m_tp.group(1))
            else:
                m_cuda = re.search(r"cuda_visible_devices[=\s]+([0-9,]+)", cmd_and_logs)
                if m_cuda:
                    devs = [x for x in m_cuda.group(1).split(",") if x.strip()]
                    if devs:
                        info["tp"] = len(devs)

            m_sh = re.search(r"start_[\w-]+\.sh", insp_cmd) or re.search(r"start_[\w-]+\.sh", logs_tail)
            if m_sh:
                info["script"] = m_sh.group(0)

            is_ready = False
            if target_port:
                t0 = time.time()
                try:
                    req = urllib.request.Request(f"http://127.0.0.1:{target_port}/v1/models", headers={"User-Agent": "Probe"})
                    with urllib.request.urlopen(req, timeout=0.8) as resp:
                        if resp.status == 200:
                            latency = int((time.time() - t0) * 1000)
                            info["status"] = "READY"
                            info["detail"] = f"服务正常提供推理 (端口 {target_port})"
                            info["ping_ms"] = latency
                            is_ready = True
                except Exception:
                    pass

            if not is_ready:
                if re.search(r"(Application startup complete|Uvicorn running on|The server is ready to accept requests|ready to accept incoming|Route: /v1/chat/completions)", logs_tail):
                    info["status"] = "READY"
                    p_str = f" (端口 {target_port})" if target_port else ""
                    info["detail"] = f"服务正常提供推理{p_str}"
                elif re.search(r"(CUDA out of memory|OutOfMemoryError|Killed|Segmentation fault|Fatal error|RuntimeError: CUDA)", logs_tail, re.I):
                    m_err = re.search(r"(CUDA out of memory[^\n]*|OutOfMemoryError[^\n]*|RuntimeError:[^\n]*)", logs_tail)
                    info["status"] = "FAILED"
                    info["detail"] = m_err.group(1)[:80] if m_err else "显存溢出 (OOM) 或运行时崩溃"
                elif re.search(r"(Capturing CUDA graph|Profiling KV cache|Allocating.*for KV cache|warmup|Capturing graph)", logs_tail, re.I):
                    info["status"] = "WARMING_UP"
                    info["detail"] = "KV Cache 分配与计算图预热中 (即将就绪)"
                elif re.search(r"(Loading model weights|safetensors|Loading checkpoint shards|Loading safetensors)", logs_tail, re.I):
                    info["status"] = "LOADING_WEIGHTS"
                    info["detail"] = "正在载入多卡权重切片..."
                else:
                    info["status"] = "INIT"
                    info["detail"] = "初始化运行环境与通信拓扑中..."

            if not result["running_cmd"] and insp_cmd:
                result["running_cmd"] = insp_cmd

        result["probe"][name_lower] = info

    # 解析 docker-compose-models.yml 中的未启动服务定义
    compose_path = os.path.join(workspace, "docker-compose-models.yml")
    if os.path.exists(compose_path):
        try:
            with open(compose_path, "r", errors="ignore") as f:
                c_text = f.read()
            curr_svc = None
            svc_info = {}
            for line in c_text.splitlines():
                if line.strip().startswith("#"):
                    continue
                m_svc = re.match(r"^[ ]{2}([a-zA-Z0-9_.-]+):[ ]*$", line)
                if m_svc:
                    if curr_svc and svc_info:
                        result["compose_services"].append(svc_info)
                    curr_svc = m_svc.group(1)
                    svc_info = {
                        "service_name": curr_svc,
                        "container_name": curr_svc,
                        "image": "",
                        "command": "",
                        "script": ""
                    }
                elif curr_svc:
                    if re.match(r"^[a-zA-Z0-9_.-]+:[ ]*$", line):
                        if curr_svc and svc_info:
                            result["compose_services"].append(svc_info)
                        curr_svc = None
                        svc_info = {}
                        continue
                    m_cn = re.search(r"container_name:\s*([a-zA-Z0-9_.-]+)", line)
                    if m_cn:
                        svc_info["container_name"] = m_cn.group(1)
                    m_im = re.search(r"image:\s*([^\s#]+)", line)
                    if m_im:
                        svc_info["image"] = m_im.group(1)
                    m_sh = re.search(r"start_[\w-]+\.sh", line)
                    if m_sh:
                        svc_info["script"] = m_sh.group(0)
            if curr_svc and svc_info:
                result["compose_services"].append(svc_info)
        except Exception:
            pass

    for f in glob.glob(os.path.join(workspace, "*.sh")) + glob.glob(os.path.join(workspace, "*", "*.sh")):
        result["scripts"].append(os.path.basename(f))

except Exception as e:
    result["error"] = str(e)

print(json.dumps(result, ensure_ascii=False))
'`, workspace, portMapJSON)

	res, err := runner.RunCmd(h.SSHAlias, sh, 12)
	if err != nil {
		return nil, "", err
	}

	type remoteComposeService struct {
		ServiceName   string `json:"service_name"`
		ContainerName string `json:"container_name"`
		Image         string `json:"image"`
		Command       string `json:"command"`
		Script        string `json:"script"`
	}

	type remoteProbeResponse struct {
		DockerPs []struct {
			Name   string `json:"name"`
			Image  string `json:"image"`
			Status string `json:"status"`
			Ports  string `json:"ports"`
		} `json:"docker_ps"`
		Probe           map[string]smartProbeItem `json:"probe"`
		Scripts         []string                  `json:"scripts"`
		ComposeServices []remoteComposeService   `json:"compose_services"`
		RunningCmd      string                    `json:"running_cmd"`
		Error           string                    `json:"error"`
	}

	var pResp remoteProbeResponse
	cleanOutput := strings.TrimSpace(res.Stdout)
	if err := json.Unmarshal([]byte(cleanOutput), &pResp); err != nil {
		log.Printf("[DiscoverModels] JSON unmarshal error: %v, raw: %s", err, cleanOutput)
		return nil, "", err
	}
	log.Printf("[DiscoverModels] host: %s, compose_services count: %d, docker_ps: %d, err: %s", h.Name, len(pResp.ComposeServices), len(pResp.DockerPs), pResp.Error)

	runningCmd := pResp.RunningCmd
	probeMap := make(map[string]smartProbeItem)
	for k, v := range pResp.Probe {
		probeMap[strings.ToLower(k)] = v
	}

	type containerMeta struct {
		image string
		isUp  bool
		ports string
	}
	cMap := make(map[string]containerMeta)
	for _, c := range pResp.DockerPs {
		cMap[strings.ToLower(c.Name)] = containerMeta{
			image: c.Image,
			isUp:  strings.HasPrefix(strings.ToLower(c.Status), "up"),
			ports: c.Ports,
		}
	}

	availableScripts := pResp.Scripts

	result := make([]ModelCard, 0)
	handledContainers := make(map[string]bool)
	handledScripts := make(map[string]bool)
	handledModels := make(map[string]bool)

	// 1. 优先根据当前主机专属预设 h.Models 加载
	for _, preset := range h.Models {
		status := "STOPPED"
		statusDetail := ""
		pingMs := int64(0)
		uptime := ""
		img := preset.Image
		cNameLower := normalizePresetName(preset.ContainerName)
		sNameLower := normalizePresetName(preset.ServiceName)

		var matchedProbe *smartProbeItem
		if p, ok := probeMap[cNameLower]; ok {
			matchedProbe = &p
		} else if p, ok := probeMap[sNameLower]; ok {
			matchedProbe = &p
		}

		if cNameLower != "" {
			handledContainers[cNameLower] = true
		}
		if sNameLower != "" {
			handledContainers[sNameLower] = true
		}
		if preset.Script != "" {
			handledScripts[strings.ToLower(preset.Script)] = true
		}
		handledModels[strings.ToLower(preset.Name)] = true

		if meta, ok := cMap[cNameLower]; ok {
			if meta.image != "" {
				img = meta.image
			}
		} else if meta, ok := cMap[sNameLower]; ok {
			if meta.image != "" {
				img = meta.image
			}
		}

		port := preset.Port
		tp := preset.TP
		engine := preset.Engine
		pid := ""
		if matchedProbe != nil {
			status = matchedProbe.Status
			statusDetail = matchedProbe.Detail
			pingMs = matchedProbe.PingMs
			uptime = matchedProbe.Uptime
			if matchedProbe.Port > 0 {
				port = matchedProbe.Port
			}
			if matchedProbe.TP > 0 {
				tp = matchedProbe.TP
			}
			if matchedProbe.PID != "" {
				pid = matchedProbe.PID
			}
			if matchedProbe.Engine != "" {
				engine = matchedProbe.Engine
			}
		}

		result = append(result, ModelCard{
			Name:          preset.Name,
			ServiceName:   preset.ServiceName,
			ContainerName: preset.ContainerName,
			Engine:        engine,
			MacaVersion:   extractMacaVersion(img),
			TP:            tp,
			Port:          port,
			Script:        preset.Script,
			Image:         img,
			Status:        status,
			StatusDetail:  statusDetail,
			PingMs:        pingMs,
			Uptime:        uptime,
			PID:           pid,
		})
	}

	// 2. 如果目标主机上有其他已运行或已存在的相关大模型容器，动态加入
	for _, c := range pResp.DockerPs {
		cName := strings.TrimSpace(c.Name)
		cImg := strings.TrimSpace(c.Image)
		cNameLower := strings.ToLower(cName)

		if cNameLower == "" || handledContainers[cNameLower] {
			continue
		}

			if isLLMContainer(cName, cImg) {
				status := "STOPPED"
				statusDetail := ""
				pingMs := int64(0)
				uptime := ""
				port := 8000
				pid := ""
				tp := 8
				engine := "vLLM"
				script := ""

				if p, ok := probeMap[cNameLower]; ok {
					status = p.Status
					statusDetail = p.Detail
					pingMs = p.PingMs
					uptime = p.Uptime
					if p.Port > 0 {
						port = p.Port
					}
					if p.TP > 0 {
						tp = p.TP
					}
					if p.PID != "" {
						pid = p.PID
					}
					if p.Engine != "" {
						engine = p.Engine
					}
					if p.Script != "" {
						script = p.Script
					}
				} else {
					engine = inferEngineFromNames(cName, cImg)
				}

				if script == "" {
					script = matchScriptForContainer(cNameLower, availableScripts)
				}

				if script != "" && handledScripts[strings.ToLower(script)] {
					continue
				}

				displayName := prettifyComposeServiceName(cName, cName, script)
				if handledModels[strings.ToLower(displayName)] {
					continue
				}

				handledContainers[cNameLower] = true
				if script != "" {
					handledScripts[strings.ToLower(script)] = true
				}
				handledModels[strings.ToLower(displayName)] = true

				result = append(result, ModelCard{
					Name:          displayName,
					ServiceName:   cName,
					ContainerName: cName,
					Engine:        engine,
					MacaVersion:   extractMacaVersion(cImg),
					TP:            tp,
					Port:          port,
					Script:        script,
					Image:         cImg,
					Status:        status,
					StatusDetail:  statusDetail,
					PingMs:        pingMs,
					Uptime:        uptime,
					PID:           pid,
				})
			}
	}

	// 3. 扫描并自动补全 docker-compose-models.yml 中已编排但未被收录的模型服务
	for _, cs := range pResp.ComposeServices {
		sName := strings.TrimSpace(cs.ServiceName)
		cName := strings.TrimSpace(cs.ContainerName)
		if cName == "" {
			cName = sName
		}
		sNameLower := strings.ToLower(sName)
		cNameLower := strings.ToLower(cName)

		if sNameLower == "" || handledContainers[sNameLower] || handledContainers[cNameLower] {
			continue
		}

		script := cs.Script
		if script == "" {
			script = matchScriptForContainer(sNameLower, availableScripts)
		}
		if script == "" {
			script = matchScriptForContainer(cNameLower, availableScripts)
		}

		// 启动脚本去重：若同一脚本已被纳管，避免重复
		if script != "" && handledScripts[strings.ToLower(script)] {
			continue
		}

		displayName := prettifyComposeServiceName(sName, cName, script)
		if handledModels[strings.ToLower(displayName)] {
			continue
		}

		handledContainers[sNameLower] = true
		handledContainers[cNameLower] = true
		if script != "" {
			handledScripts[strings.ToLower(script)] = true
		}
		handledModels[strings.ToLower(displayName)] = true

		engine := "vLLM"
		if strings.Contains(sNameLower, "sglang") || strings.Contains(strings.ToLower(cs.Image), "sglang") || strings.Contains(strings.ToLower(script), "sglang") {
			engine = "SGLang"
		}

		tp := inferTPFromServiceName(sNameLower, script)

		result = append(result, ModelCard{
			Name:          displayName,
			ServiceName:   sName,
			ContainerName: cName,
			Engine:        engine,
			MacaVersion:   extractMacaVersion(cs.Image),
			TP:            tp,
			Port:          8000,
			Script:        script,
			Image:         cs.Image,
			Status:        "STOPPED",
			StatusDetail:  "",
			PingMs:        0,
			Uptime:        "未启动",
			PID:           "",
		})
	}

	return result, runningCmd, nil
}

func prettifyComposeServiceName(sName, cName, script string) string {
	combined := strings.ToLower(sName + " " + cName + " " + script)

	// 1. DeepSeek 系列
	if strings.Contains(combined, "0731") {
		return "DeepSeek-V4-Flash-0731-W8A8"
	} else if strings.Contains(combined, "flexsmq") || strings.Contains(combined, "1m") {
		return "DeepSeek-V4-Flash-FlexSMQ-AWQ-W8A8"
	} else if strings.Contains(combined, "deepseek-v4") || strings.Contains(combined, "dsv4") {
		return "DeepSeek-V4-Flash"
	}

	// 2. MiniMax 系列
	if strings.Contains(combined, "m3") || strings.Contains(combined, "m-3") {
		return "MiniMax-M3-W8A8"
	} else if strings.Contains(combined, "m2.7") || strings.Contains(combined, "m2-7") {
		return "MiniMax-M2.7-W8A8"
	} else if strings.Contains(combined, "m2.5") || strings.Contains(combined, "m2-5") || strings.Contains(combined, "minimax") {
		return "MiniMax-M2.5-W8A8"
	}

	// 3. GLM 系列
	if strings.Contains(combined, "glm5.3") || strings.Contains(combined, "glm5_3") {
		return "GLM-5.3-Flash"
	} else if strings.Contains(combined, "glm4.7") || strings.Contains(combined, "glm-4-7") || strings.Contains(combined, "glm4-7") {
		return "GLM-4.7-W8A8"
	}

	// 4. Qwen 系列（带官方完整规格后缀与激活参数）
	if strings.Contains(combined, "fable") {
		return "Qwen3.8-27B-Fable-Distill"
	} else if strings.Contains(combined, "dflash2") {
		return "Qwen3.8-27B-DFlash2"
	} else if strings.Contains(combined, "qwen3.8") || strings.Contains(combined, "qwen3-8") || strings.Contains(combined, "qwen3_8") {
		return "Qwen3.8-27B"
	} else if strings.Contains(combined, "235b") {
		return "Qwen3-235B-A22B"
	} else if strings.Contains(combined, "122b") {
		return "Qwen3.5-122B-A10B"
	} else if strings.Contains(combined, "397b") {
		return "Qwen3.5-397B-A17B-W8A8"
	} else if strings.Contains(combined, "36-35b") || strings.Contains(combined, "36_35b") || strings.Contains(combined, "3.6-35b") {
		return "Qwen3.6-35B-A3B"
	} else if strings.Contains(combined, "36-27b") || strings.Contains(combined, "36_27b") || strings.Contains(combined, "3.6-27b") {
		return "Qwen3.6-27B"
	} else if strings.Contains(combined, "3.5-27b") || strings.Contains(combined, "3-5-27b") || strings.Contains(combined, "qwen-27b") {
		return "Qwen3.5-27B"
	} else if strings.Contains(combined, "3.5-9b") || strings.Contains(combined, "3-5-9b") || strings.Contains(combined, "qwen-9b") {
		return "Qwen3.5-9B"
	}

	raw := sName
	if raw == "" {
		raw = cName
	}
	cleaned := strings.TrimPrefix(strings.TrimPrefix(raw, "vllm-"), "sglang-")
	return cleaned
}

func inferTPFromServiceName(sName, script string) int {
	combined := strings.ToLower(sName + " " + script)
	if strings.Contains(combined, "235b") || strings.Contains(combined, "397b") ||
		strings.Contains(combined, "m2.7") || strings.Contains(combined, "m2.5") || strings.Contains(combined, "minimax") ||
		strings.Contains(combined, "glm4.7") || strings.Contains(combined, "glm-4-7") {
		return 16
	} else if strings.Contains(combined, "122b") || strings.Contains(combined, "dsv4") || strings.Contains(combined, "deepseek") || strings.Contains(combined, "glm5") {
		return 8
	} else if strings.Contains(combined, "27b") || strings.Contains(combined, "35b") || strings.Contains(combined, "fable") {
		if strings.Contains(combined, "3.5-27b") || strings.Contains(combined, "3-5-27b") {
			return 2
		}
		return 4
	} else if strings.Contains(combined, "9b") {
		return 1
	}
	return 4
}

// normalizePresetName 规范化预设的容器/服务名：小写化并清洗 CRLF 与空白字符
func normalizePresetName(s string) string {
	return strings.Trim(strings.ToLower(s), "\r\n\t\\ ")
}

// buildPortMap 根据主机模型预设构建 名称->端口 映射（容器名/服务名/显示名均注册，统一小写）
func buildPortMap(models []config.ModelPreset) map[string]int {
	portMap := make(map[string]int)
	for _, p := range models {
		if p.Port > 0 {
			if p.ContainerName != "" {
				portMap[strings.ToLower(p.ContainerName)] = p.Port
			}
			if p.ServiceName != "" {
				portMap[strings.ToLower(p.ServiceName)] = p.Port
			}
			if p.Name != "" {
				portMap[strings.ToLower(p.Name)] = p.Port
			}
		}
	}
	return portMap
}

// isLLMContainer 判断容器名/镜像名是否属于大模型推理相关容器
func isLLMContainer(containerName, imageName string) bool {
	cNameLower := strings.ToLower(containerName)
	imgLower := strings.ToLower(imageName)
	return strings.Contains(cNameLower, "vllm") || strings.Contains(cNameLower, "sglang") ||
		strings.Contains(cNameLower, "lmdeploy") || strings.Contains(cNameLower, "tgi") ||
		strings.Contains(cNameLower, "ollama") || strings.Contains(cNameLower, "model") ||
		strings.Contains(cNameLower, "llm") || strings.Contains(cNameLower, "glm") ||
		strings.Contains(cNameLower, "deepseek") || strings.Contains(cNameLower, "qwen") ||
		strings.Contains(cNameLower, "llama") || strings.Contains(cNameLower, "baichuan") ||
		strings.Contains(cNameLower, "intern") || strings.Contains(cNameLower, "mistral") ||
		strings.Contains(imgLower, "vllm") || strings.Contains(imgLower, "sglang") ||
		strings.Contains(imgLower, "model") || strings.Contains(imgLower, "maca") ||
		strings.Contains(imgLower, "dcu") || strings.Contains(imgLower, "torch")
}

// inferEngineFromNames 根据容器名/镜像名推断推理引擎（默认 vLLM，含 sglang 则为 SGLang）
func inferEngineFromNames(containerName, imageName string) string {
	if strings.Contains(strings.ToLower(containerName), "sglang") ||
		strings.Contains(strings.ToLower(imageName), "sglang") {
		return "SGLang"
	}
	return "vLLM"
}

// matchScriptForContainer 在工作空间真实脚本列表中精准匹配启动脚本，绝不虚构不存在的文件
func matchScriptForContainer(cNameLower string, scripts []string) string {
	if len(scripts) == 0 {
		return ""
	}

	// 1. 完全包含与基础名比对
	for _, s := range scripts {
		sClean := strings.ToLower(s)
		sBase := strings.TrimSuffix(strings.TrimPrefix(sClean, "start_"), ".sh")
		sBase = strings.TrimPrefix(sBase, "vllm_")
		sBase = strings.TrimPrefix(sBase, "sglang_")
		if strings.Contains(sClean, cNameLower) || (sBase != "" && strings.Contains(cNameLower, sBase)) {
			return s
		}
	}

	// 2. 关键特征提取匹配
	for _, s := range scripts {
		sLower := strings.ToLower(s)
		if strings.Contains(cNameLower, "235b") && strings.Contains(sLower, "235b") {
			return s
		}
		if strings.Contains(cNameLower, "122b") && strings.Contains(sLower, "122b") {
			return s
		}
		if strings.Contains(cNameLower, "397b") && strings.Contains(sLower, "397b") {
			return s
		}
		if strings.Contains(cNameLower, "35b") && strings.Contains(sLower, "35b") {
			return s
		}
		if strings.Contains(cNameLower, "27b") && strings.Contains(sLower, "27b") {
			if strings.Contains(cNameLower, "36") == strings.Contains(sLower, "36") &&
				strings.Contains(cNameLower, "35") == strings.Contains(sLower, "35") &&
				strings.Contains(cNameLower, "38") == strings.Contains(sLower, "38") {
				return s
			}
		}
		if strings.Contains(cNameLower, "9b") && strings.Contains(sLower, "9b") {
			return s
		}
		if strings.Contains(cNameLower, "glm4") && strings.Contains(sLower, "glm4") {
			return s
		}
		if strings.Contains(cNameLower, "glm5") && strings.Contains(sLower, "glm5") {
			return s
		}
		if strings.Contains(cNameLower, "m2.7") && strings.Contains(sLower, "m2.7") {
			return s
		}
		if (strings.Contains(cNameLower, "m2.5") || strings.Contains(cNameLower, "m2-5") || strings.Contains(cNameLower, "minimax")) &&
			(strings.Contains(sLower, "minimax.sh") || strings.Contains(sLower, "m2.5")) {
			return s
		}
	}

	return ""
}

func (m *ModelManager) GetScriptContent(scriptName string) (string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return "", err
	}
	clean := filepath.Base(scriptName)
	cmd := fmt.Sprintf("base64 <(tr -d '\\r' < %s/%s) 2>/dev/null || echo 'SCRIPT_NOT_FOUND'", h.Workspace, clean)
	res, err := runner.RunCmd(h.SSHAlias, cmd, 10)
	if err != nil {
		return "", err
	}
	out := strings.TrimSpace(res.Stdout)
	if strings.Contains(out, "SCRIPT_NOT_FOUND") || out == "" {
		return fmt.Sprintf("# 远程脚本 %s/%s 暂不存在\n# 您可以在此直接编写并点击保存进行创建\n", h.Workspace, clean), nil
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(out, "\n", ""))
	if err != nil {
		return out, nil
	}
	return string(decoded), nil
}

func (m *ModelManager) SaveScriptContent(scriptName, content string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}
	clean := filepath.Base(scriptName)

	// 强制清洗所有 Windows CRLF 换行符 (\r\n 与 \r 全部转为纯净 Unix \n)
	cleanContent := strings.ReplaceAll(content, "\r\n", "\n")
	cleanContent = strings.ReplaceAll(cleanContent, "\r", "")

	b64 := base64.StdEncoding.EncodeToString([]byte(cleanContent))
	cmd := fmt.Sprintf("echo '%s' | base64 -d | tr -d '\\r' > %s/%s && chmod +x %s/%s", b64, h.Workspace, clean, h.Workspace, clean)
	_, err = runner.RunCmd(h.SSHAlias, cmd, 10)
	return err
}

func (m *ModelManager) GetComposeSection(serviceName, modelName string) (string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return "", err
	}

	cmd := fmt.Sprintf("cat %s/docker-compose-models.yml 2>/dev/null || cat %s/docker-compose.yml 2>/dev/null || echo 'NO_COMPOSE'", h.Workspace, h.Workspace)
	res, err := runner.RunCmd(h.SSHAlias, cmd, 10)
	if err != nil {
		return "", err
	}

	if strings.Contains(res.Stdout, "NO_COMPOSE") || strings.TrimSpace(res.Stdout) == "" {
		return fmt.Sprintf("# 当前主机 (%s) 工作空间 %s 暂无 docker-compose-models.yml 编排文件\n# 建议在远端配置并管理大模型服务容器\n", h.Name, h.Workspace), nil
	}

	section := extractComposeServiceSection(res.Stdout, serviceName, modelName)
	return section, nil
}

func extractComposeServiceSection(fullYaml, serviceName, modelName string) string {
	cleanSvc := strings.TrimSpace(serviceName)
	cleanModel := strings.TrimSpace(modelName)
	if cleanSvc == "" && cleanModel == "" {
		return fullYaml
	}

	lines := strings.Split(fullYaml, "\n")
	svcRegex := regexp.MustCompile(`^[ ]{2}([a-zA-Z0-9_.-]+):[ ]*$`)
	topRegex := regexp.MustCompile(`^[a-zA-Z0-9_.-]+:[ ]*$`)

	type serviceBlock struct {
		name         string
		startIdx     int
		commentStart int
		endIdx       int
	}

	var blocks []*serviceBlock
	var currentBlock *serviceBlock

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if topRegex.MatchString(line) && !strings.HasPrefix(line, "  ") {
			if currentBlock != nil {
				currentBlock.endIdx = i
				currentBlock = nil
			}
			continue
		}

		if m := svcRegex.FindStringSubmatch(line); len(m) > 1 {
			if currentBlock != nil {
				currentBlock.endIdx = i
			}
			sName := m[1]
			cStart := i
			for k := i - 1; k >= 0; k-- {
				trimmed := strings.TrimSpace(lines[k])
				if strings.HasPrefix(trimmed, "#") {
					cStart = k
				} else if trimmed == "" {
					continue
				} else {
					break
				}
			}

			currentBlock = &serviceBlock{
				name:         sName,
				startIdx:     i,
				commentStart: cStart,
				endIdx:       len(lines),
			}
			blocks = append(blocks, currentBlock)
		}
	}

	var matchedBlock *serviceBlock
	// 1. 精确匹配 serviceName
	if cleanSvc != "" {
		for _, b := range blocks {
			if strings.EqualFold(b.name, cleanSvc) {
				matchedBlock = b
				break
			}
		}
	}

	// 2. 匹配 container_name
	if matchedBlock == nil {
		for _, b := range blocks {
			blockContent := strings.Join(lines[b.startIdx:b.endIdx], "\n")
			if cleanSvc != "" && strings.Contains(blockContent, fmt.Sprintf("container_name: %s", cleanSvc)) {
				matchedBlock = b
				break
			}
			if cleanModel != "" && strings.Contains(blockContent, fmt.Sprintf("container_name: %s", cleanModel)) {
				matchedBlock = b
				break
			}
		}
	}

	// 3. 模糊匹配名字包含
	if matchedBlock == nil {
		for _, b := range blocks {
			if cleanSvc != "" && (strings.Contains(strings.ToLower(b.name), strings.ToLower(cleanSvc)) || strings.Contains(strings.ToLower(cleanSvc), strings.ToLower(b.name))) {
				matchedBlock = b
				break
			}
			if cleanModel != "" && strings.Contains(strings.ToLower(b.name), strings.ToLower(cleanModel)) {
				matchedBlock = b
				break
			}
		}
	}

	if matchedBlock != nil {
		end := matchedBlock.endIdx
		for end > matchedBlock.startIdx {
			trimmed := strings.TrimSpace(lines[end-1])
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				end--
			} else {
				break
			}
		}
		if end < matchedBlock.startIdx {
			end = matchedBlock.endIdx
		}
		snippet := strings.Join(lines[matchedBlock.commentStart:end], "\n")
		return snippet
	}

	return fmt.Sprintf("# 未在 docker-compose-models.yml 中找到匹配的服务 [%s]\n# 您可以查阅全量编排或在此补充该容器的服务定义\n", cleanSvc)
}

func (m *ModelManager) StartModel(serviceOrScript string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}

	cmd := fmt.Sprintf("cd %s && (docker compose -f docker-compose-models.yml up -d %s 2>/dev/null || docker start %s 2>/dev/null || (sed -i 's/\\r$//' %s 2>/dev/null; chmod +x %s 2>/dev/null && bash %s > /tmp/model_start.log 2>&1 & echo 'STARTED_VIA_SCRIPT'))",
		h.Workspace, serviceOrScript, serviceOrScript, serviceOrScript, serviceOrScript, serviceOrScript)

	_, err = runner.RunCmd(h.SSHAlias, cmd, 15)
	return err
}

func (m *ModelManager) StopModel(serviceName, containerName string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}

	target := serviceName
	if target == "" {
		target = containerName
	}
	if target == "" {
		return fmt.Errorf("未指定要停止的服务或容器名称")
	}

	cmd := fmt.Sprintf("cd %s && (docker compose -f docker-compose-models.yml stop %s 2>/dev/null || docker compose -f docker-compose-models.yml rm -f %s 2>/dev/null || docker stop %s 2>/dev/null || echo 'STOP_COMMAND_EXECUTED')",
		h.Workspace, target, target, target)

	_, err = runner.RunCmd(h.SSHAlias, cmd, 20)
	return err
}

func (m *ModelManager) RestartModel(serviceName, containerName string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}

	target := containerName
	if target == "" {
		target = serviceName
	}
	if target == "" {
		return fmt.Errorf("未指定要重启的容器名称")
	}

	cleanTarget := strings.TrimSpace(target)
	// 在重启前防御性清洗工作空间内脚本的 Windows 换行符，避免因脚本包含 \r 导致容器重启后解析报错
	cmd := fmt.Sprintf("find %s -maxdepth 2 -name '*.sh' -exec sed -i 's/\\r$//' {} + 2>/dev/null || true; docker restart %s", h.Workspace, cleanTarget)
	res, err := runner.RunCmd(h.SSHAlias, cmd, 35)
	if err != nil {
		return fmt.Errorf("重启命令执行失败: %v", err)
	}
	if !res.OK {
		return fmt.Errorf("重启容器失败: %s", res.Stderr)
	}
	return nil
}

func (m *ModelManager) StopAllModels() error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}

	cmd := fmt.Sprintf("cd %s && (docker compose -f docker-compose-models.yml down 2>/dev/null || true); pkill -9 -f 'vllm serve' 2>/dev/null || true; pkill -9 -f 'sglang' 2>/dev/null || true; echo 'ALL_STOPPED'", h.Workspace)
	_, err = runner.RunCmd(h.SSHAlias, cmd, 25)
	return err
}

func (m *ModelManager) GetContainerLogs(modelOrContainerName string) (string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return "", err
	}

	target := strings.TrimSpace(modelOrContainerName)
	if target == "" {
		return "未指定容器或模型名称", nil
	}

	// 如果传入的是预设模型名，优先映射为预设的 ContainerName
	for _, p := range h.Models {
		if strings.EqualFold(p.Name, target) || strings.EqualFold(p.ServiceName, target) {
			if p.ContainerName != "" {
				target = p.ContainerName
				break
			}
		}
	}

	sh := fmt.Sprintf(`
TARGET="%s"
if docker ps -a --format "{{.Names}}" | grep -ix "${TARGET}" >/dev/null 2>&1; then
    docker logs --tail 300 "${TARGET}" 2>&1
else
    MATCH=$(docker ps -a --format "{{.Names}}" | grep -i "${TARGET}" | head -1)
    if [ -n "$MATCH" ]; then
        docker logs --tail 300 "$MATCH" 2>&1
    else
        docker logs --tail 300 "${TARGET}" 2>&1 || cat /tmp/${TARGET}.log 2>/dev/null || echo "未找到容器 ${TARGET} 的运行日志"
    fi
fi
`, target)

	res, err := runner.RunCmd(h.SSHAlias, sh, 12)
	if err != nil {
		return "", err
	}
	return res.Stdout, nil
}

type DockerImageItem struct {
	Repository string   `json:"repository"`
	Tag        string   `json:"tag"`
	ImageID    string   `json:"image_id"`
	Created    string   `json:"created"`
	Size       string   `json:"size"`
	FullName   string   `json:"full_name"`
	IsInUse    bool     `json:"is_in_use"`
	UsedBy     []string `json:"used_by"`
}

func (m *ModelManager) GetHostImages() ([]DockerImageItem, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return nil, err
	}

	sh := `
python3 -c '
import subprocess, json

images = []
try:
    used_images = {}
    try:
        ps_out = subprocess.check_output(["docker", "ps", "-a", "--format", "{{.Image}}|||{{.Names}}"], text=True)
        for line in ps_out.strip().split("\n"):
            if "|||" in line:
                img, cname = line.strip().split("|||", 1)
                img = img.strip()
                if img not in used_images:
                    used_images[img] = []
                used_images[img].append(cname.strip())
    except Exception:
        pass

    out = subprocess.check_output(["docker", "images", "--format", "{{.Repository}}|||{{.Tag}}|||{{.ID}}|||{{.CreatedAt}}|||{{.Size}}"], text=True)
    for line in out.strip().split("\n"):
        if not line.strip() or "|||" not in line:
            continue
        parts = line.strip().split("|||")
        if len(parts) >= 5:
            repo, tag, img_id, created, size = parts[0], parts[1], parts[2], parts[3], parts[4]
            full_name = f"{repo}:{tag}" if tag and tag != "<none>" else repo
            
            is_used = False
            used_by = []
            if full_name in used_images:
                is_used = True
                used_by.extend(used_images[full_name])
            if img_id in used_images:
                is_used = True
                used_by.extend(used_images[img_id])
            if repo in used_images:
                is_used = True
                used_by.extend(used_images[repo])
            
            used_by = list(dict.fromkeys(used_by))
            
            images.append({
                "repository": repo,
                "tag": tag,
                "image_id": img_id,
                "created": created,
                "size": size,
                "full_name": full_name,
                "is_in_use": is_used,
                "used_by": used_by
            })
except Exception as e:
    pass

print(json.dumps(images, ensure_ascii=False))
'
`
	res, err := runner.RunCmd(h.SSHAlias, sh, 15)
	if err != nil {
		return nil, err
	}

	var items []DockerImageItem
	if err := json.Unmarshal([]byte(res.Stdout), &items); err != nil {
		return []DockerImageItem{}, nil
	}
	return items, nil
}

type LocalWeightItem struct {
	Name          string   `json:"name"`
	Series        string   `json:"series"`
	HostPath      string   `json:"host_path"`
	ContainerPath string   `json:"container_path"`
	SizeBytes     int64    `json:"size_bytes"`
	SizeHuman     string   `json:"size_human"`
	Format        string   `json:"format"`
	FilesCount    int      `json:"files_count"`
	SampleFiles   []string `json:"sample_files"`
	Modified      string   `json:"modified"`
	UsedBy        []string `json:"used_by"`
	Status        string   `json:"status"` // CONFIGURED / READY / INCOMPLETE
}

func (m *ModelManager) GetHostLocalWeights() ([]LocalWeightItem, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return nil, err
	}

	sh := `
python3 -c '
import os, sys, json, time, glob

base_dirs = ["/mnt/model", "/home/workspace/models", "/home/workspace/model"]
workspace = "/home/workspace"

try:
    with open(f"{workspace}/docker-compose-models.yml", "r") as f:
        compose_text = f.read()
except Exception:
    compose_text = ""

script_texts = {}
for s in glob.glob(f"{workspace}/start_*.sh"):
    try:
        with open(s, "r") as f:
            script_texts[os.path.basename(s)] = f.read()
    except Exception:
        pass

def format_size(size):
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"

models = []
seen_paths = set()

def scan_model_dir(dir_path, depth=0, max_depth=3):
    if depth > max_depth or not os.path.exists(dir_path):
        return
    try:
        real_p = os.path.realpath(dir_path)
        if real_p in seen_paths:
            return
        entries = os.listdir(dir_path)
    except Exception:
        return

    safetensors = [f for f in entries if f.endswith(".safetensors")]
    bins = [f for f in entries if f.endswith(".bin")]
    ggufs = [f for f in entries if f.endswith(".gguf")]
    has_config = "config.json" in entries

    is_model = bool(safetensors or bins or ggufs or (has_config and len(entries) > 2))

    if is_model:
        seen_paths.add(real_p)
        name = os.path.basename(dir_path)
        series = "Other"
        lower = dir_path.lower()
        if "qwen" in lower: series = "Qwen"
        elif "deepseek" in lower: series = "DeepSeek"
        elif "glm" in lower: series = "GLM"
        elif "minimax" in lower: series = "MiniMax"
        elif "llama" in lower: series = "Llama"
        elif "bge" in lower: series = "Embedding"

        fmt = "Unknown"
        if safetensors: fmt = "Safetensors"
        elif bins: fmt = "PyTorch Bin"
        elif ggufs: fmt = "GGUF"
        elif has_config: fmt = "Config Only"

        total_size = 0
        weight_files = []
        try:
            for root, _, files in os.walk(dir_path):
                for f in files:
                    fp = os.path.join(root, f)
                    try:
                        total_size += os.path.getsize(fp)
                    except Exception:
                        pass
                    if f.endswith((".safetensors", ".bin", ".gguf")):
                        weight_files.append(f)
        except Exception:
            pass

        container_path = dir_path.replace("/mnt/model", "/data/model")

        used_by = []
        base_name = os.path.basename(dir_path)
        for sname, stext in script_texts.items():
            if base_name in stext or dir_path in stext or container_path in stext:
                used_by.append(sname)
        if base_name in compose_text or dir_path in compose_text or container_path in compose_text:
            used_by.append("docker-compose")
        used_by = list(dict.fromkeys(used_by))

        status = "READY"
        if total_size < 100 * 1024 * 1024 and not weight_files:
            status = "INCOMPLETE"
        elif used_by:
            status = "CONFIGURED"

        mtime_str = ""
        try:
            mtime = os.path.getmtime(dir_path)
            mtime_str = time.strftime("%Y-%m-%d %H:%M", time.localtime(mtime))
        except Exception:
            pass

        models.append({
            "name": name,
            "series": series,
            "host_path": dir_path,
            "container_path": container_path,
            "size_bytes": total_size,
            "size_human": format_size(total_size),
            "format": fmt,
            "files_count": len(weight_files) if weight_files else len(entries),
            "sample_files": weight_files[:3] if weight_files else entries[:3],
            "modified": mtime_str,
            "used_by": used_by,
            "status": status
        })
        return

    for e in sorted(entries):
        sub = os.path.join(dir_path, e)
        if os.path.isdir(sub):
            scan_model_dir(sub, depth+1, max_depth)

for b in base_dirs:
    scan_model_dir(b)

models.sort(key=lambda x: (x["series"], x["name"]))
print(json.dumps(models, ensure_ascii=False))
'
`
	res, err := runner.RunCmd(h.SSHAlias, sh, 20)
	if err != nil {
		return nil, err
	}

	var items []LocalWeightItem
	if err := json.Unmarshal([]byte(res.Stdout), &items); err != nil {
		return []LocalWeightItem{}, nil
	}
	return items, nil
}

func (m *ModelManager) DeleteModel(name, serviceName, containerName, script string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}

	cleanSvc := strings.TrimSpace(serviceName)
	cleanContainer := strings.TrimSpace(containerName)
	cleanName := strings.TrimSpace(name)
	cleanScript := strings.TrimSpace(script)

	// 1. 远程容器强制清理与下线
	var rmCmds []string
	if cleanSvc != "" {
		rmCmds = append(rmCmds, fmt.Sprintf("cd %s && docker compose -f docker-compose-models.yml rm -sf %s 2>/dev/null || true", h.Workspace, cleanSvc))
	}
	if cleanContainer != "" {
		rmCmds = append(rmCmds, fmt.Sprintf("docker rm -f %s 2>/dev/null || true", cleanContainer))
	}
	if cleanSvc != "" && cleanSvc != cleanContainer {
		rmCmds = append(rmCmds, fmt.Sprintf("docker rm -f %s 2>/dev/null || true", cleanSvc))
	}
	if len(rmCmds) > 0 {
		_, _ = runner.RunCmd(h.SSHAlias, strings.Join(rmCmds, "; "), 20)
	}

	// 2. 从远程 docker-compose-models.yml 中精准移除对应的 service 块
	cmd := fmt.Sprintf("cat %s/docker-compose-models.yml 2>/dev/null || echo 'NO_COMPOSE'", h.Workspace)
	res, err := runner.RunCmd(h.SSHAlias, cmd, 10)
	if err == nil && !strings.Contains(res.Stdout, "NO_COMPOSE") && strings.TrimSpace(res.Stdout) != "" {
		newYaml, removed := removeComposeServiceSection(res.Stdout, cleanSvc, cleanContainer, cleanName)
		if removed {
			// 先备份
			bakCmd := fmt.Sprintf("cp %s/docker-compose-models.yml %s/docker-compose-models.yml.bak 2>/dev/null || true", h.Workspace, h.Workspace)
			_, _ = runner.RunCmd(h.SSHAlias, bakCmd, 5)

			// 安全回写
			b64 := base64.StdEncoding.EncodeToString([]byte(newYaml))
			writeCmd := fmt.Sprintf("echo '%s' | base64 -d > %s/docker-compose-models.yml", b64, h.Workspace)
			_, _ = runner.RunCmd(h.SSHAlias, writeCmd, 10)
		}
	}

	// 3. 将对应启动脚本移至 scripts_archived 归档，保持工作区清爽且安全防误删
	if cleanScript != "" && cleanScript != "start.sh" && cleanScript != "manage.sh" {
		scriptBase := filepath.Base(cleanScript)
		archiveDir := fmt.Sprintf("%s/scripts_archived", h.Workspace)
		archiveCmd := fmt.Sprintf("mkdir -p %s && [ -f %s/%s ] && mv %s/%s %s/ 2>/dev/null || true",
			archiveDir, h.Workspace, scriptBase, h.Workspace, scriptBase, archiveDir)
		_, _ = runner.RunCmd(h.SSHAlias, archiveCmd, 5)
	}

	// 4. 从 hosts.yaml 中移除预设（如果在当前主机中存在）
	cfg := config.GetConfig()
	if cfg != nil {
		modified := false
		for i := range cfg.Hosts {
			if cfg.Hosts[i].ID == h.ID || cfg.Hosts[i].SSHAlias == h.SSHAlias {
				var newPresets []config.ModelPreset
				for _, p := range cfg.Hosts[i].Models {
					if (cleanName != "" && strings.EqualFold(p.Name, cleanName)) ||
						(cleanSvc != "" && strings.EqualFold(p.ServiceName, cleanSvc)) ||
						(cleanContainer != "" && strings.EqualFold(p.ContainerName, cleanContainer)) {
						modified = true
						continue
					}
					newPresets = append(newPresets, p)
				}
				if modified {
					cfg.Hosts[i].Models = newPresets
				}
			}
		}
		if modified {
			_ = config.SaveConfig(cfg, "")
		}
	}

	return nil
}

func removeComposeServiceSection(fullYaml, serviceName, containerName, modelName string) (string, bool) {
	lines := strings.Split(fullYaml, "\n")
	svcRegex := regexp.MustCompile(`^[ ]{2}([a-zA-Z0-9_.-]+):[ ]*$`)
	topRegex := regexp.MustCompile(`^[a-zA-Z0-9_.-]+:[ ]*$`)

	type serviceBlock struct {
		name         string
		startIdx     int
		commentStart int
		endIdx       int
	}

	var blocks []*serviceBlock
	var currentBlock *serviceBlock

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if topRegex.MatchString(line) && !strings.HasPrefix(line, "  ") {
			if currentBlock != nil {
				currentBlock.endIdx = i
				currentBlock = nil
			}
			continue
		}

		if m := svcRegex.FindStringSubmatch(line); len(m) > 1 {
			if currentBlock != nil {
				currentBlock.endIdx = i
			}
			sName := m[1]
			cStart := i
			for k := i - 1; k >= 0; k-- {
				trimmed := strings.TrimSpace(lines[k])
				if strings.HasPrefix(trimmed, "#") {
					cStart = k
				} else if trimmed == "" {
					continue
				} else {
					break
				}
			}

			currentBlock = &serviceBlock{
				name:         sName,
				startIdx:     i,
				commentStart: cStart,
				endIdx:       len(lines),
			}
			blocks = append(blocks, currentBlock)
		}
	}

	var matchedBlock *serviceBlock
	// 1. 精确匹配 serviceName
	if serviceName != "" {
		for _, b := range blocks {
			if strings.EqualFold(b.name, serviceName) {
				matchedBlock = b
				break
			}
		}
	}

	// 2. 匹配 containerName
	if matchedBlock == nil && containerName != "" {
		for _, b := range blocks {
			if strings.EqualFold(b.name, containerName) {
				matchedBlock = b
				break
			}
			blockContent := strings.Join(lines[b.startIdx:b.endIdx], "\n")
			if strings.Contains(blockContent, fmt.Sprintf("container_name: %s", containerName)) {
				matchedBlock = b
				break
			}
		}
	}

	// 3. 匹配 modelName
	if matchedBlock == nil && modelName != "" {
		for _, b := range blocks {
			blockContent := strings.Join(lines[b.startIdx:b.endIdx], "\n")
			if strings.Contains(blockContent, fmt.Sprintf("container_name: %s", modelName)) {
				matchedBlock = b
				break
			}
			if strings.Contains(strings.ToLower(b.name), strings.ToLower(modelName)) {
				matchedBlock = b
				break
			}
		}
	}

	if matchedBlock == nil {
		return fullYaml, false
	}

	// 移除 matchedBlock.commentStart 到 matchedBlock.endIdx 的行
	newLines := make([]string, 0, len(lines))
	newLines = append(newLines, lines[:matchedBlock.commentStart]...)
	newLines = append(newLines, lines[matchedBlock.endIdx:]...)

	return strings.Join(newLines, "\n"), true
}
