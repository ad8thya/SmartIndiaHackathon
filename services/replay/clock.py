"""Virtual clock. Owned by M5.

Every timestamp in the simulation comes from here, never from
``datetime.now()`` directly. That is what lets the same code run a demo at 60x
and a soak test at 1x, and it is what makes M2's hour-of-day congestion curve
animate instead of sitting flat.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta


class VirtualClock:
    """Wall-clock time, scaled.

    >>> clock = VirtualClock(speed=60.0)     # 1 real second = 1 simulated minute
    >>> _ = clock.now()
    """

    def __init__(self, speed: float = 60.0, start: datetime | None = None) -> None:
        if speed <= 0:
            raise ValueError("clock speed must be positive")
        self.speed = speed
        self._sim_start = start or datetime.now(tz=UTC)
        self._real_start = time.monotonic()

    def now(self) -> datetime:
        elapsed_real = time.monotonic() - self._real_start
        return self._sim_start + timedelta(seconds=elapsed_real * self.speed)

    def advance(self, real_seconds: float) -> timedelta:
        """How much simulated time passes in ``real_seconds`` of wall time."""
        return timedelta(seconds=real_seconds * self.speed)

    def reset(self, start: datetime | None = None) -> None:
        self._sim_start = start or datetime.now(tz=UTC)
        self._real_start = time.monotonic()
