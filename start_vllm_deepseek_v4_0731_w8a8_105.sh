#!/bin/bash
set -e
# DeepSeek-V4-Flash-0731-W8A8 - 8卡 tp8 (DSpark W8A8)
# 引擎: MACA 3.8.2.105 + vLLM 0.25.0 (torch2.10/py312) —— N300 全栈 FP8/INT8 原生支持
# 显卡方案: 严格使用前 8 张卡 (GPU 0,1,2,3,6,5,4,7 拓扑环序, TP8)
# 上下文长度: 256K (262,144 tokens)
MODEL_PATH="/data/model/model/DeepSeek/DeepSeek-V4-Flash-0731-W8A8"
TP_SIZE=8
PORT=8000
MAX_MODEL_LEN=262144
LOG_FILE="/home/models_log/vllm/deepseek-v4-0731-w8a8-105.log"
ulimit -n 65536
mkdir -p "$(dirname "$LOG_FILE")"
# GPU 0-7 拓扑环序: 前8卡 (tp8)
export CUDA_VISIBLE_DEVICES=0,1,2,3,6,5,4,7
export MACA_SMALL_PAGESIZE_ENABLE=1
export MACA_DIRECT_DISPATCH=1
# DSpark W8A8 关键开关 (105 引擎 vllm_metax 支持)
export MACA_VLLM_ENABLE_MCTLASS_FUSED_MOE=1
export MACA_VLLM_ENABLE_MCTLASS_PYTHON_API=1
echo "[$(date)] Starting vLLM(105) server for DeepSeek-V4-Flash-0731-W8A8 (8卡 TP8, 256K Context)..."
echo "Model: $MODEL_PATH"
echo "TP=${TP_SIZE}, Port: ${PORT}, MaxModelLen: ${MAX_MODEL_LEN}"
echo "Log: ${LOG_FILE}"
exec /opt/conda/bin/vllm serve "$MODEL_PATH" \
  --trust-remote-code \
  --kv-cache-dtype bfloat16 \
  --block-size 256 \
  --gpu-memory-utilization 0.90 \
  --enable-auto-tool-choice \
  --tool-call-parser deepseek_v4 \
  --max-num-seq 32 \
  --max-model-len "$MAX_MODEL_LEN" \
  --max-num-batched-tokens 8192 \
  --distributed-executor-backend mp \
  -tp "$TP_SIZE" \
  --port "$PORT" \
  2>&1 | tee -a "$LOG_FILE"