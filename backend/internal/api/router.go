package api

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"metax-workbench/internal/benchmark"
	"metax-workbench/internal/config"
	"metax-workbench/internal/host"
	"metax-workbench/internal/hub"
	"metax-workbench/internal/model"
)

func SetupRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// 允许跨域（方便前端开发与外部调用）
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"Content-Length", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// 动态字体流式服务（支持更纱黑体等外部大字体，无需打包进单二进制）
	r.GET("/fonts/SarasaTermSCNerd.ttc", func(c *gin.Context) {
		candidates := []string{
			"/mnt/c/Users/sys49169/WorkBuddy/2026-08-27-10-32-42/fonts/sarasa-nerd/SarasaTermSCNerd.ttc",
			"/root/fonts/SarasaTermSCNerd.ttc",
		}
		for _, p := range candidates {
			if info, err := os.Stat(p); err == nil && !info.IsDir() {
				c.Header("Cache-Control", "public, max-age=31536000, immutable")
				c.Header("Content-Type", "font/collection")
				c.File(p)
				return
			}
		}
		c.Status(http.StatusNotFound)
	})

	v1 := r.Group("/api/v1")
	{
		// 主机管理 (多机切换与自适应)
		v1.GET("/hosts", getHosts)
		v1.POST("/hosts/switch", switchHost)
		v1.POST("/hosts/add", addHost)

		// 硬件与环境
		v1.GET("/env", getEnv)
		v1.POST("/env/fix-auto-upgrade", fixAutoUpgrade)
		v1.GET("/gpus", getGPUs)

		// 模型服务与编排
		v1.GET("/models", getModels)
		v1.POST("/models/start", startModel)
		v1.POST("/models/restart", restartModel)
		v1.POST("/models/stop", stopSingleModel)
		v1.POST("/models/stop-all", stopAllModels)
		v1.GET("/models/script", getModelScript)
		v1.POST("/models/script", saveModelScript)
		v1.GET("/models/command", getModelCommand)
		v1.GET("/models/logs", getModelLogs)
		v1.GET("/models/images", getHostImages)

		// 性能压测与通信
		v1.GET("/benchmark/logs", getBenchmarkLogs)
		v1.POST("/benchmark/stream", streamBenchmark)
		v1.GET("/mccl/stream", streamMCCL)

		// 模型试玩 (直接 HTTP 代理到当前主机，支持常规与 SSE 流式打字机)
		v1.POST("/chat", chatCompletions)
		v1.POST("/chat/stream", chatCompletionsStream)

		// 模型资产检索与 ModelScope 下载与分发中心
		v1.GET("/hub/local", getHubLocalAssets)
		v1.GET("/hub/search", searchHubModelScope)
		v1.POST("/hub/start-download", startHubDownload)
		v1.GET("/hub/download-tasks", getHubDownloadTasks)
		v1.GET("/hub/download-log", getHubDownloadLog)
		v1.POST("/hub/start-rsync", startHubRsync)
		v1.GET("/hub/rsync-tasks", getHubRsyncTasks)
		v1.GET("/hub/rsync-log", getHubRsyncLog)
	}

	return r
}

func getHosts(c *gin.Context) {
	cfg := config.GetConfig()
	cur, _ := host.GetHostManager().GetCurrentHost()
	c.JSON(http.StatusOK, gin.H{
		"current": cur,
		"hosts":   cfg.Hosts,
	})
}

type SwitchHostReq struct {
	HostID string `json:"host_id" binding:"required"`
}

