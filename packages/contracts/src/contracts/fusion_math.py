"""Pure fusion arithmetic. No imports beyond the standard library, no I/O.

This module is deliberately tiny and dependency-free so that it can be imported
by an edge device, the API, a test, or a notebook without dragging anything in.
Both M3 (fusion) and M5 (API) call these, and they must agree exactly — which
is why the maths lives here rather than in either of their modules.
"""

from __future__ import annotations

from collections.abc import Iterable
from math import asin, cos, radians, sin, sqrt

from .enums import Severity, WorkflowStatus

__all__ = [
    "MAX_FUSED_CONFIDENCE",
    "derive_status",
    "fuse_confidence",
    "haversine_m",
    "severity_from_dimensions",
    "sla_hours",
]

#: We never claim certainty. 0.999 leaves room for a human to disagree.
MAX_FUSED_CONFIDENCE = 0.999

#: Thresholds used by :func:`derive_status`.
_STRONG_BUS_COUNT = 3
_STRONG_CONFIDENCE = 0.95
_CORROBORATED_BUS_COUNT = 2
_SINGLE_BUS_CONFIDENCE = 0.70


def fuse_confidence(confidences: Iterable[float]) -> float:
    """Combine independent detections with a noisy-OR.

    ``1 - Π(1 - cᵢ)``: the probability that *at least one* detector was right.
    Two 0.6 sightings give 0.84 — more than either alone, which is the whole
    point of putting cameras on a hundred buses instead of one.

    Empty input returns 0.0. The result is clamped to
    [0, :data:`MAX_FUSED_CONFIDENCE`].
    """
    product = 1.0
    seen = False
    for confidence in confidences:
        seen = True
        clamped = min(max(float(confidence), 0.0), 1.0)
        product *= 1.0 - clamped
    if not seen:
        return 0.0
    fused = 1.0 - product
    return min(max(fused, 0.0), MAX_FUSED_CONFIDENCE)


def derive_status(bus_count: int, confidence: float) -> WorkflowStatus:
    """Decide how far an event may auto-escalate without a human.

    The ladder is deliberately conservative — an automatic notification to a
    municipal corporation is a real-world action, so it needs corroboration
    from three physically distinct vehicles *and* near-certainty.

    ==========================  ===========================
    evidence                    status
    ==========================  ===========================
    ≥3 buses and conf ≥ 0.95    AUTHORITY_NOTIFIED
    ≥2 buses                    AI_VERIFIED
    1 bus and conf ≥ 0.70       AI_VERIFIED
    anything weaker             DETECTED
    ==========================  ===========================
    """
    if bus_count >= _STRONG_BUS_COUNT and confidence >= _STRONG_CONFIDENCE:
        return WorkflowStatus.AUTHORITY_NOTIFIED
    if bus_count >= _CORROBORATED_BUS_COUNT:
        return WorkflowStatus.AI_VERIFIED
    if bus_count == 1 and confidence >= _SINGLE_BUS_CONFIDENCE:
        return WorkflowStatus.AI_VERIFIED
    return WorkflowStatus.DETECTED


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres.

    Used for clustering observations before they reach PostGIS, and in tests
    where spinning up a database would be absurd.
    """
    earth_radius_m = 6_371_008.8
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * earth_radius_m * asin(sqrt(min(1.0, a)))


def severity_from_dimensions(max_dimension_mm: float, depth_mm: float) -> Severity:
    """IRC:82-2015 dimensional classification of a surface distress.

    Either dimension can push a defect up a class — a narrow but deep pothole
    is just as dangerous to a two-wheeler as a wide shallow one.
    """
    if max_dimension_mm > 300.0 or depth_mm > 50.0:
        return Severity.LARGE
    if max_dimension_mm >= 100.0 or depth_mm >= 25.0:
        return Severity.MEDIUM
    return Severity.SMALL


def sla_hours(severity: Severity) -> int:
    """Repair window per severity, mirroring typical municipal SLAs."""
    return {Severity.LARGE: 72, Severity.MEDIUM: 168, Severity.SMALL: 720}[severity]
