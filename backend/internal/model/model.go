package model

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"strings"

	"metax-workbench/internal/host"
	"metax-workbench/internal/runner"
)

type ModelCard struct {
	Name          string `json:"name"`
	ServiceName   string `json:"service_name"`
	ContainerName string `json:"container_name"`
	Engine        string `json:"engine"` // vLLM / SGLang
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

	portMap := make(map[string]int)
	for _, p := range h.Models {
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

            if "sglang" in cmd_and_logs:
                info["engine"] = "SGLang"
            elif "vllm" in cmd_and_logs:
                info["engine"] = "vLLM"
            elif "lmdeploy" in cmd_and_logs:
                info["engine"] = "LMDeploy"
            elif "tgi" in cmd_and_logs:
                info["engine"] = "TGI"
            elif "ollama" in cmd_and_logs:
                info["engine"] = "Ollama"

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

	type remoteProbeResponse struct {
		DockerPs []struct {
			Name   string `json:"name"`
			Image  string `json:"image"`
			Status string `json:"status"`
			Ports  string `json:"ports"`
		} `json:"docker_ps"`
		Probe      map[string]smartProbeItem `json:"probe"`
		Scripts    []string                  `json:"scripts"`
		RunningCmd string                    `json:"running_cmd"`
		Error      string                    `json:"error"`
	}

	var pResp remoteProbeResponse
	cleanOutput := strings.TrimSpace(res.Stdout)
	if err := json.Unmarshal([]byte(cleanOutput), &pResp); err != nil {
		log.Printf("[DiscoverModels] JSON unmarshal error: %v, raw: %s", err, cleanOutput)
		return nil, "", err
	}

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

	// 1. 优先根据当前主机专属预设 h.Models 加载
	for _, preset := range h.Models {
		status := "STOPPED"
		statusDetail := ""
		pingMs := int64(0)
		uptime := ""
		img := preset.Image
		cNameLower := strings.Trim(strings.ToLower(preset.ContainerName), "\r\n\t\\ ")
		sNameLower := strings.Trim(strings.ToLower(preset.ServiceName), "\r\n\t\\ ")

		var matchedProbe *smartProbeItem
		if p, ok := probeMap[cNameLower]; ok {
			matchedProbe = &p
		} else if p, ok := probeMap[sNameLower]; ok {
			matchedProbe = &p
		}

		if meta, ok := cMap[cNameLower]; ok {
			handledContainers[cNameLower] = true
			if meta.image != "" {
				img = meta.image
			}
		} else if meta, ok := cMap[sNameLower]; ok {
			handledContainers[sNameLower] = true
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

			imgLower := strings.ToLower(cImg)
			isLLM := strings.Contains(cNameLower, "vllm") || strings.Contains(cNameLower, "sglang") ||
				strings.Contains(cNameLower, "lmdeploy") || strings.Contains(cNameLower, "tgi") ||
				strings.Contains(cNameLower, "ollama") || strings.Contains(cNameLower, "model") ||
				strings.Contains(cNameLower, "llm") || strings.Contains(cNameLower, "glm") ||
				strings.Contains(cNameLower, "deepseek") || strings.Contains(cNameLower, "qwen") ||
				strings.Contains(cNameLower, "llama") || strings.Contains(cNameLower, "baichuan") ||
				strings.Contains(cNameLower, "intern") || strings.Contains(cNameLower, "mistral") ||
				strings.Contains(imgLower, "vllm") || strings.Contains(imgLower, "sglang") ||
				strings.Contains(imgLower, "model") || strings.Contains(imgLower, "maca") ||
				strings.Contains(imgLower, "dcu") || strings.Contains(imgLower, "torch")

			if isLLM {
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
				} else if strings.Contains(cNameLower, "sglang") || strings.Contains(imgLower, "sglang") {
					engine = "SGLang"
				}

				if script == "" {
					for _, s := range availableScripts {
						sClean := strings.ToLower(s)
						if strings.Contains(sClean, cNameLower) || strings.Contains(cNameLower, strings.TrimSuffix(strings.TrimPrefix(sClean, "start_"), ".sh")) {
							script = s
							break
						}
					}
					if script == "" {
						script = fmt.Sprintf("start_%s.sh", strings.ToLower(cName))
					}
				}

				result = append(result, ModelCard{
					Name:          cName,
					ServiceName:   cName,
					ContainerName: cName,
					Engine:        engine,
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


	return result, runningCmd, nil
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
	b64 := base64.StdEncoding.EncodeToString([]byte(content))
	cmd := fmt.Sprintf("echo '%s' | base64 -d > %s/%s && chmod +x %s/%s", b64, h.Workspace, clean, h.Workspace, clean)
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

	return res.Stdout, nil
}

func (m *ModelManager) StartModel(serviceOrScript string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}

	cmd := fmt.Sprintf("cd %s && (docker compose -f docker-compose-models.yml up -d %s 2>/dev/null || docker start %s 2>/dev/null || (chmod +x %s 2>/dev/null && bash %s > /tmp/model_start.log 2>&1 & echo 'STARTED_VIA_SCRIPT'))",
		h.Workspace, serviceOrScript, serviceOrScript, serviceOrScript, serviceOrScript)

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
	cmd := fmt.Sprintf("docker restart %s", cleanTarget)
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
