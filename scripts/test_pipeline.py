"""End-to-end pipeline test. Owned by M5.

Wires the simulator straight into the API's LiveState and FusionLoop — no
broker, no database — and asserts that the story the demo tells actually
happens:

    buses move → detections accumulate → events form →
    corroboration from multiple buses escalates them → the websocket sees it

This is the test that catches "every module passes its own tests but nothing
works together", which is the classic way a six-person hackathon project dies
on day six.
"""

from __future__ import annotations

import json

import pytest
from contracts import (
    INFRASTRUCTURE_CLASSES,
    BusPosition,
    IncidentReport,
    Observation,
    WorkflowStatus,
    WSMessageType,
)

from services.cloud.api.config import ApiSettings
from services.cloud.api.fusion_loop import FusionLoop
from services.cloud.api.hub import Broadcaster, LiveState
from services.tools.replay import Simulator
from services.tools.replay.config import ReplaySettings


class LoopbackPublisher:
    """Stands in for the MQTT broker: routes straight into LiveState."""

    def __init__(self, state: LiveState, broadcaster: Broadcaster) -> None:
        self.state = state
        self.broadcaster = broadcaster
        self.counts = {"position": 0, "observation": 0, "incident": 0}

    def publish(self, topic: str, payload: str) -> None:
        kind = topic.rsplit("/", 1)[-1]
        self.counts[kind] += 1
        data = json.loads(payload)
        if kind == "position":
            self.state.upsert_bus(BusPosition.model_validate(data))
            self.broadcaster.publish(WSMessageType.BUS_POSITION, data)
        elif kind == "observation":
            self.state.add_observation(Observation.model_validate(data))
        elif kind == "incident":
            self.state.add_incident(IncidentReport.model_validate(data))


@pytest.fixture
def pipeline() -> tuple[Simulator, LiveState, Broadcaster, FusionLoop, LoopbackPublisher]:
    state = LiveState(observation_buffer=20_000)
    broadcaster = Broadcaster()
    publisher = LoopbackPublisher(state, broadcaster)
    # 600x: one real tick is ten simulated minutes, so a short test covers a day
    settings = ReplaySettings(REPLAY_SPEED=600.0, REPLAY_BUSES=6, REPLAY_LOOP=True)
    simulator = Simulator(publisher, settings=settings)
    fusion = FusionLoop(ApiSettings(), state, broadcaster)
    return simulator, state, broadcaster, fusion, publisher


async def drive(simulator: Simulator, fusion: FusionLoop, ticks: int) -> None:
    for index in range(ticks):
        simulator.tick(1.0)
        if index % 5 == 0:
            await fusion.tick()
    await fusion.tick()


async def test_the_whole_thing_actually_works(pipeline) -> None:
    simulator, state, broadcaster, fusion, publisher = pipeline
    queue = broadcaster.subscribe()

    await drive(simulator, fusion, 200)

    # 1 ── the fleet is moving
    assert len(state.buses) == 6, "not every bus reported a position"
    assert publisher.counts["position"] >= 200

    # 2 ── perception produced something
    assert publisher.counts["observation"] > 0, "no observations in a simulated day"

    # 3 ── fusion turned observations into events
    assert state.events, "observations never became events"

    # 4 ── the escalation ladder is doing its job
    statuses = {event.status for event in state.event_list()}
    assert statuses & {
        WorkflowStatus.AI_VERIFIED,
        WorkflowStatus.AUTHORITY_NOTIFIED,
    }, f"nothing escalated past DETECTED (saw {statuses})"

    # 5 ── the websocket saw the whole thing
    frames = []
    while not queue.empty():
        frames.append(json.loads(queue.get_nowait()))
    types = {frame["type"] for frame in frames}
    assert WSMessageType.BUS_POSITION in types
    assert WSMessageType.EVENT_NEW in types


async def test_events_escalate_as_more_buses_corroborate(pipeline) -> None:
    """The core claim of the project, tested directly."""
    simulator, state, _, fusion, _ = pipeline

    # long enough for several laps — corroboration needs a *second bus* to come
    # past the same defect, which only happens on the shared Egmore↔Central trunk
    await drive(simulator, fusion, 250)
    early = {event.event_id: event for event in state.event_list()}

    await drive(simulator, fusion, 600)
    later = {event.event_id: event for event in state.event_list()}

    improved = [
        event_id
        for event_id, event in later.items()
        if event_id in early and event.distinct_bus_count > early[event_id].distinct_bus_count
    ]
    assert improved, "no event ever gained a second corroborating bus"

    for event_id in improved:
        assert later[event_id].fused_confidence >= early[event_id].fused_confidence


async def test_every_infrastructure_event_is_actionable(pipeline) -> None:
    """A defect with no severity or no SLA cannot be dispatched to a crew."""
    simulator, state, _, fusion, _ = pipeline
    await drive(simulator, fusion, 150)

    for event in state.event_list():
        if event.detection_class in INFRASTRUCTURE_CLASSES:
            assert event.severity is not None
            assert event.sla_due is not None
            assert event.sla_due >= event.last_seen


async def test_the_scripted_incident_reaches_the_operator(pipeline) -> None:
    simulator, state, _, fusion, publisher = pipeline
    await drive(simulator, fusion, 400)

    assert publisher.counts["incident"] > 0, "the scripted hit-and-run never fired"
    collisions = [
        incident for incident in state.incidents if incident.incident_class == "COLLISION"
    ]
    assert collisions, "no collision dossier reached the operator"
    assert collisions[0].plate_text == "TN 09 BX 4412"
    assert collisions[0].plate_hash is not None


async def test_a_human_decision_is_never_overwritten_by_fusion(pipeline) -> None:
    """An operator assigns a crew; the next fusion pass must not demote it."""
    simulator, state, _, fusion, _ = pipeline
    await drive(simulator, fusion, 80)
    assert state.events

    event = next(iter(state.event_list()))
    state.replace_event(
        event.model_copy(
            update={
                "status": WorkflowStatus.MAINTENANCE_ASSIGNED,
                "assigned_team": "GCC-Zone-13-Adyar",
            }
        )
    )

    await drive(simulator, fusion, 80)

    after = state.events[event.event_id]
    assert after.status is WorkflowStatus.MAINTENANCE_ASSIGNED
    assert after.assigned_team == "GCC-Zone-13-Adyar"


async def test_traffic_analytics_see_the_simulated_day(pipeline) -> None:
    simulator, state, _, fusion, _ = pipeline
    await drive(simulator, fusion, 120)

    from services.cloud.intelligence.traffic_analytics import get_traffic_analyzer

    conditions = get_traffic_analyzer().analyze(state.recent_observations())
    assert conditions
    assert any(condition.defect_counts for condition in conditions.values()), (
        "no corridor picked up any defect from the fleet"
    )
