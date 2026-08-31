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

// scanServerDeepByConfigJson 毫秒级极速扫描 config.json 提取模型身份凭证
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
            if quant_method == "none":
                plow = parent.lower()
                if "w8a8" in plow:
                    quant_method = "W8A8"
                elif "fp8" in plow:
                    quant_method = "FP8"
                elif "w4a8" in plow or "int4" in plow:
                    quant_method = "INT4"
                elif "int8" in plow or "w8a16" in plow:
                    quant_method = "INT8"
                elif "awq" in plow:
                    quant_method = "AWQ"
                elif "gptq" in plow:
                    quant_method = "GPTQ"
                
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

	if !force && len(h.localCache) > 0 && time.Since(h.cacheUpdatedAt) < 15*time.Minute {
		return h.localCache, nil
	}

	var assets []LocalModelAsset

	// 1. 扫描 76 主力服务器 (/data/AI_model/)
	list76 := scanServerDeepByConfigJson("192.2.56.76", "/data/AI_model", "76 (主力存储)", "MAIN")
	assets = append(assets, list76...)

	// 2. 扫描 test03 历史仓库 (/HDD_Raid/SVN_MODEL_REPO/Model/)
	list29 := scanServerDeepByConfigJson("192.2.29.9", "/HDD_Raid/SVN_MODEL_REPO/Model", "test03 (历史仓库)", "ARCHIVE")
	assets = append(assets, list29...)

	h.localCache = assets
	h.cacheUpdatedAt = time.Now()
	return assets, nil
}

func normalizeStrict(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, ".", "")
	return s
}

