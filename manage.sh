#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$DIR/model-workbench"
SERVICE="model-workbench.service"

case "$1" in
  start)
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/$SERVICE" ]; then
      systemctl start $SERVICE
      echo "✅ Model-Workbench 已通过 systemd 服务启动"
    else
      fuser -k 8899/tcp 2>/dev/null || true
      nohup $BIN -port 8899 >/dev/null 2>&1 &
      echo "✅ Model-Workbench 已在后台启动 (端口 8899)"
    fi
    ;;
  stop)
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/$SERVICE" ]; then
      systemctl stop $SERVICE
      echo "🛑 Model-Workbench 已通过 systemd 服务停止"
    else
      fuser -k 8899/tcp 2>/dev/null || true
      echo "🛑 Model-Workbench 已停止"
    fi
    ;;
  restart)
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/$SERVICE" ]; then
      systemctl restart $SERVICE
      echo "🔄 Model-Workbench 服务已重启"
    else
      $0 stop
      sleep 1
      $0 start
    fi
    ;;
  build)
    echo "🔨 开始重新构建前端与 Go 单二进制..."
    cd $DIR/frontend && npx vite build
    rm -rf $DIR/backend/cmd/server/dist
    cp -r $DIR/frontend/dist $DIR/backend/cmd/server/dist
    cd $DIR/backend && go build -o $DIR/model-workbench cmd/server/main.go
    ln -sf $DIR/model-workbench $DIR/metax-station 2>/dev/null || true
    echo "🎉 编译完成: $DIR/model-workbench"
    ;;
  status)
    if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/$SERVICE" ]; then
      systemctl status $SERVICE --no-pager
    else
      ss -tulpn | grep 8899 || echo "未在运行"
    fi
    ;;
  enable)
    systemctl daemon-reload
    systemctl enable $SERVICE
    echo "⚡ 已开启 WSL 开机自启动"
    ;;
  disable)
    systemctl disable $SERVICE
    echo "❌ 已关闭开机自启动"
    ;;
  *)
    echo "用法: $0 {start|stop|restart|build|status|enable|disable}"
    ;;
esac

