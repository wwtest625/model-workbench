package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
		v1.POST("/models/stop", stopModels)
		v1.GET("/models/script", getModelScript)
		v1.POST("/models/script", saveModelScript)
		v1.GET("/models/command", getModelCommand)
		v1.GET("/models/logs", getModelLogs)

		// 性能压测与通信
		v1.GET("/benchmark/logs", getBenchmarkLogs)
		v1.POST("/benchmark/stream", streamBenchmark)
		v1.GET("/mccl/stream", streamMCCL)

		// 模型试玩 (直接 HTTP 代理到当前主机)
		v1.POST("/chat", chatCompletions)

		// 模型资产检索与 ModelScope 下载中心
		v1.GET("/hub/local", getHubLocalAssets)
		v1.GET("/hub/search", searchHubModelScope)
		v1.POST("/hub/start-download", startHubDownload)
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

func addHost(c *gin.Context) {
	var req config.HostConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Workspace == "" {
		req.Workspace = "/home/workspace"
	}
	if req.GPUType == "" {
		req.GPUType = "metax"
	}
	if err := host.GetHostManager().AddHost(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "添加主机成功", "host": req})
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

func stopModels(c *gin.Context) {
	if err := model.GetModelManager().StopAllModels(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "停止指令已发送"})
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
		req.MaxTokens = 256
	}
	if req.Port <= 0 {
		req.Port = 8000
	}

	h, err := host.GetHostManager().GetCurrentHost()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	t0 := time.Now()
	url := fmt.Sprintf("http://%s:%d/v1/chat/completions", h.SSHAlias, req.Port)

	payload := map[string]interface{}{
		"model": "qwen3.8-27b",
		"messages": []map[string]string{
			{"role": "user", "content": req.Prompt},
		},
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
	}
	bodyBytes, _ := json.Marshal(payload)

	client := &http.Client{Timeout: 60 * time.Second}
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
			"cost":              float64(int(cost*100)) / 100.0,
			"speed":             speed,
			"prompt_tokens":     int(pTok),
			"completion_tokens": int(cTok),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": false, "error": string(respBytes)})
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
