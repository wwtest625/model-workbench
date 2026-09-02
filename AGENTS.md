# Reasonix 全局配置 (metax-workbench)

## 语言

**始终用中文回答。**

## 红线：WSL 网络

**绝对不要在 WSL 里操作网络**：不 `ip link set <iface> down/up`、不 flush 路由表、不改 `.wslconfig` 后自己重启。本机网卡带 `noprefixroute`，link down/up 后路由不会自动重建，会直接断网（146/76 等全部 ENETUNREACH）。需要改网络模式时只改文件，让用户自己 `wsl --shutdown`。

## xssh — SSH 快捷工具

位置: `/root/.local/bin/xssh`（`xssh --help` 可查全部参数）

```bash
xssh <alias> "<cmd>"                  # 远程执行（防御性非交互）
xssh shell|s <alias> ["<cmd>"]        # 持久会话（保持状态，可连续多条）
cat deploy.sh | xssh <alias> --stdin  # 管道喂命令
xssh upload|up <alias> <local> <remote> [--resume]   # 上传（目录加 --recursive）
xssh download|dl <alias> <remote> <local> [--resume] # 下载
xssh tunnel|t <alias> local|remote|dynamic <spec>    # 端口转发
xssh multi|m ...                      # 多连接分组管理
xssh list                             # 服务器别名列表
```

约定: 远程优先用 xssh 而非裸 ssh；长任务加 `--timeout`；大输出加 `--max-lines/--max-bytes`；连续多命令用 `xssh s`；批量多机用 `xssh m`。

## 大模型存储服务器

- 76 (`192.2.56.76`): `/data/AI_model/` — **主力存储，新模型一律下载到这**（modelscope）
- test03 (`192.2.29.9`): `/HDD_Raid/SVN_MODEL_REPO/Model/` — 历史仓库，空间紧张只读，别写大文件

```bash
xssh 192.2.56.76 "cd /data/AI_model && modelscope download --model <org/name> --local_dir <模型名>"  # 下载
xssh 192.2.56.76 "rsync -avP --progress /data/AI_model/<模型名>/ <target>:<dest>/"                    # 分发
```

- 模型目录命名与 modelscope/HF 一致；大传输用 rsync --progress 或 xssh up --resume
- 沐曦官方社区（Maca 适配模型优先查这里）: https://modelscope.cn/organization/metax-tech

## GPU 测试

沐曦用 `mx-smi`，海光用 `hy-smi`（接口类似 nvidia-smi，可能不在 PATH 需先 `which hy-smi`）。

```bash
mx-smi                    # 总览：利用率/显存/温度/功耗/进程
mx-smi -i <N> --show-hbm-bandwidth   # HBM 带宽
mx-smi -l <ms> -t <sec>   # 循环采样
mx-smi -o output.csv      # 输出 CSV
mx-smi --show-all-process # 所有 GPU 进程
```

约定: 跑测试前先确认 GPU 空闲；压测用 `-l` 采样；关注 GPU-Util/HBM/显存/温度/功耗；结果记录模型名/精度/TP/batch/seq/throughput/TTFT/TPOT；对比只变一个变量。

---

## 可用 Agent 生态

本机运行多个 coding agent，共享 `/root` 文件系统：

| Agent | 路径 | 定位 |
|-------|------|------|
| **Reasonix** | 当前 | 主力 agent，多模型支持 |
| **qoder** | `/root/.local/bin/qoder` | 前端/UI 开发 specialist |
| **CodeBuddy** | `/root/.local/bin/codebuddy` | 代码审查/安全审计 specialist |
| **agy** | `/root/.local/bin/agy` | 系统架构/GPU 压测 specialist |
| **codex** | `/usr/local/bin/codex` | OpenAI 官方 agent |
| **pi** | `/root/.local/bin/pi` | 通用 coding agent |

### 派活方式

```bash
# 一次性任务（加超时防卡）
timeout 120 /root/.local/bin/qoder -p "实现一个 React 组件"
timeout 120 /root/.local/bin/codebuddy -p "审查 /root/demo.py"
timeout 120 /root/.local/bin/agy -p "分析内存泄漏"

# 指定模型
/root/.local/bin/qoder -p -m local-vllm/Qwen3.8-27B "任务描述"
```

### 分工建议

- **前端/UI** → qoder
- **代码审查/安全** → CodeBuddy  
- **架构/GPU 测试** → agy
- **复杂多步任务** → Reasonix（当前）
- **快速查询** → pi 或 codex

---

