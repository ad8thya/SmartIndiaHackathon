#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Runs the hot-reloading processes side by side and kills them all together on
# Ctrl-C. Logs are prefixed and colourised so six people can read one terminal.
#
# One frontend, one port, one API:
#   :5176  apps/mobile  the phone app — citizen, crew, driver, emergency
#
# The desktop console lives in its own repository now. Run it there; it talks
# to this API over CORS, which is already open to any localhost port.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."
# `.env` supplies DEFAULTS. Anything already set in the caller's environment
# wins — otherwise `API_PORT=8010 make demo` is silently ignored, because
# `set -a; . ./.env` overwrites the variable the caller just passed. That made
# the port-conflict advice below impossible to follow.
_preset_api_port="${API_PORT:-}"
set -a; [ -f .env ] && . ./.env; set +a
[ -n "$_preset_api_port" ] && API_PORT="$_preset_api_port"

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
echo "  │    mobile app        →  http://localhost:5176            │"
echo "  │    api docs          →  http://localhost:${API_PORT:-8000}/docs       │"
if [ -n "$LAN_IP" ]; then
echo "  │                                                            │"
echo "  │  on your phone (same wifi):                               │"
echo "  │    http://$LAN_IP:5176   ← the phone app            │"
fi
echo "  └──────────────────────────────────────────────────────────┘"
echo ""

run 36 api    "$PY" -m uvicorn services.cloud.api.main:app --host 0.0.0.0 --port "${API_PORT:-8000}" --reload
sleep 2
run 35 replay "$PY" -m services.tools.replay --speed "${REPLAY_SPEED:-60}" --buses "${REPLAY_BUSES:-6}" --loop
run 33 mobile npm --prefix apps/mobile run dev -- --host --port 5176

wait
