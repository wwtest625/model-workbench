#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

case "$1" in
  start)
    tmux kill-session -t metax_workbench 2>/dev/null || true
    fuser -k 8899/tcp 2>/dev/null || true
    tmux new-session -d -s metax_workbench "cd $DIR && ./metax-station -port 8899"
    echo "✅ MetaX 算力工作台已在后台启动 (端口 8899)"
    ;;
  stop)
    tmux kill-session -t metax_workbench 2>/dev/null || true
    fuser -k 8899/tcp 2>/dev/null || true
    echo "🛑 MetaX 算力工作台已停止"
    ;;
  restart)
    $0 stop
    sleep 1
    $0 start
    ;;
  build)
    echo "🔨 开始重新构建前端与 Go 单二进制..."
    cd $DIR/frontend && npx vite build
    rm -rf $DIR/backend/cmd/server/dist
    cp -r $DIR/frontend/dist $DIR/backend/cmd/server/dist
    cd $DIR/backend && go build -o $DIR/metax-station cmd/server/main.go
    echo "🎉 编译完成: $DIR/metax-station"
    ;;
  status)
    ss -tulpn | grep 8899 || echo "未在运行"
    ;;
  *)
    echo "用法: $0 {start|stop|restart|build|status}"
    ;;
esac
