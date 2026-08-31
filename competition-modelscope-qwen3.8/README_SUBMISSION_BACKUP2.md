# 【经验分享】沐曦 N300-A × vLLM 部署 Qwen3.8-27B：核心防崩溃防线 + 262K 原生上下文 + 蒸馏版横向对比实测

> **首发平台**：ModelScope Qwen3.8-27B 模型讨论区 (Issue)  
> **适用硬件**：国产 GPU 沐曦 MetaX N300-A 系列（工业级多卡集群 / 单卡 48GB HBM）  
> **推理框架**：vLLM 1.0.3 (MACA AI 3.7.0 深度优化版)  
> **测试模型**：
> - 基座模型：`Qwen/Qwen3.8-27B` (BF16，27.78B 参数)
> - 蒸馏增强模型：`TeichAI/Qwen3.8-27B-Fable-Distill` (Claude Fable-5 蒸馏微调版)

---

## 0x01 生产级运行环境

测试机器是 16 卡集群里的一个节点，拿前 4 张卡组 TP=4，软件栈用沐曦官方的 MACA 3.7 生态和 vLLM 定制镜像。

| 配置分类 | 详细参数与版本 | 备注说明 |
| --- | --- | --- |
| **操作系统** | Ubuntu 22.04.4 LTS (Linux 5.15.0-generic) | 生产稳定内核 |
| **算力硬件** | 沐曦 MetaX N300-A × 4 | 单卡 48GB HBM，共 192GB 显存资源池 |
| **驱动版本** | Kernel Mode Driver (KMD) 3.8.30 | 官方生产驱动 |
| **MACA 框架** | MACA 3.7.2.0 (AI Toolkit 3.7.0.107) | 算子已做适配优化 |
| **监控管理工具** | mx-smi | 沐曦官方 GPU 监控工具 |
| **推理容器镜像** | `modelzoo.llm.vllm:1.0.3-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64` | 沐曦官方预编译 vLLM 镜像 |
| **并行策略** | Tensor Parallelism = 4 (TP=4) | 4 卡并行承载 27B 模型 |
| **上下文配置** | `max-model-len = 262144` (256K 原生上限) | 长文档不截断 |


![](.inknote-assets/image-1787982322551.png)


---

## 0x02 沐曦 MACA 部署的“三道防崩溃防线”（核心避坑）

国产卡上直接照抄公版 CUDA 的部署脚本，很容易碰到随机崩溃、NCCL 死锁、显存性能抖动这些问题。实测下来有三个环境变量必须加，缺一不可：

### 坑 1：NCCL 通信超时导致整个守护进程被 Watchdog 误杀
* **现象**：在超长文本（如 100K+ Prefill）或网络瞬时抖动时，多卡 AllReduce 计算耗时较长，PyTorch 默认的 NCCL Watchdog 会误判定为死锁，直接发出 `SIGABRT` 强杀整个 vLLM 进程。
* **防线配置**：
  ```bash
  export TORCH_NCCL_WATCHDOG_TIMEOUT=0
  ```
* **原理**：超时不再直接杀进程，而是降级为等待重试，长任务不容易被打断。

### 坑 2：高并发 KV Cache 显存碎片与 HBM 访存抖动
* **现象**：默认页表大小下，并发请求反复创建/释放 KV Cache 会产生显存碎片，跑久了偶尔性能抖动。
* **防线配置**：
  ```bash
  export MACA_SMALL_PAGESIZE_ENABLE=1
  ```
* **原理**：开启小页表模式，PagedAttention 在 HBM 上的访存连续度更好，显存利用更充分。

### 坑 3：社区开源蒸馏模型 Tokenizer 导出兼容性报错
* **现象**：加载社区微调/蒸馏模型（如 `Qwen3.8-27B-Fable-Distill`）时，vLLM 直接报错起不来：
  `ValueError: Tokenizer class TokenizersBackend does not exist or is not currently imported.`
* **根因**：部分作者用 Unsloth/TRL 导出模型时，`tokenizer_config.json` 里写了一个非标准的 `TokenizersBackend` 类名。
* **解法**：把类名改回标准的：
  ```bash
  sed -i "s/\"tokenizer_class\": \"TokenizersBackend\"/\"tokenizer_class\": \"Qwen2Tokenizer\"/g" tokenizer_config.json
  ```

### 坑 4：Dense 模型的算子调度通用路径性能损耗
* **现象**：Qwen3.8-27B 是 Dense 模型，默认 Dispatch 走通用保守路径，算子发射开销偏大。
* **防线配置**：
  ```bash
  export MACA_DIRECT_DISPATCH=1
  ```
* **原理**：启用直通硬件指令队列分发，减少 CPU-GPU 交互延迟，解码吞吐更高。

---

## 0x03 生产部署运行脚本（TP=4 + 256K 上下文）

### 启动脚本 (`start_vllm_qwen3.8_27b.sh`)

