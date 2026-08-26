package config

import (
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

type ModelPreset struct {
	Name          string `json:"name" yaml:"name"`
	ServiceName   string `json:"service_name" yaml:"service_name"`
	ContainerName string `json:"container_name" yaml:"container_name"`
	Engine        string `json:"engine" yaml:"engine"`
	TP            int    `json:"tp" yaml:"tp"`
	Port          int    `json:"port" yaml:"port"`
	Script        string `json:"script" yaml:"script"`
	Image         string `json:"image" yaml:"image"`
}

type HostConfig struct {
	ID        string        `json:"id" yaml:"id"`
	Name      string        `json:"name" yaml:"name"`
	SSHAlias  string        `json:"ssh_alias" yaml:"ssh_alias"`
	Workspace string        `json:"workspace" yaml:"workspace"`
	GPUType   string        `json:"gpu_type" yaml:"gpu_type"` // metax, hygon, nvidia
	APIPort   int           `json:"api_port" yaml:"api_port"`
	IsDefault bool          `json:"is_default" yaml:"is_default"`
	Models    []ModelPreset `json:"models,omitempty" yaml:"models,omitempty"`
}

type Config struct {
	ServerPort int          `json:"server_port" yaml:"server_port"`
	Hosts      []HostConfig `json:"hosts" yaml:"hosts"`
}

var (
	globalConfig *Config
	configMutex  sync.RWMutex
	configFile   = "hosts.yaml"
)

func LoadConfig(path string) (*Config, error) {
	configMutex.Lock()
	defer configMutex.Unlock()

	if path != "" {
		configFile = path
	}

	cfg := &Config{
		ServerPort: 8899,
		Hosts: []HostConfig{
			{
				ID:        "metax-146",
				Name:      "146 · 沐曦 8卡 N300-A",
				SSHAlias:  "192.2.0.146",
				Workspace: "/home/workspace",
				GPUType:   "metax",
				APIPort:   8000,
				IsDefault: true,
			},
		},
	}

	if data, err := os.ReadFile(configFile); err == nil {
		_ = yaml.Unmarshal(data, cfg)
	} else {
		// 保存默认配置文件
		_ = SaveConfig(cfg, configFile)
	}

	globalConfig = cfg
	return cfg, nil
}

func GetConfig() *Config {
	configMutex.RLock()
	defer configMutex.RUnlock()
	if globalConfig == nil {
		globalConfig, _ = LoadConfig("")
	}
	return globalConfig
}

func SaveConfig(cfg *Config, path string) error {
	if path == "" {
		path = configFile
	}
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
