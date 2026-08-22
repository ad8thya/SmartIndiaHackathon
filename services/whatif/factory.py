"""Mock ↔ real switch for M2's what-if engine."""

from __future__ import annotations

from functools import lru_cache

from contracts import WhatIfEngine

from .config import get_settings
from .impl import RealWhatIfEngine
from .mock import MockWhatIfEngine

__all__ = ["get_whatif_engine", "reset_whatif_engine"]


@lru_cache(maxsize=1)
def get_whatif_engine() -> WhatIfEngine:
    settings = get_settings()
    if settings.USE_REAL_WHATIF:
        return RealWhatIfEngine(settings)
    return MockWhatIfEngine(settings)


def reset_whatif_engine() -> None:
    get_whatif_engine.cache_clear()
