# Contributing

Seven days, six people, one repo. These rules exist so that nobody spends an
afternoon resolving a merge conflict instead of building.

---

## Branches

One long-lived branch per person. You work on yours all week.

| branch | owner | scope |
|---|---|---|
| `m1-defects` | M1 | `services/perception/defects/**`, `panels/DefectsPanel.tsx` |
| `m2-traffic` | M2 | `services/analytics/traffic/**`, `services/whatif/**`, `panels/TrafficPanel.tsx`, `panels/WhatIfPanel.tsx` |
| `m3-fusion` | M3 | `services/perception/pedestrian/**`, `services/fusion/**`, `panels/RiskPanel.tsx` |
| `m4-incidents` | M4 | `services/perception/incidents/**`, `panels/IncidentsPanel.tsx` |
| `m5-platform` | M5 | `services/api/**`, `services/replay/**`, `packages/db/**`, `scripts/**` |
| `m6-frontend` | M6 | `apps/command/src/**` (except `panels/`), `apps/field/**` |

`main` is protected. **No direct pushes, by anyone, including whoever set the
repo up.**

---

## The daily loop

```bash
# ── every morning, BEFORE you write a line of code ──
git checkout main
git pull origin main
git checkout m3-fusion
git rebase main

# ── during the day ──
MEMBER=m3 make mine        # your tests, fast
git add services/fusion    # stage only what you own
git commit -m "fusion: DBSCAN clustering with metre-space projection"

# ── before you push ──
make test                  # everything, not just yours
make fmt
git push origin m3-fusion
```

Rebase rather than merge. Six people merging main into six branches produces a
commit graph nobody can read by Wednesday.

---

## Pull requests

Open a PR to `main` **at least once a day**, even for work in progress. A branch
that has not touched main in three days is a branch that will not merge.

A PR needs:

- [ ] `make mine` green
- [ ] `make test` green — all six modules, not just yours
- [ ] `make fmt` run
- [ ] only files you own in the diff
- [ ] a title that says what changed, not "updates"

One approval from anyone merges it. Do not wait for a quorum; you do not have
the time.

### PR description template

```markdown
## What
One sentence.

## Files touched
- services/fusion/impl.py
- services/fusion/test_module.py

## Flag state
USE_REAL_FUSION: still false / now true

## Anyone else affected?
No / Yes — <who> and <why>, and I have told them.
```

---

## Touching a file you do not own

Do not. Ask the owner instead — it is faster than the conflict.

The exceptions, in order of preference:

1. **You need data another module has.** Ask its owner to expose it through
   their existing Protocol return type. Usually a field that already exists.
2. **You need a new API endpoint.** That is M5's. Ask M5.
3. **You need a contract change.** See below.

---

## Changing `packages/contracts`

It is frozen after Day 1. When you genuinely need a change:

1. Post the exact diff in the team channel.
2. Get an explicit ACK from **every owner it touches.**
3. `make test` — all module tests.
4. Commit with the guard acknowledged:
   ```bash
   CONTRACTS_OK=1 git commit -m "contracts: add optional Event.reported_by field"
   ```
5. Tell everyone to pull immediately. A stale contract is worse than a wrong one.

Additive changes — a new optional field, a new enum member — are cheap and
usually fine. **Renames and removals break five people at once.** If you find
yourself wanting one, ask whether an additive change would do.

---

## Commit messages

`<module>: <what changed>`

```
defects:   YOLOv8 inference path with lazy model load
fusion:    DBSCAN clustering, noise treated as single-obs events
api:       /api/events bbox filter
frontend:  interpolate bus positions between updates
contracts: add optional Event.reported_by  [ACKED: m1 m3 m5]
```

Not `fix`, not `wip`, not `updates`. On day six you will be reading this log to
find out when something broke.

---

## Merge conflicts

If you get one, something went wrong upstream of the conflict:

- **In your own module** → you did not rebase this morning. Rebase and move on.
- **In `packages/contracts`** → two people changed the frozen layer. Stop, get
  everyone in a room, resolve it as a team.
- **In someone else's file** → you edited a file you do not own. Revert your
  side and ask the owner.
- **In `.env`** → `.env` is gitignored. If you are seeing this, someone
  committed it. Remove it from tracking immediately:
  ```bash
  git rm --cached .env
  ```

---

## Code style

Python is enforced by tooling — run `make fmt` and stop thinking about it.
Ruff at 100 columns, mypy strict on `packages/`.

TypeScript: `npm run typecheck` in each app. Strict mode, no `any` without a
comment saying why.

Two conventions the tools cannot enforce:

- **Comments explain *why*, not *what*.** `# clamp to 0.999` is noise;
  `# never claim certainty — leave room for a human to disagree` is not.
- **Name the trap.** If you worked out something non-obvious — that buses stop
  at bus stops and wreck naive speed averaging, that mosquitto 2.x needs a
  config file — write it down where the next person will hit it.

---

## Pre-commit hooks

```bash
.venv/bin/pre-commit install
```

Runs ruff, mypy on the shared layer, and the contracts guard. It takes two
seconds and saves a broken main.

---

## Day 7

Feature freeze at the start of the day. After that: rehearse, fix only what is
actually broken, and make sure two people know how to restart the whole system
from scratch in under a minute.

The demo is not the code. The demo is the demo.
