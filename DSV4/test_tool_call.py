#!/usr/bin/env python3
"""
DeepSeek-V4 工具调用完整性测试脚本 (流式 & 非流式)
针对 192.2.0.146:8000 (MetaX N300 16卡 vLLM)
"""
import json
import time
import urllib.request

API_URL = "http://192.2.0.146:8000/v1/chat/completions"
MODEL_NAME = "/data/model/model/DeepSeek/DeepSeek-V4-Flash-0731-W8A8"

# 禁用环境代理，直连内网 146
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Execute a bash command in the terminal",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The command to run"}
                },
                "required": ["command"],
            },
        },
    }
]


def test_non_streaming():
    print("=" * 60)
    print("1. 测试非流式 Tool Call 响应...")
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": "请帮我查一下当前机器运行的 docker 容器状态，使用 bash 工具。",
            }
        ],
        "tools": TOOLS,
        "tool_choice": "auto",
        "temperature": 0.0,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.time()
    with opener.open(req) as resp:
        latency = time.time() - t0
        data = json.loads(resp.read().decode("utf-8"))

    choice = data["choices"][0]
    finish_reason = choice.get("finish_reason")
    msg = choice.get("message", {})
    content = msg.get("content")
    tool_calls = msg.get("tool_calls")
    usage = data.get("usage", {})

    print(f"端到端耗时: {latency:.2f}s")
    print(f"Finish Reason: {finish_reason}")
    print(f"Content (应为 None/清理干净): {content}")
    print(f"Tool Calls: {json.dumps(tool_calls, ensure_ascii=False, indent=2)}")
    print(f"Usage: {usage}")

    assert finish_reason == "tool_calls", f"预期 finish_reason 为 tool_calls，实际为 {finish_reason}"
    assert tool_calls is not None and len(tool_calls) > 0, "未能成功解析出 tool_calls"
    print(">>> [PASS] 非流式 Tool Call 校验通过！\n")


def test_streaming():
    print("=" * 60)
    print("2. 测试流式 (SSE) Tool Call 响应...")
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": "请使用 bash 工具执行 uptime 查看系统负载。",
            }
        ],
        "tools": TOOLS,
        "tool_choice": "auto",
        "stream": True,
        "temperature": 0.0,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.time()
    chunks = []
    with opener.open(req) as resp:
        for line in resp:
            line = line.decode("utf-8").strip()
            if line.startswith("data: ") and line != "data: [DONE]":
                chunks.append(json.loads(line[6:]))
    latency = time.time() - t0

    accum_args = ""
    finish_reason = None
    for c in chunks:
        delta = c["choices"][0].get("delta", {})
        if delta.get("tool_calls"):
            tc = delta["tool_calls"][0]
            if "function" in tc and "arguments" in tc["function"]:
                accum_args += tc["function"]["arguments"]
        if c["choices"][0].get("finish_reason"):
            finish_reason = c["choices"][0]["finish_reason"]

    print(f"流式总耗时: {latency:.2f}s, 数据包分片数: {len(chunks)}")
    print(f"聚合参数 Arguments: {accum_args}")
    print(f"Finish Reason: {finish_reason}")

    assert finish_reason == "tool_calls", f"预期 finish_reason 为 tool_calls，实际为 {finish_reason}"
    assert "uptime" in accum_args, f"未能正确解析出 uptime 参数: {accum_args}"
    print(">>> [PASS] 流式 Tool Call 校验通过！\n")


if __name__ == "__main__":
    test_non_streaming()
    test_streaming()
    print("全部测试通过，模型已完全适配 Agent 标准 Function Call 协议！")
