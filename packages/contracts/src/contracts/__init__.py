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
"""

from __future__ import annotations

from .enums import (
    FUSABLE_CLASSES,
    INFRASTRUCTURE_CLASSES,
    SAFETY_CLASSES,
    SEVERITY_ORDER,
    STATUS_ORDER,
    TERMINAL_STATUSES,
    DetectionClass,
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
    Event,
    FrameMeta,
    HealthStatus,
    IncidentReport,
    LonLat,
    Observation,
    RoadCondition,
    Route,
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

__version__ = "1.0.0"

__all__ = [
    # enums
    "DetectionClass",
    "Severity",
    "WorkflowStatus",
    "RiskLevel",
    "WSMessageType",
    "INFRASTRUCTURE_CLASSES",
    "SAFETY_CLASSES",
    "FUSABLE_CLASSES",
    "TERMINAL_STATUSES",
    "SEVERITY_ORDER",
    "STATUS_ORDER",
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
    # mqtt
    "position_topic",
    "observation_topic",
    "incident_topic",
    "ALL_POSITIONS",
    "ALL_OBSERVATIONS",
    "ALL_INCIDENTS",
    "__version__",
]
