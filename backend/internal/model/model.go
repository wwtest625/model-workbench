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

	sh := `
echo "=== RUNNING_CONTAINERS ==="
docker ps --format "{{.Names}}" 2>/dev/null
echo "=== RUNNING_PID ==="
PID=$(pgrep -f 'vllm serve' | head -1 || pgrep -f 'sglang' | head -1)
echo "$PID"
echo "=== RUNNING_CMD ==="
if [ -n "$PID" ]; then
    tr '\0' ' ' < /proc/$PID/cmdline 2>/dev/null
fi
echo
`

	res, err := runner.RunCmd(h.SSHAlias, sh, 12)
	if err != nil {
		return nil, "", err
	}

	raw := res.Stdout
	runningContainers := ""
	if strings.Contains(raw, "=== RUNNING_CONTAINERS ===") {
		parts := strings.Split(raw, "=== RUNNING_CONTAINERS ===")
		if len(parts) > 1 {
			runningContainers = strings.ToLower(strings.TrimSpace(strings.Split(parts[1], "=== RUNNING_PID ===")[0]))
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
			runningCmd = strings.TrimSpace(parts[1])
		}
	}

	definedModels := []ModelCard{
		{
			Name:          "Qwen3.8-27B",
			ServiceName:   "vllm-qwen3-8-27b",
			ContainerName: "vllm-qwen3-8-27b",
			Engine:        "vLLM",
			TP:            8,
			Port:          8000,
			Script:        "start_vllm_qwen3_8_27b.sh",
			Image:         "cr.metax-tech.com/public-ai-release/maca/modelzoo.llm.vllm:1.0.3-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64",
		},
		{
			Name:          "DeepSeek-V4-Flash-W8A8",
			ServiceName:   "vllm-deepseek-v4-0731-w8a8",
			ContainerName: "vllm-deepseek-v4-0731-w8a8",
			Engine:        "vLLM",
			TP:            8,
			Port:          8001,
			Script:        "start_vllm_deepseek_v4_0731_w8a8.sh",
			Image:         "cr.metax-tech.com/public-ai-release/maca/modelzoo.llm.vllm:1.0.3-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64",
		},
		{
			Name:          "GLM-4.7-W8A8",
			ServiceName:   "vllm-glm4-7",
			ContainerName: "vllm-glm4-7",
			Engine:        "vLLM",
			TP:            8,
			Port:          8002,
			Script:        "start_vllm_glm4.7.sh",
			Image:         "cr.metax-tech.com/public-ai-release/maca/modelzoo.llm.vllm:1.0.3-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64",
		},
		{
			Name:          "MiniMax-M2.5-W8A8",
			ServiceName:   "vllm-minimax",
			ContainerName: "vllm-minimax",
			Engine:        "vLLM",
			TP:            8,
			Port:          8003,
			Script:        "start_vllm_minimax.sh",
			Image:         "cr.metax-tech.com/public-ai-release/maca/modelzoo.llm.vllm:1.0.3-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64",
		},
		{
			Name:          "Qwen3.5-122B-A10B",
			ServiceName:   "vllm-qwen3-5-122b",
			ContainerName: "vllm-qwen3-5-122b",
			Engine:        "vLLM",
			TP:            8,
			Port:          8004,
			Script:        "start_vllm_qwen3-5-122b.sh",
			Image:         "cr.metax-tech.com/public-ai-release/maca/modelzoo.llm.vllm:1.0.3-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64",
		},
		{
			Name:          "Qwen3.8-27B-DFlash2",
			ServiceName:   "sglang-qwen3-8-27b-dflash2",
			ContainerName: "sglang-qwen3-8-dflash2",
			Engine:        "SGLang",
			TP:            8,
			Port:          8001,
			Script:        "start_sglang_qwen3_8_27b_dflash2.sh",
			Image:         "cr.metax-tech.com/public-ai-release/maca/modelzoo.llm.sglang:1.0.3-maca.ai3.8.0.3-torch2.8-py312-ubuntu22.04-amd64",
		},
		{
			Name:          "Qwen3-235B-A22B",
			ServiceName:   "vllm-qwen3-5-235b",
			ContainerName: "vllm-qwen3-5-235b",
			Engine:        "vLLM",
			TP:            8,
			Port:          8005,
			Script:        "start_vllm_qwen3-235b.sh",
			Image:         "cr.metax-tech.com/public-ai-release/maca/modelzoo.llm.vllm:1.0.3-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64",
		},
	}

	for i := range definedModels {
		m := &definedModels[i]
		cname := strings.ToLower(m.ContainerName)
		isContainerRunning := strings.Contains(runningContainers, cname)

		cmdLower := strings.ToLower(runningCmd)
		isProcessMatch := false
		if m.Name == "Qwen3.8-27B" && (strings.Contains(cmdLower, "qwen3.8-27b") || strings.Contains(cmdLower, "qwen3_8_27b")) {
			isProcessMatch = true
		} else if m.Name == "DeepSeek-V4-Flash-W8A8" && strings.Contains(cmdLower, "deepseek_v4") {
			isProcessMatch = true
		} else if m.Name == "GLM-4.7-W8A8" && strings.Contains(cmdLower, "glm4.7") {
			isProcessMatch = true
		} else if m.Name == "MiniMax-M2.5-W8A8" && strings.Contains(cmdLower, "minimax") {
			isProcessMatch = true
		} else if m.Name == "Qwen3-235B-A22B" && strings.Contains(cmdLower, "qwen3-235b") {
			isProcessMatch = true
		}

		if isContainerRunning || isProcessMatch {
			m.Status = "RUNNING"
			m.PID = runningPID
		} else {
			m.Status = "STOPPED"
			m.PID = ""
		}
	}

	return definedModels, runningCmd, nil
}

