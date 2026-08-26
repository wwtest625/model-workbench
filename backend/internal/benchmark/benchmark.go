package benchmark

import (
	"context"
	"fmt"
	"strings"

	"metax-workbench/internal/host"
	"metax-workbench/internal/runner"
)

type LogFile struct {
	Name string `json:"name"`
	Size string `json:"size"`
	Time string `json:"time"`
}

type BenchmarkManager struct{}

var defaultBenchManager *BenchmarkManager

func GetBenchmarkManager() *BenchmarkManager {
	if defaultBenchManager == nil {
		defaultBenchManager = &BenchmarkManager{}
	}
	return defaultBenchManager
}

// StreamBenchmark 智能进入容器流式执行 run.py
func (b *BenchmarkManager) StreamBenchmark(ctx context.Context, modelName, dataset, concurrency string, outChan chan<- string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		outChan <- fmt.Sprintf("[错误] 获取当前主机失败: %v", err)
		close(outChan)
		return err
	}

	sh := fmt.Sprintf(`
CONTAINER=$(docker ps --filter "status=running" --format "{{.Names}}" | head -1)
if [ -n "$CONTAINER" ]; then
    echo ">> [容器环境] 正在进入容器 $CONTAINER 执行 /workspace/run.py..."
    docker exec -i $CONTAINER bash -c "export PATH=/opt/conda/bin:\$PATH; python /workspace/run.py --model %s --dataset %s" 2>&1
else
    echo ">> [宿主环境] 尝试在宿主机执行 %s/run.py..."
    python3 %s/run.py --model %s --dataset %s 2>&1
fi
`, modelName, dataset, h.Workspace, h.Workspace, modelName, dataset)

	return runner.StreamCmd(ctx, h.SSHAlias, sh, 600, outChan)
}

// StreamMCCL 流式执行 run_mccl_v6.sh
func (b *BenchmarkManager) StreamMCCL(ctx context.Context, outChan chan<- string) error {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		outChan <- fmt.Sprintf("[错误] 获取当前主机失败: %v", err)
		close(outChan)
		return err
	}

	cmd := fmt.Sprintf("bash %s/run_mccl_v6.sh 2>&1", h.Workspace)
	return runner.StreamCmd(ctx, h.SSHAlias, cmd, 120, outChan)
}

// ListLogFiles 读取 benchmark_logs/ 下的文件列表
func (b *BenchmarkManager) ListLogFiles() ([]LogFile, error) {
	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		return nil, err
	}

	sh := fmt.Sprintf("ls -lh %s/benchmark_logs/*.tar 2>/dev/null || ls -lh %s/benchmark_logs/", h.Workspace, h.Workspace)
	res, err := runner.RunCmd(h.SSHAlias, sh, 10)
	if err != nil {
		return nil, err
	}

	var logs []LogFile
	for _, line := range strings.Split(res.Stdout, "\n") {
		parts := strings.Fields(line)
		if len(parts) >= 9 {
			size := parts[4]
			dateTime := fmt.Sprintf("%s %s %s", parts[5], parts[6], parts[7])
			nameParts := strings.Split(parts[8], "/")
			name := nameParts[len(nameParts)-1]
			logs = append(logs, LogFile{
				Name: name,
				Size: size,
				Time: dateTime,
			})
		}
	}
	return logs, nil
}