## Lane 泳道协同系统

位置: `/root/.agent/`

### CLI 命令 (`/root/.local/bin/lane`)

```bash
lane                      # 查看所有 Agent 最新会话列表
lane <session_id> -s      # 摘要模式查看
lane -a qoder -s          # 仅筛选 qoder 会话
lane -a agy               # 仅筛选 agy 会话
lane -g "关键词"           # 全局跨 Agent 搜索
lane <session_id> -T      # 跳过思考流
lane rename <ID> "新标题"
lane tag <ID> add "标签"
lane pin <ID>             # 置顶
lane rm <ID> [-f]         # 删除（-f 物理删除）
lane clean --empty        # 清理空会话
```

### 跨 Agent 注入

```bash
lane qoder "我是 Reasonix，已完成后端，请测试前端"
lane codebuddy "请对 /root/demo.py 进行安全审查"
lane agy "继续排查内存泄漏问题"
```

### Web 控制面板

```bash
lane panel [--port 3457]     # 启动可视化控制台
```

---

## 联网搜索三件套

`/root/.qoder/skills/` 下有: `build-with-exa`, `anysearch`, `use-tinyfish`

| 工具 | 调用 | 强项 |
|---|---|---|
| **Exa** | `curl` 或 `exa-py`/`exa-js` | 语义排名最强；`/answer` 带引用回答 |
| **AnySearch** | `python3 /root/.qoder/skills/anysearch/scripts/anysearch_cli.py search "q"` | **零配置**；时效最好；垂直领域支持 |
| **TinyFish** | `/root/tinyfish-proxy/tinyfish search query "q"` | **唯一**支持浏览器自动化 |

---

## Qoder 本地补丁

`/root/.local/bin/qoder` wrapper 每次启动自动重打两个补丁：

| 补丁脚本 | 目标文件 | 作用 |
|---|---|---|
| `/root/qoder-local-patch.js` | `bundle/qodercli.js` | 强制启用 External Providers（接本地 vLLM） |
| `/root/qoder-zh-patch.js` | `bundle/qoder-worker-runtime.mjs` | 内置斜杠命令描述中文化 |

```bash
node /root/qoder-zh-patch.js          # 手动重打汉化补丁
node /root/qoder-zh-patch.js --undo   # 还原
```

---

## Herdr 终端管理器

位置: `/root/.local/bin/herdr`（配置: `/root/.config/herdr/`）

```bash
herdr status                          # 服务端与客户端状态
herdr agent list                      # 查看所有受管 Agent
herdr pane list                       # 查看所有窗格
herdr pane read <pane_id> [--lines N] # 偷瞄窗格输出
herdr agent prompt <target> "<cmd>"   # 投递任务提示词
herdr pane rename <pane_id> "<label>" # 重命名窗格
```

---

## WSL → Windows Chrome CDP (web-access skill)

复用 Windows Chrome 登录态。Chrome 必须带调试端口启动（`Chrome-CDP.bat` 或 `--remote-debugging-port=9222`）。

```bash
# 启动 proxy（使用 run_in_background）
node /root/.qoder/skills/web-access/scripts/cdp-proxy.mjs --browser chrome
curl -s http://localhost:3456/health   # 期望 "connected":true

# 基本操作
curl -s -X POST --data-raw '<URL>' http://localhost:3456/new
curl -s -X POST "http://localhost:3456/eval?target=ID" -d 'document.body.innerText'
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/shot.png"
```

---

## Reasonix 配置参考

- **配置目录**: `/root/.reasonix/`
- **会话存储**: `/root/.reasonix/projects/-root-metax-workbench/sessions/`
- **默认模型**: `agnes-2.5-flash` (custom-apihub)
- **备用模型**: `Qwen3.8-27B` (local-vllm @ 192.2.0.146:8000)
- **权限模式**: `ask`（敏感操作需确认）
- **工作区沙盒**: `/root/metax-workbench`

### 常用命令

```bash
reasonix session list --json           # 列出会话
reasonix session show <id> --json     # 查看会话详情
reasonix task list --json              # 列出任务
reasonix doctor                        # 诊断信息
reasonix upgrade                       # 更新
```

---

## 项目结构

```
/root/metax-workbench/
├── backend/              # 后端服务
├── frontend/             # 前端项目
├── competition-modelscope-qwen3.8/  # 模型比赛
├── model-workbench       # 主程序（65MB）
├── manage.sh             # 启动脚本
├── hosts.yaml            # 主机配置
└── .git/                 # Git 仓库
```
