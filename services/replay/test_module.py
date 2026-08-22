"""Replay simulator tests. No broker required — they publish to a list."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from contracts import BusPosition, IncidentReport, Observation

from services.replay import Simulator, VirtualClock
from services.replay.config import ReplaySettings


class RecordingPublisher:
    def __init__(self) -> None:
        self.messages: list[tuple[str, dict]] = []

    def publish(self, topic: str, payload: str) -> None:
        self.messages.append((topic, json.loads(payload)))

    def topics(self, suffix: str) -> list[dict]:
        return [payload for topic, payload in self.messages if topic.endswith(suffix)]


@pytest.fixture
def publisher() -> RecordingPublisher:
    return RecordingPublisher()


@pytest.fixture
def simulator(publisher: RecordingPublisher) -> Simulator:
    settings = ReplaySettings(REPLAY_SPEED=60.0, REPLAY_BUSES=6, REPLAY_LOOP=True)
    return Simulator(publisher, settings=settings)


# ── the virtual clock ───────────────────────────────────────────────────────
def test_clock_scales_time() -> None:
    start = datetime(2026, 8, 21, 6, 0, tzinfo=UTC)
    clock = VirtualClock(speed=60.0, start=start)
    assert clock.advance(1.0) == timedelta(minutes=1)
    assert clock.advance(60.0) == timedelta(hours=1)


def test_clock_rejects_a_stopped_clock() -> None:
    with pytest.raises(ValueError, match="positive"):
        VirtualClock(speed=0.0)


# ── the fleet moves ─────────────────────────────────────────────────────────
def test_every_bus_publishes_a_position(
    simulator: Simulator, publisher: RecordingPublisher
) -> None:
    simulator.tick(1.0)
    positions = publisher.topics("/position")
    assert len(positions) == len(simulator.buses)
    for payload in positions:
        BusPosition.model_validate(payload)  # must satisfy the contract


def test_buses_actually_move(simulator: Simulator, publisher: RecordingPublisher) -> None:
    simulator.tick(1.0)
    first = publisher.topics("/position")[0]
    for _ in range(6):
        simulator.tick(1.0)
    last = [p for p in publisher.topics("/position") if p["bus_id"] == first["bus_id"]][-1]
    assert (last["lat"], last["lon"]) != (first["lat"], first["lon"])


def test_buses_stay_inside_chennai(simulator: Simulator, publisher: RecordingPublisher) -> None:
    for _ in range(60):
        simulator.tick(1.0)
    for payload in publisher.topics("/position"):
        assert 12.7 < payload["lat"] < 13.4
        assert 79.9 < payload["lon"] < 80.5


def test_buses_start_spread_along_their_routes(simulator: Simulator) -> None:
    """Six buses stacked on one pixel is a demo that looks broken."""
    assert len({round(bus.progress, 2) for bus in simulator.buses}) > 3


def test_bus_turns_around_at_the_terminus(publisher: RecordingPublisher) -> None:
    settings = ReplaySettings(REPLAY_SPEED=3600.0, REPLAY_LOOP=True)
    simulator = Simulator(publisher, settings=settings, bus_count=1)
    for _ in range(200):
        simulator.tick(1.0)
        if simulator.buses[0].direction == -1:
            break
    assert simulator.buses[0].direction == -1
    assert 0.0 <= simulator.buses[0].progress <= 1.0


# ── perception rides along ──────────────────────────────────────────────────
def test_observations_appear_over_time(simulator: Simulator, publisher: RecordingPublisher) -> None:
    for _ in range(120):
        simulator.tick(1.0)
    observations = publisher.topics("/observation")
    assert observations, "no observations after two simulated hours"
    for payload in observations[:20]:
        Observation.model_validate(payload)


def test_incidents_appear_over_time(publisher: RecordingPublisher) -> None:
    settings = ReplaySettings(REPLAY_SPEED=600.0, REPLAY_LOOP=True)
    simulator = Simulator(publisher, settings=settings)
    for _ in range(200):
        simulator.tick(1.0)
    incidents = publisher.topics("/incident")
    assert incidents, "the scripted hit-and-run never fired"
    for payload in incidents:
        IncidentReport.model_validate(payload)


def test_topics_are_namespaced_per_bus(simulator: Simulator, publisher: RecordingPublisher) -> None:
    """`bus/{id}/position` — the id in the topic must match the id in the body,
    or a subscriber filtering by topic gets somebody else's telemetry."""
    simulator.tick(1.0)
    for topic, payload in publisher.messages:
        prefix, bus_id, kind = topic.split("/")
        assert prefix == "bus"
        assert kind in {"position", "observation", "incident"}
        assert bus_id == payload.get("bus_id", payload.get("reported_by_bus"))


# ── resilience: a broken module must not stop the fleet ─────────────────────
def test_a_raising_detector_does_not_stop_the_simulation(
    simulator: Simulator, publisher: RecordingPublisher
) -> None:
    class Exploding:
        def detect(self, frame: object, meta: object) -> list[Observation]:
            raise RuntimeError("M1 flipped their flag on a half-finished detector")

    simulator.defects = Exploding()  # type: ignore[assignment]
    simulator.tick(1.0)
    assert len(publisher.topics("/position")) == len(simulator.buses)


def test_a_not_implemented_detector_is_silently_skipped(
    simulator: Simulator, publisher: RecordingPublisher
) -> None:
    class NotDone:
        def detect(self, frame: object, meta: object) -> list[Observation]:
            raise NotImplementedError

    simulator.pedestrian = NotDone()  # type: ignore[assignment]
    simulator.tick(1.0)
    assert publisher.topics("/position")


# ── stats ───────────────────────────────────────────────────────────────────
def test_stats_report_progress(simulator: Simulator) -> None:
    simulator.tick(1.0)
    stats = simulator.stats()
    assert stats["buses"] == len(simulator.buses)
    assert stats["messages"] >= len(simulator.buses)
