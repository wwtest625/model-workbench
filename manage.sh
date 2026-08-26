#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$DIR/model-workbench"
if [ ! -f "$BIN" ] && [ -f "$DIR/metax-station" ]; then
  BIN="$DIR/metax-station"
fi

case "$1" in
  start)
    tmux kill-session -t model_workbench 2>/dev/null || true
    tmux kill-session -t metax_workbench 2>/dev/null || true
    fuser -k 8899/tcp 2>/dev/null || true
    tmux new-session -d -s model_workbench "cd $DIR && $BIN -port 8899"
    echo "✅ Model-Workbench 已在后台启动 (端口 8899)"
    ;;
  stop)
    tmux kill-session -t model_workbench 2>/dev/null || true
    tmux kill-session -t metax_workbench 2>/dev/null || true
    fuser -k 8899/tcp 2>/dev/null || true
    echo "🛑 Model-Workbench 已停止"
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
    cd $DIR/backend && go build -o $DIR/model-workbench cmd/server/main.go
    ln -sf $DIR/model-workbench $DIR/metax-station
    echo "🎉 编译完成: $DIR/model-workbench"
    ;;
  status)
    ss -tulpn | grep 8899 || echo "未在运行"
    ;;
  *)
    echo "用法: $0 {start|stop|restart|build|status}"
    ;;
esac
