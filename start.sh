#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fuser -k 8899/tcp 2>/dev/null || true
cd "$DIR"
exec "$DIR/.venv/bin/python" -m uvicorn app:app --host 0.0.0.0 --port 8899
