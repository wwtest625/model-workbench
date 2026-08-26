package runner

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type ExecResult struct {
	OK       bool   `json:"ok"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

type XSSHOutput struct {
	Success bool   `json:"success"`
	Stdout  string `json:"stdout"`
	Stderr  string `json:"stderr"`
	Exit    int    `json:"_exit"`
}

func getXSSHBin() string {
	home, _ := os.UserHomeDir()
	xsshPath := filepath.Join(home, ".local", "bin", "xssh")
	if _, err := os.Stat(xsshPath); err == nil {
		return xsshPath
	}
	return "xssh"
}

// RunCmd 同步在目标服务器上执行命令
func RunCmd(server string, script string, timeoutSec int) (*ExecResult, error) {
	if timeoutSec <= 0 {
		timeoutSec = 30
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec+15)*time.Second)
	defer cancel()

	xsshBin := getXSSHBin()
	home, _ := os.UserHomeDir()
	envPath := fmt.Sprintf("PATH=%s/.local/bin:%s", home, os.Getenv("PATH"))

	// --max-lines 0 取消 xssh 默认 500 行截断，避免 cat 大文件被静默截断
	cmd := exec.CommandContext(ctx, xsshBin, server, "--timeout", fmt.Sprintf("%d", timeoutSec), "--max-lines", "0", script)
	cmd.Env = append(os.Environ(), envPath)

	outBytes, err := cmd.CombinedOutput()
	rawOut := strings.TrimSpace(string(outBytes))

	var xout XSSHOutput
	if err == nil && json.Unmarshal(outBytes, &xout) == nil {
		resOut := xout.Stdout
		if resOut == "" {
			resOut = xout.Stderr
		}
		return &ExecResult{
			OK:       xout.Success,
			Stdout:   strings.TrimSpace(resOut),
			Stderr:   xout.Stderr,
			ExitCode: xout.Exit,
		}, nil
	}

	return &ExecResult{
		OK:       err == nil,
		Stdout:   rawOut,
		Stderr:   "",
		ExitCode: cmd.ProcessState.ExitCode(),
	}, nil
}

// StreamCmd 异步流式执行命令并通过 channel 输出每一行
func StreamCmd(ctx context.Context, server string, script string, timeoutSec int, outChan chan<- string) error {
	defer close(outChan)

	xsshBin := getXSSHBin()
	home, _ := os.UserHomeDir()
	envPath := fmt.Sprintf("PATH=%s/.local/bin:%s", home, os.Getenv("PATH"))

	cmd := exec.CommandContext(ctx, xsshBin, server, "--timeout", fmt.Sprintf("%d", timeoutSec), script)
	cmd.Env = append(os.Environ(), envPath)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		outChan <- fmt.Sprintf("[错误] 无法建立管道: %v", err)
		return err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		outChan <- fmt.Sprintf("[错误] 启动命令失败: %v", err)
		return err
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			outChan <- scanner.Text()
		}
	}

	return cmd.Wait()
}
