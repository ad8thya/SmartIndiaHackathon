"""M4 · Incident detection and ANPR.

Protocol: :class:`contracts.IncidentDetector`
Entry point: :func:`get_incident_detector`

Privacy contract: readable plates live only in ``IncidentReport.plate_text``
for the operator dossier. Anything persisted or published carries
``plate_hash`` (salted sha256) instead. See :func:`config.hash_plate`.
"""

from __future__ import annotations

from .config import IncidentSettings, get_settings, hash_plate
from .factory import get_incident_detector, reset_incident_detector
from .impl import RealIncidentDetector
from .mock import (
    SCRIPTED_BUS,
    SCRIPTED_PLATE,
    SCRIPTED_PLATE_CONFIDENCE,
    SCRIPTED_SEGMENT,
    MockIncidentDetector,
)

__all__ = [
    "SCRIPTED_BUS",
    "SCRIPTED_PLATE",
    "SCRIPTED_PLATE_CONFIDENCE",
    "SCRIPTED_SEGMENT",
    "IncidentSettings",
    "MockIncidentDetector",
    "RealIncidentDetector",
    "get_incident_detector",
    "get_settings",
    "hash_plate",
    "reset_incident_detector",
]
