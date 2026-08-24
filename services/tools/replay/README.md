# M5b · Replay & Fleet Simulation

Stands in for a real AIS-140 fleet feed. It is **not** a mock in the module
sense — it stays in the system after every module goes real, because you cannot
bring six MTC buses to a hackathon.

## What one tick does

1. advance every bus along its route polyline by `speed × simulated dt`
2. publish a `BusPosition` to `bus/{id}/position`
3. ask **M1, M3 and M4's factories** what they would have seen from there
4. publish `Observation`s to `bus/{id}/observation` and `IncidentReport`s to
   `bus/{id}/incident`

Step 3 is the important one: the simulator calls the *factories*, so the moment
an owner flips their `USE_REAL_*` flag their real implementation is in the loop
with nothing here changing.

A module that raises is caught, logged with its name, and skipped. One person's
half-finished detector never stops the fleet.

## CLI

```bash
python -m services.tools.replay --speed 60 --buses 6 --loop
python -m services.tools.replay --speed 1 --buses 1 --ticks 20 -v   # slow, verbose, finite
```

| flag | meaning |
|---|---|
| `--speed` | virtual clock multiplier; 60 = one simulated minute per real second |
| `--buses` | 1–6 |
| `--loop` / `--no-loop` | turn around at the terminus, or stop |
| `--tick` | real seconds between ticks |
| `--ticks N` | run N ticks and exit (used by `make smoke`) |

Without a reachable broker it falls back to a console publisher and keeps
simulating, so you can develop perception with nothing else running.

## The virtual clock

Every timestamp comes from `VirtualClock`, never `datetime.now()`. That is what
makes M2's hour-of-day congestion curve animate at 60x instead of sitting flat,
and it is why the same code runs a two-minute demo and an overnight soak test.