// SearchModelScope 远程查询 ModelScope 并智能关联本地存储状态
func (h *HubManager) SearchModelScope(query string, org string, pageSize int) ([]HubModelItem, error) {
	if pageSize <= 0 {
		pageSize = 30
	}
	org = strings.TrimSpace(org)
	query = strings.TrimSpace(query)

	localAssets, _ := h.ScanLocalAssets(false)

	sh := fmt.Sprintf(`
python3 -c '
import json
from modelscope.hub.api import HubApi
api = HubApi()
org = "%s".strip()
query = "%s".strip()
pageSize = %d
models = []
try:
    if org and org.upper() not in ["ALL", "OTHER"]:
        page = api.list_repos("model", owner=org, search=query if query and query.lower() != "all" else None, page_size=pageSize)
    else:
        page = api.list_repos("model", search=query if query and query.lower() != "all" else None, page_size=pageSize)
    
    for item in page.items:
        d = item.to_dict()
        mid = d.get("id", "")
        parts = mid.split("/", 1)
        owner_name = parts[0] if len(parts) > 1 else ""
        repo_name = parts[1] if len(parts) > 1 else mid
        
        models.append({
            "Id": mid,
            "Name": repo_name,
            "DisplayName": d.get("display_name") or repo_name,
            "Owner": owner_name,
            "Description": d.get("description", ""),
            "Downloads": d.get("downloads", 0),
            "UpdatedAt": d.get("last_modified") or d.get("created_at", ""),
            "file_size": d.get("file_size", 0),
            "Tags": d.get("tags", [])
        })
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

		normName := normalizeStrict(name)
		idParts := strings.Split(id, "/")
		shortId := idParts[len(idParts)-1]
		normShortId := normalizeStrict(shortId)

		localStatus := "CLOUD_ONLY"
		localPath := ""
		var matchedMeta *LocalModelAsset

		// 严格精确比对，坚决避免 strings.Contains 导致量化模型（如 W8A8）与基础模型（如 BF16）混淆
		for _, loc := range localAssets {
			locBase := loc.Name
			if slashIdx := strings.LastIndex(loc.Name, "/"); slashIdx >= 0 {
				locBase = loc.Name[slashIdx+1:]
			}
			normLocBase := normalizeStrict(locBase)
			normLocName := normalizeStrict(loc.Name)

			// 必须精确匹配模型名或末级目录名
			if normLocBase == normName || normLocBase == normShortId || normLocName == normName || normLocName == normalizeStrict(id) {
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
		
		rsyncCmd := ""
		if localStatus == "LOCAL_76" {
			rsyncCmd = fmt.Sprintf(`xssh 192.2.56.76 "rsync -avP --progress %s/ 192.2.0.146:/data/model/%s/"`, localPath, cleanLocalDir)
		} else if localStatus == "LOCAL_TEST03" {
			rsyncCmd = fmt.Sprintf(`xssh 192.2.29.9 "rsync -avP --progress %s/ 192.2.0.146:/data/model/%s/"`, localPath, cleanLocalDir)
		}

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

type DownloadTask struct {
	PID         string `json:"pid"`
	ModelID     string `json:"model_id"`
	LocalDir    string `json:"local_dir"`
	LocalPath   string `json:"local_path"`
	DirSize     string `json:"dir_size"`
	TotalSize   string `json:"total_size,omitempty"`
	Progress    int    `json:"progress"` // 0~100
	Speed       string `json:"speed,omitempty"`
	ETA         string `json:"eta,omitempty"`
	Transferred string `json:"transferred,omitempty"` // 如 "分片 17/62"
	LastLog     string `json:"last_log"`
	Status      string `json:"status"` // DOWNLOADING
}

func (h *HubManager) GetDownloadTasks() ([]DownloadTask, error) {
	sh := `
python3 -c '
import os, json, subprocess, re

tasks = []
try:
    ps_out = subprocess.check_output(["ps", "-eo", "pid,args"], text=True)
    for line in ps_out.strip().split("\n"):
        if "modelscope download" in line and "grep" not in line:
            parts = line.strip().split(None, 1)
            pid = parts[0]
            cmd = parts[1] if len(parts) > 1 else ""
            
            m_model = re.search(r"--model\s+([^\s]+)", cmd)
            model_id = m_model.group(1) if m_model else ""
            
            m_dir = re.search(r"--local_dir\s+([^\s]+)", cmd)
            local_dir_path = m_dir.group(1) if m_dir else ""
            local_dir_name = os.path.basename(local_dir_path.rstrip("/"))
            
            dir_size = ""
            if os.path.exists(local_dir_path):
                try:
                    du_out = subprocess.check_output(["du", "-sh", local_dir_path], text=True)
                    dir_size = du_out.split()[0]
                except Exception:
                    pass
            
            log_file = f"/tmp/download_{local_dir_name}.log"
            last_log = ""
            progress = 5
            speed = ""
            eta = ""
            transferred = ""
            total_size = ""
            
            if os.path.exists(log_file):
                try:
                    with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                    lines = [l.strip() for l in re.split(r"[\r\n]+", text) if l.strip()]
                    if lines:
                        clean_last = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", lines[-1]).strip()
                        last_log = clean_last[-140:]
                        
                        max_shard = 0
                        total_shards = 0
                        
                        for l in lines[-120:]:
                            # 匹配 model-00017-of-00062.safetensors
                            m_s = re.search(r"(\d+)-of-(\d+)", l)
                            if m_s:
                                s_cur = int(m_s.group(1))
                                s_tot = int(m_s.group(2))
                                if s_cur > max_shard:
                                    max_shard = s_cur
                                if s_tot > total_shards:
                                    total_shards = s_tot
                            
                            m_spd = re.search(r"([\d\.]+[KMG]?B/s)", l)
                            if m_spd:
                                speed = m_spd.group(1)
                            
                            m_eta = re.search(r"<([\d:]+)", l)
                            if m_eta:
                                eta = m_eta.group(1)
                        
                        if total_shards > 0 and max_shard > 0:
                            progress = min(99, max(5, int((max_shard / total_shards) * 100)))
                            transferred = f"分片 {max_shard}/{total_shards}"
                except Exception:
                    pass
            
            tasks.append({
                "pid": pid,
                "model_id": model_id,
                "local_dir": local_dir_name,
                "local_path": local_dir_path,
                "dir_size": dir_size,
                "total_size": total_size,
                "progress": progress,
                "speed": speed,
                "eta": eta,
                "transferred": transferred,
                "last_log": last_log,
                "status": "DOWNLOADING"
            })
except Exception as e:
    pass

print(json.dumps(tasks, ensure_ascii=False))
'
`
	res, err := runner.RunCmd("192.2.56.76", sh, 10)
	if err != nil || !res.OK {
		return []DownloadTask{}, nil
	}

	var tasks []DownloadTask
	if err := json.Unmarshal([]byte(res.Stdout), &tasks); err != nil {
		return []DownloadTask{}, nil
	}
	return tasks, nil
}

func (h *HubManager) GetDownloadLog(localDir string, lines int) (string, error) {
	if lines <= 0 {
		lines = 60
	}
	if localDir == "" {
		return "", fmt.Errorf("localDir 不能为空")
	}
	sh := fmt.Sprintf("tail -n %d /tmp/download_%s.log 2>/dev/null", lines, localDir)
	res, err := runner.RunCmd("192.2.56.76", sh, 10)
	if err != nil {
		return "", err
	}
	return res.Stdout, nil
}

type RsyncTask struct {
	PID          string `json:"pid"`
	ModelName    string `json:"model_name"`
	SourceServer string `json:"source_server"`
	SourcePath   string `json:"source_path"`
	TargetServer string `json:"target_server"`
	TargetPath   string `json:"target_path"`
	Progress     int    `json:"progress"` // 0~100 总进度百分比
	Speed        string `json:"speed"`    // 实时速度, 如 112.5MB/s
	ETA          string `json:"eta"`      // 剩余时间, 如 01:36
	Transferred  string `json:"transferred"` // 已传输, 如 23.4 GB
	TotalSize    string `json:"total_size"`  // 总大小, 如 34.2 GB
	LastLog      string `json:"last_log"`
	Status       string `json:"status"` // SYNCING
}

func (h *HubManager) StartRsyncTask(sourceServer, sourcePath, targetServer, targetPath, modelName string) (string, error) {
	if sourceServer == "" {
		sourceServer = "192.2.56.76"
	}
	if targetServer == "" {
		targetServer = "192.2.0.146"
	}
	if targetPath == "" {
		targetPath = fmt.Sprintf("/data/model/%s", modelName)
	}
	if modelName == "" {
		parts := strings.Split(strings.TrimRight(sourcePath, "/"), "/")
		modelName = parts[len(parts)-1]
	}

	// 采用 --info=progress2 输出工业级全局总进度与总 ETA
	sh := fmt.Sprintf(`
nohup rsync -avP --info=progress2 %s/ %s:%s/ > /tmp/rsync_%s.log 2>&1 &
echo $!
`, sourcePath, targetServer, targetPath, modelName)

	res, err := runner.RunCmd(sourceServer, sh, 10)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(res.Stdout), nil
}

func (h *HubManager) GetRsyncTasks() ([]RsyncTask, error) {
	sh := `
python3 -c '
import os, json, subprocess, re

tasks = []
try:
    ps_out = subprocess.check_output(["ps", "-eo", "pid,args"], text=True)
    for line in ps_out.strip().split("\n"):
        if "rsync -avP" in line and "grep" not in line:
            parts = line.strip().split(None, 1)
            pid = parts[0]
            cmd = parts[1] if len(parts) > 1 else ""
            
            m_src = re.search(r"rsync\s+.*?(?:--info=progress2\s+|--progress\s+)([^\s]+)\s+([^\s]+)", cmd)
            src_path = ""
            target_full = ""
            if m_src:
                src_path = m_src.group(1)
                target_full = m_src.group(2)
            
            target_server = ""
            target_path = ""
            if ":" in target_full:
                t_parts = target_full.split(":", 1)
                target_server = t_parts[0]
                target_path = t_parts[1]
            
            model_name = os.path.basename(src_path.rstrip("/"))
            
            # 读取源端分片数量与总大小
            src_shard_count = 0
            total_size = ""
            if os.path.exists(src_path):
                try:
                    all_files = os.listdir(src_path)
                    shards = [f for f in all_files if f.endswith(".safetensors") or f.endswith(".bin")]
                    src_shard_count = len(shards) if shards else len(all_files)
                    du_out = subprocess.check_output(["du", "-sh", src_path], text=True)
                    total_size = du_out.split()[0]
                except Exception:
                    pass
            
            log_file = f"/tmp/rsync_{model_name}.log"
            progress = 5
            speed = ""
            eta = ""
            transferred = ""
            last_log = ""
            
            if os.path.exists(log_file):
                try:
                    with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                    
                    # 展开 \r 与 \n，取最近 120 行
                    lines = [l.strip() for l in re.split(r"[\r\n]+", text) if l.strip()]
                    if lines:
                        clean_last = re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", lines[-1]).strip()
                        last_log = clean_last[-140:]
                        
                        cur_shard = 0
                        total_shards = 0
                        file_pct = 0
                        
                        for l in lines[-120:]:
                            # 1. 匹配标准大模型权重分片如: model-00015-of-00062.safetensors / pytorch_model-001-of-008.bin
                            m_name = re.search(r"(?:model|pytorch_model|consolidated|checkpoint|\w+)[-_.](\d+)-of-(\d+)\.(?:safetensors|bin|pt|safete|\w+)", l, re.IGNORECASE)
                            if not m_name:
                                m_name = re.search(r"(\d+)-of-(\d+)", l)
                            
                            if m_name:
                                cur_shard = int(m_name.group(1))
                                total_shards = int(m_name.group(2))
                            
                            # 2. 匹配当前切片的传输百分比与速率、ETA
                            m_pct = re.search(r"(\d+)%\s+([\d\.]+[KMG]?B/s)\s+([\d:]+)", l)
                            if m_pct:
                                file_pct = int(m_pct.group(1))
                                speed = m_pct.group(2)
                                eta = m_pct.group(3)
                        
                        # 3. 稳健平滑的全局百分比算法 (绝对单调递增，不乱跳)
                        if total_shards > 0 and cur_shard > 0:
                            smooth_pct = ((cur_shard - 1) + (file_pct / 100.0)) / total_shards * 100.0
                            progress = min(99, max(1, int(smooth_pct)))
                            transferred = f"分片 {cur_shard}/{total_shards}"
                        elif src_shard_count > 0 and file_pct > 0:
                            smooth_pct = file_pct / src_shard_count
                            progress = min(99, max(1, int(smooth_pct)))
                            transferred = f"分片 1/{src_shard_count}"
                        elif file_pct > 0:
                            progress = min(99, max(1, file_pct))
                except Exception:
                    pass
            
            tasks.append({
                "pid": pid,
                "model_name": model_name,
                "source_server": "192.2.56.76",
                "source_path": src_path,
                "target_server": target_server,
                "target_path": target_path,
                "progress": progress,
                "speed": speed,
                "eta": eta,
                "transferred": transferred,
                "total_size": total_size,
                "last_log": last_log,
                "status": "SYNCING"
            })
except Exception as e:
    pass

print(json.dumps(tasks, ensure_ascii=False))
'
`
	res, err := runner.RunCmd("192.2.56.76", sh, 10)
	if err != nil || !res.OK {
		return []RsyncTask{}, nil
	}

	var tasks []RsyncTask
	if err := json.Unmarshal([]byte(res.Stdout), &tasks); err != nil {
		return []RsyncTask{}, nil
	}
	return tasks, nil
}

func (h *HubManager) GetRsyncLog(modelName string, lines int) (string, error) {
	if lines <= 0 {
		lines = 60
	}
	if modelName == "" {
		return "", fmt.Errorf("modelName 不能为空")
	}
	sh := fmt.Sprintf("tail -n %d /tmp/rsync_%s.log 2>/dev/null", lines, modelName)
	res, err := runner.RunCmd("192.2.56.76", sh, 10)
	if err != nil {
		return "", err
	}
	return res.Stdout, nil
}


