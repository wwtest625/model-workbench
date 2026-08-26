# 🚀 Model-Workbench · 大模型算力与工程工作台

<p align="center">
  <b>专为国产 GPU（沐曦 MetaX / 海光 Hygon 等）打造的算力运维、容器编排、性能常规巡检与基准对比全栈平台</b>
</p>

---

## 🌟 核心特性

- **🎮 多卡 GPU 实时拓扑**：实时采集显存占用、利用率、温度与功耗，支持 8 卡 / 16 卡矩阵感知与自动轮询。
- **🩺 环境合规预检**：开箱即查 `ACS`、`IOMMU` 隔离关闭状态及 `CPU Governor (performance)` 运行模式，确保多卡通信最佳性能。
- **🔄 多机即插即用 (Multi-Host Adapter)**：顶栏一秒切换算力机，标准工程范式（`/home/workspace`）自动复用与服务自适应发现。
- **🐳 容器编排与三大透视**：
  - **脚本源码在线 IDE**：集成微软 VS Code 原生 **Monaco Editor**，支持实时 Shell 语法高亮、Tab 缩进与 `Ctrl+S` 安全热保存（Base64 双向防截断传输）。
  - **Compose 编排解析**：精准提取 `docker-compose-models.yml` 对应服务定义与启动指令。
  - **容器实时日志**：最近 250 行 `docker logs` 动态拉取与一键复制。
- **📈 性能常规巡检 (run.py)**：穿透容器执行短/长上下文及 SLO 极限摸高压测，**SSE 流式推流**实时回显终端输出。
- **🌐 MCCL 通信基准**：一键执行 16 进程 1GB AllReduce 带宽测试与节点连通性验证。
- **💬 模型试玩 (Playground)**：直连推理服务端口，实时测算响应速度（Tokens/s）与耗时。
- **🤖 AI Agent 友好 (Headless Ready)**：暴露标准 RESTful JSON API，无缝对接自动化评测与调度 Agent。

---

## 🏗️ 架构设计

```text
                  ┌─────────────────────────────────────────────────────────┐
                  │               🖥️ 前端中台 (React + TypeScript)          │
                  │  Tailwind CSS · Lucide 图标 · Monaco Editor · ECharts    │
                  └────────────────────────────┬────────────────────────────┘
                                               │ HTTP REST / SSE 流式推流
                  ┌────────────────────────────┴────────────────────────────┐
                  │                 ⚙️ 后端引擎 (Go 语言)                    │
                  │                                                         │
                  │  - Host Manager: 多主机配置中心与自动探测               │
                  │  - Runner: xssh / 原生 SSH 无损字节流管道               │
                  │  - Model Manager: Docker 容器感知与 Compose 解析        │
                  │  - Benchmark Engine: 容器内穿透压测与日志解析           │
                  │  - Embed FS: 前端静态资源内嵌 (单二进制文件交付)         │
                  └────────────────────────────┬────────────────────────────┘
                                               │ SSH / Docker Socket
                                               ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │              🖥️ 目标算力服务器 (/home/workspace)         │
                  └─────────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 1. 启动服务
```bash
./manage.sh start
```
打开浏览器访问：`http://localhost:8899`

### 2. 常用管理命令
```bash
./manage.sh status     # 查看当前运行状态
./manage.sh restart    # 重启工作台服务
./manage.sh stop       # 停止服务
./manage.sh build      # 重新构建前端与 Go 单二进制
```

---

## 🛠️ 技术栈

- **后端**：Go 1.25+, Gin Web Framework, Server-Sent Events (SSE), xssh
- **前端**：React 18, TypeScript, Vite, Tailwind CSS, Monaco Editor, ECharts, Lucide Icons
- **打包交付**：Go `//go:embed` 单二进制单文件部署

---

## 📄 License
MIT License
