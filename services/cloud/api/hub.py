"""In-process live state + websocket fan-out. Owned by M5.

Everything the command centre shows in real time passes through here. Keeping
it in one small module means the WebSocket, the MQTT bridge and the REST
handlers all read the same picture, and none of them import each other.

The state is deliberately *not* the source of truth — postgres is. This is a
hot cache shaped for the two questions the UI asks constantly: "where is
everything right now" and "what changed since I last looked".
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import deque
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from contracts import (
    BusPosition,
    CitizenReport,
    Event,
    IncidentReport,
    Observation,
    WSMessage,
    WSMessageType,
)

log = logging.getLogger("urban-twin.hub")


class LiveState:
    """Latest known state of the city. One instance per API process."""

    def __init__(self, observation_buffer: int = 5000) -> None:
        self.buses: dict[str, BusPosition] = {}
        self.observations: deque[Observation] = deque(maxlen=observation_buffer)
        self.events: dict[UUID, Event] = {}
        self.incidents: deque[IncidentReport] = deque(maxlen=500)
        #: Citizen reports, newest first. Postgres is the source of truth; this
        #: is the same hot-cache/fallback arrangement `events` has, and it is
        #: what keeps a report the citizen just sent visible on the console
        #: during the window where the database is unreachable.
        self.reports: deque[CitizenReport] = deque(maxlen=500)
        self.started_at = datetime.now(tz=UTC)
        self.km_surveyed = 0.0
        self._lock = asyncio.Lock()

    # ── writes ──────────────────────────────────────────────────────────────
    def upsert_bus(self, position: BusPosition) -> None:
        previous = self.buses.get(position.bus_id)
        if previous is not None:
            from contracts import haversine_m

            self.km_surveyed += (
                haversine_m(previous.lat, previous.lon, position.lat, position.lon) / 1000.0
            )
        self.buses[position.bus_id] = position

    def add_observation(self, observation: Observation) -> None:
        self.observations.append(observation)

    def add_incident(self, incident: IncidentReport) -> None:
        self.incidents.appendleft(incident)

    def add_report(self, report: CitizenReport) -> None:
        self.reports.appendleft(report)

    def apply_event(self, event: Event) -> WSMessageType:
        """Store a fused event and report whether it is new or an update."""
        previous = self.events.get(event.event_id)
        self.events[event.event_id] = event
        if previous is None:
            return WSMessageType.EVENT_NEW
        return WSMessageType.EVENT_UPDATED

    def replace_event(self, event: Event) -> None:
        self.events[event.event_id] = event

    # ── reads ───────────────────────────────────────────────────────────────
    def recent_observations(self, limit: int | None = None) -> list[Observation]:
        items = list(self.observations)
        return items[-limit:] if limit else items

    def event_list(self) -> list[Event]:
        return list(self.events.values())

    def report_list(self) -> list[CitizenReport]:
        return list(self.reports)


class Broadcaster:
    """Fan a WSMessage out to every connected websocket.

    Slow clients get dropped rather than back-pressuring the whole system — a
    laptop that closed its lid must not stall the control room's map.
    """

    def __init__(self, queue_size: int = 256) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._queue_size = queue_size

    def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=self._queue_size)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, message_type: WSMessageType, payload: dict[str, Any]) -> None:
        message = WSMessage(type=message_type, ts=datetime.now(tz=UTC), payload=payload)
        encoded = message.model_dump_json()
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(encoded)
            except asyncio.QueueFull:
                log.debug("dropping frame for a slow websocket subscriber")
                self._subscribers.discard(queue)


class Repeater:
    """A cancellable periodic task. Used for fusion and websocket heartbeats."""

    def __init__(self, interval: float, coro: Any, name: str) -> None:
        self.interval = interval
        self._coro = coro
        self._name = name
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name=self._name)

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.interval)
                await self._coro()
            except asyncio.CancelledError:
                raise
            except Exception:  # a bad tick must never kill the loop
                log.exception("%s tick failed", self._name)


#: process-wide singletons, wired up in main.py's lifespan
state = LiveState()
broadcaster = Broadcaster()
