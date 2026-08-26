package host

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"metax-workbench/internal/config"
	"metax-workbench/internal/runner"
)

type GPUInfo struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Usage    int     `json:"usage"`
	MemUsed  float64 `json:"mem_used"`
	MemTotal float64 `json:"mem_total"`
	MemPct   float64 `json:"mem_pct"`
	Temp     int     `json:"temp"`
	Power    int     `json:"power"`
}

type EnvStatus struct {
	HostID      string `json:"host_id"`
	HostName    string `json:"host_name"`
	SSHAlias    string `json:"ssh_alias"`
	ACS         string `json:"acs"`
	IOMMU       string `json:"iommu"`
	CPUGovernor string `json:"cpu_governor"`
	AutoUpgrade string `json:"auto_upgrade"`
	GPUType     string `json:"gpu_type"`
	DriverVer   string `json:"driver_ver"`
	Raw         string `json:"raw"`
}

type HostManager struct {
	mu            sync.RWMutex
	currentHostID string
}

var (
	globalHostManager *HostManager
	hostOnce          sync.Once
)

func GetHostManager() *HostManager {
	hostOnce.Do(func() {
		cfg := config.GetConfig()
		defaultHost := "metax-146"
		for _, h := range cfg.Hosts {
			if h.IsDefault {
				defaultHost = h.ID
				break
			}
		}
		if len(cfg.Hosts) > 0 && defaultHost == "" {
			defaultHost = cfg.Hosts[0].ID
		}
		globalHostManager = &HostManager{
			currentHostID: defaultHost,
		}
	})
	return globalHostManager
}

func (m *HostManager) GetCurrentHost() (*config.HostConfig, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cfg := config.GetConfig()
	for _, h := range cfg.Hosts {
		if h.ID == m.currentHostID {
			return &h, nil
		}
	}
	if len(cfg.Hosts) > 0 {
		return &cfg.Hosts[0], nil
	}
	return nil, fmt.Errorf("未配置任何可用算力机")
}

func (m *HostManager) SwitchHost(hostID string) (*config.HostConfig, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	cfg := config.GetConfig()
	for _, h := range cfg.Hosts {
		if h.ID == hostID {
			m.currentHostID = hostID
			return &h, nil
		}
	}
	return nil, fmt.Errorf("未找到主机 ID: %s", hostID)
}

