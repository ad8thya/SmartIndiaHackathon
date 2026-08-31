"""The absence rule. Owned by M5 with M1.

CORROBORATION TO APPEAR, CORROBORATION TO DISAPPEAR
---------------------------------------------------
This is the deliberate mirror of the fusion rule, and the symmetry is the
point.

A defect does not become `CONFIRMED` because one bus saw it once. One camera,
one frame, one bad angle is not evidence; `services/cloud/consensus` requires
several sightings from several distinct buses before the system will assert
that a pothole exists.

The same standard has to apply to the claim that it has *gone*. A single bus
failing to see a pothole means nothing on its own: it may have been a puddle
covering it, a lorry in the way, a bad frame, or — the case this system
already models on the driver's own screen — a lens with dirt on it. **A
covered lens reports "clean" forever.** That is precisely why the threshold
counts DISTINCT buses and not just passes: a systematic fault on one vehicle
produces a systematic false negative, and a false negative here closes a work
order on a pothole that is still in the road.

So: N clean passes from at least M distinct buses, and below that threshold
the system does not close anything — it lowers its confidence and keeps
looking. A dirty pass, where the defect is seen again, resets the count.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class VerificationProgress:
    """What the fleet has seen of one repaired defect since it was closed."""

    event_id: str
    road_segment_id: str | None
    #: bus_id → how many clean passes that bus has contributed
    clean_by_bus: dict[str, int] = field(default_factory=dict)
    #: a pass where the defect was detected again — resets the count
    dirty_passes: int = 0
    #: confidence as it decays with each clean pass
    confidence: float = 1.0
    pending_since: datetime | None = None
    last_pass_at: datetime | None = None
    #: every bus that has driven past at all, clean or not
    buses_seen: set[str] = field(default_factory=set)

    @property
    def clean_passes(self) -> int:
        return sum(self.clean_by_bus.values())

    @property
    def distinct_clean_buses(self) -> int:
        return len(self.clean_by_bus)


def is_verified(progress: VerificationProgress, *, passes: int, min_buses: int) -> bool:
    """Enough corroboration to say the defect is gone."""
    return (
        progress.clean_passes >= passes
        and progress.distinct_clean_buses >= min_buses
        and progress.dirty_passes == 0
    )


def decayed(confidence: float, decay: float) -> float:
    """Confidence after one clean pass that did not meet the threshold.

    Multiplicative, like the noisy-OR that raised it, so repeated absence
    lowers belief quickly at first and then asymptotically — it never reaches
    zero, because "we did not see it" is never proof.
    """
    return round(max(0.01, confidence * decay), 4)