func switchHost(c *gin.Context) {
	var req SwitchHostReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cur, err := host.GetHostManager().SwitchHost(req.HostID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已切换主机", "current": cur})
}

type AddHostReq struct {
	IP        string `json:"ip"`
	User      string `json:"user"`
	Password  string `json:"password"`
	Name      string `json:"name"`
	SSHAlias  string `json:"ssh_alias"`
	Workspace string `json:"workspace"`
	GPUType   string `json:"gpu_type"`
	Port      int    `json:"port"`
	ID        string `json:"id"`
}

func addHost(c *gin.Context) {
	var req AddHostReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	targetIP := req.IP
	if targetIP == "" {
		targetIP = req.SSHAlias
	}
	if targetIP == "" {
		targetIP = req.ID
	}
	if targetIP == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的主机 IP 地址或 SSH 别名"})
		return
	}

	newHost, err := host.GetHostManager().AddHostAutoSetup(
		targetIP,
		req.User,
		req.Password,
		req.Name,
		req.GPUType,
		req.Workspace,
		req.Port,
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("主机 %s (%s) 已成功添加并连接！", newHost.Name, newHost.SSHAlias), "host": newHost})
}

func getEnv(c *gin.Context) {
	env, err := host.GetHostManager().InspectEnv()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, env)
}

func fixAutoUpgrade(c *gin.Context) {
	res, err := host.GetHostManager().FixAutoUpgrade()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "已成功将 20auto-upgrades & 10periodic 全部置 0，并停用无人值守自动更新服务！",
		"result":  res,
	})
}

func getGPUs(c *gin.Context) {
	gpus, err := host.GetHostManager().InspectGPUs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"gpus": gpus})
}

func getModels(c *gin.Context) {
	models, runningCmd, err := model.GetModelManager().DiscoverModels()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"models": models, "running_cmd": runningCmd})
}

type ModelActionReq struct {
	Name   string `json:"name"`
	Script string `json:"script"`
}

func startModel(c *gin.Context) {
	var req ModelActionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := model.GetModelManager().StartModel(req.Script); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("模型 %s 启动指令已发送", req.Name)})
}

type StopSingleReq struct {
	Name          string `json:"name"`
	ServiceName   string `json:"service_name"`
	ContainerName string `json:"container_name"`
}

func stopSingleModel(c *gin.Context) {
	var req StopSingleReq
	_ = c.ShouldBindJSON(&req)
	targetService := req.ServiceName
	if targetService == "" {
		targetService = req.Name
	}
	if err := model.GetModelManager().StopModel(targetService, req.ContainerName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("已停止模型 %s 容器", req.Name)})
}

func restartModel(c *gin.Context) {
	var req StopSingleReq
	_ = c.ShouldBindJSON(&req)
	target := req.ContainerName
	if target == "" {
		target = req.ServiceName
	}
	if target == "" {
		target = req.Name
	}
	if err := model.GetModelManager().RestartModel(req.ServiceName, req.ContainerName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("容器 %s 已成功重启", target)})
}

func stopAllModels(c *gin.Context) {
	if err := model.GetModelManager().StopAllModels(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已停止全部推理容器并释放 GPU 显存"})
}

func getModelScript(c *gin.Context) {
	name := c.Query("name")
	content, err := model.GetModelManager().GetScriptContent(name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"name": name, "content": content})
}

func getModelCommand(c *gin.Context) {
	service := c.Query("service")
	name := c.Query("name")
	snippet, err := model.GetModelManager().GetComposeSection(service, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"model_name":   name,
		"service_name": service,
		"compose_yaml": snippet,
	})
}

func getModelLogs(c *gin.Context) {
	name := c.Query("name")
	logs, err := model.GetModelManager().GetContainerLogs(name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"model_name": name, "logs": logs})
}