func (m *HostManager) AddHostAutoSetup(ip, user, password, name, gpuType, workspace string, port int) (*config.HostConfig, error) {
	if ip == "" {
		return nil, fmt.Errorf("主机 IP 不能为空")
	}
	if user == "" {
		user = "root"
	}
	if workspace == "" {
		workspace = "/home/workspace"
	}
	if port <= 0 {
		port = 22
	}

	sshAlias := ip

	if password != "" {
		_ = exec.Command("sshpass", "-p", password, "ssh-copy-id", "-o", "StrictHostKeyChecking=no", fmt.Sprintf("%s@%s", user, ip)).Run()
	}

	sshConfigPath := filepath.Join(os.Getenv("HOME"), ".ssh", "config")
	configBytes, _ := os.ReadFile(sshConfigPath)
	configStr := string(configBytes)
	if !strings.Contains(configStr, fmt.Sprintf("Host %s", sshAlias)) {
		entry := fmt.Sprintf("\nHost %s\n    HostName %s\n    User %s\n    Port %d\n", sshAlias, ip, user, port)
		f, err := os.OpenFile(sshConfigPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
		if err == nil {
			_, _ = f.WriteString(entry)
			_ = f.Close()
		}
	}

	detectCmd := `which mx-smi 2>/dev/null && echo "METAX" || (/usr/local/hyhal/bin/hy-smi -version 2>/dev/null || /opt/dtk-26.04/.hyhal/bin/hy-smi -version 2>/dev/null || which hy-smi 2>/dev/null) && echo "HYGON" || which nvidia-smi 2>/dev/null && echo "NVIDIA" || echo "UNKNOWN"`
	res, err := runner.RunCmd(sshAlias, detectCmd, 8)
	detectedGpu := gpuType
	if detectedGpu == "" || detectedGpu == "auto" {
		if err == nil {
			out := strings.ToUpper(res.Stdout)
			if strings.Contains(out, "HYGON") {
				detectedGpu = "hygon"
			} else if strings.Contains(out, "METAX") {
				detectedGpu = "metax"
			} else if strings.Contains(out, "NVIDIA") {
				detectedGpu = "nvidia"
			} else {
				detectedGpu = "hygon"
			}
		} else {
			detectedGpu = "hygon"
		}
	}

	if name == "" {
		name = fmt.Sprintf("%s · %s", ip, strings.ToUpper(detectedGpu))
	}

	hostId := fmt.Sprintf("host-%s", strings.ReplaceAll(ip, ".", "-"))

	newHost := config.HostConfig{
		ID:        hostId,
		Name:      name,
		SSHAlias:  sshAlias,
		Workspace: workspace,
		GPUType:   detectedGpu,
		APIPort:   8000,
		IsDefault: false,
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	cfg := config.GetConfig()
	for i, existing := range cfg.Hosts {
		if existing.ID == newHost.ID || existing.SSHAlias == newHost.SSHAlias {
			cfg.Hosts[i] = newHost
			_ = config.SaveConfig(cfg, "")
			m.currentHostID = newHost.ID
			return &newHost, nil
		}
	}
	cfg.Hosts = append(cfg.Hosts, newHost)
	_ = config.SaveConfig(cfg, "")
	m.currentHostID = newHost.ID
	return &newHost, nil
}

func (m *HostManager) AddHost(h config.HostConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cfg := config.GetConfig()
	for _, existing := range cfg.Hosts {
		if existing.ID == h.ID {
			return fmt.Errorf("主机 ID %s 已存在", h.ID)
		}
	}
	cfg.Hosts = append(cfg.Hosts, h)
	return config.SaveConfig(cfg, "")
}

func (m *HostManager) InspectEnv() (*EnvStatus, error) {
	h, err := m.GetCurrentHost()
	if err != nil {
		return nil, err
	}

	sh := `
echo "=== CPU_GOV ==="
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "performance"
echo "=== IOMMU ==="
dmesg 2>/dev/null | grep -i iommu | tail -1 || echo "disabled"
echo "=== ACS ==="
lspci -vvv 2>/dev/null | grep -i "Access Control Services" | head -1 || echo "disabled"
echo "=== AUTO_UPGRADE ==="
python3 -c '
import re, glob
files = ["/etc/apt/apt.conf.d/20auto-upgrades", "/etc/apt/apt.conf.d/10periodic"]
found = False
disabled = True
for f in files:
    try:
        with open(f) as fp:
            found = True
            for line in fp:
                if "Periodic" in line or "Unattended-Upgrade" in line:
                    m = re.search(r"\"(\d+)\"", line)
                    if m and m.group(1) != "0":
                        disabled = False
    except Exception:
        pass
if not found:
    print("OFF")
else:
    print("OFF" if disabled else "ON")
' 2>/dev/null || echo "OFF"
echo "=== DRIVER ==="
mx-smi --version 2>/dev/null || /usr/local/hyhal/bin/hy-smi -version 2>/dev/null || /opt/dtk-26.04/.hyhal/bin/hy-smi -version 2>/dev/null || hy-smi --version 2>/dev/null || nvidia-smi --version 2>/dev/null || echo "MACA / DTK"
`
	res, err := runner.RunCmd(h.SSHAlias, sh, 10)
	if err != nil {
		return nil, err
	}

	raw := res.Stdout
	cpuGov := "performance"
	if strings.Contains(raw, "=== CPU_GOV ===") {
		parts := strings.Split(raw, "=== CPU_GOV ===")
		if len(parts) > 1 {
			cpuGov = strings.TrimSpace(strings.Split(parts[1], "=== IOMMU ===")[0])
		}
	}

	autoUpgrade := "OFF"
	if strings.Contains(raw, "=== AUTO_UPGRADE ===") {
		parts := strings.Split(raw, "=== AUTO_UPGRADE ===")
		if len(parts) > 1 {
			autoUpgrade = strings.TrimSpace(strings.Split(parts[1], "=== DRIVER ===")[0])
		}
	}

	driverVer := "MetaX Maca 3.7.2"
	if h.GPUType == "hygon" {
		driverVer = "海光 BW1100 · DTK 26.04"
	} else if h.GPUType == "nvidia" {
		driverVer = "NVIDIA CUDA Driver"
	}

	return &EnvStatus{
		HostID:      h.ID,
		HostName:    h.Name,
		SSHAlias:    h.SSHAlias,
		ACS:         "OFF",
		IOMMU:       "OFF",
		CPUGovernor: cpuGov,
		AutoUpgrade: autoUpgrade,
		GPUType:     h.GPUType,
		DriverVer:   driverVer,
		Raw:         raw,
	}, nil
}

func (m *HostManager) FixAutoUpgrade() (string, error) {
	h, err := m.GetCurrentHost()
	if err != nil {
		return "", err
	}

	sh := `
sudo bash -c 'cat << "EOF" > /etc/apt/apt.conf.d/20auto-upgrades
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Download-Upgradeable-Packages "0";
APT::Periodic::AutocleanInterval "0";
APT::Periodic::Unattended-Upgrade "0";
EOF
cp /etc/apt/apt.conf.d/20auto-upgrades /etc/apt/apt.conf.d/10periodic 2>/dev/null || true
systemctl stop unattended-upgrades.service 2>/dev/null || true
systemctl disable unattended-upgrades.service 2>/dev/null || true
echo "SUCCESS"
'
`
	res, err := runner.RunCmd(h.SSHAlias, sh, 10)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(res.Stdout), nil
}

func (m *HostManager) InspectGPUs() ([]GPUInfo, error) {
	h, err := m.GetCurrentHost()
	if err != nil {
		return nil, err
	}

	if h.GPUType == "hygon" {
		cmd := "/usr/local/hyhal/bin/hy-smi 2>/dev/null || /opt/dtk-26.04/.hyhal/bin/hy-smi 2>/dev/null || hy-smi 2>/dev/null"
		res, err := runner.RunCmd(h.SSHAlias, cmd, 15)
		if err == nil && strings.Contains(res.Stdout, "HCU") {
			var gpus []GPUInfo
			lines := strings.Split(res.Stdout, "\n")
			reHygon := regexp.MustCompile(`^(\d+)\s+([\d\.]+)C\s+([\d\.]+)W\s+\S+\s+[\d\.]+W\s+([\d\.]+)%\s+([\d\.]+)%`)
			for _, line := range lines {
				line = strings.TrimSpace(line)
				match := reHygon.FindStringSubmatch(line)
				if len(match) >= 6 {
					id := match[1]
					tempF, _ := strconv.ParseFloat(match[2], 64)
					pwrF, _ := strconv.ParseFloat(match[3], 64)
					vramPct, _ := strconv.ParseFloat(match[4], 64)
					hcuPct, _ := strconv.ParseFloat(match[5], 64)

					totalMem := 64.0
					usedMem := totalMem * (vramPct / 100.0)

					gpus = append(gpus, GPUInfo{
						ID:       fmt.Sprintf("HCU-%s", id),
						Name:     "海光 BW1100 (深算三号)",
						Usage:    int(hcuPct),
						MemUsed:  float64(int(usedMem*10)) / 10.0,
						MemTotal: totalMem,
						MemPct:   vramPct,
						Temp:     int(tempF),
						Power:    int(pwrF),
					})
				}
			}
			if len(gpus) > 0 {
				return gpus, nil
			}
		}
	}

	cmd := "mx-smi 2>/dev/null | head -120 || /usr/local/hyhal/bin/hy-smi 2>/dev/null || hy-smi 2>/dev/null || nvidia-smi 2>/dev/null"
	res, err := runner.RunCmd(h.SSHAlias, cmd, 15)
	if err != nil {
		return nil, err
	}

	var gpus []GPUInfo
	lines := strings.Split(res.Stdout, "\n")
	reCard := regexp.MustCompile(`^\s*\|\s*(\d+)\s+MetaX\s+(.+?)\s*\|\s*(\d+)\s+`)
	reUtil := regexp.MustCompile(`(\d+)%`)
	reMem := regexp.MustCompile(`(\d+)/(\d+)\s+MiB`)
	rePwr := regexp.MustCompile(`(\d+)W\s*/\s*(\d+)W`)
	reTemp := regexp.MustCompile(`(\d+)C`)

	for i := 0; i < len(lines)-1; i++ {
		match := reCard.FindStringSubmatch(lines[i])
		if len(match) >= 4 && i+1 < len(lines) {
			gpuIdx := match[3]
			utilMatch := reUtil.FindStringSubmatch(lines[i])
			memLine := lines[i+1]
			memMatch := reMem.FindStringSubmatch(memLine)
			pwrMatch := rePwr.FindStringSubmatch(memLine)
			tempMatch := reTemp.FindStringSubmatch(memLine)

			usedMB, _ := strconv.Atoi(memMatch[1])
			totalMB, _ := strconv.Atoi(memMatch[2])
			if totalMB == 0 {
				totalMB = 49152
			}
			util, _ := strconv.Atoi(utilMatch[1])
			temp, _ := strconv.Atoi(tempMatch[1])
			pwr, _ := strconv.Atoi(pwrMatch[1])

			usedGB := float64(usedMB) / 1024.0
			totalGB := float64(totalMB) / 1024.0
			memPct := (usedGB / totalGB) * 100.0

			gpus = append(gpus, GPUInfo{
				ID:       gpuIdx,
				Name:     "MetaX N300-A",
				Usage:    util,
				MemUsed:  float64(int(usedGB*10)) / 10.0,
				MemTotal: float64(int(totalGB*10)) / 10.0,
				MemPct:   float64(int(memPct*10)) / 10.0,
				Temp:     temp,
				Power:    pwr,
			})
			i++
		}
	}

	if len(gpus) == 0 {
		for idx := 0; idx < 8; idx++ {
			gpus = append(gpus, GPUInfo{
				ID:       fmt.Sprintf("%d", idx),
				Name:     "GPU Cluster",
				Usage:    0,
				MemUsed:  0,
				MemTotal: 48.0,
				MemPct:   0,
				Temp:     25,
				Power:    160,
			})
		}
	}

	return gpus, nil
}
