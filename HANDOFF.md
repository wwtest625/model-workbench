# 大模型多算力集群全景工作台 (Model Workbench) - 上下文交接文档

> 更新时间: 2026-08-27
> 仓库地址: https://github.com/wwtest625/model-workbench
> 运行端口: `http://localhost:8899`

---

## 1. 核心架构与技术栈
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + Monaco Editor + xterm.js (流式终端)
- **后端**: Go 1.23 + Gin + 纯静态资源内嵌 (`embed.FS`)，单二进制产物 (`/root/metax-workbench/model-workbench`)
- **运维控制**: `/root/metax-workbench/manage.sh` (集成 Systemd 服务 `model-workbench.service`)
- **WSL 开机自启**: 已通过 `/etc/systemd/system/model-workbench.service` 启用 `systemctl enable`

---

## 2. 算力集群与多主机物理隔离 (`hosts.yaml`)
- **146 沐曦算力节点 (`metax-146`)**:
  - IP / SSH: `192.2.0.146` (免密)
  - 硬件: 沐曦 MetaX N300-A · 16 卡在线 (768 GB 显存)
  - 工作空间: `/home/workspace`
  - 专属模型: `Qwen3.8-27B` (运行中), `DeepSeek-V4-Flash-W8A8`, `MiniMax-M2.5-W8A8`, `GLM-4.5-Air-W8A8`, `GLM-4-32B-FP8`
- **55 海光 DCU 算力节点 (`hygon-55`)**:
  - IP / SSH: `192.7.9.55` (已通过一键密码打通免密)
  - 硬件: 海光 BW1100 · 深算三号 DCU-3 · 8 卡在线 (512 GB 显存)
  - 工作空间: `/root/workspace`
  - 专属模型/真实容器: `GLM5-vLLM (深算三号)` (运行中), `DeepSeek-V4-Flash (SGLang)`, `GLM5-SGLang`, `flash-mla`, `v4flash` 等

---

## 3. 最新 UI/UX 规范 (方案 B 全景统一看板)
1. **状态切片器**: 顶部仅保留 **`[运行中 (N)]`** 与 **`[未启动 (M)]`** 两个状态 Tab，移除了“全部模型”；
2. **未启动列表**: 采用 3 列横向规整网格，每张卡片含名称、框架徽标、TP/Port、右上角紧凑墨绿 `▶ 启动` 按钮、底部 `[脚本源码]` 与 `[Compose]` 双透视；
3. **运行中列表**: 全景卡片，支持自由折叠/展开，镜像 Repo & Tag 独立换行展示，提供 `[实时日志]` 与 `[停止]`；
4. **实时日志抽屉**: 位于页面底部，支持鼠标自由拖拽拉伸高度，不遮挡顶部 GPU 实时拓扑；已修复容器名映射与 xterm 渲染契约。

---

## 4. 常用管理指令
```bash
/root/metax-workbench/manage.sh status     # 查看状态
/root/metax-workbench/manage.sh restart    # 重启服务
/root/metax-workbench/manage.sh build      # 全量构建前端与 Go 单二进制
/root/metax-workbench/manage.sh enable     # 开启开机自启
```
