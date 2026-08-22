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
    "RiskLevel",
    "Severity",
    "WSMessageType",
    "WorkflowStatus",
]


class DetectionClass(StrEnum):
    """Everything a bus-mounted camera can report.

    The first eight are *infrastructure* classes (M1) and always carry an
    IRC:82-2015 severity. The rest are traffic/safety classes (M2/M3/M4).
    """

    # ── infrastructure defects (M1) ────────────────────────────────────────
    POTHOLE = "POTHOLE"
    LONGITUDINAL_CRACK = "LONGITUDINAL_CRACK"
    TRANSVERSE_CRACK = "TRANSVERSE_CRACK"
    ALLIGATOR_CRACK = "ALLIGATOR_CRACK"
    WATERLOGGING = "WATERLOGGING"
    DAMAGED_DIVIDER = "DAMAGED_DIVIDER"
    MISSING_SIGN = "MISSING_SIGN"
    FADED_ZEBRA = "FADED_ZEBRA"
    # ── traffic (M2) ───────────────────────────────────────────────────────
    VEHICLE = "VEHICLE"
    # ── pedestrian safety (M3) ─────────────────────────────────────────────
    PEDESTRIAN = "PEDESTRIAN"
    PEDESTRIAN_RISK = "PEDESTRIAN_RISK"
    # ── incidents (M4) ─────────────────────────────────────────────────────
    RASH_DRIVING = "RASH_DRIVING"
    COLLISION = "COLLISION"


class Severity(StrEnum):
    """IRC:82-2015 dimensional severity classes for road surface distress.

    SMALL   < 100 mm across / < 25 mm deep
    MEDIUM  100–300 mm across / 25–50 mm deep
    LARGE   > 300 mm across / > 50 mm deep
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
        DetectionClass.MISSING_SIGN,
        DetectionClass.FADED_ZEBRA,
    }
)

#: Classes that feed the live-safety layer rather than the maintenance backlog.
SAFETY_CLASSES: frozenset[DetectionClass] = frozenset(
    {
        DetectionClass.PEDESTRIAN_RISK,
        DetectionClass.RASH_DRIVING,
        DetectionClass.COLLISION,
    }
)

#: The only classes that may become a workflow :class:`~contracts.models.Event`.
#:
#: Everything else a camera reports — plain ``PEDESTRIAN`` presence, ``VEHICLE``
#: counts — is *analytics input*, not a backlog item. Fusing them would hand a
#: repair crew a work order with an SLA clock for a person walking down a road,
#: and would drown the real defects in the operator's event list.
#:
#: Both the mock and the real fuser filter on this, so the rule survives the
#: mock → impl swap.
FUSABLE_CLASSES: frozenset[DetectionClass] = INFRASTRUCTURE_CLASSES | frozenset(
    {
        DetectionClass.PEDESTRIAN_RISK,
        DetectionClass.RASH_DRIVING,
        DetectionClass.COLLISION,
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