func (m *ModelManager) GetScriptContent(scriptName string) (string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return "", err
	}
	clean := filepath.Base(scriptName)
	// 远端先 tr -d '\r' 统一成 LF 再 base64：xssh 的远程 shell 会规范化换行符，
	// 直接 base64 原文会因 \r\n 漂移导致保存内容与远端不一致；编码后按 76 列切分还原 \r
	cmd := fmt.Sprintf("base64 <(tr -d '\\r' < %s/%s) 2>/dev/null || echo 'SCRIPT_NOT_FOUND'", h.Workspace, clean)
	res, err := runner.RunCmd(h.SSHAlias, cmd, 10)
	if err != nil {
		return "", err
	}
	enc := strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(res.Stdout), "\n", ""), "\r", "")
	if enc == "" || enc == "U0NSSVBUX05PVF9GT1VORA==" {
		return "", fmt.Errorf("脚本不存在: %s", clean)
	}
	decoded, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}

// GetComposeSection 从 docker-compose-models.yml 中精确提取该容器的定义块
func (m *ModelManager) GetComposeSection(serviceName string, modelName string) (string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return "", err
	}

	sh := fmt.Sprintf(`
echo "=== 1. 标准启动命令 (RUN COMMAND) ==="
echo "cd %s && docker compose -f docker-compose-models.yml up -d %s"
echo
echo "=== 2. COMPOSE SERVICE 定义 (FROM docker-compose-models.yml) ==="
python3 -c "
import sys
content = open('%s/docker-compose-models.yml').read()
target = sys.argv[1]
lines = content.splitlines()
in_service = False
res = []
for line in lines:
    if line.strip().startswith(target + ':'):
        in_service = True
        res.append(line)
        continue
    if in_service:
        if line.startswith('  ') and not line.startswith('    ') and not line.strip().startswith('#') and ':' in line:
            break
        if not (line.strip().startswith('#') and '=====' in line):
            res.append(line)
print('\\n'.join(res))
" %s
`, h.Workspace, serviceName, h.Workspace, serviceName)

	res, err := runner.RunCmd(h.SSHAlias, sh, 10)
	if err != nil {
		return "", err
	}
	return res.Stdout, nil
}

func (m *ModelManager) GetContainerLogs(modelName string) (string, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return "", err
	}

	sh := `
CONTAINER=$(docker ps --filter "status=running" --format "{{.Names}}" | head -1)
if [ -n "$CONTAINER" ]; then
    echo "=== DOCKER LOGS ($CONTAINER) ==="
    docker logs --tail 250 $CONTAINER 2>&1
else
    echo "=== NO ACTIVE CONTAINER ==="
    cat /tmp/model_service.log 2>/dev/null | tail -n 100 || echo "未找到运行日志"
fi
`
	res, err := runner.RunCmd(h.SSHAlias, sh, 15)
	if err != nil {
		return "", err
	}
	return res.Stdout, nil
}

func (m *ModelManager) StartModel(serviceName string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}
	// 1. 确保所有脚本换行符规范为 Linux LF
	// 2. 停止旧容器并拉起新容器
	cmd := fmt.Sprintf(`
sed -i 's/\r$//' %s/*.sh 2>/dev/null || true
cd %s && docker compose -f docker-compose-models.yml up -d --force-recreate %s
`, h.Workspace, h.Workspace, serviceName)
	_, err = runner.RunCmd(h.SSHAlias, cmd, 25)
	return err
}

func (m *ModelManager) StopModel(serviceName string, containerName string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}
	cmd := fmt.Sprintf(`
cd %s && docker compose -f docker-compose-models.yml stop %s 2>/dev/null || true
if [ -n "%s" ]; then
    docker stop %s 2>/dev/null || true
fi
`, h.Workspace, serviceName, containerName, containerName)
	_, err = runner.RunCmd(h.SSHAlias, cmd, 20)
	return err
}

func (m *ModelManager) StopAllModels() error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}
	cmd := fmt.Sprintf("cd %s && docker compose -f docker-compose-models.yml down 2>/dev/null || pkill -9 -f 'vllm serve' 2>/dev/null || true", h.Workspace)
	_, err = runner.RunCmd(h.SSHAlias, cmd, 20)
	return err
}

func (m *ModelManager) SaveScriptContent(scriptName string, newContent string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return err
	}
	clean := filepath.Base(scriptName)
	// 规范化换行，去掉 Windows \r
	normalized := strings.ReplaceAll(newContent, "\r\n", "\n")
	b64 := base64.StdEncoding.EncodeToString([]byte(normalized))
	sh := fmt.Sprintf(`
echo "%s" | base64 -d > %s/%s
sed -i 's/\r$//' %s/%s 2>/dev/null || true
chmod +x %s/%s
`, b64, h.Workspace, clean, h.Workspace, clean, h.Workspace, clean)

	_, err = runner.RunCmd(h.SSHAlias, sh, 15)
	return err
}
