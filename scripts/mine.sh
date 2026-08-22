#!/usr/bin/env bash
# `make mine` — run only the tests for the module you own.
# Deliberately written for bash 3.2 (macOS ships that; no associative arrays).
set -uo pipefail
cd "$(dirname "$0")/.."
MEMBER="${1:-all}"
PYTEST=.venv/bin/pytest

case "$MEMBER" in
  m1) NAME="M1 · Road Defects"
      PATHS="services/perception/defects"
      FILES="apps/command/src/panels/DefectsPanel.tsx" ;;
  m2) NAME="M2 · Traffic + What-If"
      PATHS="services/analytics/traffic services/whatif"
      FILES="apps/command/src/panels/TrafficPanel.tsx apps/command/src/panels/WhatIfPanel.tsx" ;;
  m3) NAME="M3 · Pedestrian + Fusion"
      PATHS="services/perception/pedestrian services/fusion"
      FILES="apps/command/src/panels/RiskPanel.tsx" ;;
  m4) NAME="M4 · Incidents / ANPR"
      PATHS="services/perception/incidents"
      FILES="apps/command/src/panels/IncidentsPanel.tsx" ;;
  m5) NAME="M5 · Platform"
      PATHS="services/api packages/db scripts"
      FILES="(no panel — you own the API surface everyone calls)" ;;
  m6) NAME="M6 · Frontend / Twin"
      PATHS="packages/contracts"
      FILES="apps/command/src (shell, map, layout) + apps/field (whole app)" ;;
  all)
      echo "  no member detected (branch is not m1-… and MEMBER is unset) — running everything"
      exec $PYTEST ;;
  *)  echo "  unknown member '$MEMBER'. Use MEMBER=m1 … m6"; exit 1 ;;
esac

printf "\n  \033[1m%s\033[0m owns:\n" "$NAME"
for p in $PATHS; do echo "    $p"; done
echo "    $FILES"
echo ""

if [ "$MEMBER" = "m6" ]; then
  echo "  → your tests are mostly frontend:  cd apps/command && npm run test"
  echo ""
fi
exec $PYTEST $PATHS