```bash
#!/bin/bash


# 1. 注入三道防崩溃环境变量
export MACA_SMALL_PAGESIZE_ENABLE=1
export MACA_DIRECT_DISPATCH=1
export CUDA_VISIBLE_DEVICES=0,1,2,3
export TORCH_NCCL_WATCHDOG_TIMEOUT=0

# 2. 启动 vLLM 推理服务
python3 -m vllm.entrypoints.openai.api_server \
  --model /data/model/Qwen3.8-27B \
  --tensor-parallel-size 4 \
  --pipeline-parallel-size 1 \
  --trust-remote-code \
  --served-model-name "Qwen3.8-27B" "qwen3.8-27b" \
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
```

### 关键参数设计意图
1. `--max-model-len 262144`：原生拉满 256K（262,144），不截断长文档。智商拉满
2. `--max-num-batched-tokens 8192`：削峰机制，防止超大 Prompt 一次性冲垮预填充显存。
3. `--enable-prefix-caching`：System Prompt 与历史对话 KV Cache 自动复用，多轮对话首字延迟降低 60% 以上。
4. `--tool-call-parser qwen3_xml`：原生支持 Qwen 体系的 Agent 工具调用解析。


![](.inknote-assets/image-1787983405249.png)


---

## 0x04 生产负载实测与稳定性（持续运行 24h+）

### 1. 显存分配与负载状态（`mx-smi` 实测采样）

4 卡 TP 下各卡显存、功耗都很均衡：

| GPU ID | 显存占用 (MiB) | 显存使用率 | 待机功耗 | 满载峰值功耗 | 核心温度 |
| --- | --- | --- | --- | --- | --- |
| GPU 0 | **47395 / 49152** | 96.4% | 94W | 280W / 500W | 37°C |
| GPU 1 | **47395 / 49152** | 96.4% | 94W | 275W / 500W | 36°C |
| GPU 2 | **47395 / 49152** | 96.4% | 92W | 285W / 500W | 38°C |
| GPU 3 | **47395 / 49152** | 96.4% | 92W | 278W / 500W | 39°C |

### 2. GPU 利用率是"脉冲式"的，别误判
* 无论是手动交互还是通过 Coding Agent（如 qodercli）持续调用，vLLM 的 Decode 非常快，请求间隙 GPU 利用率会瞬间归零（0%），请求一到就冲高到 48%~58%。
* **利用率为 0% 不等于服务挂了**，不要拿某一瞬间的 GPU-Util 判断健康度，看 `/v1/models` 或端口探针更靠谱。服务已连续稳定运行 24 小时以上，没有 Crash 过。

---

## 0x05 Agent 工具调用（Function Calling）验证

用 OpenAI 兼容协议测了工具调用（Qwen 的 XML tool call 格式），看参数解析准不准：

### 自动化验证脚本 (`scripts/agent_tool_test.py`)

```python
import json
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="EMPTY")

# 定义工具模式
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_gpu_metric",
            "description": "查询沐曦国产 GPU 的指定监控指标",
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

messages = [{"role": "user", "content": "帮我查一下 2号卡 当前的显存使用量 (hbm_used)是多少？"}]

response = client.chat.completions.create(
    model="Qwen3.8-27B",
    messages=messages,
    tools=tools,
    tool_choice="auto"
)

print(json.dumps(response.model_dump(), indent=2, ensure_ascii=False))
```

### 实测返回结果

```json
{
  "choices": [
    {
      "finish_reason": "tool_calls",
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "chatcmpl-tool-7b19a2e8c024",
            "type": "function",
            "function": {
              "name": "get_gpu_metric",
              "arguments": "{\"gpu_id\": 2, \"metric\": \"hbm_used\"}"
            }
          }
        ]
      }
    }
  ]
}
```
开启 `--tool-call-parser qwen3_xml` 后参数和意图都解析对了，接 Agent 任务循环没问题。

---

## 0x06 基座 vs 蒸馏模型横向对比：Qwen3.8-27B vs Fable-Distill

又拉了一个社区蒸馏版 **`TeichAI/Qwen3.8-27B-Fable-Distill`**（基于 Claude Fable-5 的语料和思维链做的微调），放在同样的 N300-A TP=4 环境里同台对比。

### 1. 权重直接迁移验证
* **权重规格**：两者都是 `qwen3_5` 结构、27.78B 参数。
* **部署结论**：**换权重路径直接就能起**，不用重新编译任何算子，显存占用同样收敛到 47.4GB/卡，社区模型基本不用额外适配。

### 2. 基座 vs 蒸馏版指标对比