func getBenchmarkLogs(c *gin.Context) {
	logs, err := benchmark.GetBenchmarkManager().ListLogFiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

type BenchStreamReq struct {
	Model       string `json:"model"`
	Dataset     string `json:"dataset"`
	Concurrency string `json:"concurrency"`
}

func streamBenchmark(c *gin.Context) {
	var req BenchStreamReq
	_ = c.ShouldBindJSON(&req)
	if req.Model == "" {
		req.Model = "Qwen3.8-27B"
	}
	if req.Dataset == "" {
		req.Dataset = "short"
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")

	outChan := make(chan string, 100)
	ctx := c.Request.Context()
	go func() {
		_ = benchmark.GetBenchmarkManager().StreamBenchmark(ctx, req.Model, req.Dataset, req.Concurrency, outChan)
	}()

	c.Stream(func(w io.Writer) bool {
		if text, ok := <-outChan; ok {
			data, _ := json.Marshal(gin.H{"text": text})
			c.SSEvent("", string(data))
			return true
		}
		data, _ := json.Marshal(gin.H{"done": true})
		c.SSEvent("", string(data))
		return false
	})
}

func streamMCCL(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")

	outChan := make(chan string, 100)
	ctx := c.Request.Context()
	go func() {
		_ = benchmark.GetBenchmarkManager().StreamMCCL(ctx, outChan)
	}()

	c.Stream(func(w io.Writer) bool {
		if text, ok := <-outChan; ok {
			data, _ := json.Marshal(gin.H{"text": text})
			c.SSEvent("", string(data))
			return true
		}
		data, _ := json.Marshal(gin.H{"done": true})
		c.SSEvent("", string(data))
		return false
	})
}

type ChatReq struct {
	Model       string  `json:"model"`
	Prompt      string  `json:"prompt" binding:"required"`
	MaxTokens   int     `json:"max_tokens"`
	Temperature float64 `json:"temperature"`
	Port        int     `json:"port"`
}

func chatCompletions(c *gin.Context) {
	var req ChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 4096
	}

	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.Port <= 0 {
		req.Port = h.APIPort
		if req.Port <= 0 {
			req.Port = 8000
		}
	}

	client := &http.Client{Timeout: 300 * time.Second}
	modelName := strings.TrimSpace(req.Model)

	// 动态检测目标端口实际提供服务的模型名称
	if modelName == "" {
		modelsUrl := fmt.Sprintf("http://%s:%d/v1/models", h.SSHAlias, req.Port)
		if mResp, mErr := client.Get(modelsUrl); mErr == nil {
			defer mResp.Body.Close()
			var mData struct {
				Data []struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			if json.NewDecoder(mResp.Body).Decode(&mData) == nil && len(mData.Data) > 0 {
				modelName = mData.Data[0].ID
			}
		}
	}
	if modelName == "" {
		modelName = "default"
	}

	t0 := time.Now()
	url := fmt.Sprintf("http://%s:%d/v1/chat/completions", h.SSHAlias, req.Port)

	payload := map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "user", "content": req.Prompt},
		},
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
	}
	bodyBytes, _ := json.Marshal(payload)

	resp, err := client.Post(url, "application/json", bytes.NewReader(bodyBytes))
	cost := time.Since(t0).Seconds()

	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": fmt.Sprintf("连接异常: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	var data map[string]interface{}
	if err := json.Unmarshal(respBytes, &data); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": fmt.Sprintf("解析错误: %v", err), "raw": string(respBytes)})
		return
	}

	choices, ok := data["choices"].([]interface{})
	if ok && len(choices) > 0 {
		choice0 := choices[0].(map[string]interface{})
		msg := choice0["message"].(map[string]interface{})
		reply := msg["content"].(string)
		finishReason, _ := choice0["finish_reason"].(string)

		usage, _ := data["usage"].(map[string]interface{})
		pTok, _ := usage["prompt_tokens"].(float64)
		cTok, _ := usage["completion_tokens"].(float64)

		speed := 0.0
		if cost > 0 && cTok > 0 {
			speed = float64(int((cTok/cost)*10)) / 10.0
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":                true,
			"reply":             reply,
			"finish_reason":     finishReason,
			"target_port":       req.Port,
			"target_model":      modelName,
			"cost":              float64(int(cost*100)) / 100.0,
			"speed":             speed,
			"prompt_tokens":     int(pTok),
			"completion_tokens": int(cTok),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": false, "error": string(respBytes)})
}

func chatCompletionsStream(c *gin.Context) {
	var req ChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 4096
	}

	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.Port <= 0 {
		req.Port = h.APIPort
		if req.Port <= 0 {
			req.Port = 8000
		}
	}

	modelName := strings.TrimSpace(req.Model)
	if modelName == "" {
		modelsUrl := fmt.Sprintf("http://%s:%d/v1/models", h.SSHAlias, req.Port)
		clientCheck := &http.Client{Timeout: 5 * time.Second}
		if mResp, mErr := clientCheck.Get(modelsUrl); mErr == nil {
			defer mResp.Body.Close()
			var mData struct {
				Data []struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			if json.NewDecoder(mResp.Body).Decode(&mData) == nil && len(mData.Data) > 0 {
				modelName = mData.Data[0].ID
			}
		}
	}
	if modelName == "" {
		modelName = "default"
	}

	url := fmt.Sprintf("http://%s:%d/v1/chat/completions", h.SSHAlias, req.Port)

	payload := map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "user", "content": req.Prompt},
		},
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
		"stream":      true,
	}
	bodyBytes, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	// 流式请求不设总体 Timeout，由用户连接生命周期自动管理
	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": fmt.Sprintf("连接后端异常: %v", err)})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBytes, _ := io.ReadAll(resp.Body)
		c.JSON(resp.StatusCode, gin.H{"ok": false, "error": string(errBytes)})
		return
	}

	// 设置 SSE 头
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.Flush()

	scanner := bufio.NewScanner(resp.Body)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		// 透传 SSE 协议
		fmt.Fprintf(c.Writer, "%s\n\n", line)
		c.Writer.Flush()

		if strings.TrimSpace(line) == "data: [DONE]" {
			break
		}
	}
}


