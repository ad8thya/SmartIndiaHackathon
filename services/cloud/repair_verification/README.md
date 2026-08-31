# Closing the Loop · Repair Verification

Placeholder module — **not implemented yet**. Folder exists to reserve the
module's place in the pipeline; there is no `impl.py`/`mock.py`/`factory.py`
here.

Every other module stops at "work order created." This one closes it: once a
`WorkOrder` is marked `REPAIR_COMPLETED`, the next bus that crosses the same
`road_id` re-runs M1 (`services.edge.defects`) on that segment. If the new pass
comes back clean, the work order is verified and auto-closed instead of
waiting on a human sign-off.

```
Repair Completed
      │
      ▼
Next Bus Passes
      │
      ▼
Edge AI Scans Same Location   (services.edge.defects)
      │
      ▼
Road Quality Improved?
      │
   Yes ▼
Automatically Verify Repair
      │
      ▼
Close Work Order
```

## Intended protocol (not yet implemented)

```python
class RepairVerifier(Protocol):
    def verify(
        self, work_order_id: UUID, post_repair_observations: list[Observation]
    ) -> VerificationResult: ...
```

Inputs it will need from existing modules:

- `WorkOrder` (`packages.contracts`) — already carries `before_uri`/`after_uri`
  and a `completed_at` timestamp, so the before/after comparison has
  somewhere to live.
- `Observation`s from `services.edge.defects` for the same `road_id`, dated
  after `completed_at`.

No `VerificationResult` contract exists yet — it belongs in
`packages/contracts` alongside `WorkOrder` when this module is built.
