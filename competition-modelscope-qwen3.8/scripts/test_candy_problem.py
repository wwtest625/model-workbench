#!/usr/bin/env python3
import urllib.request
import json
import time

prompt = """在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖果和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖果？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）

| 形状 | 苹果味 | 桃子味 | 西瓜味 |
|---|---|---|---|
| 圆形 | 7 | 9 | 8 |
| 五角星形 | 7 | 6 | 4 |

请给出详细的分析步骤和最终最少取出的糖果数目。"""

def test_model(port, name):
    url = f"http://192.2.0.146:{port}/v1/chat/completions"
    payload = {
        "model": name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 1500
    }
    t0 = time.time()
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elapsed = time.time() - t0
            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            return elapsed, content, usage
    except Exception as e:
        return 0, f"Error: {e}", {}

print("=== 正在请求 Base (Qwen3.8-27B @ 8000) ===")
t_base, c_base, u_base = test_model(8000, "Qwen3.8-27B")
print("Base 完成! 耗时: " + str(round(t_base, 2)) + "s, tokens: " + str(u_base.get("completion_tokens", 0)))

print("\n=== 正在请求 Distill (Qwen3.8-27B-Fable-Distill @ 8001) ===")
t_dist, c_dist, u_dist = test_model(8001, "Qwen3.8-27B-Fable-Distill")
print("Distill 完成! 耗时: " + str(round(t_dist, 2)) + "s, tokens: " + str(u_dist.get("completion_tokens", 0)))

with open("/root/metax-workbench/competition-modelscope-qwen3.8/candy_test_results.json", "w", encoding="utf-8") as f:
    json.dump({
        "prompt": prompt,
        "base": {"elapsed": t_base, "content": c_base, "usage": u_base},
        "distill": {"elapsed": t_dist, "content": c_dist, "usage": u_dist}
    }, f, ensure_ascii=False, indent=2)

print("\n==================== [Base Qwen3.8-27B 输出] ====================")
print(c_base)
print("\n==================== [Distill Qwen3.8-27B-Fable 输出] ====================")
print(c_dist)
