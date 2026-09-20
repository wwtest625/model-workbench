package transfer

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"metax-workbench/internal/runner"
)

// PreflightChecker 目标机器路径空间与就绪状态预检器
type PreflightChecker struct{}

func NewPreflightChecker() *PreflightChecker {
	return &PreflightChecker{}
}

// FormatBytes 友好字节可读转换
func FormatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// CheckSpace 校验目标机器路径是否有足够空间容纳源端模型
func (c *PreflightChecker) CheckSpace(sourceServer, sourcePath, targetServer, targetPath string) (*PreflightCheckResult, error) {
	if sourceServer == "" {
		sourceServer = "192.2.56.76"
	}
	if targetServer == "" {
		targetServer = "192.2.0.146"
	}

	result := &PreflightCheckResult{
		SourceServer: sourceServer,
		SourcePath:   sourcePath,
		TargetServer: targetServer,
		TargetPath:   targetPath,
	}

	// 1. 获取源端模型文件大小 (字节)
	shSource := fmt.Sprintf(`python3 -c '
import os, sys, subprocess

p = """%s""".strip()
total_bytes = 0
if os.path.exists(p):
    try:
        # 优先极速 du -sb
        du_out = subprocess.check_output(["du", "-sb", p], text=True, stderr=subprocess.DEVNULL)
        total_bytes = int(du_out.split()[0])
    except Exception:
        for root, dirs, files in os.walk(p):
            for f in files:
                fp = os.path.join(root, f)
                if not os.path.islink(fp):
                    try:
                        total_bytes += os.path.getsize(fp)
                    except Exception:
                        pass
print(total_bytes)
'`, sourcePath)

	resSrc, err := runner.RunCmd(sourceServer, shSource, 8)
	if err != nil || !resSrc.OK {
		return nil, fmt.Errorf("无法连接源服务器 %s 探测模型大小: %v", sourceServer, err)
	}

	srcBytes, _ := strconv.ParseInt(strings.TrimSpace(resSrc.Stdout), 10, 64)
	if srcBytes <= 0 {
		return nil, fmt.Errorf("源端模型路径 %s 不存在或大小为 0", sourcePath)
	}
	result.ModelSizeBytes = srcBytes
	result.ModelSizeHuman = FormatBytes(srcBytes)

	// 2. 获取目标端服务器目标路径所在磁盘分区的剩余可用空间
	shTarget := fmt.Sprintf(`python3 -c '
import os, sys, shutil, json, subprocess

p = """%s""".strip()
cur = p
while cur and not os.path.exists(cur):
    parent = os.path.dirname(cur)
    if parent == cur:
        break
    cur = parent

if not cur or not os.path.exists(cur):
    cur = "/"

usage = shutil.disk_usage(cur)
mount = "/"
try:
    out = subprocess.check_output(["df", "-P", cur], text=True)
    lines = out.strip().split("\n")
    if len(lines) > 1:
        mount = lines[1].split()[-1]
except Exception:
    pass

print(json.dumps({
    "total": usage.total,
    "free": usage.free,
    "mount": mount
}))
'`, targetPath)

	resTgt, err := runner.RunCmd(targetServer, shTarget, 8)
	if err != nil || !resTgt.OK {
		return nil, fmt.Errorf("无法连接目标服务器 %s 探测磁盘空间: %v", targetServer, err)
	}

	var tgtDisk struct {
		Total int64  `json:"total"`
		Free  int64  `json:"free"`
		Mount string `json:"mount"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(resTgt.Stdout)), &tgtDisk); err != nil {
		return nil, fmt.Errorf("解析目标服务器磁盘信息失败: %v, raw: %s", err, resTgt.Stdout)
	}

	result.TargetFreeBytes = tgtDisk.Free
	result.TargetFreeHuman = FormatBytes(tgtDisk.Free)
	result.TargetTotalHuman = FormatBytes(tgtDisk.Total)
	result.MountPoint = tgtDisk.Mount

	// 3. 空间校验裁决: 需留出 2GB 安全边际
	safetyBuffer := int64(2 * 1024 * 1024 * 1024)
	requiredBytes := srcBytes + safetyBuffer

	if tgtDisk.Free < requiredBytes {
		result.Allowed = false
		result.Message = fmt.Sprintf("⚠️ 目标算力机磁盘空间不足！模型需 %s，挂载点 [%s] 仅剩 %s 可用。已强制拦截，防止写满导致系统崩溃！",
			result.ModelSizeHuman, result.MountPoint, result.TargetFreeHuman)
	} else {
		result.Allowed = true
		result.Message = fmt.Sprintf("✅ 空间预检通过！目标挂载点 [%s] 剩余 %s (模型需 %s，容量充裕)",
			result.MountPoint, result.TargetFreeHuman, result.ModelSizeHuman)
	}

	return result, nil
}
