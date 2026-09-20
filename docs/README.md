# 平台设计与技术文档库 (Docs)

本目录归档平台架构设计、冷启动生产规范、模型验收交接以及多 Agent 审查反馈报告。

## 1. 架构与生产标准

| 文档 | 主题 | 说明 |
|---|---|---|
| `fast-startup-production-standard.md` | 极速冷启动 | 生产环境冷启动与快速恢复落地规范 |
| `heterogeneous-fast-startup-tech-design.md` | 异构硬件加速 | 跨异构集群快速加载技术方案 |
| `serverlessllm-minimax-tech-design.md` | MiniMax 专项 | ServerlessLLM 存储对接与切片架构设计 |
| `handoff-serverlessllm-minimax.md` | MiniMax 移交 | 146 节点 16 卡 vLLM 运行状态与验收基线 |

## 2. 代码审查与工具反馈 (`reviews/`)

| 文档 | 审查对象 / 来源 | 说明 |
|---|---|---|
| `reviews/REVIEW_pinned_shm_from_codebuddy.md` | CodeBuddy | Pinned SHM 显存共享机制代码审查意见 |
| `reviews/REVIEW_shm_cache_from_codebuddy.md` | CodeBuddy | SHM Cache 缓存策略审查与优化建议 |
| `reviews/tool_feedback_20260916.md` | Agent 协同 | 工具链集成与自动化反馈记录 |
