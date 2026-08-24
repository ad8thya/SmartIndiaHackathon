"""Mock ↔ real switch for M4's incident detector."""

from __future__ import annotations

from functools import lru_cache

from contracts import IncidentDetector

from .config import get_settings
from .impl import RealIncidentDetector
from .mock import MockIncidentDetector

__all__ = ["get_incident_detector", "reset_incident_detector"]


@lru_cache(maxsize=1)
def get_incident_detector() -> IncidentDetector:
    settings = get_settings()
    if settings.USE_REAL_INCIDENTS:
        return RealIncidentDetector(settings)
    return MockIncidentDetector(settings)


def reset_incident_detector() -> None:
    get_incident_detector.cache_clear()
