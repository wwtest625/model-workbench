# DeepSeek-V4-Flash 16卡部署、性能调优与 DSML 工具调用修复记录

## 1. 架构总览与拓扑方案

| 项目 | 配置详情 |
| :--- | :--- |
| **部署主机** | `192.2.0.146:8000` |
| **容器名称** | `vllm-dsv4-0731-w8a8-105` |
| **硬件环境** | 16x MetaX N300-A (48GB HBM，共 768GB 显存) |
| **模型版本** | `DeepSeek-V4-Flash-0731-W8A8` (DSpark 混合量化) |
| **底层驱动与引擎** | MACA 3.8.2.105 + vLLM 0.25.0 (PyTorch 2.10 / Python 3.12) |
| **并行计算架构** | **Tensor Parallel (TP) = 8, Data Parallel (DP) = 2**（共 16 卡全开） |
| **API 服务节点** | 双 API Server 协同路由 (`ApiServer_0`, `ApiServer_1`) |

---

## 2. 调优记录与核心参数实测边界（1、2、3 排坑记）

在探索进一步提升 Agent 交互吞吐（TPS）与缩短首字延迟（TTFT）的过程中，针对以下三个关键配置进行了深度极限测试与验证：

### ① `--max-num-batched-tokens`
- **默认设定**：`8192`
- **激进尝试**：调大至 `32768`（期望单批次处理更大吞吐，减少多轮 Chunk 拆分）
- **实测结果**：❌ **启动崩溃（OOM / ValueError）**
- **底层根因**：
  在 MetaX N300 架构下，`max-num-batched-tokens` 设为 32768 会直接导致前向 Activation Buffer 与 Breakable CUDA Graph 的显存预留**骤增 10 GiB**。
  - 8192 时，分配模型权重（19.37 GiB）后，**可用 KV Cache 高达 17.36 GiB**；
  - 32768 时，可用 KV Cache **暴跌至 7.48 GiB**。
  - vLLM 在启动检查阶段计算发现 7.48 GiB 无法承载基础上下文调度，直接抛出 `ValueError: larger than available KV cache memory` 并强制退出。
- **调优结论**：**生产环境必须锁定 `--max-num-batched-tokens 8192`**，确保 17.36 GiB KV Cache 安全底线。

---

### ② `--block-size`
- **默认设定**：`256`
- **激进尝试**：调小至 `128` 或 `16`（期望减小 PagedAttention 显存碎片并加快细粒度读取）
- **实测结果**：❌ **初始化编译断言失败（AssertionError）**
- **底层根因**：
  DeepSeek-V4 采用了滑动窗口与多头潜变量注意力（SWA + MLA），其模型配置文件中强制指定了 `"sliding_window": 128`。
  而在 vLLM 的 `kv_cache_utils.py`（第 1628 行）中包含硬性断言：
  ```python
  assert max(sm_page_sizes) <= max(all_page_sizes)
  ```
  当 block size 设定小于 256（如 128 或 16）时，底层多级 Page 大小无法满足对齐关系，触发 `AssertionError`。
- **调优结论**：**生产环境必须锁定 `--block-size 256`**。

---

### ③ `--max-model-len`
- **默认设定**：`262144`（256k 超长上下文）
- **激进尝试**：强制降至 `65536`
- **实测结果**：在 batched tokens 保持 8192 时，模型本身无需缩减至 65536 即可轻松承载 262144；若在 batched tokens 过大导致 KV Cache 缩减时，即使限制为 65536 也需要 21.18 GiB KV Cache，依然无法解决问题。
- **调优结论**：保持原始 `MAX_MODEL_LEN=262144`，享受全尺寸超长上下文能力。

---

### 生产黄金参数汇总

```bash
/opt/conda/bin/vllm serve /data/model/model/DeepSeek/DeepSeek-V4-Flash-0731-W8A8 \
  --trust-remote-code \
  --kv-cache-dtype bfloat16 \
  --block-size 256 \
  --gpu-memory-utilization 0.90 \
  --enable-auto-tool-choice \
  --tool-call-parser deepseek_v4 \
  --max-num-seq 32 \
  --max-model-len 262144 \
  --max-num-batched-tokens 8192 \
  --distributed-executor-backend mp \
  -tp 8 \
  -dp 2 \
  --port 8000
```

---

## 3. DSML 工具调用 (Tool Call) 泄漏与双层拦截修复

### 3.1 故障现象
在接入 CodeBuddy 或 Reasonix Agent 时，模型遇到工具执行场景不会返回 OpenAI 标准的 `tool_calls` 结构，而是直接输出类似如下的原始标签：
```text
<｜DSML｜> <｜DSML｜> ...
<｜DSML｜_execute> docker ps -a --filter name=vllm </｜DSML｜_execute>
```
导致 Agent 前端将其当成普通文本展示，无法拦截并触发 Bash/文件执行。

### 3.2 根因定位
1. **模型端**：DeepSeek-V4 在预训练与微调阶段使用自研的 `<｜DSML｜>` 领域控制符，执行命令被封装在 `<｜DSML｜_execute>` 节点内；
2. **服务端**：vLLM 内置的 `deepseek_v4` parser 仅处理标准 XML 或 JSON 闭环，遇到未转义的专用 token 无法解包；流式传输时（SSE）更因逐字输出导致标签漏入 `delta.content`。

