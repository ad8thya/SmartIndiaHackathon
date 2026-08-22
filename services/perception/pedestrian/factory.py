"""Mock ↔ real switch for M3's pedestrian detector."""

from __future__ import annotations

from functools import lru_cache

from contracts import PedestrianRiskDetector

from .config import get_settings
from .impl import RealPedestrianRiskDetector
from .mock import MockPedestrianRiskDetector

__all__ = ["get_pedestrian_detector", "reset_pedestrian_detector"]


@lru_cache(maxsize=1)
def get_pedestrian_detector() -> PedestrianRiskDetector:
    settings = get_settings()
    if settings.USE_REAL_PEDESTRIAN:
        return RealPedestrianRiskDetector(settings)
    return MockPedestrianRiskDetector(settings)


def reset_pedestrian_detector() -> None:
    get_pedestrian_detector.cache_clear()
