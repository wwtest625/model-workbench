package host

import (
	"path/filepath"
	"testing"

	"metax-workbench/internal/config"
)

func newTestManager(t *testing.T, hosts []config.HostConfig) *HostManager {
	t.Helper()
	path := filepath.Join(t.TempDir(), "hosts.yaml")
	if err := config.SaveConfig(&config.Config{ServerPort: 8899, Hosts: hosts}, path); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}
	if _, err := config.LoadConfig(path); err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	current := ""
	if len(hosts) > 0 {
		current = hosts[0].ID
	}
	return &HostManager{currentHostID: current}
}

func TestGetCurrentHost(t *testing.T) {
	m := newTestManager(t, []config.HostConfig{
		{ID: "host-a", Name: "A 节点"},
		{ID: "host-b", Name: "B 节点"},
	})

	h, err := m.GetCurrentHost()
	if err != nil {
		t.Fatalf("GetCurrentHost: %v", err)
	}
	if h.ID != "host-a" {
		t.Errorf("current = %q, want host-a", h.ID)
	}
}

func TestSwitchHost(t *testing.T) {
	m := newTestManager(t, []config.HostConfig{
		{ID: "metax-146", Name: "沐曦"},
		{ID: "hygon-55", Name: "海光"},
	})

	h, err := m.SwitchHost("hygon-55")
	if err != nil {
		t.Fatalf("SwitchHost: %v", err)
	}
	if h.ID != "hygon-55" {
		t.Errorf("returned = %q, want hygon-55", h.ID)
	}

	cur, err := m.GetCurrentHost()
	if err != nil {
		t.Fatalf("GetCurrentHost: %v", err)
	}
	if cur.ID != "hygon-55" {
		t.Errorf("current after switch = %q, want hygon-55", cur.ID)
	}
}

func TestSwitchHostNotFound(t *testing.T) {
	m := newTestManager(t, []config.HostConfig{{ID: "host-a"}})

	if _, err := m.SwitchHost("no-such-host"); err == nil {
		t.Errorf("SwitchHost with unknown id should return error")
	}
	// 切换失败后当前主机不应变化
	cur, _ := m.GetCurrentHost()
	if cur.ID != "host-a" {
		t.Errorf("current changed to %q after failed switch", cur.ID)
	}
}

func TestGetCurrentHostEmptyConfig(t *testing.T) {
	m := newTestManager(t, nil)

	if _, err := m.GetCurrentHost(); err == nil {
		t.Errorf("empty hosts should return error")
	}
}
