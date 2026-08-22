# packages/contracts — the frozen layer

> **This package is FROZEN after Day 1.** Everything else in the repo depends on
> it. A rename here breaks five people at once.

## What lives here

| file | contents |
|---|---|
| `enums.py` | `DetectionClass`, `Severity`, `WorkflowStatus`, `RiskLevel`, `WSMessageType`, `INFRASTRUCTURE_CLASSES` |
| `models.py` | every Pydantic model that crosses a module boundary |
| `fusion_math.py` | `fuse_confidence`, `derive_status`, `haversine_m`, IRC severity — pure functions, zero deps |
| `interfaces.py` | the six `Protocol` classes that *are* the module boundaries |
| `topics.py` | MQTT topic strings, so publisher and subscriber cannot drift |

## Why Protocols instead of base classes

Nobody imports anybody. M5's API imports `DefectDetector` (a Protocol) and
calls `get_defect_detector()`. M1 writes a class with a `detect()` method. The
two never reference each other's modules, so they never conflict in git.

```python
from contracts import DefectDetector, FrameMeta, Observation


class MyDetector:  # note: no inheritance
    def detect(self, frame, meta: FrameMeta) -> list[Observation]: ...


assert isinstance(MyDetector(), DefectDetector)  # structural — this passes
```

## Changing something anyway

1. Post the diff in the team channel.
2. Get an ACK from every owner it touches.
3. `make test` — **all** module tests, not just yours.
4. `CONTRACTS_OK=1 git commit …` (the pre-commit hook asks for this on purpose).

Additive changes — a new optional field, a new enum member — are cheap and
usually fine. Renames and removals are not.

## Run the tests

```bash
.venv/bin/pytest packages/contracts
```
