#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Runs the five hot-reloading processes side by side and kills them all
# together on Ctrl-C. Logs are prefixed and colourised so six people can read
# one terminal.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

VENV=.venv
PY="$VENV/bin/python"
PIDS=()

cleanup() {
  echo ""
  echo "  shutting down…"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

run() { # run <colour> <label> <cmd...>
  local colour=$1 label=$2; shift 2
  ( "$@" 2>&1 | sed -u "s/^/$(printf '\033[%sm%-7s\033[0m│ ' "$colour" "$label")/" ) &
  PIDS+=($!)
}

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"

echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  URBAN TWIN is starting                                  │"
echo "  │    command centre  →  http://localhost:5173              │"
echo "  │    field app       →  http://localhost:5174              │"
echo "  │    role portal     →  http://localhost:5175              │"
echo "  │    api docs        →  http://localhost:${API_PORT:-8000}/docs         │"
if [ -n "$LAN_IP" ]; then
echo "  │                                                            │"
echo "  │  on your phone (same wifi):                               │"
echo "  │    field app       →  http://$LAN_IP:5174              │"
echo "  │    role portal     →  http://$LAN_IP:5175              │"
fi
echo "  └──────────────────────────────────────────────────────────┘"
echo ""

run 36 api    "$PY" -m uvicorn services.cloud.api.main:app --host 0.0.0.0 --port "${API_PORT:-8000}" --reload
sleep 2
run 35 replay "$PY" -m services.tools.replay --speed "${REPLAY_SPEED:-60}" --buses "${REPLAY_BUSES:-6}" --loop
run 32 command npm --prefix apps/command run dev -- --host --port 5173
run 33 field   npm --prefix apps/field   run dev -- --host --port 5174
run 34 roles   npm --prefix apps/roles   run dev -- --host --port 5175

wait
