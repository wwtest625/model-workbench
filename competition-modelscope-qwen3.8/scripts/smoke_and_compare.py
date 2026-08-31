#!/usr/bin/env python3
"""
Qwen3.8-27B 冒烟与蒸馏模型对比评测脚本
支持对比 Qwen3.8-27B (基座) 与 TeichAI/Qwen3.8-27B-Fable-Distill (蒸馏版)
"""
import time
import json
from openai import OpenAI

BASE_URL = "http://127.0.0.1:8000/v1"
API_KEY = "EMPTY"

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

PROMPTS = [
    ("math", "请只给出最终计算结果：17 * 23 + 19 = ?"),
    ("logic_reasoning", "一个水池有两个进水管和一个出水管。单开甲管6小时注满，单开乙管8小时注满，单开出水管12小时放空。若三管齐开，几小时可注满？请写出简明计算步骤。"),
    ("ops_debug", "在沐曦 MetaX GPU 集群上使用 vLLM 部署 27B 模型，出现多卡通信超时并触发 Watchdog 崩溃，给出 2 个核心排查环境变量并说明原因。"),
    ("code", "用 Python 编写一个高效求区间 [L, R] 内所有质数的函数，并给出时间复杂度说明。")
]

def test_model(model_name):
    print(f"\n{'='*25} 开始评测模型: {model_name} {'='*25}")
    results = []
    for case_name, prompt in PROMPTS:
        t0 = time.time()
        try:
            resp = client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=512
            )
            elapsed = time.time() - t0
            usage = resp.usage.model_dump() if resp.usage else {}
            content = resp.choices[0].message.content
            
            # 计算吞吐 tok/s
            completion_tokens = usage.get("completion_tokens", 0)
            tok_s = round(completion_tokens / elapsed, 2) if elapsed > 0 else 0
            
            item = {
                "case": case_name,
                "latency_s": round(elapsed, 3),
                "tok_per_sec": tok_s,
                "usage": usage,
                "output": content
            }
            results.append(item)
            print(f"[{case_name}] 耗时: {elapsed:.2f}s | 生成 Token: {completion_tokens} | 速度: {tok_s} tok/s")
            print(f"输出片段: {content[:100]}...\n")
        except Exception as e:
            print(f"[{case_name}] 调用出错: {e}")
    return results

if __name__ == "__main__":
    # 评测当前正在运行的模型
    test_model("Qwen3.8-27B")
