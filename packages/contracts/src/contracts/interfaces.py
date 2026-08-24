"""THE MODULE BOUNDARIES.

Each of these Protocols is owned end-to-end by exactly one person. As long as
the signature holds, integration costs nothing: swapping a mock for a real
implementation is a one-line change in that module's ``factory.py`` and nobody
else's code moves.

Protocols are structural — you do NOT subclass them. Write a plain class with
matching methods; ``isinstance(obj, DefectDetector)`` still returns True because
every Protocol here is ``@runtime_checkable``. That is what the module tests
assert against.

    Protocol                  owner   implementation lives in
    ────────────────────────  ─────   ─────────────────────────────────────
    DefectDetector            M1      services/edge/defects/
    PedestrianRiskDetector    M3      services/edge/pedestrian/
    IncidentDetector          M4      services/edge/incidents/
    TrafficAnalyzer           M2      services/cloud/intelligence/traffic_analytics/
    EventFuser                M3      services/cloud/consensus/
    WhatIfEngine              M2      services/cloud/intelligence/whatif/
    RiskScorer                M3      services/cloud/intelligence/urban_risk/
    RecommendationEngine      M2      services/cloud/intelligence/recommend/

The last two were added in the one-time AI intelligence layer contracts
unfreeze — same rules apply: structural, ``@runtime_checkable``, one owner.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from .models import (
    Event,
    FrameMeta,
    IncidentReport,
    InfrastructureRecommendation,
    Observation,
    RoadCondition,
    UrbanRiskScore,
    WhatIfRequest,
    WhatIfResult,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    import numpy as np
    from numpy.typing import NDArray

    Frame = NDArray[np.uint8]
else:
    #: An HxWx3 uint8 BGR image. Typed loosely at runtime so that the light
    #: (no-numpy-typing) environments used by M5/M6 can still import this file.
    Frame = Any

__all__ = [
    "DefectDetector",
    "EventFuser",
    "Frame",
    "IncidentDetector",
    "PedestrianRiskDetector",
    "RecommendationEngine",
    "RiskContext",
    "RiskScorer",
    "TrafficAnalyzer",
    "WhatIfEngine",
]


@dataclass(frozen=True)
class RiskContext:
    """Everything RiskScorer and RecommendationEngine need for one road.

    A plain dataclass, not a pydantic wire model — it never crosses MQTT or
    HTTP. The API builds one per request from LiveState plus the traffic,
    pedestrian and incident factories, and hands it straight to both
    Protocols in-process. Both M2 and M3 read the same instance, so their two
    outputs are always talking about the same evidence.
    """

    defect_counts: dict[str, int]
    avg_congestion_pct: float
    pedestrian_density: float
    near_miss_count: int
    school_zone_distance_m: float | None
    pci_score: float
    recent_incident_count: int


@runtime_checkable
class DefectDetector(Protocol):
    """M1 — road surface distress from a forward-facing camera frame.

    Must return an Observation per distinct defect, each carrying an
    IRC:82-2015 ``severity`` (the Observation validator enforces this).
    Return ``[]`` for a clean frame; never raise on a bad frame.
    """

    def detect(self, frame: Frame, meta: FrameMeta) -> list[Observation]: ...


@runtime_checkable
class PedestrianRiskDetector(Protocol):
    """M3 — unsafe pedestrian–vehicle interactions.

    Emits ``PEDESTRIAN`` for plain presence and ``PEDESTRIAN_RISK`` when the
    interaction is dangerous (crossing outside a zebra, time-to-collision below
    threshold, school-zone proximity at speed).
    """

    def detect(self, frame: Frame, meta: FrameMeta) -> list[Observation]: ...


@runtime_checkable
class IncidentDetector(Protocol):
    """M4 — incidents need temporal context, so this one takes a frame *window*.

    ``frames`` is a short buffer ending at ``meta.ts`` (typically 2–4 seconds).
    Plate text belongs in ``IncidentReport.plate_text`` for the operator dossier
    and its salted hash in ``plate_hash`` for anything persisted.
    """

    def process(self, frames: list[Frame], meta: FrameMeta) -> list[IncidentReport]: ...


@runtime_checkable
class TrafficAnalyzer(Protocol):
    """M2 — turn raw VEHICLE observations into per-road condition summaries.

    Keyed by ``road_id``. Called by the API on every ``/api/roads/{id}/condition``
    request, so it must be fast and side-effect free.
    """

    def analyze(self, observations: list[Observation]) -> dict[str, RoadCondition]: ...


@runtime_checkable
class EventFuser(Protocol):
    """M3 — collapse many Observations into the Events humans act on.

    Two observations fuse when they are the same class and spatially close.
    Confidence must come from ``fusion_math.fuse_confidence`` and status from
    ``fusion_math.derive_status`` — do not invent your own ladder.
    """

    def fuse(self, observations: list[Observation]) -> list[Event]: ...


@runtime_checkable
class WhatIfEngine(Protocol):
    """M2 — counterfactual routing when roads close.

    One WhatIfResult per affected route. ``recommended`` answers the operator's
    actual question: can we shut this road tonight or not?
    """

    def simulate(self, req: WhatIfRequest) -> list[WhatIfResult]: ...


@runtime_checkable
class RiskScorer(Protocol):
    """M3 — explainable composite risk index for one road.

    The returned UrbanRiskScore's ``components`` must sum to its ``score`` and
    its ``explanation`` must never be empty — both are enforced by the model
    itself, not left to the caller. This is a government decision-support
    metric; an unexplained number is worthless.
    """

    def score(self, road_id: str, ctx: RiskContext) -> UrbanRiskScore: ...


@runtime_checkable
class RecommendationEngine(Protocol):
    """M2 — infrastructure interventions a road's risk profile justifies.

    Zero or more per road — an unremarkable road gets an empty list, not a
    fabricated one. Every recommendation carries its own rationale and
    evidence_event_ids; a recommendation with neither is an opinion, not
    decision support.
    """

    def recommend(self, road_id: str, ctx: RiskContext) -> list[InfrastructureRecommendation]: ...