| 测试维度 / Prompt 场景 | 原始基座：`Qwen3.8-27B` (端口 8000) | 蒸馏版：`Qwen3.8-27B-Fable-Distill` (端口 8001) | 实测表现与生成风格 |
|---|---|---|---|
| **算法编码 (区间质数函数)** | 12.61s (40.62 tok/s) | 12.86s (39.83 tok/s) | 吞吐对齐；Base 用常规埃氏筛，Distill 改用**分段筛 (Segmented Sieve)**，大区间更省内存 |
| **逻辑推理 (三管水池注水)** | 8.20s (40.24 tok/s) | 7.30s (39.86 tok/s) | 两者计算步骤均正确；Distill 耗时更短、推导步骤更紧凑 |
| **国产运维排障 (NCCL 熔断)** | 12.65s (40.49 tok/s) | 12.77s (40.09 tok/s) | 解码速率一致 (40+ tok/s)；两者都准确指出了 Watchdog 置 0 与页大小环境变量 |
| **数学推导 (17*23+19)** | 0.21s (直接输出 410) | 1.98s (37.92 tok/s) | Base 直接给答案，Distill 会先写思维链验证 |
| **单卡稳态显存 (TP=4)** | **47,376 MiB** (GPU 0-3) | **47,356 MiB** (GPU 4-7) | **显存偏差 < 0.05%**，两款模型资源分配一致 |
| **原生上下文上限** | **262,144 (256K)** | **262,144 (256K)** | 都能完整载入 256K 上下文，没有 OOM 或算子降级 |

### 3. 高难度 Case：糖果抽屉问题

为了测模型的审题和自我纠错能力，找了一道抽屉原理变式题。这题迷惑性强，据说大部分模型都做不对：

#### 【测试题目】
> 在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖果和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖果？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）
> 
> | 形状 | 苹果味 | 桃子味 | 西瓜味 |
> |---|---|---|---|
> | 圆形 | 7 | 9 | 8 |
> | 五角星形 | 7 | 6 | 4 |

#### 【两款模型的实际推导表现对比】

* **原始基座 `Qwen3.8-27B`（耗时 36.68s，输出 26 颗 ❌ 翻车）**：
  * **死因**：看到抽屉原理就直接套盲摸模板，没有仔细审题。
  * **推演过程**：把 12 颗西瓜 + 7 颗圆形苹果 + 9 颗圆形桃子直接累加，算出最坏情况 28，加 1 得出 29 颗。全程无视了题干里 **“手感可以分辨形状”** 这个关键条件。
* **蒸馏增强 `Qwen3.8-27B-Fable-Distill`（耗时 38.12s，成功破局识别形状决策 ✅）**：
  * **亮点**：中途自己停下来重新审题、纠正思路。
  * **原话**：它开头也算出了盲摸的 29，但后面自己停下来重读题目：
    > *"Wait... 不同的形状靠手感可以分辨? They can distinguish shape by touch? If shapes can be distinguished by touch, they can select based on shape! Participant needs to decide (x, y) rather than a single blind number!"*
  * 由此意识到参赛者可以**主动指定摸 $x$ 个圆 + $y$ 个星**，而不是只能盲摸一个总数。

#### 【官方标准推导过程：为什么答案必定是 21？】

关键是把圆形和五角星分开决策（两种配对满足任意一种就赢）：
1. **五角星取 12 颗（锁定两种口味）**：五角星共 17 颗（7 果、6 桃、4 瓜）。最坏情况下排除星桃需 $7+4=11$ 颗，排除星果需 $6+4=10$ 颗。因此只要摸取 $y = 11 + 1 = 12$ 颗五角星，无论运气多差，手中**必定同时拥有【五角星苹果】和【五角星桃子】**！
2. **圆形取 9 颗（排除干扰项）**：既然已经稳拿两味五角星，圆形里只要拿到**任意一颗苹果或桃子（非西瓜即可获胜）**。圆形西瓜只有 8 颗，因此只需摸取 $x = 8 + 1 = 9$ 颗圆形，第 9 颗必然是苹果或桃子！
3. **最少取出总数**：$N = x + y = 9 + 12 = \mathbf{21} \text{ 颗}$！

**蒸馏版**：答对了 21，而且过程严谨——四种失败局面分解、写了暴力验证脚本、发现脚本 bug 并自我修正、最后给出反例证明 20 不够。

![](.inknote-assets/image-1788054937303.png)

![](.inknote-assets/image-1788054955116.png)

**base 版**：答错了 26。它的分析框架有误：把"圆形苹果"和"圆形桃子"当独立事件处理（表格里甚至自相矛盾：文字说"c≥18 必得"但公式却用 c-13），忽略了两种配对可同时发生的耦合，导致保底数偏大。

![](.inknote-assets/image-1788054986395.png)




---

## 0x07 总结与选型建议

1. **硬件选型**：N300-A 48GB × 4 张卡 TP=4 部署 27B 刚好合适，KV Cache 够支持 256K 上下文，并发吞吐 340+ tok/s。
2. **防坑核心**：三个环境变量（Watchdog 置 0、小页表、Direct Dispatch）是长期稳定运行的关键，建议直接固化到启动脚本。
3. **蒸馏版**：要更强的逻辑推理和 Agent 能力，可以直接换 `TeichAI/Qwen3.8-27B-Fable-Distill`，部署配置完全通用。

---

### 附录：复现资源与代码清单
* 自动化冒烟与对比测试脚本：`scripts/smoke_and_compare.py`
* 工具调用验证脚本：`scripts/agent_tool_test.py`
* 生产环境配置启动脚本：`scripts/start_vllm_qwen3.8_27b.sh`
