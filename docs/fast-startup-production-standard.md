# 工业级通用大模型极速冷启动标准规范 (Fast-Startup Standard)

---

## 1. 核心理念与技术分层

为了彻底解决百 GB 级大模型在异构集群（如 146 沐曦 16 卡节点）上冷启动耗时漫长（动辄 5~10 分钟）、且坚决避免“私有二进制格式转换”带来的高昂适配与维护成本，平台确立**“零格式转换、纯原生生态、分层极速启动”**的工业标准规范。

```
┌────────────────────────────────────────────────────────────────────────┐
│                   工业级 Fast-Startup 三层加速体系                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 宿主机 PageCache 内存预热层 (fast-preload CLI)                      │
│    利用 1TB 物理内存红利，将原生 Safetensors 锁定于内核页缓存 (4~6GB/s)   │
├────────────────────────────────────────────────────────────────────────┤
│ 2. 算子编译持久化层 (Persistent Triton & Graph Cache)                  │
│    映射 /workspace/.triton_cache，跳过重复 JIT 编译 (单模型净省 60~100s) │
├────────────────────────────────────────────────────────────────────────┤
│ 3. 运行时调度优化层 (Runtime Fast-Path Flags)                           │
│    跳过 P2P 探针握手、强制离线 Hub 检查、MCCL 本地通信复用              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 资产与工具沉淀

### 2.1 宿主机一键预热工具：`fast-preload`
- **位置**：`/home/workspace/fast_preload.py`（软链接至 `/usr/local/bin/fast-preload`）
- **特点**：零外部依赖（纯 Python 标准库），基于 `posix_fadvise(POSIX_FADV_WILLNEED)` 与并发块读取，将模型直接“焊”在宿主机内存中。
- **使用方法**：
  ```bash
  # 预热任意模型目录（支持 Safetensors / Bin / PT）
  fast-preload /mnt/model/Qwen3.8-27B
  fast-preload /mnt/model/GLM/GLM-4.7-W8A8
  ```

### 2.2 共享持久化缓存目录
在宿主机建立统一的缓存基线目录，权限置为 `777`，供不同容器共享挂载：
- Triton 算子缓存：`/home/workspace/.triton_cache` -> 容器内 `/workspace/.triton_cache`
- vLLM 图缓存：`/home/workspace/.vllm_cache` -> 容器内 `/workspace/.vllm_cache`

---

## 3. 1:1 独立启动脚本标准模版

任何接入平台的模型，其专属启动脚本（如 `start_vllm_<模型名>.sh`）必须包含以下标准化头部与参数配置：

```bash
#!/bin/bash
set -e

# ==============================================================================
# 🚀 模型专属配置 (参数隔离，严禁跨模型脚本复用)
# ==============================================================================
MODEL_PATH="/data/model/<模型目录>"
TP_SIZE=4                        # 按模型卡数配置 (如 4, 8, 16)
PP_SIZE=1
MAX_MODEL_LEN=8192
MAX_BATCHED_TOKENS=4096
GPU_MEM_UTIL=0.9
PORT=8000
LOG_FILE="/home/models_log/vllm/<模型名>.log"

ulimit -n 65536
mkdir -p "$(dirname "$LOG_FILE")"

# ==============================================================================
# ⚡ 工业级 Fast-Startup 标准环境变量组合拳 (核心沉淀)
# ==============================================================================
# 1. 算子编译持久化缓存 (彻底跳过二次启动的 JIT 耗时)
export VLLM_CACHE_ROOT="/workspace/.vllm_cache"
export TRITON_CACHE_DIR="/workspace/.triton_cache"

# 2. 启动握手加速 (跳过 P2P 互通探针与外网检查)
export VLLM_SKIP_P2P_CHECK=1
export HF_HUB_OFFLINE=1
export TORCH_NCCL_WATCHDOG_TIMEOUT=0

# 3. 沐曦 MetaX 硬件加速标志
export MACA_SMALL_PAGESIZE_ENABLE=1
export MACA_DIRECT_DISPATCH=1
export CUDA_VISIBLE_DEVICES=0,1,2,3  # 按实际绑卡配置

echo "[$(date)] Starting vLLM server with Fast-Startup Optimizations for $MODEL_PATH..."

# ==============================================================================
# 🚀 启动服务
# ==============================================================================
exec /opt/conda/bin/vllm serve "$MODEL_PATH" \
  -tp "$TP_SIZE" \
  -pp "$PP_SIZE" \
  --trust-remote-code \
  --max-model-len "$MAX_MODEL_LEN" \
  --max-num-batched-tokens "$MAX_BATCHED_TOKENS" \
  --enable-prefix-caching \
  --distributed-executor-backend mp \
  --gpu-memory-utilization "$GPU_MEM_UTIL" \
  --port "$PORT" \
  2>&1 | tee -a "$LOG_FILE"
```

---

## 4. 推广至新模型的“三步接入法”

当业务要在平台上部署新模型（如 `GLM-4.7-W8A8`、`DeepSeek-V4` 等）时，按以下三步标准化落地：

1. **Step 1: 宿主机一键预热 (Preload)**
   ```bash
   xssh 192.2.0.146 "fast-preload /mnt/model/<新模型目录>"
   ```
   *收益：50~200GB 权重一次性驻留物理内存，后续所有卡并发读取走内存总线带宽。*

2. **Step 2: 标准头注入启动脚本 (Standard Header Injection)**
   在模型的专属脚本 `start_vllm_<新模型>.sh` 中植入第 3 节的 Fast-Startup 标准环境变量。
   确保 docker 挂载包含 `-v /home/workspace:/workspace`。

3. **Step 3: 启动并持久化固化 (Warm & Freeze)**
   首次启动时正常完成 JIT 编译并自动将二进制落盘至 `/home/workspace/.triton_cache`。
   **自第二次启动起，该模型将自动享受“权重内存秒读 + JIT 零等待”的极速体验！**

---

## 5. 实测基准收益 (Qwen3.8-27B 生产对照)

| 启动阶段 | 原生未优化 | 沉淀后的 Fast-Startup 规范 | 效果评价 |
| :--- | :--- | :--- | :--- |
| **权重加载** | 43.7 秒 | **14.1 秒** | 提速 3.1 倍 (PageCache 纯内存直读) |
| **引擎 Warmup & 编译** | 88.3 秒 | **21.2 秒** | **净省 67 秒** (Triton 缓存持久化生效) |
| **容器重启耗时** | ~135 秒 | **~35 秒** | **总耗时缩减 74%** |
| **格式转换与适配风险** | - | **0 转换成本 / 0 适配风险** | 完全遵循官方生态，杜绝技术债务 |
