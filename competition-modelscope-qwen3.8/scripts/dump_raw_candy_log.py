#!/usr/bin/env python3
import json

with open("/root/metax-workbench/competition-modelscope-qwen3.8/candy_test_results.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("################################################################################")
print("# MODEL 1: Qwen3.8-27B (Port 8000)")
print(f"# Elapsed: {data['base']['elapsed']:.2f}s | Tokens: {data['base']['usage']['completion_tokens']}")
print("################################################################################\n")
print(data['base']['content'])

print("\n\n" + "#" * 80)
print("# MODEL 2: Qwen3.8-27B-Fable-Distill (Port 8001)")
print(f"# Elapsed: {data['distill']['elapsed']:.2f}s | Tokens: {data['distill']['usage']['completion_tokens']}")
print("#" * 80 + "\n")
print(data['distill']['content'])
