package hub

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"metax-workbench/internal/runner"
)

type LocalModelAsset struct {
	Name       string `json:"name"`
	Server     string `json:"server"`      // 76 或 test03
	Path       string `json:"path"`        // 完整路径
	ServerIP   string `json:"server_ip"`   // 192.2.56.76 或 192.2.29.9
	Time       string `json:"time"`
	Type       string `json:"type"`        // MAIN (76) 或 ARCHIVE (test03)
}

type HubModelItem struct {
	ID          string   `json:"id"`           // metax-tech/DeepSeek-V4-Flash-0731-W8A8
	Name        string   `json:"name"`         // DeepSeek-V4-Flash-0731-W8A8
	Owner       string   `json:"owner"`        // metax-tech
	Description string   `json:"description"`
	Downloads   int      `json:"downloads"`
	UpdatedAt   string   `json:"updated_at"`
	FileSize    int64    `json:"file_size"`    // bytes
	Tags        []string `json:"tags"`
	LocalStatus string   `json:"local_status"` // LOCAL_76, LOCAL_TEST03, CLOUD_ONLY
	LocalPath   string   `json:"local_path"`
	DownloadCmd string   `json:"download_cmd"`
	RsyncCmd    string   `json:"rsync_cmd"`
}

type HubManager struct {
	localCache     []LocalModelAsset
	cacheUpdatedAt time.Time
	mu             sync.RWMutex
}

var defaultHubManager *HubManager

func GetHubManager() *HubManager {
	if defaultHubManager == nil {
		defaultHubManager = &HubManager{}
	}
	return defaultHubManager
}

func (h *HubManager) ScanLocalAssets(force bool) ([]LocalModelAsset, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !force && len(h.localCache) > 0 && time.Since(h.cacheUpdatedAt) < 2*time.Minute {
		return h.localCache, nil
	}

	var assets []LocalModelAsset

	// 1. 扫描 76 主力服务器 (/data/AI_model/)
	res76, err := runner.RunCmd("192.2.56.76", "ls -l --time-style=iso /data/AI_model/ 2>/dev/null", 10)
	if err == nil && res76.OK {
		for _, line := range strings.Split(res76.Stdout, "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 8 && strings.HasPrefix(fields[0], "d") {
				name := fields[7]
				if name != "." && name != ".." && name != "temp-ssd" {
					assets = append(assets, LocalModelAsset{
						Name:     name,
						Server:   "76 (主力存储)",
						ServerIP: "192.2.56.76",
						Path:     fmt.Sprintf("/data/AI_model/%s", name),
						Time:     fields[5] + " " + fields[6],
						Type:     "MAIN",
					})
				}
			}
		}
	}

	// 2. 扫描 test03 历史仓库 (/HDD_Raid/SVN_MODEL_REPO/Model/)
	res29, err := runner.RunCmd("192.2.29.9", "ls -l --time-style=iso /HDD_Raid/SVN_MODEL_REPO/Model/ 2>/dev/null | head -100", 10)
	if err == nil && res29.OK {
		for _, line := range strings.Split(res29.Stdout, "\n") {
			fields := strings.Fields(line)
			if len(fields) >= 8 && strings.HasPrefix(fields[0], "d") {
				name := fields[7]
				if name != "." && name != ".." {
					assets = append(assets, LocalModelAsset{
						Name:     name,
						Server:   "test03 (历史仓库)",
						ServerIP: "192.2.29.9",
						Path:     fmt.Sprintf("/HDD_Raid/SVN_MODEL_REPO/Model/%s", name),
						Time:     fields[5] + " " + fields[6],
						Type:     "ARCHIVE",
					})
				}
			}
		}
	}

	h.localCache = assets
	h.cacheUpdatedAt = time.Now()
	return assets, nil
}

func normalizeName(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, ".", "")
	return s
}

// SearchModelScope 远程查询 ModelScope 社区并与本地资产关联
func (h *HubManager) SearchModelScope(query string, org string, pageSize int) ([]HubModelItem, error) {
	if pageSize <= 0 {
		pageSize = 20
	}
	if org == "" {
		org = "metax-tech"
	}

	localAssets, _ := h.ScanLocalAssets(false)

	// 通过 76 上安装的 Python modelscope SDK 极速拉取结构化 JSON
	sh := fmt.Sprintf(`
python3 -c '
import json
from modelscope.hub.api import HubApi
api = HubApi()
org = "%s"
query = "%s".lower()
try:
    res = api.list_models(owner_or_group=org, page_size=%d)
    models = res.get("Models", [])
    if query and query != "all":
        models = [m for m in models if query in m.get("Name", "").lower() or query in m.get("Id", "").lower()]
    print(json.dumps(models, default=str, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)}))
'
`, org, query, pageSize)

	res, err := runner.RunCmd("192.2.56.76", sh, 15)
	if err != nil {
		return nil, err
	}

	var rawList []map[string]interface{}
	if err := json.Unmarshal([]byte(res.Stdout), &rawList); err != nil {
		return nil, fmt.Errorf("解析 ModelScope 结果失败: %v, raw: %s", err, res.Stdout)
	}

	var items []HubModelItem
	for _, m := range rawList {
		id, _ := m["Id"].(string)
		name, _ := m["Name"].(string)
		owner, _ := m["Owner"].(string)
		desc, _ := m["Description"].(string)
		down, _ := m["Downloads"].(float64)
		upTime, _ := m["UpdatedAt"].(string)
		fsize, _ := m["file_size"].(float64)

		normName := normalizeName(name)
		localStatus := "CLOUD_ONLY"
		localPath := ""

		for _, loc := range localAssets {
			normLoc := normalizeName(loc.Name)
			if normLoc == normName || strings.Contains(normLoc, normName) || strings.Contains(normName, normLoc) {
				if loc.Type == "MAIN" {
					localStatus = "LOCAL_76"
					localPath = loc.Path
					break
				} else if localStatus == "CLOUD_ONLY" {
					localStatus = "LOCAL_TEST03"
					localPath = loc.Path
				}
			}
		}

		cleanLocalDir := name
		downloadCmd := fmt.Sprintf(`xssh 192.2.56.76 "cd /data/AI_model && modelscope download --model %s --local_dir %s"`, id, cleanLocalDir)
		rsyncCmd := fmt.Sprintf(`xssh 192.2.56.76 "rsync -avP --progress /data/AI_model/%s/ 192.2.0.146:/data/model/%s/"`, cleanLocalDir, cleanLocalDir)

		items = append(items, HubModelItem{
			ID:          id,
			Name:        name,
			Owner:       owner,
			Description: desc,
			Downloads:   int(down),
			UpdatedAt:   upTime,
			FileSize:    int64(fsize),
			LocalStatus: localStatus,
			LocalPath:   localPath,
			DownloadCmd: downloadCmd,
			RsyncCmd:    rsyncCmd,
		})
	}

	return items, nil
}

// StartDownloadIn76 在 76 后台启动下载进程
func (h *HubManager) StartDownloadIn76(modelID string, localDir string) (string, error) {
	if localDir == "" {
		parts := strings.Split(modelID, "/")
		localDir = parts[len(parts)-1]
	}
	sh := fmt.Sprintf(`
nohup modelscope download --model %s --local_dir /data/AI_model/%s > /tmp/download_%s.log 2>&1 &
echo $!
`, modelID, localDir, localDir)

	res, err := runner.RunCmd("192.2.56.76", sh, 10)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(res.Stdout), nil
}
