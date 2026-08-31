#!/usr/bin/env bash
# `make mine` — run only the tests for the module you own.
# Deliberately written for bash 3.2 (macOS ships that; no associative arrays).
set -uo pipefail
cd "$(dirname "$0")/.."
MEMBER="${1:-all}"
PYTEST=.venv/bin/pytest

case "$MEMBER" in
  m1) NAME="M1 · Road Defects"
      PATHS="services/edge/defects"
      FILES="(moved to the console repo)" ;;
  m2) NAME="M2 · Traffic + What-If + Recommendations"
      PATHS="services/cloud/intelligence/traffic_analytics services/cloud/intelligence/whatif services/cloud/intelligence/recommend"
      FILES="(moved to the console repo)" ;;
  m3) NAME="M3 · Pedestrian + Fusion + Urban Risk Index"
      PATHS="services/edge/pedestrian services/cloud/consensus services/cloud/intelligence/urban_risk"
      FILES="(moved to the console repo)" ;;
  m4) NAME="M4 · Incidents / ANPR"
      PATHS="services/edge/incidents"
      FILES="(moved to the console repo)" ;;
  m5) NAME="M5 · Platform"
      PATHS="services/cloud/api packages/db scripts"
      FILES="(no panel — you own the API surface everyone calls)" ;;
  m6) NAME="M6 · Frontend / Twin"
      PATHS="packages/contracts"
      FILES="(moved to the console repo)" ;;
  all)
      echo "  no member set — running everything."
      echo "  to run only your module:   echo m3 > .member    (or  MEMBER=m3 make mine)"
      exec $PYTEST ;;
  *)  echo "  unknown member '$MEMBER'. Use MEMBER=m1 … m6"; exit 1 ;;
esac

printf "\n  \033[1m%s\033[0m owns:\n" "$NAME"
for p in $PATHS; do echo "    $p"; done
echo "    $FILES"
echo ""

if [ "$MEMBER" = "m6" ]; then
  echo "  → your tests are mostly frontend:  cd apps/mobile && npm run test"
  echo ""
fi
exec $PYTEST $PATHS
