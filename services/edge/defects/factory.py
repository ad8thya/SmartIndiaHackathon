"""The one-line switch between M1's mock and M1's real detector.

Every consumer in the repo calls ``get_defect_detector()``. Nobody imports
``MockDefectDetector`` or ``RealDefectDetector`` directly, which is why M1 can
swap implementations without a single other file changing.
"""

from __future__ import annotations

from functools import lru_cache

from contracts import DefectDetector

from .config import get_settings
from .impl import RealDefectDetector
from .mock import MockDefectDetector

__all__ = ["get_defect_detector", "reset_defect_detector"]


@lru_cache(maxsize=1)
def get_defect_detector() -> DefectDetector:
    settings = get_settings()
    if settings.USE_REAL_DEFECTS:
        return RealDefectDetector(settings)
    return MockDefectDetector(settings)


def reset_defect_detector() -> None:
    """Drop the cached instance — used by tests that toggle the flag."""
    get_defect_detector.cache_clear()
