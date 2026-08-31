"""Which places the world no longer has a defect at. Owned by M5.

The replay is a world simulator: it decides what is physically on the road.
"A crew laid tarmac, so the pothole is not there any more" is world state, and
a simulator that kept generating a defect after it had been repaired would be
modelling a world in which repairs do not work — which would make the repair
verification loop untestable and, worse, quietly wrong.

**A real fleet needs none of this.** Its cameras simply stop seeing the
pothole, because the pothole is gone. This exists only because the mock
detector reads fixed hotspots from `citydata` and has no way to learn that
anything happened to them.

Deliberately NOT an MQTT topic and NOT a contracts change. It is a read of
`/api/events`, an endpoint that already exists, filtered to the rungs that
mean "a crew says this is fixed". Adding a wire contract between the API and
its own simulator would put a simulator concern in the frozen layer that six
people share.

When a work order is reopened — the event drops back to INSPECTION or below —
it stops appearing in that list and the hotspot comes back on the next poll.
The world reverts because the repair did not hold.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from contracts import haversine_m

log = logging.getLogger("urban-twin.replay.repairs")

#: Workflow rungs at which a crew has claimed the defect is gone. VERIFIED and
#: RESOLVED stay suppressed for good; REPAIR_COMPLETED is the interesting one,
#: because that is the window in which the fleet is being asked to confirm it.
REPAIRED_STATUSES = ("REPAIR_COMPLETED", "VERIFIED", "RESOLVED")


@dataclass
class RepairedPlaces:
    """A polled, cached list of where not to generate defects any more."""

    api_base: str
    radius_m: float
    poll_seconds: float
    enabled: bool = True

    _places: list[tuple[float, float, str]] = None  # type: ignore[assignment]
    _last_poll: float = 0.0
    _warned: bool = False

    def __post_init__(self) -> None:
        self._places = []

    def refresh(self, now: float | None = None) -> None:
        """Ask the API, at most every `poll_seconds`. Never raises.

        A failure is non-fatal and keeps the previous answer: the simulator
        losing contact with the API should degrade to "carry on as before",
        not stop the fleet. It warns once rather than every tick, because a
        log line per second is how a real problem gets scrolled past.
        """
        if not self.enabled:
            return
        now = now or time.monotonic()
        if self._places and (now - self._last_poll) < self.poll_seconds:
            return
        self._last_poll = now

        try:
            import httpx

            response = httpx.get(
                f"{self.api_base}/api/events",
                params={"status": list(REPAIRED_STATUSES), "limit": 500},
                timeout=3.0,
            )
            response.raise_for_status()
            events = response.json()
        except Exception as exc:
            if not self._warned:
                log.warning(
                    "cannot reach %s to ask which roads are repaired (%s) — "
                    "the simulator will keep generating every seeded defect",
                    self.api_base,
                    exc,
                )
                self._warned = True
            return

        self._warned = False
        places = [
            (event["lat"], event["lon"], event["detection_class"])
            for event in events
            if event.get("lat") is not None
        ]
        if len(places) != len(self._places):
            log.info("world model: %d repaired place(s) no longer generate defects", len(places))
        self._places = places

    def is_repaired(self, lat: float, lon: float, detection_class: str) -> bool:
        """Has this exact defect been repaired at this place?

        Class-matched: a repaired pothole does not stop the simulator
        generating the faded crossing that shares the junction with it.
        """
        if not self.enabled:
            return False
        for place_lat, place_lon, place_class in self._places:
            if place_class != detection_class:
                continue
            if haversine_m(lat, lon, place_lat, place_lon) <= self.radius_m:
                return True
        return False
