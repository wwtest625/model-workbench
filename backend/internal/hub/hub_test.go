package hub

import "testing"

func TestNormalizeStrict(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Qwen3.8-27B", "qwen3827b"},
		{"DeepSeek-V4-Flash", "deepseekv4flash"},
		{"  GLM_4.5-Air  ", "glm45air"},
		{"MiniMax-M2.5-W8A8", "minimaxm25w8a8"},
		{"", ""},
	}
	for _, c := range cases {
		if got := normalizeStrict(c.in); got != c.want {
			t.Errorf("normalizeStrict(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
