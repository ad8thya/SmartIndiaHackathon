"""Shared vocabulary for the whole platform.

FROZEN AFTER DAY 1. Every module imports from here; adding a member is cheap,
renaming or removing one breaks five other people at once.
"""

from __future__ import annotations

from enum import StrEnum

__all__ = [
    "INFRASTRUCTURE_CLASSES",
    "SAFETY_CLASSES",
    "FUSABLE_CLASSES",
    "SEVERITY_ORDER",
    "STATUS_ORDER",
    "TERMINAL_STATUSES",
    "DetectionClass",
    "RecommendationType",
    "RiskBand",
    "RiskLevel",
    "Severity",
    "WSMessageType",
    "WorkflowStatus",
]


class DetectionClass(StrEnum):
    """Everything a bus-mounted camera can report.

    The first eight are *infrastructure* classes (M1) and always carry a
    severity. For every class except ZEBRA_CROSSING that severity is an
    IRC:82-2015 dimensional measurement (see Severity below). For
    ZEBRA_CROSSING, severity instead means the CONDITION of the crossing —
    how faded/worn its markings are, not the size of a defect. "SMALL
    severity zebra crossing" reads as a small defect; it means "markings
    clearly visible, minor wear." See notebooks/03_prepare_hazards.ipynb for
    the annotation rubric this maps to. The rest are traffic/safety classes
    (M2/M3/M4).
    """

    # ── infrastructure defects (M1) ────────────────────────────────────────
    POTHOLE = "POTHOLE"
    LONGITUDINAL_CRACK = "LONGITUDINAL_CRACK"
    TRANSVERSE_CRACK = "TRANSVERSE_CRACK"
    ALLIGATOR_CRACK = "ALLIGATOR_CRACK"
    WATERLOGGING = "WATERLOGGING"
    DAMAGED_DIVIDER = "DAMAGED_DIVIDER"
    DAMAGED_SIGN = "DAMAGED_SIGN"
    #: severity here means CONDITION (how worn the markings are), not defect
    #: size — see the class docstring above and the notebook 03 rubric.
    ZEBRA_CROSSING = "ZEBRA_CROSSING"
    # ── traffic (M2) ───────────────────────────────────────────────────────
    VEHICLE = "VEHICLE"
    # ── pedestrian safety (M3) ─────────────────────────────────────────────
    PEDESTRIAN = "PEDESTRIAN"
    PEDESTRIAN_RISK = "PEDESTRIAN_RISK"
    # ── incidents (M4) ─────────────────────────────────────────────────────
    RASH_DRIVING = "RASH_DRIVING"
    COLLISION = "COLLISION"
    # ── near-miss (M4, AI intelligence layer) ───────────────────────────────
    #: a vehicle-pedestrian conflict with no contact — TTC below threshold but
    #: no collision. An actionable workflow event in its own right (it fuses),
    #: not a milder shade of COLLISION.
    NEAR_MISS = "NEAR_MISS"


class Severity(StrEnum):
    """IRC:82-2015 dimensional severity classes for road surface distress.

    SMALL   < 100 mm across / < 25 mm deep
    MEDIUM  100–300 mm across / 25–50 mm deep
    LARGE   > 300 mm across / > 50 mm deep

    Exception: for DetectionClass.ZEBRA_CROSSING these three values instead
    grade marking CONDITION per the rubric in notebooks/03_prepare_hazards.ipynb
    (SMALL = clearly visible/minor wear ... LARGE = barely visible), not a
    physical dimension — there is nothing to measure in mm on a crossing.
    """

    SMALL = "SMALL"
    MEDIUM = "MEDIUM"
    LARGE = "LARGE"


class WorkflowStatus(StrEnum):
    """The life of a defect, from first camera frame to signed-off repair.

    The map colours events off this: DETECTED is grey, the middle states are
    amber, REPAIR_COMPLETED onward is green, REJECTED is struck through.
    """

    DETECTED = "DETECTED"
    AI_VERIFIED = "AI_VERIFIED"
    AUTHORITY_NOTIFIED = "AUTHORITY_NOTIFIED"
    INSPECTION = "INSPECTION"
    MAINTENANCE_ASSIGNED = "MAINTENANCE_ASSIGNED"
    REPAIR_COMPLETED = "REPAIR_COMPLETED"
    VERIFIED = "VERIFIED"
    RESOLVED = "RESOLVED"
    REJECTED = "REJECTED"


class RiskLevel(StrEnum):
    """Composite risk band for a road segment (M3 fusion output)."""

    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    SEVERE = "SEVERE"


