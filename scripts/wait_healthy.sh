#!/usr/bin/env bash
# Block until postgres, redis and mosquitto all report healthy.
set -uo pipefail
SERVICES=(ut-postgres ut-redis ut-mosquitto)
DEADLINE=$((SECONDS + 120))

echo "  waiting for infrastructure…"
for svc in "${SERVICES[@]}"; do
  while true; do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "missing")
    case "$status" in
      healthy) printf "    \033[32m✔\033[0m %s\n" "$svc"; break ;;
      missing) printf "    \033[31m✘\033[0m %s not running — is docker up?\n" "$svc"; exit 1 ;;
    esac
    if (( SECONDS > DEADLINE )); then
      printf "    \033[31m✘\033[0m %s stuck in '%s'\n" "$svc" "$status"
      docker logs --tail 40 "$svc" || true
      exit 1
    fi
    sleep 2
  done
done
echo "  infrastructure ready."
