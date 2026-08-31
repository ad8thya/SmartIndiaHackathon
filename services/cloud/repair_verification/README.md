# Closing the Loop · Repair Verification

**Implemented.** A crew marks a repair done; the fleet decides whether to
believe them.

```
Repair Completed  (crew, on the phone)
      |
      v
Next bus drives that road          <- RepairVerifier, a Repeater in the API
      |
      v
Did a camera report the defect again?
      |
   No |                        Yes --> count resets, case stays open
      v
Clean pass recorded
      |
      v
N clean passes from >=M distinct buses?
      |
   No |                        Yes --> VERIFIED, work order closes itself
      v
Confidence decays, keep looking
```

## Corroboration to appear, corroboration to disappear

This is the deliberate mirror of the fusion rule, and the symmetry is the
whole idea.

A defect does not become `CONFIRMED` because one bus saw it once.
`services/cloud/consensus` requires several sightings from several **distinct
buses** before the system will assert that a pothole exists — one camera, one
frame, one bad angle is not evidence.

**The same standard has to apply to the claim that it has gone.** A single bus
failing to see a pothole means nothing on its own: a puddle covering it, a
lorry in the way, a bad frame, or — the case this system already models on the
driver's own camera screen — **a lens with dirt on it. A covered lens reports
clean forever.**

That is exactly why the threshold counts distinct buses and not merely passes.
A systematic fault on one vehicle produces a systematic false negative, and a
false negative here closes a work order on a pothole that is still in the
road. It is the more dangerous direction of the two: a false positive wastes a
crew's morning, a false negative leaves the hazard.

Below the threshold nothing closes. `fused_confidence` decays
multiplicatively — the same shape as the noisy-OR that raised it, run
backwards — so repeated absence lowers belief quickly at first and then
asymptotically. **It never reaches zero, because "we did not see it" is never
proof.**

## Configuration

| setting | default | why |
|---|---|---|
| `REPAIR_VERIFY_PASSES` | 3 | clean passes before closing |
| `REPAIR_VERIFY_MIN_BUSES` | 2 | ...from at least this many distinct buses |
| `REPAIR_VERIFY_RADIUS_M` | 40 | "did a camera get a look at it" |
| `REPAIR_VERIFY_DECAY` | 0.7 | belief remaining after one clean pass |
| `REPAIR_VERIFY_STALL_HOURS` | 6 | after this, tell the crew rather than wait |
| `REPAIR_VERIFY_INTERVAL_S` | 5 | how often the verifier looks |

## What counts as a pass

A bus **entering** the radius, having been outside it. The edge matters: a bus
stuck in traffic on top of a pothole is one look at it, not forty, and
counting every tick would let a single stationary vehicle satisfy the whole
threshold in under a minute.

## When the rule cannot be satisfied

**This network has one bus per route, and only 6 of its 26 segments are within
40 m of a second route.** So on most roads a second bus never comes, and a
strict two-bus rule would leave those repairs pending forever.

That is the "awaiting next pass with no end" problem one level further along,
so the verifier detects it rather than hiding it. Two states are reported to
the crew as first-class outcomes, both offering manual sign-off:

- **stalled** — no bus has driven this road within `REPAIR_VERIFY_STALL_HOURS`
- **needs sign-off** — enough clean passes, but only one bus serves this road,
  so the distinct-bus threshold is unreachable here

Neither is a bug in the rule. The rule is right; the fleet is thin. Setting
`REPAIR_VERIFY_MIN_BUSES` above the number of buses that actually serve a road
is a decision to require manual sign-off there, and the crew is told so plainly
instead of watching a counter that cannot finish.

## What this deliberately does not do

It does not re-run the detector. `services/edge/defects` runs **on the bus**,
and its output arrives here as observations. Asking the cloud to re-analyse a
frame it never had would mean shipping video off the vehicle, which is the
thing the edge architecture exists to avoid.

It is also not a poller over the workflow table. It reads the bus positions
the MQTT bridge already puts into `LiveState`, and it closes an event through
`routers/events.py::apply_status_change` — the same function an operator's
`PATCH` goes through — so an auto-close broadcasts, writes a work-order note,
and advances the linked citizen report identically. A second write path would
eventually forget one of the three.

## Tests

`test_module.py`. The decay and stall paths are covered as carefully as the
close path: a rule that is only ever exercised on its happy path is not a
rule, and a bug that closed on the first clean pass would pass a suite that
only tested the threshold.
