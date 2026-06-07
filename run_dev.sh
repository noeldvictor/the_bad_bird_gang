#!/usr/bin/env bash
# Dev server for The Bad Birds — LAN-exposed so you can play on your phone.
# Usage: ./run_dev.sh            (default port 5173)
#        PORT=8080 ./run_dev.sh  (custom port)
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "node_modules missing — installing dependencies…"
  npm install
fi

PORT="${PORT:-5173}"

# Print the LAN URL up front (vite prints it too, but this one's hard to miss).
IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo "────────────────────────────────────────────────"
echo "  THE BAD BIRDS — dev server"
echo "  Desktop:  http://localhost:${PORT}/"
if [ -n "$IP" ]; then
  echo "  Phone:    http://${IP}:${PORT}/   (same Wi-Fi)"
fi
echo "────────────────────────────────────────────────"

exec npm run dev -- --port "$PORT"