type SaveScriptReq struct {
	Name    string `json:"name" binding:"required"`
	Content string `json:"content" binding:"required"`
}

func saveModelScript(c *gin.Context) {
	var req SaveScriptReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := model.GetModelManager().SaveScriptContent(req.Name, req.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("脚本 %s 保存成功", req.Name)})
}

func getHostImages(c *gin.Context) {
	images, err := model.GetModelManager().GetHostImages()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"images": images})
}


func getHubLocalAssets(c *gin.Context) {
	force := c.Query("force") == "true"
	assets, err := hub.GetHubManager().ScanLocalAssets(force)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"assets": assets})
}

func searchHubModelScope(c *gin.Context) {
	q := c.Query("q")
	org := c.Query("org")
	items, err := hub.GetHubManager().SearchModelScope(q, org, 30)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"models": items})
}

type StartDownloadReq struct {
	ModelID  string `json:"model_id" binding:"required"`
	LocalDir string `json:"local_dir"`
}

func startHubDownload(c *gin.Context) {
	var req StartDownloadReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pid, err := hub.GetHubManager().StartDownloadIn76(req.ModelID, req.LocalDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("已在 76 存储服务器后台启动下载 (PID: %s)", pid),
		"pid":     pid,
	})
}

func getHubDownloadTasks(c *gin.Context) {
	tasks, err := hub.GetHubManager().GetDownloadTasks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}

func getHubDownloadLog(c *gin.Context) {
	dir := c.Query("dir")
	if dir == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 dir 参数"})
		return
	}
	logs, err := hub.GetHubManager().GetDownloadLog(dir, 80)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"dir": dir, "logs": logs})
}

type StartRsyncReq struct {
	ModelName    string `json:"model_name"`
	SourceServer string `json:"source_server"`
	SourcePath   string `json:"source_path" binding:"required"`
	TargetServer string `json:"target_server"`
	TargetPath   string `json:"target_path"`
}

func startHubRsync(c *gin.Context) {
	var req StartRsyncReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pid, err := hub.GetHubManager().StartRsyncTask(req.SourceServer, req.SourcePath, req.TargetServer, req.TargetPath, req.ModelName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("已启动向算力节点的分发任务 (PID: %s)", pid),
		"pid":     pid,
	})
}

func getHubRsyncTasks(c *gin.Context) {
	tasks, err := hub.GetHubManager().GetRsyncTasks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}

func getHubRsyncLog(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 name 参数"})
		return
	}
	logs, err := hub.GetHubManager().GetRsyncLog(name, 80)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"name": name, "logs": logs})
}


