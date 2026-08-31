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


## The simulator models repair

`REPLAY_RESPECT_REPAIRS` (default **on**).

The replay is a world simulator: it decides what is physically on the road.
Once a crew marks a defect repaired, that pothole is not there any more, so
the simulator stops generating detections for it. A simulator that kept
emitting the defect would be modelling a world in which repairs do not work —
which makes `services/cloud/repair_verification` untestable and, worse,
quietly wrong: the verifier would correctly conclude "still there" forever.

**A real fleet needs none of this.** Its cameras simply stop seeing the
pothole, because the pothole is gone. This flag exists only because the mock
detector reads fixed hotspots out of `citydata` and has no way to learn that
anything happened to them. Turn it off (`REPLAY_RESPECT_REPAIRS=false`) and
you get the old behaviour: a world where every seeded defect is eternal.

### How it knows

It polls `GET /api/events?status=REPAIR_COMPLETED&status=VERIFIED&status=RESOLVED`
every `REPLAY_REPAIR_POLL_SECONDS` and suppresses any detection of the same
class within `REPLAY_REPAIR_RADIUS_M` of one of those.

Deliberately **not** an MQTT topic and **not** a contracts change. Adding a
wire contract between the API and its own simulator would put a simulator
concern into the frozen layer six people share, for something that is a read
of an endpoint that already exists.

The API's port comes from the same `API_PORT` the API itself reads, so the two
cannot drift — a simulator pointed at the wrong port fails silently as "no
repairs are ever suppressed", which looks identical to the feature being off.

### It reverts

Reopen a work order — drop the event back to `INSPECTION` or below — and it
leaves that list, so the hotspot comes back on the next poll. The world
reverts because the repair did not hold.

### Reading the tick log

`suppressed` counts detections the world model swallowed. If a repair loop is
not closing, that number tells you immediately whether the simulator ever
learned about the repair, or whether the problem is downstream in the verifier.

If the API is unreachable the simulator warns **once** and carries on with its
last answer. Losing contact with the API should degrade to "carry on as
before", not stop the fleet.
