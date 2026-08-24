"""M3 · Pedestrian safety perception.

Protocol: :class:`contracts.PedestrianRiskDetector`
Entry point: :func:`get_pedestrian_detector`
"""

from __future__ import annotations

from .config import PedestrianSettings, get_settings
from .factory import get_pedestrian_detector, reset_pedestrian_detector
from .impl import RealPedestrianRiskDetector
from .mock import MockPedestrianRiskDetector

__all__ = [
    "MockPedestrianRiskDetector",
    "PedestrianSettings",
    "RealPedestrianRiskDetector",
    "get_pedestrian_detector",
    "get_settings",
    "reset_pedestrian_detector",
]
