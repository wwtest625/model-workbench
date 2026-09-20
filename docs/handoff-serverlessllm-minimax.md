# Handoff: MiniMax-M2.5-W8A8 (146 节点 16卡 vLLM) 状态与交付文档

## 1. 核心结论与服务现状

1. **服务运行状态**：
   - **容器名称**：`vllm-minimax-m2.5-w8a8`（已在平台 `hosts.yaml` 与 146 宿主机对齐名称）
   - **监听端口**：`8000`（HTTP 就绪，`/v1/models` 返回 200）
   - **模型架构**：`MiniMax-M2.5-W8A8` (TP=16, max_model_len=20480, max_num_batched_tokens=8192)
   - **GPU 状态**：16 卡 MetaX N300-A 显存均匀占用 ~46.3GB，温度 31~35℃

2. **端到端推理验收**：
   - 已通过 `/v1/chat/completions` 执行端到端真实文本生成测试，首包正常输出，模型推理与 16 卡通信正常无损。

---

## 2. 关键文件与资产路径 (192.2.0.146)

| 资产路径 | 类别 | 说明 |
|---|---|---|
| `/home/workspace/start_vllm_minimax.sh` | 专属启动脚本 | 平台调用的 1:1 专属启动脚本 |
| `/home/workspace/patch_vllm_sllm.py` | 补丁引擎 | Direct DMA 标量对齐与跨分卷自适应切片补丁 |
| `/data/model/MiniMax/MiniMax-M2.5-W8A8` | 原始权重 | 215GB W8A8 原始 Safetensors 权重 |
| `/home/workspace/convert_minimax_m2_5_sllm.py` | 离线转换脚本 | 全量 62 层无损切分与校验导出脚本 |

---

## 3. 规范与指令清单

- **监控看护铁律**：已写入 `AGENTS.md`，服务监控统一使用 `xssh watch` 挂起至就绪，严禁 sleep 轮询。
- **健康检查与调用命令**：
  ```bash
  # 查询模型
  xssh 192.2.0.146 "curl -s http://127.0.0.1:8000/v1/models"
  
  # 端到端推理
  xssh 192.2.0.146 'curl -s http://127.0.0.1:8000/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"/data/model/MiniMax/MiniMax-M2.5-W8A8\",\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}],\"max_tokens\":64}"'
  ```
