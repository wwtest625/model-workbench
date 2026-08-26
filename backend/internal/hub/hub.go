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
	Name          string   `json:"name"`
	Server        string   `json:"server"`
	ServerIP      string   `json:"server_ip"`
	Path          string   `json:"path"`
	ModelType     string   `json:"model_type"`
	Architectures []string `json:"architectures"`
	TorchDtype    string   `json:"torch_dtype"`
	QuantMethod   string   `json:"quant_method"`
	MaxPosition   int      `json:"max_position"`
	Time          string   `json:"time"`
	Type          string   `json:"type"` // MAIN (76) / ARCHIVE (test03)
}

type HubModelItem struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Owner       string           `json:"owner"`
	Description string           `json:"description"`
	Downloads   int              `json:"downloads"`
	UpdatedAt   string           `json:"updated_at"`
	FileSize    int64            `json:"file_size"`
	Tags        []string         `json:"tags"`
	LocalStatus string           `json:"local_status"` // LOCAL_76, LOCAL_TEST03, CLOUD_ONLY
	LocalPath   string           `json:"local_path"`
	LocalMeta   *LocalModelAsset `json:"local_meta,omitempty"`
	DownloadCmd string           `json:"download_cmd"`
	RsyncCmd    string           `json:"rsync_cmd"`
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

// scanServerDeepByConfigJson 毫秒级极速扫描 config.json 提取模型身份凭证（不统计文件大小以保证瞬时响应）
func scanServerDeepByConfigJson(serverIP string, rootPath string, serverLabel string, sType string) []LocalModelAsset {
	sh := fmt.Sprintf(`
python3 -c '
import os, json, glob, time
root = "%s"
results = []
if os.path.exists(root):
    for cpath in glob.glob(root + "/**/config.json", recursive=True):
        parent = os.path.dirname(cpath)
        bname = os.path.basename(parent)
        if bname in ["vae", "text_encoder", "audio_vae", "video_vae", "transformer", "transformer_ref", "tokenizer", "source"]:
            continue
        try:
            with open(cpath, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            mtype = cfg.get("model_type", "")
            archs = cfg.get("architectures", [])
            if not mtype and not archs:
                continue
            
            mtime = os.path.getmtime(cpath)
            time_str = time.strftime("%%Y-%%m-%%d %%H:%%M", time.localtime(mtime))
            rel_path = os.path.relpath(parent, root)
            
            quant_cfg = cfg.get("quantization_config")
            quant_method = "none"
            if isinstance(quant_cfg, dict):
                quant_method = quant_cfg.get("quant_method", quant_cfg.get("bits", "quantized"))
                
            max_pos = cfg.get("max_position_embeddings", cfg.get("seq_length", cfg.get("max_seq_len", 0)))
            
            results.append({
                "name": rel_path,
                "path": parent,
                "model_type": str(mtype),
                "architectures": [str(a) for a in archs] if isinstance(archs, list) else [],
                "torch_dtype": str(cfg.get("torch_dtype", "")),
                "quant_method": str(quant_method),
                "max_position": int(max_pos) if isinstance(max_pos, (int, float)) else 0,
                "time": time_str
            })
        except Exception as e:
            pass
print(json.dumps(results, ensure_ascii=False))
' 2>/dev/null
`, rootPath)

	res, err := runner.RunCmd(serverIP, sh, 10)
	if err != nil || !res.OK {
		return nil
	}

	var rawList []map[string]interface{}
	if err := json.Unmarshal([]byte(res.Stdout), &rawList); err != nil {
		return nil
	}

	var assets []LocalModelAsset
	for _, m := range rawList {
		name, _ := m["name"].(string)
		path, _ := m["path"].(string)
		mtype, _ := m["model_type"].(string)
		torchDtype, _ := m["torch_dtype"].(string)
		quant, _ := m["quant_method"].(string)
		maxPos, _ := m["max_position"].(float64)
		tStr, _ := m["time"].(string)

		var archs []string
		if rawArchs, ok := m["architectures"].([]interface{}); ok {
			for _, a := range rawArchs {
				if s, ok := a.(string); ok {
					archs = append(archs, s)
				}
			}
		}

		assets = append(assets, LocalModelAsset{
			Name:          name,
			Server:        serverLabel,
			ServerIP:      serverIP,
			Path:          path,
			ModelType:     mtype,
			Architectures: archs,
			TorchDtype:    torchDtype,
			QuantMethod:   quant,
			MaxPosition:   int(maxPos),
			Time:          tStr,
			Type:          sType,
		})
	}
	return assets
}

func (h *HubManager) ScanLocalAssets(force bool) ([]LocalModelAsset, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !force && len(h.localCache) > 0 && time.Since(h.cacheUpdatedAt) < 3*time.Minute {
		return h.localCache, nil
	}

	var assets []LocalModelAsset

	// 1. 毫秒级扫描 76 主力服务器 (/data/AI_model/)
	list76 := scanServerDeepByConfigJson("192.2.56.76", "/data/AI_model", "76 (主力存储)", "MAIN")
	assets = append(assets, list76...)

	// 2. 毫秒级扫描 test03 历史仓库 (/HDD_Raid/SVN_MODEL_REPO/Model/)
	list29 := scanServerDeepByConfigJson("192.2.29.9", "/HDD_Raid/SVN_MODEL_REPO/Model", "test03 (历史仓库)", "ARCHIVE")
	assets = append(assets, list29...)

	h.localCache = assets
	h.cacheUpdatedAt = time.Now()
	return assets, nil
}

func normalizeName(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, "/", "")
	return s
}

// SearchModelScope 远程查询 ModelScope 社区并与本地深度资产进行身份凭证匹配
func (h *HubManager) SearchModelScope(query string, org string, pageSize int) ([]HubModelItem, error) {
	if pageSize <= 0 {
		pageSize = 25
	}
	if org == "" {
		org = "metax-tech"
	}

	localAssets, _ := h.ScanLocalAssets(false)

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
		var matchedMeta *LocalModelAsset

		for _, loc := range localAssets {
			normLoc := normalizeName(loc.Name)
			if normLoc == normName || strings.Contains(normLoc, normName) || strings.Contains(normName, normLoc) {
				if loc.Type == "MAIN" {
					localStatus = "LOCAL_76"
					localPath = loc.Path
					matchedMeta = &loc
					break
				} else if localStatus == "CLOUD_ONLY" {
					localStatus = "LOCAL_TEST03"
					localPath = loc.Path
					matchedMeta = &loc
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
			LocalMeta:   matchedMeta,
			DownloadCmd: downloadCmd,
			RsyncCmd:    rsyncCmd,
		})
	}

	return items, nil
}

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
