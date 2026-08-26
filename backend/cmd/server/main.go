package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"metax-workbench/internal/api"
	"metax-workbench/internal/config"
)

//go:embed dist/*
var frontendDist embed.FS

func main() {
	configPath := flag.String("config", "hosts.yaml", "Path to hosts.yaml config file")
	port := flag.Int("port", 8899, "Server port")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Printf("Warning: failed to load config from %s: %v, using defaults\n", *configPath, err)
	}

	if *port != 8899 {
		cfg.ServerPort = *port
	}

	r := api.SetupRouter()

	// 嵌入前端静态资源
	distFS, err := fs.Sub(frontendDist, "dist")
	if err == nil {
		fileServer := http.FileServer(http.FS(distFS))
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/api") {
				c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
				return
			}
			// 尝试提供静态文件
			f, err := distFS.Open(strings.TrimPrefix(path, "/"))
			if err == nil {
				_ = f.Close()
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
			// SPA fallback: index.html
			indexData, err := fs.ReadFile(distFS, "index.html")
			if err == nil {
				c.Data(http.StatusOK, "text/html; charset=utf-8", indexData)
				return
			}
			c.String(http.StatusNotFound, "Not Found")
		})
	}

	addr := fmt.Sprintf("0.0.0.0:%d", cfg.ServerPort)
	log.Printf("====================================================\n")
	log.Printf("🚀 MetaX Fullstack Workbench Started Successfully!\n")
	log.Printf("🌐 UI & Headless API URL: http://%s\n", addr)
	log.Printf("📋 Loaded %d host configurations\n", len(cfg.Hosts))
	log.Printf("====================================================\n")

	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed to start: %v\n", err)
	}
}
