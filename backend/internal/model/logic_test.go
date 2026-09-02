package model

import (
	"testing"

	"metax-workbench/internal/config"
)

func TestNormalizePresetName(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"VLLM-Qwen3-8-27B", "vllm-qwen3-8-27b"},
		{"vllm_qwen3\r\n", "vllm_qwen3"},          // CRLF 被裁剪
		{"  GLM5-vllm_0.18.0 \t", "glm5-vllm_0.18.0"},
		{"caoh\\deepseek\r", "caoh\\deepseek"},
		{"", ""},
	}
	for _, c := range cases {
		if got := normalizePresetName(c.in); got != c.want {
			t.Errorf("normalizePresetName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestBuildPortMap(t *testing.T) {
	models := []config.ModelPreset{
		{Name: "Qwen3.8-27B", ServiceName: "vllm-qwen3-8-27b", ContainerName: "vllm-qwen3-8-27b", Port: 8000},
		{Name: "DeepSeek-V4-Flash-W8A8", ServiceName: "vllm-deepseek-v4-0731-w8a8", ContainerName: "vllm-deepseek-v4-0731-w8a8", Port: 8001},
		{Name: "NoPort", ServiceName: "svc-nport", Port: 0}, // 端口为 0 不应注册
	}
	m := buildPortMap(models)

	if got := m["vllm-qwen3-8-27b"]; got != 8000 {
		t.Errorf("container name lookup = %d, want 8000", got)
	}
	if got := m["qwen3.8-27b"]; got != 8000 {
		t.Errorf("display name lookup = %d, want 8000", got)
	}
	if got := m["vllm-deepseek-v4-0731-w8a8"]; got != 8001 {
		t.Errorf("second model lookup = %d, want 8001", got)
	}
	if _, ok := m["svc-nport"]; ok {
		t.Errorf("port-0 preset should not be registered")
	}
	if len(m) != 4 {
		t.Errorf("map size = %d, want 4 (2 models x 2 keys)", len(m))
	}
}

func TestIsLLMContainer(t *testing.T) {
	// 应识别为大模型容器
	llm := [][2]string{
		{"vllm-qwen3-8-27b", ""},
		{"caoh_deepseekv4_flash", ""},
		{"GLM5-vllm_0.18.0", ""},
		{"my-app", "vllm:0.18.1-dtk2604"},
		{"data-worker", "sglang:0.5.12"},
		{"random-name", "cr.metax-tech.com/public-ai/maca/modelzoo.vllm:1.0"},
		{"intern-server", ""},
		{"mistral-svc", ""},
	}
	for _, c := range llm {
		if !isLLMContainer(c[0], c[1]) {
			t.Errorf("isLLMContainer(%q, %q) = false, want true", c[0], c[1])
		}
	}

	// 不应识别为大模型容器
	non := [][2]string{
		{"nginx-proxy", "nginx:latest"},
		{"redis-cache", "redis:7"},
		{"prometheus", "prom/prometheus:v2.1"},
		{"", ""},
	}
	for _, c := range non {
		if isLLMContainer(c[0], c[1]) {
			t.Errorf("isLLMContainer(%q, %q) = true, want false", c[0], c[1])
		}
	}
}

func TestInferEngineFromNames(t *testing.T) {
	cases := []struct {
		name, image, want string
	}{
		{"GLM5-vllm_0.18.0", "vllm:0.18.1", "vLLM"},
		{"caoh_deepseekv4_flash", "sglang:0.5.12", "SGLang"},
		{"SGlang-Server", "", "SGLang"},
		{"qwen-svc", "torch:2.8", "vLLM"},
		{"", "", "vLLM"},
	}
	for _, c := range cases {
		if got := inferEngineFromNames(c.name, c.image); got != c.want {
			t.Errorf("inferEngineFromNames(%q, %q) = %q, want %q", c.name, c.image, got, c.want)
		}
	}
}

func TestMatchScriptForContainer(t *testing.T) {
	scripts := []string{"start_vllm_qwen3_8_27b.sh", "start_deepseekv4_sglang.sh", "start_glm5_vllm.sh"}

	// 容器名包含于脚本名
	if got := matchScriptForContainer("vllm_qwen3_8_27b", scripts); got != "start_vllm_qwen3_8_27b.sh" {
		t.Errorf("got %q", got)
	}
	// 脚本名去掉 start_/.sh 前后缀后被容器名包含
	if got := matchScriptForContainer("caoh_deepseekv4_sglang", scripts); got != "start_deepseekv4_sglang.sh" {
		t.Errorf("got %q", got)
	}
	// 未命中走默认约定
	if got := matchScriptForContainer("unknown_model", scripts); got != "start_unknown_model.sh" {
		t.Errorf("got %q", got)
	}
	// 空脚本列表
	if got := matchScriptForContainer("foo", nil); got != "start_foo.sh" {
		t.Errorf("got %q", got)
	}
}
