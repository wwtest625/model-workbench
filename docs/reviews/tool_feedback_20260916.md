# 工具问题反馈（lane / herdr / xssh）— 每条附真实实例

> 反馈人：CodeBuddy · 2026-09-16 · 全部来自 09-15 ~ 09-16 真实使用场景
> 排序：影响越大越靠前。每条含【实例】（当时具体发生了什么）与【期望】。

---

## lane（4 条）

### L1. `lane view` 长消息静默截断，且无截断标记 ⭐ 最影响工作 ✅ 已修复（09-16）
- **实例**：09-16 审核.agy 的 Pinned 方案。`lane view f2886219` 里 step 3970 的关键句显示为"事实 2：现场对 13GB 内存执行 mlock/pin_memory() 需要 O…"——**正好断在"约 22 秒"这个决定架构方案的数字前面**。且没有任何"[已截断]"标记，我一开始无法分辨是消息本来就短还是被截了，差点基于残缺信息做架构判断。
- **期望**：① 截断时显示标记，如 `…[已截断，全文 3,214 字]`；② 长消息支持全文输出。
- **修复**：超 300 字必带 `…[已截断：全文 N 字，用 lane msg 或 --full 查看全文]`；`--full` 关闭截断。验收：该会话 117 条长消息全部带标记，`--full` 下 0 条。另附带消除了超 64KB 长行静默中断的隐患（改为显式告警）。

### L2. 缺少"取单条消息全文"的命令 ✅ 已修复（09-16）
- **实例**：同场景下，为拿 step 3970 全文，我被迫写 Python 脚本直接解析 `transcript.jsonl`（按 step_index 过滤、剥 `\\n` 转义）——就是你纠正过的"怎么还在用 py 脚本"的来历。当时不是不想用 lane，是 lane 确实给不了全文。
- **期望**：新增 `lane msg <会话ID> <序号>` 之类命令，输出单条消息不截断全文。补上它，"查记录用 lane"就能 100% 闭环，我永远不用碰底层 jsonl。
- **修复**：新增 `lane msg <会话ID> <序号> [--line]`，永不截断；无 text/content 的记录自动回退原始 JSON。验收：`lane msg f2886219 3974` 完整取出「耗时约 22 秒」——正是当初断掉的那个数字。

### L3. `lane view` 的展示编号与底层序号有偏移 ✅ 已修复（09-16）
- **实例**：lane view 显示 `[助手 #4002]`，我按 step_index=4002 去底层找，拿到的是空记录；真实全文在 **step 3999**（GENERIC 类型）。偏移关系不稳定（有的消息对得上有的对不上），排查浪费了两轮。
- **期望**：`lane view` 的编号与底层标识统一，或展示时附带真实序号（如 `[助手 #4002 (step:3999)]`）。
- **修复**：view 序号改为底层 step_index（与 msg 同口径），物理行号以 `(line:N)` 灰字附注；msg 支持 step_index/行号双口径自动兜底。验收：`[助手 #3974](line:3970)` 双标注正常。

### L4. 索引覆盖有遗漏（reasonix 会话搜不到）
- **实例**：09-15 查 reasonix 的 vLLM 卡死诊断结论，`lane -g "mxcd_ioctl"`、`lane -g "Multi-modal warmup"` 全部只命中 codebuddy 自己的会话，reasonix 的会话不在索引/扫描范围里。最后靠 `herdr pane read` + 手动找 `/root/.reasonix/projects/` 底层文件才拿到。
- **期望**：索引扫描覆盖 `.reasonix` 的 sessions 目录（`turns.jsonl` 格式），或至少 `lane -g` 结果里提示"以下 agent 未被索引：reasonix"，让我知道该去哪补查。

---

## herdr（3 条）

> 注：herdr 为开源第三方工具（非自研）。以下问题可用于向 upstream 提 issue，也可作为评估替代方案或自研替换的输入。用户本人同样认为不好用。

### H1. `agent list` 寻址不到 agy，传话只能盲发
- **实例**：agy（Gemini CLI）始终不在 `herdr agent list` 里（只注册了 cline/pi），`agent prompt/send-keys` 全部用不了。传话只能 `pane run wC:p5` 盲发。
- **期望**：agent 识别支持 Gemini CLI；或 pane 上有简易"标签"机制能稳定定位。

### H2. `pane run` 投递后无法确认对方是否读到
- **实例**：09-16 投递审核意见给 agy，`pane run` 返回 exit 0，随后 `pane read` 返回**空输出**——无法区分"已收到正在处理"还是"投递丢失"。最后靠 `lane -g "REVIEW_pinned"` 从会话标题反查才确认收到了（绕了两大圈）。
- **期望**：`pane run` 增加回执语义，如检测目标 CLI 进入 working 状态后返回 `delivered:true`（现有 agent prompt 的 stalled 检测逻辑其实就有，pane 面也能用上就好）。

### H3. `pane read` 对 alternate-screen 应用的历史输出丢失
- **实例**：09-15 读 reasonix（TUI 全屏应用），`--source recent-unwrapped --lines 400` 也只拿到当前帧，它之前的完整诊断结论拿不到，只能去翻底层会话文件。（skill 文档承认此限制，但实际工作里 TUI agent 恰恰是最常要读的。）
- **期望**：可接受维持现状（已知限制），但建议 `pane read` 在检测到 alternate screen 时输出提示，免得我反复加大 `--lines` 试错。

---

## xssh（2 条）

### X1. 本地 shell（fish）与远端命令的转义冲突，复杂命令必坑
- **实例**：09-15 多次踩坑：`xssh 146 "awk '{print \$14+\$15}' ..."` 中 `\$` 被本地 fish 吃掉，远端报 `awk: unexpected character '\'`；`$(...)` 命令替换在本地就被展开。同样意图的命令 bash 环境下正常。
- **期望**：提供 `xssh run 146 --file script.sh`（把本地脚本原样推到远端执行）或 `--raw`（跳过本地 shell 插值）。目前的 workaround 是"本地写文件 → `xssh up` 上传 → 执行"三步走，能用但繁琐。

### X2. heredoc 双跳失效且静默
- **实例**：`xssh 146 "docker exec c1 python - <<'EOF' ... EOF"` 远端拿到的是空 heredoc，命令 exit 0、输出为空——**静默失败**，我以为成功了，白等一轮才发现。
- **期望**：检测到远端命令含 heredoc 但 stdin 未接通时报警（exit 非 0 或 stderr 提示）。

---

## 正面反馈（保持别动）

- `lane -g` 关键词检索：快且准（1.3ms 命中，"REVIEW_pinned"、"23.18" 都一次命中），本次审核能快速反查 agy 接单全靠它
- `herdr pane run / wait-output / pane list`：日常投递与状态确认稳定
- `xssh up` 传文件 + `xssh watch` 盯远端日志：好用，已是我的默认动作

---

## 优先级建议

| 优先级 | 项 | 理由 |
|---|---|---|
| ~~P0~~ | ~~L1 / L2~~ ✅ 已修复（09-16） | 两个 P0 当天闭环，`lane msg` + 截断标记已验证可用 |
| P1 | H2（投递回执） | 跨 agent 协作的可信度基础 |
| P1 | X1（--file/--raw） | 消除每换一台机器就要重新踩一遍的转义坑 |
| P2 | L3 ✅ 已修复（09-16）/ L4 / H1 / H3 / X2 | 有实例、有 workaround，按顺手时排 |
