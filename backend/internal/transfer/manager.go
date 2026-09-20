package transfer

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"metax-workbench/internal/runner"
)

// TransferManager 工业级模型传输与分发全生命周期管理中枢
type TransferManager struct {
	store     *TaskStore
	preflight *PreflightChecker
	verifier  *WeightVerifier
	daemonMu  sync.Mutex
}

var defaultManager *TransferManager
var managerOnce sync.Once

func GetTransferManager() *TransferManager {
	managerOnce.Do(func() {
		defaultManager = &TransferManager{
			store:     GetTaskStore(),
			preflight: NewPreflightChecker(),
			verifier:  NewWeightVerifier(),
		}
		go defaultManager.startDaemon()
	})
	return defaultManager
}

// PreflightCheck 传输前空间与健康度预检
func (m *TransferManager) PreflightCheck(sourceServer, sourcePath, targetServer, targetPath string) (*PreflightCheckResult, error) {
	return m.preflight.CheckSpace(sourceServer, sourcePath, targetServer, targetPath)
}

// StartTask 启动新分发传输任务 (带前置空间校验拦截)
func (m *TransferManager) StartTask(sourceServer, sourcePath, targetServer, targetPath, modelName string) (*TransferTask, error) {
	if sourceServer == "" {
		sourceServer = "192.2.56.76"
	}
	if targetServer == "" {
		targetServer = "192.2.0.146"
	}
	if modelName == "" {
		parts := strings.Split(strings.TrimRight(sourcePath, "/"), "/")
		modelName = parts[len(parts)-1]
	}
	if targetPath == "" {
		targetPath = fmt.Sprintf("/data/model/%s", modelName)
	}

	// 1. 严格前置空间预检
	checkResult, err := m.preflight.CheckSpace(sourceServer, sourcePath, targetServer, targetPath)
	if err != nil {
		return nil, fmt.Errorf("传输前目标空间预检失败: %v", err)
	}
	if !checkResult.Allowed {
		return nil, fmt.Errorf("%s", checkResult.Message)
	}

	// 2. 目标端预先创建目标目录
	shMkdir := fmt.Sprintf("mkdir -p %s", targetPath)
	_, _ = runner.RunCmd(targetServer, shMkdir, 5)

	// 3. 在源端服务器拉起 rsync 后台断点续传进程
	shRsync := fmt.Sprintf(`
nohup rsync -avP --info=progress2 %s/ %s:%s/ > /tmp/rsync_%s.log 2>&1 &
echo $!
`, sourcePath, targetServer, targetPath, modelName)

	res, err := runner.RunCmd(sourceServer, shRsync, 10)
	if err != nil || !res.OK {
		return nil, fmt.Errorf("拉起 rsync 传输进程失败: %v, raw: %s", err, res.Stderr)
	}

	pid := strings.TrimSpace(res.Stdout)
	taskID := fmt.Sprintf("task-%s-%d", modelName, time.Now().Unix())

	task := &TransferTask{
		ID:              taskID,
		PID:             pid,
		ModelName:       modelName,
		SourceServer:    sourceServer,
		SourcePath:      sourcePath,
		TargetServer:    targetServer,
		TargetPath:      targetPath,
		Status:          StatusSyncing,
		Progress:        1,
		Speed:           "计算中...",
		ETA:             "--:--",
		TransferredDesc: "开始增量比对与传输...",
		TotalSize:       checkResult.ModelSizeHuman,
		Preflight:       checkResult,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	if err := m.store.UpsertTask(task); err != nil {
		return nil, err
	}

	return task, nil
}

// ResumeTask 意外中断任务的一键断点续传
func (m *TransferManager) ResumeTask(taskID string) (*TransferTask, error) {
	task, err := m.store.GetTask(taskID)
	if err != nil {
		return nil, err
	}

	// 再次做轻量空间检查
	checkResult, err := m.preflight.CheckSpace(task.SourceServer, task.SourcePath, task.TargetServer, task.TargetPath)
	if err == nil && !checkResult.Allowed {
		return nil, fmt.Errorf("%s", checkResult.Message)
	}

	shRsync := fmt.Sprintf(`
nohup rsync -avP --info=progress2 %s/ %s:%s/ > /tmp/rsync_%s.log 2>&1 &
echo $!
`, task.SourcePath, task.TargetServer, task.TargetPath, task.ModelName)

	res, err := runner.RunCmd(task.SourceServer, shRsync, 10)
	if err != nil || !res.OK {
		return nil, fmt.Errorf("重新拉起断点续传失败: %v, raw: %s", err, res.Stderr)
	}

	task.PID = strings.TrimSpace(res.Stdout)
	task.Status = StatusSyncing
	task.Speed = "恢复续传中..."
	task.ErrorMessage = ""
	task.UpdatedAt = time.Now()

	if err := m.store.UpsertTask(task); err != nil {
		return nil, err
	}
	return task, nil
}

// StopTask 终止正在运行的传输任务
func (m *TransferManager) StopTask(taskID string) error {
	task, err := m.store.GetTask(taskID)
	if err != nil {
		return err
	}

	if task.PID != "" {
		shKill := fmt.Sprintf("kill -9 %s 2>/dev/null || true", task.PID)
		_, _ = runner.RunCmd(task.SourceServer, shKill, 5)
	}

	task.Status = StatusInterrupted
	task.Speed = "已手动暂停"
	task.ErrorMessage = "用户手动终止传输，支持一键续传"
	task.UpdatedAt = time.Now()

	return m.store.UpsertTask(task)
}

// VerifyTask 手动触发权重完整性深度质检
func (m *TransferManager) VerifyTask(taskID string) (*VerifyReport, error) {
	task, err := m.store.GetTask(taskID)
	if err != nil {
		return nil, err
	}

	task.Status = StatusVerifying
	task.UpdatedAt = time.Now()
	_ = m.store.UpsertTask(task)

	report, err := m.verifier.VerifyModelDir(task.TargetServer, task.TargetPath)
	if err != nil {
		task.Status = StatusVerifyFailed
		task.ErrorMessage = fmt.Sprintf("质检执行异常: %v", err)
		task.UpdatedAt = time.Now()
		_ = m.store.UpsertTask(task)
		return nil, err
	}

	task.VerifyResult = report
	if report.Passed {
		task.Status = StatusSuccess
		task.Progress = 100
		now := time.Now()
		task.FinishedAt = &now
		task.TransferredDesc = "全部分片质检通过 (100%)"
	} else {
		task.Status = StatusVerifyFailed
		task.ErrorMessage = report.Details
	}
	task.UpdatedAt = time.Now()
	_ = m.store.UpsertTask(task)

	return report, nil
}

// ListTasks 列出所有传输任务
func (m *TransferManager) ListTasks() ([]TransferTask, error) {
	return m.store.ListTasks()
}

// DeleteTask 删除任务记录
func (m *TransferManager) DeleteTask(taskID string) error {
	return m.store.DeleteTask(taskID)
}

// GetTaskLog 读取任务的实时传输日志
func (m *TransferManager) GetTaskLog(taskID string, lines int) (string, error) {
	task, err := m.store.GetTask(taskID)
	if err != nil {
		return "", err
	}
	if lines <= 0 {
		lines = 100
	}

	sh := fmt.Sprintf("tail -n %d /tmp/rsync_%s.log 2>/dev/null", lines, task.ModelName)
	res, err := runner.RunCmd(task.SourceServer, sh, 5)
	if err != nil || !res.OK {
		return "", fmt.Errorf("读取远程日志失败: %v", err)
	}
	return res.Stdout, nil
}

// startDaemon 后台守护协程: 实时捕获传输状态、感知网络闪断、自动触发质检
func (m *TransferManager) startDaemon() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		tasks, err := m.store.ListTasks()
		if err != nil {
			continue
		}

		for _, t := range tasks {
			if t.Status != StatusSyncing && t.Status != StatusVerifying {
				continue
			}

			// 检查源服务器上该进程是否还活着
			shCheck := fmt.Sprintf(`python3 -c '
import os, sys, subprocess, json, re

pid = "%s"
model_name = "%s"
log_path = f"/tmp/rsync_{model_name}.log"

alive = False
if pid and pid.isdigit():
    try:
        os.kill(int(pid), 0)
        alive = True
    except OSError:
        alive = False

# 读取日志内容
content = ""
last_log = ""
if os.path.exists(log_path):
    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        lines = [l.strip() for l in re.split(r"[\r\n]+", content) if l.strip()]
        if lines:
            clean_last = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", lines[-1]).strip()
            last_log = clean_last[-140:]
    except Exception:
        pass

# 分析传输进度与速率
progress = 5
speed = ""
eta = ""
file_pct = 0
cur_shard = 0
total_shards = 0

if content:
    lines = [l.strip() for l in re.split(r"[\r\n]+", content) if l.strip()]
    for l in lines[-100:]:
        m_name = re.search(r"(?:model|pytorch_model|\w+)[-_.](\d+)-of-(\d+)", l, re.IGNORECASE)
        if m_name:
            cur_shard = int(m_name.group(1))
            total_shards = int(m_name.group(2))
        m_pct = re.search(r"(\d+)%%\s+([\d\.]+[KMG]?B/s)\s+([\d:]+)", l)
        if m_pct:
            file_pct = int(m_pct.group(1))
            speed = m_pct.group(2)
            eta = m_pct.group(3)

if total_shards > 0 and cur_shard > 0:
    smooth_pct = ((cur_shard - 1) + (file_pct / 100.0)) / total_shards * 100.0
    progress = min(99, max(1, int(smooth_pct)))
elif file_pct > 0:
    progress = min(99, max(1, file_pct))

is_complete = ("total size is" in content and "speedup is" in content)
has_error = ("rsync error:" in content or "error" in content.lower())

print(json.dumps({
    "alive": alive,
    "last_log": last_log,
    "progress": progress,
    "speed": speed,
    "eta": eta,
    "cur_shard": cur_shard,
    "total_shards": total_shards,
    "is_complete": is_complete,
    "has_error": has_error
}))
'`, t.PID, t.ModelName)

			res, err := runner.RunCmd(t.SourceServer, shCheck, 6)
			if err != nil || !res.OK {
				continue
			}

			var statusInfo struct {
				Alive       bool   `json:"alive"`
				LastLog     string `json:"last_log"`
				Progress    int    `json:"progress"`
				Speed       string `json:"speed"`
				ETA         string `json:"eta"`
				CurShard    int    `json:"cur_shard"`
				TotalShards int    `json:"total_shards"`
				IsComplete  bool   `json:"is_complete"`
				HasError    bool   `json:"has_error"`
			}

			if json.Unmarshal([]byte(strings.TrimSpace(res.Stdout)), &statusInfo) != nil {
				continue
			}

			taskRef, err := m.store.GetTask(t.ID)
			if err != nil {
				continue
			}

			taskRef.LastLog = statusInfo.LastLog

			if statusInfo.Alive {
				// 进程正在活跃传输
				taskRef.Status = StatusSyncing
				taskRef.Progress = statusInfo.Progress
				taskRef.Speed = statusInfo.Speed
				taskRef.ETA = statusInfo.ETA
				if statusInfo.TotalShards > 0 {
					taskRef.TransferredDesc = fmt.Sprintf("正在传输分片 %d/%d", statusInfo.CurShard, statusInfo.TotalShards)
				}
				taskRef.UpdatedAt = time.Now()
				_ = m.store.UpsertTask(taskRef)
			} else {
				// 进程已不在运行，分析退出原因
				if statusInfo.IsComplete {
					// rsync 正常传输完毕，触发自动化完整性校验
					taskRef.Status = StatusVerifying
					taskRef.Progress = 100
					taskRef.Speed = "质检中..."
					taskRef.TransferredDesc = "传输结束，正在深度核验权重分片与 Header..."
					taskRef.UpdatedAt = time.Now()
					_ = m.store.UpsertTask(taskRef)

					// 异步触发校验
					go func(tid string) {
						_, _ = m.VerifyTask(tid)
					}(taskRef.ID)
				} else if statusInfo.HasError || !statusInfo.IsComplete {
					// 意外中断 / 网络闪断 / 异常退出
					taskRef.Status = StatusInterrupted
					taskRef.Speed = "已中断"
					taskRef.ErrorMessage = "传输进程意外退出或网络中断，已保留断点进度，点击【一键续传】即可继续"
					taskRef.TransferredDesc = fmt.Sprintf("意外中断于进度 %d%%", taskRef.Progress)
					taskRef.UpdatedAt = time.Now()
					_ = m.store.UpsertTask(taskRef)
				}
			}
		}
	}
}
