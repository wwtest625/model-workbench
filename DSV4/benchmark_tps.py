#!/usr/bin/env python3
"""
DeepSeek-V4 吞吐量 (TPS) 与首字延迟 (TTFT) 阶梯基准测试
对比短 Prompt（对话/指令）与长 Prompt（Agent 8k-10k Context）下的表现
"""
import json
import time
import urllib.request

API_URL = "http://192.2.0.146:8000/v1/chat/completions"
MODEL_NAME = "/data/model/model/DeepSeek/DeepSeek-V4-Flash-0731-W8A8"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def run_benchmark(prompt: str, label: str, max_tokens: int = 128):
    print(f"\n{'='*20} [{label}] {'='*20}")
    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "stream": True,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    t_start = time.time()
    t_first = None
    chunks = []

    with opener.open(req) as resp:
        for line in resp:
            line = line.decode("utf-8").strip()
            if line.startswith("data: ") and line != "data: [DONE]":
                c = json.loads(line[6:])
                if t_first is None and c["choices"][0]["delta"].get("content"):
                    t_first = time.time()
                chunks.append(c)

    t_end = time.time()
    total_time = t_end - t_start
    ttft = (t_first - t_start) if t_first else total_time
    decode_time = t_end - t_first if t_first else 0.001

    full_content = "".join(
        c["choices"][0]["delta"].get("content", "") for c in chunks
    )
    tokens_est = len(chunks)

    print(f"输入字符数: {len(prompt)}")
    print(f"输出 Chunk 数 (约输出 Token 数): {tokens_est}")
    print(f"首字延迟 (TTFT): {ttft:.3f}s")
    print(f"纯解码耗时 (Decode Time): {decode_time:.3f}s")
    print(f"端到端总耗时 (Total Latency): {total_time:.3f}s")

    if tokens_est > 0:
        decode_tps = tokens_est / decode_time
        e2e_tps = tokens_est / total_time
        print(f"纯解码 TPS: {decode_tps:.2f} tokens/s")
        print(f"端到端整体 TPS (含首字): {e2e_tps:.2f} tokens/s")


if __name__ == "__main__":
    # 场景 1: 短 Prompt (常规指令)
    run_benchmark(
        prompt="请详细解释什么是稀疏混合专家模型（MoE），其路由机制与门控策略原理是什么？",
        label="短 Prompt (约 50 tokens)",
        max_tokens=150,
    )

    # 场景 2: Agent 长上下文 Prompt (模拟包含历史对话与系统 Prompt 的长文本，约 6000 字)
    long_ctx = (
        "你是一个高级代码审查与运维助手。\n"
        + "以下是系统近期收集的容器日志与配置详情：\n"
        + ("INFO: MACA compatibility check passed 3.8.2. Container running vLLM 0.25.0.\n" * 150)
        + "\n请根据以上上下文总结系统当前健康状态，并给出 3 条建议。"
    )
    run_benchmark(
        prompt=long_ctx,
        label="长 Context Prompt (约 3,500+ tokens 模拟 Agent 场景)",
        max_tokens=100,
    )
