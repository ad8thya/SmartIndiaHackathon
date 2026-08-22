"""Pydantic v2 wire models. FROZEN AFTER DAY 1.

Everything that crosses a module boundary — MQTT payload, HTTP body, WebSocket
frame, function return — is one of these. All models are ``frozen=True``: if you
want a changed copy, use ``model_copy(update=...)``. Immutability is what lets
six people pass objects around without defensive copying.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID, uuid4

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from .enums import (
    INFRASTRUCTURE_CLASSES,
    DetectionClass,
    RiskLevel,
    Severity,
    WorkflowStatus,
    WSMessageType,
)

__all__ = [
    "BUS_ID_PATTERN",
    "REID_DIM",
    "SHA256_PATTERN",
    "AnalyticsSummary",
    "BBox",
    "BusPosition",
    "Event",
    "FrameMeta",
    "HealthStatus",
    "IncidentReport",
    "LonLat",
    "Observation",
    "RoadCondition",
    "Route",
    "WSMessage",
    "WhatIfRequest",
    "WhatIfResult",
    "WorkOrder",
]

#: ``MTC-<depot>-<4 digits>`` — Metropolitan Transport Corporation fleet numbering.
BUS_ID_PATTERN = r"^MTC-[A-Z0-9]+-\d{4}$"
#: lowercase hex sha256 — plates are hashed, never stored raw (DPDP Act 2023 §8).
SHA256_PATTERN = r"^[a-f0-9]{64}$"
#: length of the person/vehicle re-identification embedding.
REID_DIM = 512

#: GeoJSON ordering — (longitude, latitude). Everything on the wire uses this order.
LonLat = tuple[float, float]

Latitude = Annotated[float, Field(ge=-90.0, le=90.0, description="WGS84 latitude")]
Longitude = Annotated[float, Field(ge=-180.0, le=180.0, description="WGS84 longitude")]
Confidence = Annotated[float, Field(ge=0.0, le=1.0)]
Heading = Annotated[float, Field(ge=0.0, le=360.0, description="degrees clockwise from north")]


def _require_aware(value: datetime) -> datetime:
    """Reject naive datetimes.

    A naive timestamp from an edge device is indistinguishable from an IST one
    and silently shifts every event by 5h30m. Fail loudly at the boundary.
    """
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError(
            "timestamp must be timezone-aware — use datetime.now(tz=UTC), not datetime.utcnow()"
        )
    return value


class _Frozen(BaseModel):
    """Base: immutable, strict about unknown fields, enum values on dump."""

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        use_enum_values=False,
        str_strip_whitespace=True,
        validate_assignment=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Perception primitives
# ─────────────────────────────────────────────────────────────────────────────
class BBox(_Frozen):
    """Pixel-space bounding box in the source frame, origin top-left."""

    x1: float = Field(ge=0)
    y1: float = Field(ge=0)
    x2: float = Field(ge=0)
    y2: float = Field(ge=0)

    @model_validator(mode="after")
    def _ordered(self) -> BBox:
        if self.x2 <= self.x1:
            raise ValueError(f"bbox x2 ({self.x2}) must be greater than x1 ({self.x1})")
        if self.y2 <= self.y1:
            raise ValueError(f"bbox y2 ({self.y2}) must be greater than y1 ({self.y1})")
        return self

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.width * self.height

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={"examples": [{"x1": 412.0, "y1": 688.0, "x2": 559.0, "y2": 771.0}]},
    )


class FrameMeta(_Frozen):
    """Everything a detector needs to know about the frame it was handed.

    This is the second argument of every perception Protocol. Detectors are pure:
    frame in, Observations out — they never read the GPS themselves.
    """

    bus_id: str = Field(pattern=BUS_ID_PATTERN)
    route_id: str
    ts: datetime
    lat: Latitude
    lon: Longitude
    heading_deg: Heading = 0.0
    speed_kmph: float = Field(default=0.0, ge=0.0, le=200.0)
    gps_accuracy_m: float = Field(default=5.0, ge=0.0)
    frame_idx: int = Field(default=0, ge=0)
    fps: float = Field(default=15.0, gt=0.0)

    _aware = field_validator("ts")(_require_aware)

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "bus_id": "MTC-ADYAR-1042",
                    "route_id": "27B",
                    "ts": "2026-08-21T09:14:03+05:30",
                    "lat": 13.0067,
                    "lon": 80.2570,
                    "heading_deg": 187.4,
                    "speed_kmph": 24.5,
                    "gps_accuracy_m": 4.0,
                    "frame_idx": 1180,
                    "fps": 15.0,
                }
            ]
        },
    )


class Observation(_Frozen):
    """One detection from one bus at one instant. The atom of the whole system.

    Observations are cheap, numerous and *unverified* — a single Observation is
    never shown to an engineer. Many Observations of the same physical thing get
    fused into one :class:`Event`, which is what humans act on.
    """

    obs_id: UUID = Field(default_factory=uuid4)
    bus_id: str = Field(pattern=BUS_ID_PATTERN, description="AIS-140 fleet identifier")
    route_id: str = Field(min_length=1, max_length=16)
    ts: datetime = Field(description="timezone-aware capture time; naive values are rejected")
    lat: Latitude
    lon: Longitude
    gps_accuracy_m: float = Field(ge=0.0, le=1000.0)
    heading_deg: Heading
    speed_kmph: float = Field(ge=0.0, le=200.0)
    detection_class: DetectionClass
    raw_confidence: Confidence
    severity: Severity | None = None
    bbox: BBox | None = None
    evidence_uri: str | None = Field(default=None, description="object-store key for the crop")
    plate_hash: str | None = Field(
        default=None,
        pattern=SHA256_PATTERN,
        description="salted sha256 of the plate — never the plate itself (DPDP Act 2023)",
    )
    track_id: int | None = Field(default=None, ge=0, description="multi-object tracker id")
    reid_embedding: list[float] | None = Field(
        default=None, description=f"exactly {REID_DIM} floats, or omitted"
    )

    _aware = field_validator("ts")(_require_aware)

    @field_validator("reid_embedding")
    @classmethod
    def _embedding_dim(cls, value: list[float] | None) -> list[float] | None:
        if value is not None and len(value) != REID_DIM:
            raise ValueError(f"reid_embedding must be exactly {REID_DIM} floats, got {len(value)}")
        return value

    @model_validator(mode="after")
    def _infrastructure_needs_severity(self) -> Observation:
        """An infrastructure defect without a severity cannot be triaged.

        The whole downstream workflow — SLA clock, crew sizing, cost estimate —
        keys off severity, so we refuse to accept the observation at all.
        """
        if self.detection_class in INFRASTRUCTURE_CLASSES and self.severity is None:
            raise ValueError(
                f"{self.detection_class} is an infrastructure class and requires a "
                f"severity (IRC:82-2015 SMALL/MEDIUM/LARGE)"
            )
        return self

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "obs_id": "8f14e45f-ceea-467a-9f42-3b0c1f0f9a11",
                    "bus_id": "MTC-ADYAR-1042",
                    "route_id": "27B",
                    "ts": "2026-08-21T09:14:03+05:30",
                    "lat": 13.0067,
                    "lon": 80.2570,
                    "gps_accuracy_m": 4.0,
                    "heading_deg": 187.4,
                    "speed_kmph": 24.5,
                    "detection_class": "POTHOLE",
                    "raw_confidence": 0.82,
                    "severity": "MEDIUM",
                    "bbox": {"x1": 412.0, "y1": 688.0, "x2": 559.0, "y2": 771.0},
                    "evidence_uri": "s3://urban-twin/evidence/8f14e45f.jpg",
                    "track_id": 17,
                }
            ]
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Fused, human-facing records
# ─────────────────────────────────────────────────────────────────────────────
class Event(_Frozen):
    """A real-world thing, confirmed by fusing many Observations.

    ``distinct_bus_count`` is the trust signal that matters: three different
    buses seeing the same pothole is far stronger evidence than one bus seeing
    it thirty times, because a dirty lens repeats but does not corroborate.
    """

    event_id: UUID = Field(default_factory=uuid4)
    lat: Latitude
    lon: Longitude
    road_segment_id: str | None = None
    detection_class: DetectionClass
    severity: Severity
    fused_confidence: Confidence
    observation_count: int = Field(ge=1)
    distinct_bus_count: int = Field(ge=1)
    first_seen: datetime
    last_seen: datetime
    status: WorkflowStatus = WorkflowStatus.DETECTED
    assigned_team: str | None = None
    sla_due: datetime | None = None
    evidence_uris: list[str] = Field(default_factory=list)

    _aware_first = field_validator("first_seen")(_require_aware)
    _aware_last = field_validator("last_seen")(_require_aware)

    @model_validator(mode="after")
    def _time_ordered(self) -> Event:
        if self.last_seen < self.first_seen:
            raise ValueError("last_seen cannot be earlier than first_seen")
        if self.distinct_bus_count > self.observation_count:
            raise ValueError("distinct_bus_count cannot exceed observation_count")
        return self

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "event_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
                    "lat": 13.0067,
                    "lon": 80.2570,
                    "road_segment_id": "SEG-27B-014",
                    "detection_class": "POTHOLE",
                    "severity": "LARGE",
                    "fused_confidence": 0.972,
                    "observation_count": 11,
                    "distinct_bus_count": 3,
                    "first_seen": "2026-08-19T07:41:00+05:30",
                    "last_seen": "2026-08-21T09:14:03+05:30",
                    "status": "AUTHORITY_NOTIFIED",
                    "assigned_team": "GCC-Zone-13-Adyar",
                    "sla_due": "2026-08-24T09:14:03+05:30",
                    "evidence_uris": ["s3://urban-twin/evidence/8f14e45f.jpg"],
                }
            ]
        },
    )


class BusPosition(_Frozen):
    """Live fleet telemetry, AIS-140 shaped. Published to ``bus/{id}/position``."""

    bus_id: str = Field(pattern=BUS_ID_PATTERN)
    route_id: str
    ts: datetime
    lat: Latitude
    lon: Longitude
    heading_deg: Heading
    speed_kmph: float = Field(ge=0.0, le=200.0)
    progress: float = Field(default=0.0, ge=0.0, le=1.0, description="fraction along the route")
    occupancy_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    next_stop: str | None = None
    delay_min: float = Field(default=0.0, description="negative means running early")

    _aware = field_validator("ts")(_require_aware)

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "bus_id": "MTC-ADYAR-1042",
                    "route_id": "27B",
                    "ts": "2026-08-21T09:14:03+05:30",
                    "lat": 13.0067,
                    "lon": 80.2570,
                    "heading_deg": 187.4,
                    "speed_kmph": 24.5,
                    "progress": 0.42,
                    "occupancy_pct": 68.0,
                    "next_stop": "Adyar Depot",
                    "delay_min": 3.5,
                }
            ]
        },
    )


class Route(_Frozen):
    """A GTFS-style bus route with the polyline the twin draws."""

    route_id: str
    name: str
    polyline: list[LonLat] = Field(min_length=2, description="GeoJSON order: (lon, lat)")
    stops: list[str] = Field(default_factory=list)
    color: str = Field(default="#38bdf8", pattern=r"^#[0-9a-fA-F]{6}$")
    length_km: float = Field(default=0.0, ge=0.0)

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "route_id": "27B",
                    "name": "Adyar Depot ↔ Broadway",
                    "polyline": [[80.2570, 13.0067], [80.2610, 13.0210]],
                    "stops": ["Adyar Depot", "Saidapet", "Broadway"],
                    "color": "#38bdf8",
                    "length_km": 14.2,
                }
            ]
        },
    )


class RoadCondition(_Frozen):
    """Everything the command centre shows when an operator clicks a road."""

    road_id: str
    name: str
    density: float = Field(ge=0.0, description="vehicles per km per lane")
    avg_speed_kmph: float = Field(ge=0.0, le=200.0)
    congestion_pct: float = Field(ge=0.0, le=100.0)
    pci_score: float = Field(ge=0.0, le=100.0, description="Pavement Condition Index, 100 = new")
    defect_counts: dict[str, int] = Field(default_factory=dict)
    bus_delay_min: float = 0.0
    risk_level: RiskLevel = RiskLevel.LOW

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "road_id": "SEG-27B-014",
                    "name": "Sardar Patel Road",
                    "density": 78.4,
                    "avg_speed_kmph": 14.2,
                    "congestion_pct": 71.0,
                    "pci_score": 46.5,
                    "defect_counts": {"POTHOLE": 6, "ALLIGATOR_CRACK": 2},
                    "bus_delay_min": 9.5,
                    "risk_level": "HIGH",
                }
            ]
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# What-if simulation
# ─────────────────────────────────────────────────────────────────────────────
class WhatIfRequest(_Frozen):
    """Ask the twin: what happens to every route if these roads shut?"""

    closed_road_ids: list[str] = Field(min_length=1, max_length=20)
    horizon_minutes: int = Field(default=60, ge=5, le=720)
    reason: str | None = Field(default=None, description="e.g. 'metro works', 'flooding'")

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "closed_road_ids": ["SEG-27B-014"],
                    "horizon_minutes": 120,
                    "reason": "monsoon waterlogging",
                }
            ]
        },
    )


class WhatIfResult(_Frozen):
    """Per-route outcome of a closure. ``recommended`` is the go/no-go call."""

    route_id: str
    baseline_min: float = Field(ge=0.0)
    simulated_min: float = Field(ge=0.0)
    delta_min: float
    recommended: bool = Field(description="True when the closure is tolerable for this route")
    diversion_polyline: list[LonLat] = Field(default_factory=list)
    affected_passengers: int = Field(default=0, ge=0)

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "route_id": "27B",
                    "baseline_min": 42.0,
                    "simulated_min": 48.0,
                    "delta_min": 6.0,
                    "recommended": True,
                    "diversion_polyline": [],
                    "affected_passengers": 1840,
                }
            ]
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Incidents & work orders
# ─────────────────────────────────────────────────────────────────────────────
class IncidentReport(_Frozen):
    """A safety incident dossier: what happened, where, and the plate evidence.

    ``plate_text`` is present only in the live dossier handed to an authorised
    operator. What is persisted and what crosses MQTT is ``plate_hash``.
    """

    incident_id: UUID = Field(default_factory=uuid4)
    incident_class: DetectionClass
    ts: datetime
    lat: Latitude
    lon: Longitude
    road_segment_id: str | None = None
    reported_by_bus: str = Field(pattern=BUS_ID_PATTERN)
    narrative: str = Field(max_length=1000)
    confidence: Confidence
    track_id: int | None = Field(default=None, ge=0)
    vehicle_type: str | None = None
    plate_text: str | None = Field(default=None, description="operator-visible only")
    plate_hash: str | None = Field(default=None, pattern=SHA256_PATTERN)
    plate_confidence: Confidence | None = None
    evidence_uris: list[str] = Field(default_factory=list)

    _aware = field_validator("ts")(_require_aware)

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "incident_id": "9c5b94b1-35ad-49bb-b118-8e8fc24abf80",
                    "incident_class": "COLLISION",
                    "ts": "2026-08-21T18:42:11+05:30",
                    "lat": 13.0421,
                    "lon": 80.2337,
                    "road_segment_id": "SEG-21G-007",
                    "reported_by_bus": "MTC-VYASARPADI-3311",
                    "narrative": "Two-wheeler clipped at kerb; offending car left the scene.",
                    "confidence": 0.87,
                    "track_id": 44,
                    "vehicle_type": "hatchback",
                    "plate_text": "TN 09 BX 4412",
                    "plate_confidence": 0.87,
                    "evidence_uris": ["s3://urban-twin/evidence/incident-9c5b94b1-plate.jpg"],
                }
            ]
        },
    )


class WorkOrder(_Frozen):
    """The municipal side of an Event: who is fixing it, by when, for how much."""

    work_order_id: UUID = Field(default_factory=uuid4)
    event_id: UUID
    assigned_team: str
    status: WorkflowStatus = WorkflowStatus.MAINTENANCE_ASSIGNED
    created_at: datetime
    sla_due: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)
    cost_estimate_inr: float | None = Field(default=None, ge=0.0)
    before_uri: str | None = None
    after_uri: str | None = None

    _aware_created = field_validator("created_at")(_require_aware)

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "work_order_id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
                    "event_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
                    "assigned_team": "GCC-Zone-13-Adyar",
                    "status": "MAINTENANCE_ASSIGNED",
                    "created_at": "2026-08-21T10:00:00+05:30",
                    "sla_due": "2026-08-24T10:00:00+05:30",
                    "notes": "Cold-mix patch, 2 m². Crew of 3.",
                    "cost_estimate_inr": 7400.0,
                }
            ]
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Aggregates & transport envelopes
# ─────────────────────────────────────────────────────────────────────────────
class AnalyticsSummary(_Frozen):
    """The KPI strip across the top of the command centre."""

    generated_at: datetime
    buses_online: int = Field(ge=0)
    km_surveyed_today: float = Field(ge=0.0)
    open_events: int = Field(ge=0)
    events_by_status: dict[str, int] = Field(default_factory=dict)
    events_by_class: dict[str, int] = Field(default_factory=dict)
    avg_network_speed_kmph: float = Field(ge=0.0)
    incidents_today: int = Field(ge=0)
    sla_breaches: int = Field(ge=0)
    avg_resolution_hours: float = Field(default=0.0, ge=0.0)

    _aware = field_validator("generated_at")(_require_aware)


class WSMessage(_Frozen):
    """Envelope for every /ws/live frame. Discriminate on ``type``.

    M5 only ever sends this shape; M6 only ever parses this shape. That single
    agreement is what keeps the realtime layer from becoming a negotiation.
    """

    type: WSMessageType
    ts: datetime
    payload: dict[str, Any] = Field(default_factory=dict)

    _aware = field_validator("ts")(_require_aware)

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "type": "BUS_POSITION",
                    "ts": "2026-08-21T09:14:03+05:30",
                    "payload": {"bus_id": "MTC-ADYAR-1042", "lat": 13.0067, "lon": 80.2570},
                }
            ]
        },
    )


class HealthStatus(_Frozen):
    """GET /health — one boolean per dependency, plus a rollup."""

    ok: bool
    database: bool
    postgis: bool
    redis: bool
    mqtt: bool
    version: str = "0.1.0"
    detail: dict[str, str] = Field(default_factory=dict)
