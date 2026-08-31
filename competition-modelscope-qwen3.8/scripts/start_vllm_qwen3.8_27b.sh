#!/bin/bash
# 沐曦 N300-A × vLLM 生产启动脚本
# 支持原生 256K 上下文 + 三道防崩溃环境变量注入

export MACA_SMALL_PAGESIZE_ENABLE=1
export MACA_DIRECT_DISPATCH=1
export CUDA_VISIBLE_DEVICES=0,1,2,3
export TORCH_NCCL_WATCHDOG_TIMEOUT=0

MODEL_PATH=${1:-"/data/model/Qwen3.8-27B"}
SERVED_NAME=${2:-"Qwen3.8-27B"}

python3 -m vllm.entrypoints.openai.api_server \
  --model "${MODEL_PATH}" \
  --tensor-parallel-size 4 \
  --pipeline-parallel-size 1 \
  --trust-remote-code \
  --served-model-name "${SERVED_NAME}" \
  --max-model-len 262144 \
  --max-num-batched-tokens 8192 \
  --enable-prefix-caching \
  --distributed-executor-backend mp \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --gpu-memory-utilization 0.92 \
  --default-chat-template-kwargs '{"enable_thinking": false}' \
  --host 0.0.0.0 \
  --port 8000
