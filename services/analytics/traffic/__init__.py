"""M2a · Traffic analytics.

Protocol: :class:`contracts.TrafficAnalyzer`
Entry point: :func:`get_traffic_analyzer`
"""

from __future__ import annotations

from .config import TrafficSettings, get_settings
from .factory import get_traffic_analyzer, reset_traffic_analyzer
from .impl import RealTrafficAnalyzer
from .mock import MockTrafficAnalyzer, congestion_curve

__all__ = [
    "MockTrafficAnalyzer",
    "RealTrafficAnalyzer",
    "TrafficSettings",
    "congestion_curve",
    "get_settings",
    "get_traffic_analyzer",
    "reset_traffic_analyzer",
]