### 3.3 修复架构：双层安全拦截（Double Interceptor）
我们开发并注入了容器级热补丁 [`patch_dsml.py`](file:///root/metax-workbench/DSV4/patch_dsml.py)：

1. **非流式拦截层** (`vllm/parser/deepseek_v4.py`)：
   - 重写 `parse()` 方法；
   - 提取 `<[｜|]DSML[｜|]_execute>(.*?)</[｜|]DSML[｜|]_execute>` 中的命令内容；
   - 动态识别请求注册的工具（如 `bash`, `execute`, `run_command`），封装为合法的 `FunctionCall(name=..., arguments=...)`；
   - 清洗文本中泄漏的 `<｜DSML｜>` 字符，当全部为工具调用时将 `content` 重置为 `None`。
2. **流式拦截层** (`vllm/entrypoints/openai/chat_completion/serving.py`)：
   - 拦截 SSE delta 流中尚未被标识为 `tool_calls` 但包含 `_execute` 的历史片段；
   - 将其即时转换为 `DeltaToolCall` 事件流推送给客户端，同时阻断其向 `delta.content` 发送。

---

## 4. 性能与基准测试结果 (Benchmark)

使用专用测试脚本实测得到以下真实性能数据：

### 4.1 工具调用准确性验证 (`test_tool_call.py`)
- **非流式响应**：
  - 耗时：**1.15s**
  - Finish Reason：`tool_calls`
  - Arguments：`{"command": "docker ps"}`
  - Leaked DSML Tokens：**0**
- **流式响应**：
  - 耗时：**1.13s**（6 chunks 流式到达）
  - Finish Reason：`tool_calls`
  - Arguments：`{"command": "uptime"}`

### 4.2 吞吐量 (TPS) 与首字延迟 (TTFT) (`benchmark_tps.py`)

| 测试场景 | 输入大小 | 首字延迟 (TTFT) | 纯解码 TPS | 端到端总 TPS |
| :--- | :--- | :--- | :--- | :--- |
| **短 Prompt（问答/指令）** | 38 字符 (~50 tokens) | **0.098s** | **42.76 tokens/s** | **41.61 tokens/s** |
| **长 Context（Agent 8k-10k 场景）** | 11,468 字符 (~3,500+ tokens) | **1.139s** | **41.20 tokens/s** | **28.13 tokens/s** |

### 4.3 为什么 Agent 场景感官上会觉得慢？
1. **纯解码性能非常稳定**：无论 Prompt 长度如何，纯解码阶段均稳定在 **41+ tokens/s**。
2. **首字计算 (Prefill) 开销**：在 Agent 场景下，由于携带海量系统提示词、所有工具的 JSON Schema 及历史对话上下文，输入 Token 数往往达到数千乃至上万。在 16 卡 TP8+DP2 组网下，计算 SWA MLA 矩阵与跨卡通信使得首字延迟（TTFT）延长至 1~2 秒。若单步工具调用仅需输出 30~40 tokens，端到端总时间约 2.5 秒，导致计算出的整体平均 TPS 看似被拉低，但这是长序列预填充的正常物理特性。

---

## 5. 文件目录与脚本说明

本目录 (`/root/metax-workbench/DSV4/`) 汇集了所有相关资产：

| 文件 | 说明 |
| :--- | :--- |
| [`start_vllm_deepseek_v4_0731_w8a8_105.sh`](file:///root/metax-workbench/DSV4/start_vllm_deepseek_v4_0731_w8a8_105.sh) | 146 服务器上的基准黄金启动脚本（包含拓扑、MCCL 与 16 卡配置） |
| [`patch_dsml.py`](file:///root/metax-workbench/DSV4/patch_dsml.py) | 解决 DSML 标记泄漏与 Function Call 自动映射的热补丁脚本 |
| [`test_tool_call.py`](file:///root/metax-workbench/DSV4/test_tool_call.py) | 工具调用（非流式 & 流式）自动化校验脚本 |
| [`benchmark_tps.py`](file:///root/metax-workbench/DSV4/benchmark_tps.py) | 阶梯长短 Prompt 吞吐量、首字延迟（TTFT）基准测试脚本 |

---

## 6. 运维与快速操作手册

### 检查服务与模型可用性
```bash
curl --noproxy "*" -s http://192.2.0.146:8000/v1/models | jq .
```

### 运行功能与性能验证
```bash
# 1. 验证工具调用
python3 /root/metax-workbench/DSV4/test_tool_call.py

# 2. 运行性能测试
python3 /root/metax-workbench/DSV4/benchmark_tps.py
```

### 重启与打补丁命令（若容器重建）
```bash
# 重启容器
xssh 192.2.0.146 "docker restart vllm-dsv4-0731-w8a8-105"

# 在容器内注入 DSML 补丁
xssh 192.2.0.146 "docker cp /root/metax-workbench/DSV4/patch_dsml.py vllm-dsv4-0731-w8a8-105:/tmp/ && docker exec vllm-dsv4-0731-w8a8-105 python3 /tmp/patch_dsml.py"
```
