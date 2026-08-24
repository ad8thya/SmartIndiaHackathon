"""Mock ↔ real switch for M2's traffic analyzer."""

from __future__ import annotations

from functools import lru_cache

from contracts import TrafficAnalyzer

from .config import get_settings
from .impl import RealTrafficAnalyzer
from .mock import MockTrafficAnalyzer

__all__ = ["get_traffic_analyzer", "reset_traffic_analyzer"]


@lru_cache(maxsize=1)
def get_traffic_analyzer() -> TrafficAnalyzer:
    settings = get_settings()
    if settings.USE_REAL_TRAFFIC:
        return RealTrafficAnalyzer(settings)
    return MockTrafficAnalyzer(settings)


def reset_traffic_analyzer() -> None:
    get_traffic_analyzer.cache_clear()
