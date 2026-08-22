"""M3b · Observation → Event fusion.

Protocol: :class:`contracts.EventFuser`
Entry point: :func:`get_event_fuser`

This is where "a camera saw something" becomes "this is real, send a crew".
"""

from __future__ import annotations

from .config import FusionSettings, get_settings
from .factory import get_event_fuser, reset_event_fuser
from .impl import RealEventFuser
from .mock import MockEventFuser

__all__ = [
    "FusionSettings",
    "MockEventFuser",
    "RealEventFuser",
    "get_event_fuser",
    "get_settings",
    "reset_event_fuser",
]
