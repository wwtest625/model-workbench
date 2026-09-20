# [CodeBuddy 审核] Pinned-SHM DMA 方案 — 数字采纳、宣称打回、三个必测数字

> 审核人：CodeBuddy · 2026-09-16
> 对象：你在 146 的 Pinned Memory 压测与 "Pinned-SHM DMA Direct Loader" 架构
> 结论先行：**pinned 提速是真的（我修正自己此前"PCIe 地板 10-13s"的误判，那是 pageable 路径的地板）；但架构图"单体、零 daemon、常驻锁页"三句话物理上互斥。补测完三个数字再动代码。**

---

## 一、数字审核

| 项 | 结论 |
|---|---|
| 23.18~23.81 GB/s / 0.546s | ✅ 可信。脚本可见（`pin_memory()` 13GB → `copy_(non_blocking=True)`），符合 Gen4 x16 理论 32GB/s 的 ~73% |
| 口径 | ⚠️ 这是**单卡、纯 memcpy**。端到端 HIT 还要叠加 mmap/元数据构建/process_weights_after_loading，合理预期 1~2s 端到端（依然优秀） |
| 4 卡并发 | ❓ 未测。是否每卡独立 x16 决定 4 卡并发时总时间仍是 ~0.6s 还是打折 |

## 二、核心矛盾（必须先钉死）

你自己测出的事实 2：**现场锁页 13GB ≈ 22 秒**。而 pinned 是 GPU 驱动的运行时状态，**绑定进程生命周期——进程死，pinned 属性即失效**。因此：

- "**零守护进程**" 与 "**Pre-Pinned 常驻池**" **互斥**；
- 每次启动现场注册 → 22 + 0.5 ≈ 22.5s，比 pageable 的 13.9s 还慢，全盘归零；
- 要常驻 pre-pinned 池，必须有一个活进程持有它 = **daemon，只是从"占显存"换成"占 RAM"**。

**注意这是好消息**：RAM daemon 不占显存 → vLLM 独占显存（0.92 随便用，配比问题消失）；权重 DMA 进来就是 vLLM 自己的显存（数据与官方裸跑天然一致）；不碰 GPU IPC（无 ringbuf/shm_broadcast 嫌疑）；daemon 只守内存块，复杂度低一个量级。首次冷启动 36~41s 入池，之后每次重启 ~0.5s，正好是用户要的"第二次秒过"。

## 三、必测的三个数字（T1-T3，测完前禁止改加载器代码、禁止对外用"零 daemon"口径）

**T1 — `cudaHostRegister` 注册 mmap 区域的真实耗时**
- 22s 是 `mlock` 逐页（4KB）的数；`cudaHostRegister` 路径可能不同
- 实验矩阵：tmpfs 文件 13GB mmap 后 register；对照组 `MAP_POPULATE` 预读、huge pages（若 MACA/OS 支持）；记录注册耗时分布
- 若 register < 2s：架构可以简化为"无 daemon，每次启动现场注册"；若 ≈22s：坐实需要常驻持有者

**T2 — 跨进程 pinned 共享路径验证（方案成立与否的技术关键，你的架构图目前回避了它）**
- 候选路径 A：daemon `memfd_create`/shm 创建并 register，`SCM_RIGHTS` 传 fd 给 vLLM，vLLM mmap 同一物理页后**对端 register** —— 重点测 vLLM 侧 register 耗时（同 T1 但跨进程共享同一物理页时是否有 fast path）
- 候选路径 B：daemon 代发 DMA（daemon 收 UDS 请求，把 pinned 池内容拷到指定 device buffer）——需要验证 daemon 持有 CUDA context 但**零显存分配**是否可行、以及跨进程写 device 内存的权限路径
- 输出：两条路径各自的端到端耗时 + 可行性结论

**T3 — 4 卡并发 DMA 带宽**
- `mx-smi` 确认 GPU0-3 的 bus-id/PCIe 拓扑（是否每卡独立 x16 或共享 switch）
- 4 进程（或 4 stream）并发各拷 13GB pinned→各自卡，测总完成时间
- 输出：单卡 23GB/s 在 4 卡并发下保持多少

## 四、统一口径（测完后对外）

- 禁用："零 daemon 单体"（物理不成立）
- 正确叙事："**单容器双进程：RAM 常驻缓存池（不占显存）+ Pinned DMA 直灌**，冷启动一次，此后重启权重加载 ~0.5s，显存与推理数据与官方裸跑完全一致"

完成后回执（LANE_CARD 或用户转达）。
