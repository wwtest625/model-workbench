package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "hosts.yaml")

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	// 文件不存在时应写入默认配置
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("默认配置文件未生成: %v", err)
	}
	if cfg.ServerPort != 8899 {
		t.Errorf("ServerPort = %d, want 8899", cfg.ServerPort)
	}
	if len(cfg.Hosts) != 1 || cfg.Hosts[0].ID != "metax-146" {
		t.Errorf("默认主机配置不符: %+v", cfg.Hosts)
	}
}

func TestLoadConfigRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "hosts.yaml")

	original := &Config{
		ServerPort: 9001,
		Hosts: []HostConfig{
			{
				ID: "test-host", Name: "测试节点", SSHAlias: "1.2.3.4",
				Workspace: "/root/workspace", GPUType: "metax", APIPort: 8000,
				Models: []ModelPreset{
					{Name: "M1", ServiceName: "m1", ContainerName: "m1", Engine: "vLLM", TP: 4, Port: 8000, Script: "start_m1.sh", Image: "img:1"},
				},
			},
		},
	}
	if err := SaveConfig(original, path); err != nil {
		t.Fatalf("SaveConfig error: %v", err)
	}

	loaded, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig error: %v", err)
	}
	if loaded.ServerPort != 9001 {
		t.Errorf("ServerPort = %d, want 9001", loaded.ServerPort)
	}
	if len(loaded.Hosts) != 1 || loaded.Hosts[0].ID != "test-host" {
		t.Fatalf("主机配置不符: %+v", loaded.Hosts)
	}
	m := loaded.Hosts[0].Models[0]
	if m.Name != "M1" || m.TP != 4 || m.Port != 8000 || m.Engine != "vLLM" {
		t.Errorf("模型预设回环不符: %+v", m)
	}
}
