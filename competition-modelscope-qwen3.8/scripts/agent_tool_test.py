#!/usr/bin/env python3
"""
Qwen3.8-27B 自动化 Agent 工具调用验证脚本
验证基于 qwen3_xml 协议的 Function Calling 能否准确触发与解析
"""
import json
from openai import OpenAI

BASE_URL = "http://127.0.0.1:8000/v1"
client = OpenAI(base_url=BASE_URL, api_key="EMPTY")

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_gpu_metric",
            "description": "查询沐曦国产 GPU 算力集群的指定监控指标",
            "parameters": {
                "type": "object",
                "properties": {
                    "gpu_id": {"type": "integer", "description": "GPU 卡号 (0-3)"},
                    "metric": {"type": "string", "enum": ["temperature", "hbm_used", "utilization"]}
                },
                "required": ["gpu_id", "metric"]
            }
        }
    }
]

prompt = "帮我查一下 2号卡 当前的显存使用量 (hbm_used)是多少？"
print(f"发送用户请求: {prompt}")

resp = client.chat.completions.create(
    model="Qwen3.8-27B",
    messages=[{"role": "user", "content": prompt}],
    tools=tools,
    tool_choice="auto"
)

msg = resp.choices[0].message
if msg.tool_calls:
    print("\n✅ 工具调用触发成功:")
    for tc in msg.tool_calls:
        print(f"- 函数名: {tc.function.name}")
        print(f"- 解析参数: {tc.function.arguments}")
else:
    print("\n⚠️ 未触发工具调用，直接回复:")
    print(msg.content)
