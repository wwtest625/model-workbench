package model

import (
	"encoding/base64"
	"fmt"
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
	Status        string `json:"status"` // RUNNING / STOPPED
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

func (m *ModelManager) DiscoverModels() ([]ModelCard, string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return nil, "", err
	}

	workspace := h.Workspace
	if workspace == "" {
		workspace = "/home/workspace"
	}

	sh := fmt.Sprintf(`
echo "=== DOCKER_PS ==="
docker ps -a --format "{{.Names}}|||{{.Image}}|||{{.Status}}|||{{.Ports}}" 2>/dev/null
echo "=== RUNNING_PID ==="
PID=$(pgrep -f 'vllm serve' | head -1 || pgrep -f 'sglang' | head -1)
echo "$PID"
echo "=== RUNNING_CMD ==="
if [ -n "$PID" ]; then
    tr '\0' ' ' < /proc/$PID/cmdline 2>/dev/null
fi
echo
echo "=== SCRIPTS ==="
find %s -maxdepth 2 -name "*.sh" -exec basename {} \; 2>/dev/null || true
`, workspace)

	res, err := runner.RunCmd(h.SSHAlias, sh, 12)
	if err != nil {
		return nil, "", err
	}

	raw := res.Stdout

	dockerLines := []string{}
	if strings.Contains(raw, "=== DOCKER_PS ===") {
		parts := strings.Split(raw, "=== DOCKER_PS ===")
		if len(parts) > 1 {
			psBlock := strings.TrimSpace(strings.Split(parts[1], "=== RUNNING_PID ===")[0])
			if psBlock != "" {
				dockerLines = strings.Split(psBlock, "\n")
			}
		}
	}

	runningPID := ""
	if strings.Contains(raw, "=== RUNNING_PID ===") {
		parts := strings.Split(raw, "=== RUNNING_PID ===")
		if len(parts) > 1 {
			runningPID = strings.TrimSpace(strings.Split(parts[1], "=== RUNNING_CMD ===")[0])
		}
	}

	runningCmd := ""
	if strings.Contains(raw, "=== RUNNING_CMD ===") {
		parts := strings.Split(raw, "=== RUNNING_CMD ===")
		if len(parts) > 1 {
			runningCmd = strings.TrimSpace(strings.Split(parts[1], "=== SCRIPTS ===")[0])
		}
	}

	// 容器状态映射表: containerName -> { image, isUp, ports }
	type containerMeta struct {
		image string
		isUp  bool
		ports string
	}
	cMap := make(map[string]containerMeta)
	for _, l := range dockerLines {
		parts := strings.Split(l, "|||")
		if len(parts) >= 3 {
			cName := strings.TrimSpace(parts[0])
			cImg := strings.TrimSpace(parts[1])
			cStatus := strings.TrimSpace(parts[2])
			cPorts := ""
			if len(parts) >= 4 {
				cPorts = strings.TrimSpace(parts[3])
			}
			isUp := strings.HasPrefix(strings.ToLower(cStatus), "up")
			cMap[strings.ToLower(cName)] = containerMeta{
				image: cImg,
				isUp:  isUp,
				ports: cPorts,
			}
		}
	}

	result := make([]ModelCard, 0)
	handledContainers := make(map[string]bool)

	// 1. 优先根据当前主机专属预设 h.Models 加载
	for _, preset := range h.Models {
		status := "STOPPED"
		img := preset.Image
		cNameLower := strings.ToLower(preset.ContainerName)
		sNameLower := strings.ToLower(preset.ServiceName)

		if meta, ok := cMap[cNameLower]; ok {
			handledContainers[cNameLower] = true
			if meta.isUp {
				status = "RUNNING"
			}
			if meta.image != "" {
				img = meta.image
			}
		} else if meta, ok := cMap[sNameLower]; ok {
			handledContainers[sNameLower] = true
			if meta.isUp {
				status = "RUNNING"
			}
			if meta.image != "" {
				img = meta.image
			}
		}

		pid := ""
		if status == "RUNNING" && runningPID != "" {
			pid = runningPID
		}

		result = append(result, ModelCard{
			Name:          preset.Name,
			ServiceName:   preset.ServiceName,
			ContainerName: preset.ContainerName,
			Engine:        preset.Engine,
			TP:            preset.TP,
			Port:          preset.Port,
			Script:        preset.Script,
			Image:         img,
			Status:        status,
			PID:           pid,
		})
	}

	// 2. 如果目标主机上有其他已运行或已存在的相关大模型容器，动态加入
	for _, l := range dockerLines {
		parts := strings.Split(l, "|||")
		if len(parts) >= 3 {
			cName := strings.TrimSpace(parts[0])
			cImg := strings.TrimSpace(parts[1])
			cStatus := strings.TrimSpace(parts[2])
			cNameLower := strings.ToLower(cName)

			if handledContainers[cNameLower] {
				continue
			}

			imgLower := strings.ToLower(cImg)
			isLLM := strings.Contains(cNameLower, "vllm") || strings.Contains(cNameLower, "sglang") ||
				strings.Contains(imgLower, "vllm") || strings.Contains(imgLower, "sglang") ||
				strings.Contains(cNameLower, "glm") || strings.Contains(cNameLower, "deepseek") ||
				strings.Contains(cNameLower, "qwen") || strings.Contains(cNameLower, "flash")

			if isLLM {
				engine := "vLLM"
				if strings.Contains(cNameLower, "sglang") || strings.Contains(imgLower, "sglang") {
					engine = "SGLang"
				}

				status := "STOPPED"
				if strings.HasPrefix(strings.ToLower(cStatus), "up") {
					status = "RUNNING"
				}

				tp := 8
				if strings.Contains(cNameLower, "tp4") || strings.Contains(cNameLower, "4卡") {
					tp = 4
				}

				script := fmt.Sprintf("start_%s.sh", strings.ToLower(cName))

				pid := ""
				if status == "RUNNING" && runningPID != "" {
					pid = runningPID
				}

				result = append(result, ModelCard{
					Name:          cName,
					ServiceName:   cName,
					ContainerName: cName,
					Engine:        engine,
					TP:            tp,
					Port:          8000,
					Script:        script,
					Image:         cImg,
					Status:        status,
					PID:           pid,
				})
			}
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
