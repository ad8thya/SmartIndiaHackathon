"""Walk buses along their routes and emit telemetry. Owned by M5.

This is the beating heart of the demo. It is *not* a mock in the module sense —
it is the stand-in for a real fleet's AIS-140 feed, and it stays in the system
even after every module goes real, because you cannot bring six MTC buses to a
hackathon.

Each tick it:
  1. advances every bus along its route polyline by (speed × simulated dt)
  2. publishes a BusPosition to ``bus/{id}/position``
  3. asks M1, M3 and M4's factories what they would have seen from there
  4. publishes the resulting Observations to ``bus/{id}/observation`` and
     IncidentReports to ``bus/{id}/incident``

Note step 3: the simulator calls the **factories**, so the moment a module owner
flips their USE_REAL_* flag their real implementation is in the loop with no
change here.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from citydata import BUSES, RouteSpec, point_at_fraction, route_by_id
from contracts import (
    BusPosition,
    FrameMeta,
    IncidentReport,
    Observation,
    incident_topic,
    observation_topic,
    position_topic,
)

from services.perception.defects import get_defect_detector
from services.perception.incidents import get_incident_detector
from services.perception.incidents.near_miss import MockNearMissDetector
from services.perception.pedestrian import get_pedestrian_detector

from .clock import VirtualClock
from .config import ReplaySettings, get_replay_settings

log = logging.getLogger("urban-twin.replay")


class Publisher(Protocol):
    """Anything that can put a JSON string on a topic. Keeps MQTT out of tests."""

    def publish(self, topic: str, payload: str) -> None: ...


class ConsolePublisher:
    """Fallback when no broker is reachable — the simulation still runs."""

    def __init__(self, verbose: bool = False) -> None:
        self.verbose = verbose
        self.count = 0

    def publish(self, topic: str, payload: str) -> None:
        self.count += 1
        if self.verbose:
            log.info("%s %s", topic, payload[:120])


class MqttPublisher:
    def __init__(self, settings: ReplaySettings) -> None:
        import paho.mqtt.client as mqtt

        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{settings.MQTT_CLIENT_PREFIX}-replay",
        )
        self._client.connect(settings.MQTT_HOST, settings.MQTT_PORT, 60)
        self._client.loop_start()
        log.info("replay publishing to mqtt://%s:%s", settings.MQTT_HOST, settings.MQTT_PORT)

    def publish(self, topic: str, payload: str) -> None:
        self._client.publish(topic, payload, qos=0)

    def close(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()


@dataclass
class SimulatedBus:
    bus_id: str
    route: RouteSpec
    progress: float
    depot: str
    occupancy_pct: float = 40.0
    delay_min: float = 0.0
    direction: int = 1
    frame_idx: int = 0
    _rng: random.Random = field(default_factory=random.Random, repr=False)

    def step(self, simulated_seconds: float, cruise_kmph: float, loop: bool) -> float:
        """Advance along the route. Returns the instantaneous speed in km/h."""
        # a real bus is not a metronome: traffic, signals and stops all bite
        speed = max(0.0, self._rng.gauss(cruise_kmph, cruise_kmph * 0.28))
        if self._rng.random() < 0.06:
            speed = self._rng.uniform(0.0, 3.0)  # at a stop or a signal

        distance_km = speed * (simulated_seconds / 3600.0)
        route_km = max(self.route.length_km, 0.1)
        self.progress += self.direction * (distance_km / route_km)

        if self.progress >= 1.0:
            if loop:
                # turn around at the terminus rather than teleporting to the
                # start — a bus that jumps across the city looks broken on a map
                self.progress, self.direction = 1.0, -1
            else:
                self.progress = 1.0
        elif self.progress <= 0.0:
            self.progress, self.direction = 0.0, 1

        self.occupancy_pct = min(100.0, max(5.0, self._rng.gauss(self.occupancy_pct, 4.0)))
        self.delay_min = max(-5.0, min(25.0, self.delay_min + self._rng.gauss(0.0, 0.4)))
        self.frame_idx += 1
        return round(speed, 1)


class Simulator:
    def __init__(
        self,
        publisher: Publisher,
        settings: ReplaySettings | None = None,
        bus_count: int | None = None,
        clock: VirtualClock | None = None,
    ) -> None:
        self.settings = settings or get_replay_settings()
        self.publisher = publisher
        self.clock = clock or VirtualClock(speed=self.settings.REPLAY_SPEED)
        count = bus_count or self.settings.REPLAY_BUSES

        self.buses = [
            SimulatedBus(
                bus_id=spec.bus_id,
                route=route_by_id(spec.route_id),
                progress=spec.start_progress,
                depot=spec.depot,
                _rng=random.Random(spec.bus_id),
            )
            for spec in BUSES[:count]
        ]

        self.defects = get_defect_detector()
        self.pedestrian = get_pedestrian_detector()
        self.incidents = get_incident_detector()
        # near-miss has no USE_REAL_* flag yet — it is scaffolding for the AI
        # intelligence layer, not one of the six frozen Protocols, so there is
        # no factory to swap. See services/perception/incidents/near_miss.py.
        self.near_miss = MockNearMissDetector()

        self.published = 0
        self.observations_emitted = 0
        self.incidents_emitted = 0
        self._loops_completed = 0

    # ── one tick ────────────────────────────────────────────────────────────
    def tick(self, real_seconds: float | None = None) -> None:
        real_seconds = (
            real_seconds if real_seconds is not None else self.settings.REPLAY_TICK_SECONDS
        )
        simulated_seconds = real_seconds * self.settings.REPLAY_SPEED
        now = self.clock.now()

        for bus in self.buses:
            was_at_end = bus.progress >= 1.0
            speed = bus.step(
                simulated_seconds, self.settings.REPLAY_CRUISE_KMPH, self.settings.REPLAY_LOOP
            )
            if bus.progress >= 1.0 and not was_at_end:
                self._on_terminus()

            (lon, lat), heading = point_at_fraction(bus.route.polyline, bus.progress)
            self._publish_position(bus, lat, lon, heading, speed, now)

            meta = FrameMeta(
                bus_id=bus.bus_id,
                route_id=bus.route.route_id,
                ts=now,
                lat=lat,
                lon=lon,
                heading_deg=heading,
                speed_kmph=speed,
                gps_accuracy_m=round(random.uniform(2.5, 8.0), 1),
                frame_idx=bus.frame_idx,
                fps=self.settings.REPLAY_FPS,
            )
            self._run_perception(bus, meta)

    def _on_terminus(self) -> None:
        """A bus reached the end of its route — start the story over."""
        self._loops_completed += 1
        reset = getattr(self.incidents, "reset", None)
        if callable(reset):
            reset()
        self.near_miss.reset()

    def _publish_position(
        self,
        bus: SimulatedBus,
        lat: float,
        lon: float,
        heading: float,
        speed: float,
        now: datetime,
    ) -> None:
        stop_index = min(int(bus.progress * len(bus.route.stops)), max(len(bus.route.stops) - 1, 0))
        position = BusPosition(
            bus_id=bus.bus_id,
            route_id=bus.route.route_id,
            ts=now,
            lat=lat,
            lon=lon,
            heading_deg=heading,
            speed_kmph=speed,
            progress=round(bus.progress, 4),
            occupancy_pct=round(bus.occupancy_pct, 1),
            next_stop=bus.route.stops[stop_index] if bus.route.stops else None,
            delay_min=round(bus.delay_min, 1),
        )
        self._emit(position_topic(bus.bus_id), position)

    def _run_perception(self, bus: SimulatedBus, meta: FrameMeta) -> None:
        for observation in self._safely(self.defects.detect, None, meta, "defects"):
            self._emit(observation_topic(bus.bus_id), observation)
            self.observations_emitted += 1

        for observation in self._safely(self.pedestrian.detect, None, meta, "pedestrian"):
            self._emit(observation_topic(bus.bus_id), observation)
            self.observations_emitted += 1

        for report in self._safely(self.incidents.process, [], meta, "incidents"):
            self._emit(incident_topic(bus.bus_id), report)
            self.incidents_emitted += 1

        for observation in self._safely(self.near_miss.detect, None, meta, "near_miss"):
            self._emit(observation_topic(bus.bus_id), observation)
            self.observations_emitted += 1

    def _safely(
        self, fn: Any, frames: Any, meta: FrameMeta, label: str
    ) -> list[Observation] | list[IncidentReport]:
        """One module raising must not stop the fleet.

        This is the whole point of the factory boundary: if M1 flips their flag
        on a half-finished detector, everyone else's demo keeps running and the
        log says exactly whose module broke.
        """
        try:
            return fn(frames, meta)
        except NotImplementedError:
            return []
        except Exception:
            log.exception("%s module raised — skipping this frame", label)
            return []

    def _emit(self, topic: str, model: Any) -> None:
        self.publisher.publish(topic, model.model_dump_json())
        self.published += 1

    # ── stats for the console ───────────────────────────────────────────────
    def stats(self) -> dict[str, Any]:
        return {
            "simulated_time": self.clock.now().strftime("%Y-%m-%d %H:%M:%S"),
            "buses": len(self.buses),
            "messages": self.published,
            "observations": self.observations_emitted,
            "incidents": self.incidents_emitted,
            "loops": self._loops_completed,
        }


def build_publisher(settings: ReplaySettings, verbose: bool = False) -> Publisher:
    """MQTT if we can reach a broker, console otherwise. Never hard-fail."""
    try:
        return MqttPublisher(settings)
    except Exception as exc:
        log.warning(
            "no mqtt broker at %s:%s (%s) — simulating to the console instead. "
            "Run `make up` to start mosquitto.",
            settings.MQTT_HOST,
            settings.MQTT_PORT,
            exc,
        )
        return ConsolePublisher(verbose=verbose)