class RecommendationType(StrEnum):
    """Infrastructure interventions the recommendation engine can propose.

    AI Intelligence layer — added in the one-time contracts unfreeze alongside
    :class:`RiskBand` and :class:`UrbanRiskScore`.
    """

    ZEBRA_CROSSING = "ZEBRA_CROSSING"
    SIGNAL_TIMING = "SIGNAL_TIMING"
    DIVIDER = "DIVIDER"
    SIGNAGE = "SIGNAGE"
    STREET_LIGHT = "STREET_LIGHT"
    SPEED_CALMING = "SPEED_CALMING"
    DRAINAGE = "DRAINAGE"


class RiskBand(StrEnum):
    """Band for the composite :class:`UrbanRiskScore` (0-100).

    Deliberately a separate enum from :class:`RiskLevel` rather than a reuse:
    ``RiskLevel`` is M2's per-segment traffic/PCI blend (``SEVERE`` at the top);
    ``RiskBand`` is the urban risk index's own scale (``CRITICAL`` at the top),
    computed from a different, wider set of inputs (pedestrians, schools,
    near-misses, incidents). Conflating them would make one flag mean two
    different things depending on which endpoint you read it from.
    """

    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class WSMessageType(StrEnum):
    """Envelope discriminator for /ws/live. M5 publishes, M6 consumes."""

    HELLO = "HELLO"
    BUS_POSITION = "BUS_POSITION"
    EVENT_NEW = "EVENT_NEW"
    EVENT_UPDATED = "EVENT_UPDATED"
    ROAD_CONDITION = "ROAD_CONDITION"
    INCIDENT = "INCIDENT"
    TICK = "TICK"


#: The eight classes that MUST carry a severity. Enforced in Observation.
INFRASTRUCTURE_CLASSES: frozenset[DetectionClass] = frozenset(
    {
        DetectionClass.POTHOLE,
        DetectionClass.LONGITUDINAL_CRACK,
        DetectionClass.TRANSVERSE_CRACK,
        DetectionClass.ALLIGATOR_CRACK,
        DetectionClass.WATERLOGGING,
        DetectionClass.DAMAGED_DIVIDER,
        DetectionClass.DAMAGED_SIGN,
        DetectionClass.ZEBRA_CROSSING,
    }
)

#: Classes that feed the live-safety layer rather than the maintenance backlog.
#:
#: NEAR_MISS joined this set in the AI intelligence layer amendment: it is a
#: point-in-time vehicle-pedestrian conflict, same shape as a collision or a
#: pedestrian risk sighting, and should cluster at the same tight radius —
#: two near-misses 25 m apart are two junctions, not one.
SAFETY_CLASSES: frozenset[DetectionClass] = frozenset(
    {
        DetectionClass.PEDESTRIAN_RISK,
        DetectionClass.RASH_DRIVING,
        DetectionClass.COLLISION,
        DetectionClass.NEAR_MISS,
    }
)

#: The only classes that may become a workflow :class:`~contracts.models.Event`.
#:
#: Everything else a camera reports — plain ``PEDESTRIAN`` presence, ``VEHICLE``
#: counts — is *analytics input*, not a backlog item. Fusing them would hand a
#: repair crew a work order with an SLA clock for a person walking down a road,
#: and would drown the real defects in the operator's event list.
#:
#: NEAR_MISS, added alongside the AI intelligence layer, IS an actionable
#: workflow event — a repeated near-miss at one junction is exactly the kind of
#: corroborated, escalating safety signal this ladder exists to surface, and it
#: is the evidence the recommendation engine's SPEED_CALMING rule keys off.
#:
#: Both the mock and the real fuser filter on this, so the rule survives the
#: mock → impl swap.
FUSABLE_CLASSES: frozenset[DetectionClass] = INFRASTRUCTURE_CLASSES | frozenset(
    {
        DetectionClass.PEDESTRIAN_RISK,
        DetectionClass.RASH_DRIVING,
        DetectionClass.COLLISION,
        DetectionClass.NEAR_MISS,
    }
)

#: Statuses after which an event stops escalating.
TERMINAL_STATUSES: frozenset[WorkflowStatus] = frozenset(
    {WorkflowStatus.RESOLVED, WorkflowStatus.REJECTED}
)

#: Sort keys — handy for "worst first" listings without special-casing in UI code.
SEVERITY_ORDER: dict[Severity, int] = {
    Severity.SMALL: 0,
    Severity.MEDIUM: 1,
    Severity.LARGE: 2,
}

STATUS_ORDER: dict[WorkflowStatus, int] = {
    status: index for index, status in enumerate(WorkflowStatus)
}
