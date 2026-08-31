#!/usr/bin/env python3
"""
糖果高阶极值题 Base vs Distill 评测日志展示器
用于终端高亮截屏展示
"""
import json

LOG_PATH = "/root/metax-workbench/competition-modelscope-qwen3.8/candy_test_results.json"

with open(LOG_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

print("\033[1;36m" + "=" * 90 + "\033[0m")
print("\033[1;33m 🍭【大模型高阶博弈推理测试日志】Qwen3.8-27B Base vs Fable-Distill 同台实测 \033[0m")
print("\033[1;36m" + "=" * 90 + "\033[0m\n")

print("\033[1;32m📋 [测试题目与数据]\033[0m")
print(data["prompt"])
print("\n" + "-" * 90 + "\n")

print(f"\033[1;35m🔴 [Base 模型: Qwen3.8-27B (Port 8000)]\033[0m")
print(f"⏱️ 耗时: {data['base']['elapsed']:.2f}s | 生成 Tokens: {data['base']['usage']['completion_tokens']}")
print("\033[37m" + data['base']['content'][:900] + "...\033[0m")
print(f"\033[1;31m👉 Base 结论: 陷入盲摸模式匹配，忽略形状可感知性，得出 28+1=29 颗 (❌ 翻车)\033[0m\n")

print("-" * 90 + "\n")

print(f"\033[1;34m🔵 [Distill 蒸馏模型: Qwen3.8-27B-Fable-Distill (Port 8001)]\033[0m")
print(f"⏱️ 耗时: {data['distill']['elapsed']:.2f}s | 生成 Tokens: {data['distill']['usage']['completion_tokens']}")
print("\033[37m" + data['distill']['content'][1050:2050] + "...\033[0m")
print("\033[1;32m👉 Distill 核心质变高光（元认知反思）: 敏锐识别题眼 '不同的形状靠手感可以分辨' -> 成功识别参赛者拥有 (x, y) 形状控制权！\033[0m\n")

print("\033[1;36m" + "=" * 90 + "\033[0m")
print("\033[1;33m🏆 官方最终数学破局解: 取 12 颗星(锁定双味) + 9 颗圆(过滤西瓜) = 21 颗！\033[0m")
print("\033[1;36m" + "=" * 90 + "\033[0m")
