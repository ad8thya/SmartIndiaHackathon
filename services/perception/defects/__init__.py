"""M1 · Road defect perception.

Protocol: :class:`contracts.DefectDetector`
Entry point: :func:`get_defect_detector`
"""

from __future__ import annotations

from .config import DefectSettings, get_settings
from .factory import get_defect_detector, reset_defect_detector
from .impl import RealDefectDetector
from .mock import MockDefectDetector

__all__ = [
    "DefectSettings",
    "MockDefectDetector",
    "RealDefectDetector",
    "get_defect_detector",
    "get_settings",
    "reset_defect_detector",
]
