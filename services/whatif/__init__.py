"""M2b · What-if closure simulation.

Protocol: :class:`contracts.WhatIfEngine`
Entry point: :func:`get_whatif_engine`
"""

from __future__ import annotations

from .config import WhatIfSettings, get_settings
from .factory import get_whatif_engine, reset_whatif_engine
from .impl import RealWhatIfEngine
from .mock import BASELINE_MINUTES, SEGMENT_PENALTY_MIN, MockWhatIfEngine

__all__ = [
    "BASELINE_MINUTES",
    "SEGMENT_PENALTY_MIN",
    "MockWhatIfEngine",
    "RealWhatIfEngine",
    "WhatIfSettings",
    "get_settings",
    "get_whatif_engine",
    "reset_whatif_engine",
]
