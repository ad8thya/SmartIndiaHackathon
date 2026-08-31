"""URBAN TWIN shared contracts — THE FROZEN LAYER.

    from contracts import Observation, Event, DetectionClass, fuse_confidence

Everything six people need to agree on lives here and nowhere else:
enums, wire models, the fusion arithmetic, the Protocol boundaries, and the
MQTT topic layout.

RULES
  1. This package is FROZEN after Day 1.
  2. A change here needs agreement from every owner it touches.
  3. Additive changes (new optional field, new enum member) are cheap.
     Renames and removals are not — they break five people simultaneously.

AMENDMENT (v1.3.0) — ⚠️ NEEDS TEAM ACK. Closes the three "no endpoint yet"
gaps the phone app was carrying: ResponseState, CameraState,
TERMINAL_RESPONSE_STATES, RESPONSE_ORDER, WSMessageType.INCIDENT_RESPONSE,
and the IncidentResponse and CameraStatus models. Purely additive on the same
terms as v1.2.0. Owners touched: M4 (incidents own the response lifecycle),
M5 (tables, migration, endpoints), M6 (generated types). See BUILD.md §13.
Contracts are RE-FROZEN as of this version.

AMENDMENT (v1.2.0) — ⚠️ NEEDS TEAM ACK BEFORE THIS LANDS. A second approved
unfreeze for the mobile app's citizen reports: ReportCategory, ReportStatus,
TERMINAL_REPORT_STATUSES, WSMessageType.REPORT_NEW, and the CitizenReport
model. Purely additive — no existing enum member, model field, or Protocol
signature is renamed, removed, or changed, and every previously valid
construction still validates. Owners touched: M5 (table, migration,
endpoints), M6 (generated types, municipal backlog). See BUILD.md §12 for
the amendment record and the reasoning for why a citizen report is NOT an
Observation. Contracts are RE-FROZEN as of this version.

AMENDMENT (v1.1.0): one approved, one-time unfreeze added the AI intelligence
layer — NEAR_MISS, RiskBand, RecommendationType, UrbanRiskScore,
InfrastructureRecommendation, NearMissEvent, RiskContext, RiskScorer,
RecommendationEngine. Purely additive: no existing Protocol signature, enum
member, or model field changed or moved. Contracts are RE-FROZEN as of this
version — see BUILD.md for the amendment record.
"""

from __future__ import annotations

from .enums import (
    FUSABLE_CLASSES,
    INFRASTRUCTURE_CLASSES,
    RESPONSE_ORDER,
    SAFETY_CLASSES,
    SEVERITY_ORDER,
    STATUS_ORDER,
    TERMINAL_REPORT_STATUSES,
    TERMINAL_RESPONSE_STATES,
    TERMINAL_STATUSES,
    CameraState,
    DetectionClass,
    RecommendationType,
    ReportCategory,
    ReportStatus,
    ResponseState,
    RiskBand,
    RiskLevel,
    Severity,
    WorkflowStatus,
    WSMessageType,
)
from .fusion_math import (
    MAX_FUSED_CONFIDENCE,
    derive_status,
    fuse_confidence,
    haversine_m,
    severity_from_dimensions,
    sla_hours,
)
from .interfaces import (
    DefectDetector,
    EventFuser,
    Frame,
    IncidentDetector,
    PedestrianRiskDetector,
    RecommendationEngine,
    RiskContext,
    RiskScorer,
    TrafficAnalyzer,
    WhatIfEngine,
)
from .models import (
    BUS_ID_PATTERN,
    REID_DIM,
    SHA256_PATTERN,
    AnalyticsSummary,
    BBox,
    BusPosition,
    CameraStatus,
    CitizenReport,
    Event,
    FrameMeta,
    HealthStatus,
    IncidentReport,
    IncidentResponse,
    InfrastructureRecommendation,
    LonLat,
    NearMissEvent,
    Observation,
    RoadCondition,
    Route,
    UrbanRiskScore,
    WhatIfRequest,
    WhatIfResult,
    WorkOrder,
    WSMessage,
)
from .topics import (
    ALL_INCIDENTS,
    ALL_OBSERVATIONS,
    ALL_POSITIONS,
    incident_topic,
    observation_topic,
    position_topic,
)

#: 1.1.0 — the one-time AI intelligence layer amendment (near-miss, urban risk
#: index, recommendations). Additive only: nothing existing renamed or removed.
#: Re-frozen as of this version. See BUILD.md for the amendment record.
__version__ = "1.3.0"

__all__ = [
    # enums
    "DetectionClass",
    "Severity",
    "WorkflowStatus",
    "RiskLevel",
    "RiskBand",
    "RecommendationType",
    "CameraState",
    "ReportCategory",
    "ReportStatus",
    "ResponseState",
    "WSMessageType",
    "INFRASTRUCTURE_CLASSES",
    "SAFETY_CLASSES",
    "FUSABLE_CLASSES",
    "TERMINAL_STATUSES",
    "SEVERITY_ORDER",
    "STATUS_ORDER",
    "TERMINAL_REPORT_STATUSES",
    "TERMINAL_RESPONSE_STATES",
    "RESPONSE_ORDER",
    # models
    "BBox",
    "FrameMeta",
    "Observation",
    "Event",
    "BusPosition",
    "Route",
    "RoadCondition",
    "WhatIfRequest",
    "WhatIfResult",
    "IncidentReport",
    "WorkOrder",
    "AnalyticsSummary",
    "WSMessage",
    "HealthStatus",
    "LonLat",
    "BUS_ID_PATTERN",
    "SHA256_PATTERN",
    "REID_DIM",
    # AI intelligence layer
    "UrbanRiskScore",
    "InfrastructureRecommendation",
    "NearMissEvent",
    "RiskContext",
    # citizen reports (v1.2.0)
    "CitizenReport",
    # field response + camera health (v1.3.0)
    "IncidentResponse",
    "CameraStatus",
    # maths
    "fuse_confidence",
    "derive_status",
    "haversine_m",
    "severity_from_dimensions",
    "sla_hours",
    "MAX_FUSED_CONFIDENCE",
    # protocols
    "Frame",
    "DefectDetector",
    "PedestrianRiskDetector",
    "IncidentDetector",
    "TrafficAnalyzer",
    "EventFuser",
    "WhatIfEngine",
    "RiskScorer",
    "RecommendationEngine",
    # mqtt
    "position_topic",
    "observation_topic",
    "incident_topic",
    "ALL_POSITIONS",
    "ALL_OBSERVATIONS",
    "ALL_INCIDENTS",
    "__version__",
]
