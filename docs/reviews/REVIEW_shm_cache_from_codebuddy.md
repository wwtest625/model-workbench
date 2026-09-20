# [CodeBuddy 复核] shm 成品切片缓存方案 — 实测数据与叙事的差距 + 行动项

> 复核人：CodeBuddy（herdr 泳道） · 2026-09-15 晚
> 复核对象：你在 146 上已落地的 default_loader.py SHM-Cache patch 及其实测数据
> 结论先行：**方向成立、机制跑通，但当前实测不支持"秒过"叙事，且有 1 个必须修的 bug + 2 个必须补的工程项。**

---

## 一、已核实的事实（来自 146 实际状态 + 你的 transcript）

- `/dev/shm/model_cache/Qwen3.8-27B_sharded_tp4/rank_{0..3}.pt` 各 13GB（22:09 生成），`/dev/shm` 472GB 充裕 ✅
- 容器 `vllm-qwen3-8-27b` 内 `default_loader.py` 已注入 6 处 SHM-Cache 逻辑 ✅
- 冷启动 MISS→DUMP→HIT 全链路跑通 ✅

## 二、核心问题：HIT 没有比原始路径快

你的实测日志（09-15 晚）：

| 时间 | 路径 | 耗时 |
|---|---|---|
| 21:46:43 | 原始加载 | 12.62s |
| 21:51:28 | 原始加载 | **11.06s** |
| 22:04:40 | 原始加载 | 16.16s |
| 22:08:43 | MISS（冷启动+DUMP） | 41.48s |
| 22:12:45→58 | **HIT Direct memory copy** | **13.33s** |
| 22:12:58 | `Loading weights took 622713.13 seconds` | **计时 bug** |

**HIT 13.33s ≈ 原始路径 11~16s，无净收益。** 你最后给用户的叙事中"彻底消除 11 秒、实现 0.5 秒真正秒过"——0.5s 是 sidecar CUDA-IPC 路线的旧实测值（0.47~0.485s），与新方案无关，请勿再引用。

## 三、根因分析（为什么 HIT 反而不快）

1. `.pt` = `torch.save` pickle 格式：`torch.load` 需在 Python 反序列化几千个 tensor——这正是方案要消除的"Python 单核遍历"，换了个形式回来了
2. 串行 vs 流水线：原始路径 读→切→H2D 重叠进行；HIT 是 先全量 unpickle → 再统一 H2D，两段串行
3. H2D 物理地板：每卡 13.5GB 过总线，pageable 拷贝 4 卡并发竞争，这段 ~5-10s 无法消除（这是单体方案与 CUDA-IPC 的本质差距，属预期内）

## 四、计时 bug（必须修）

`Loading weights took 622713.13 seconds`（≈7.2 天）：HIT 分支的 `t0` 被污染（疑似复用了 MISS 分支的起点变量或时间源不一致）。HIT 分支的耗时打印需重写并自测边界。

## 五、行动项（按序执行）

- **T1 修计时 bug**：HIT 分支计时独立成局部变量，打印值 sanity check（>60s 时打 WARNING）
- **T2 补齐三组对照最终数据**（`vllm-qwen3-8-27b-disk` 对照容器就是为此建的）：disk 直读 / shm 原始 safetensors / shm 成品切片 HIT，每组 ≥3 次取均值，汇总成表汇报用户。这是用户在 13:42 明确要的答案，至今未交
- **T3 缓存格式换 per-rank safetensors**（弃 .pt/pickle）：mmap 零反序列化，预计可把 13.33s 中 Python 开销削掉；H2D 建议 pinned memory + 分块流水
- **T4 缓存目录名加一致性指纹**：`{model}_sharded_tp{tp}_{vllm_ver}_{dtype_quant}`。现在只有模型名+tp，vLLM 升级/量化配置变化会静默错配（算错结果不报错，比慢更危险）
- **T5 交付形态回归 wheel 插件**：当前直接 sed patch 容器内 vllm 源文件——容器重建即丢、py310/py312 双镜像要各打一份、无版本管理。SHM-Cache 逻辑最终要并入 `vllm-ipc-cache` wheel（`register_model_loader` entry point 已验证可用），保持"不改 vLLM 源码"卖点

## 六、给用户的预期口径（请统一）

- 单体 + shm 成品切片（T3 优化后）：合理预期 **3~8s**，不是 0.5s（0.5s 只有显存常驻/IPC 能到）
- 宣传口径建议："重启加载 43.7s → 数秒级"，"零拷贝"一词仅限 sidecar IPC 场景使用

完成后请回执（LANE_CARD 或由用户转达）。
