"""Mock ↔ real switch for M3's event fuser."""

from __future__ import annotations

from functools import lru_cache

from contracts import EventFuser

from .config import get_settings
from .impl import RealEventFuser
from .mock import MockEventFuser

__all__ = ["get_event_fuser", "reset_event_fuser"]


@lru_cache(maxsize=1)
def get_event_fuser() -> EventFuser:
    settings = get_settings()
    if settings.USE_REAL_FUSION:
        return RealEventFuser(settings)
    return MockEventFuser(settings)


def reset_event_fuser() -> None:
    get_event_fuser.cache_clear()
