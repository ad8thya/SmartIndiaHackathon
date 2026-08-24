"""M5 · Replay / fleet simulation.

Stands in for a real AIS-140 fleet feed. It stays in the system even after every
module goes real — you cannot bring six MTC buses to a hackathon.
"""

from __future__ import annotations

from .clock import VirtualClock
from .config import ReplaySettings, get_replay_settings
from .simulator import ConsolePublisher, MqttPublisher, Publisher, Simulator, build_publisher

__all__ = [
    "ConsolePublisher",
    "MqttPublisher",
    "Publisher",
    "ReplaySettings",
    "Simulator",
    "VirtualClock",
    "build_publisher",
    "get_replay_settings",
]
