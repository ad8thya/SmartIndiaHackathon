# Contributing

Seven days, six people, one repo, **one branch**. These rules exist so that
nobody spends an afternoon resolving a merge conflict instead of building.

---

## Everyone works on `main`

There are no member branches. There is `main`, and that is all.

We tried one long-lived branch per person. What actually happened: five
branches sat untouched at the same commit for days while the real work piled up
on one, and `main` quietly diverged from all of them. By the time anyone
looked, two people had rewritten the same two files in different directions and
the PR would not merge. The branches did not prevent that collision — they hid
it until it was expensive.

Small commits straight onto `main`, pushed often, collide less. You find out
about a conflict in the thirty seconds after someone else's push, not on day
six.

The protection that branches used to give you is now three things: **the
ownership map below**, **pulling with `--rebase` before you start**, and
**pushing often enough that your work is never a surprise**.

---

## Who owns what

This is the useful half of the old branch system, and it still applies. Same
boundaries, no branches.

| Member | Owns |
|---|---|
| M1 | `services/edge/defects/**` (+ `DefectsPanel.tsx` in the console repo) |
| M2 | `services/cloud/intelligence/traffic_analytics/**`, `services/cloud/intelligence/whatif/**`, `services/cloud/intelligence/recommend/**`, `TrafficPanel.tsx` (console repo), `WhatIfPanel.tsx` (console repo) |
| M3 | `services/edge/pedestrian/**`, `services/cloud/consensus/**`, `services/cloud/intelligence/urban_risk/**`, `RiskPanel.tsx` (console repo) |
| M4 | `services/edge/incidents/**` (+ `IncidentsPanel.tsx` in the console repo) |
| M5 | `services/cloud/api/**`, `services/tools/replay/**`, `packages/db/**`, `scripts/**` |
| M6 | `apps/mobile/src/**` — the phone app; the console lives in its own repo |

`packages/contracts` is owned by everyone and changed by nobody without an ACK.
See below.

**Stage what you own, not what is dirty.** `git commit -a` is how you commit
someone else's half-finished file. Name your paths:

```bash
git add services/cloud/consensus            # not  git add -A
```

---

## The daily loop

```bash
# ── every morning, and after any long break ──
git pull --rebase origin main

# ── during the day ──
MEMBER=m3 make mine                          # your tests, fast
git add services/cloud/consensus             # stage only what you own
git commit -m "fusion: DBSCAN clustering with metre-space projection"
git pull --rebase origin main                # someone else pushed while you worked
git push origin main
```

Push **several times a day**, not once. On one shared branch, an unpushed
commit is a commit nobody can build on and everybody can collide with.

### `--rebase`, always

Configure it once and stop thinking about it:

```bash
git config pull.rebase true
```

Without it, six people pulling produces a merge commit per pull and a graph
nobody can read by Wednesday.

### Never force-push

`git push --force` on a shared `main` deletes other people's commits. There is
no undo that does not involve someone reading a reflog at 2am.

If you need to undo something already pushed, add a commit that reverses it:

```bash
git revert <sha>
```

If you rebased and now `push` is rejected, **do not** reach for `--force`. Run
`git pull --rebase origin main` and push again. If it is still rejected, stop
and ask — that is a genuinely confusing state and it is faster to look at it
together than to guess.

---

## Before you push

Every time. It takes under a minute and it is the whole reason `main` stays
green for five other people.

```bash
make test          # everything, python + frontend — not just your module
make lint          # ruff, and it must exit 0
git pull --rebase origin main
```

Checklist:

- [ ] `make test` green — all six modules, not just yours
- [ ] `make lint` green (`make fmt` first if it is not)
- [ ] `git pull --rebase origin main` done, and nothing broke after it
- [ ] only files you own in `git diff --stat`
- [ ] a commit message that says what changed, not "updates"

If `make test` is red and it is not your code that broke it, say so in the team
channel before you push on top of it. Two people debugging the same red suite
in silence is the worst use of an afternoon.

---

## Touching a file you do not own

Do not. Ask the owner instead — it is faster than the conflict.

The exceptions, in order of preference:

1. **You need data another module has.** Ask its owner to expose it through
   their existing Protocol return type. Usually a field that already exists.
2. **You need a new API endpoint.** That is M5's. Ask M5.
3. **You need a contract change.** See below.

On one branch this matters *more* than it did, not less. There is no PR review
standing between your commit and everyone else's next pull.

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
5. Push immediately, and tell everyone to pull. A stale contract is worse than
   a wrong one — and on a shared branch, "stale" now means everyone.

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
find out when something broke — and now it is the only log there is.

---

## Merge conflicts

On one branch you will hit these during `git pull --rebase`, not at PR time.
The diagnosis is the same:

- **In your own module** → you did not pull this morning. Resolve, `git rebase
  --continue`, move on.
- **In `packages/contracts`** → two people changed the frozen layer. Stop, get
  everyone in a room, resolve it as a team.
- **In someone else's file** → you edited a file you do not own. Take their
  side (`git checkout --theirs <file>`), drop your change, and ask the owner.
- **In `.env`** → `.env` is gitignored. If you are seeing this, someone
  committed it. Remove it from tracking immediately:
  ```bash
  git rm --cached .env
  ```

If a rebase goes somewhere you do not understand, `git rebase --abort` puts you
back exactly where you started. It is always safe. Use it early rather than
pushing a mess.

---

## Code style

Python is enforced by tooling — run `make fmt` and stop thinking about it.
Ruff at 100 columns, mypy strict on `packages/`.

TypeScript: `npm run typecheck` in `apps/mobile`. Strict mode, no `any` without a
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
seconds and saves a broken `main` — which is now everybody's working copy.

---

## Day 7

Feature freeze at the start of the day. After that: rehearse, fix only what is
actually broken, and make sure two people know how to restart the whole system
from scratch in under a minute.

The demo is not the code. The demo is the demo.
