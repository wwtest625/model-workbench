#!/usr/bin/env python3
"""
双模型同台竞技自动化对比评测脚本
对比 146 算力机上并行运行的两个服务：
- Base: Qwen3.8-27B (GPU 0-3, 端口 8000)
- Distill: Qwen3.8-27B-Fable-Distill (GPU 4-7, 端口 8001)
"""
import time
import json
import urllib.request
import urllib.error

HOST = "192.2.0.146"
BASE_URL_BASE = f"http://{HOST}:8000/v1/chat/completions"
BASE_URL_DISTILL = f"http://{HOST}:8001/v1/chat/completions"

PROMPTS = [
    {
        "category": "数学与逻辑推导 (Math)",
        "prompt": "请只给出最终计算结果：17 * 23 + 19 = ?",
        "max_tokens": 128
    },
    {
        "category": "算法编码与时空复杂度 (Code)",
        "prompt": "用 Python 编写一个高效求区间 [L, R] 内所有质数的函数，并简要说明时间复杂度。",
        "max_tokens": 512
    },
    {
        "category": "复杂逻辑推理 (Logic)",
        "prompt": "一个水池有两个进水管和一个出水管。单开甲管6小时注满，单开乙管8小时注满，单开出水管12小时放空。若三管齐开，几小时可注满？请写出简明计算步骤并给出答案。",
        "max_tokens": 512
    },
    {
        "category": "国产集群运维排障 (Ops/Reasoning)",
        "prompt": "在沐曦 MetaX GPU 集群上使用 vLLM 部署 27B 模型，出现多卡通信超时并触发 NCCL Watchdog 崩溃，给出 2 个核心排查环境变量并详细解释其底层原理。",
        "max_tokens": 512
    }
]

def query_endpoint(url, model_name, prompt, max_tokens):
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": max_tokens
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            elapsed = time.perf_counter() - t0
            res = json.loads(resp.read().decode("utf-8"))
            usage = res.get("usage", {})
            choice = res["choices"][0]
            content = choice["message"]["content"]
            prompt_tokens = usage.get("prompt_tokens", 0)
            completion_tokens = usage.get("completion_tokens", 0)
            tok_per_sec = round(completion_tokens / elapsed, 2) if elapsed > 0 else 0
            return {
                "success": True,
                "elapsed_s": round(elapsed, 3),
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "tok_per_sec": tok_per_sec,
                "content": content
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "elapsed_s": round(time.perf_counter() - t0, 3)
        }

def main():
    print("=" * 80)
    print(" 🚀 沐曦 N300-A 双模型同台横向对比测试开始 (TP=4)")
    print(f" - Base 模型: Qwen3.8-27B (GPU 0-3 @ http://{HOST}:8000)")
    print(f" - Distill 模型: Qwen3.8-27B-Fable-Distill (GPU 4-7 @ http://{HOST}:8001)")
    print("=" * 80)

    comparison_records = []

    for idx, item in enumerate(PROMPTS, start=1):
        cat = item["category"]
        p = item["prompt"]
        max_tok = item["max_tokens"]
        print(f"\n[{idx}/{len(PROMPTS)}] 测试分类: {cat}")
        print(f"输入 Prompt: {p}")
        
        # 1. 测试 Base
        print("  正在评测 Base (Qwen3.8-27B)...", end="", flush=True)
        base_res = query_endpoint(BASE_URL_BASE, "Qwen3.8-27B", p, max_tok)
        if base_res["success"]:
            print(f" 完成! 耗时: {base_res['elapsed_s']}s | 生成: {base_res['completion_tokens']} tok | 速度: {base_res['tok_per_sec']} tok/s")
        else:
            print(f" 失败: {base_res.get('error')}")

        # 2. 测试 Distill
        print("  正在评测 Distill (Qwen3.8-27B-Fable-Distill)...", end="", flush=True)
        distill_res = query_endpoint(BASE_URL_DISTILL, "Qwen3.8-27B-Fable-Distill", p, max_tok)
        if distill_res["success"]:
            print(f" 完成! 耗时: {distill_res['elapsed_s']}s | 生成: {distill_res['completion_tokens']} tok | 速度: {distill_res['tok_per_sec']} tok/s")
        else:
            print(f" 失败: {distill_res.get('error')}")

        record = {
            "index": idx,
            "category": cat,
            "prompt": p,
            "base": base_res,
            "distill": distill_res
        }
        comparison_records.append(record)

    # 汇总输出与写入结果文件
    output_file = "/root/metax-workbench/competition-modelscope-qwen3.8/benchmark_results.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(comparison_records, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 80)
    print(" 📊 对比测试完成，结果已保存至 benchmark_results.json")
    print("=" * 80)

if __name__ == "__main__":
    main()
