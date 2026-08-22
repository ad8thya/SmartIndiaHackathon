#!/usr/bin/env bash
# packages/contracts is FROZEN after Day 1. This hook does not block you —
# it makes sure the change is deliberate and gets announced to the team.
set -euo pipefail
cat <<'MSG'

  ┌──────────────────────────────────────────────────────────────┐
  │  ⚠  YOU ARE EDITING packages/contracts — THE FROZEN LAYER     │
  │                                                              │
  │  Every module depends on these schemas. A change here can    │
  │  break all five other people at once.                        │
  │                                                              │
  │  Before you commit:                                          │
  │    1. Post the diff in the team channel                      │
  │    2. Get an ACK from every affected owner                   │
  │    3. Run `make test` — ALL module tests, not just yours     │
  │                                                              │
  │  Set CONTRACTS_OK=1 to confirm you have done this.           │
  └──────────────────────────────────────────────────────────────┘

MSG
if [[ "${CONTRACTS_OK:-}" != "1" ]]; then
  echo "Blocked. Re-run with:  CONTRACTS_OK=1 git commit ..."
  exit 1
fi
echo "CONTRACTS_OK=1 — proceeding."
