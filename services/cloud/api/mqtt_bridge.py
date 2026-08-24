"""MQTT → LiveState bridge. Owned by M5.

paho-mqtt is a threaded, blocking client, so it runs on its own thread and
hands messages back to the event loop with ``call_soon_threadsafe``. Doing this
the other way round — awaiting inside the paho callback — deadlocks the client
under load, which is a fun thing to discover during a demo.

If the broker is unreachable the bridge logs and keeps retrying. The API still
serves; it just has no live fleet.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from contracts import (
    ALL_INCIDENTS,
    ALL_OBSERVATIONS,
    ALL_POSITIONS,
    BusPosition,
    IncidentReport,
    Observation,
    WSMessageType,
)

from .config import ApiSettings
from .hub import Broadcaster, LiveState

log = logging.getLogger("urban-twin.mqtt")


class MqttBridge:
    def __init__(self, settings: ApiSettings, state: LiveState, broadcaster: Broadcaster) -> None:
        self.settings = settings
        self.state = state
        self.broadcaster = broadcaster
        self._client: Any = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self.connected = False

    # ── lifecycle ───────────────────────────────────────────────────────────
    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        try:
            import paho.mqtt.client as mqtt
        except ImportError:  # pragma: no cover
            log.warning("paho-mqtt not installed — running without live telemetry")
            return

        self._loop = loop
        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"{self.settings.MQTT_CLIENT_PREFIX}-api",
        )
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        try:
            self._client.connect_async(self.settings.MQTT_HOST, self.settings.MQTT_PORT, 60)
            self._client.loop_start()
        except Exception:
            log.exception("mqtt connect failed — the API will serve without live data")

    def stop(self) -> None:
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self.connected = False

    # ── paho callbacks (these run on the paho thread) ───────────────────────
    def _on_connect(
        self, client: Any, userdata: Any, flags: Any, rc: Any, props: Any = None
    ) -> None:
        self.connected = True
        log.info("mqtt connected to %s:%s", self.settings.MQTT_HOST, self.settings.MQTT_PORT)
        client.subscribe([(ALL_POSITIONS, 0), (ALL_OBSERVATIONS, 0), (ALL_INCIDENTS, 0)])

    def _on_disconnect(self, client: Any, userdata: Any, *args: Any) -> None:
        self.connected = False
        log.warning("mqtt disconnected — paho will retry")

    def _on_message(self, client: Any, userdata: Any, message: Any) -> None:
        if self._loop is None:
            return
        try:
            payload = json.loads(message.payload.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            log.warning("undecodable mqtt payload on %s", message.topic)
            return
        # hop back onto the event loop; never touch asyncio state from this thread
        self._loop.call_soon_threadsafe(self._dispatch, message.topic, payload)

    # ── event-loop side ─────────────────────────────────────────────────────
    def _dispatch(self, topic: str, payload: dict[str, Any]) -> None:
        try:
            if topic.endswith("/position"):
                position = BusPosition.model_validate(payload)
                self.state.upsert_bus(position)
                self.broadcaster.publish(WSMessageType.BUS_POSITION, payload)
            elif topic.endswith("/observation"):
                # TODO (M5): observations land in memory and nowhere else — the
                # `observations` table is never written at runtime. M2 needs
                # history across a restart for TRAFFIC_WINDOW_MINUTES, and the
                # audit trail from an Event back to its raw evidence
                # (event_observations) has nothing to point at. Batch-insert
                # here rather than one row per message; at 6 buses x 15 fps a
                # per-message round trip will not keep up.
                self.state.add_observation(Observation.model_validate(payload))
            elif topic.endswith("/incident"):
                incident = IncidentReport.model_validate(payload)
                self.state.add_incident(incident)
                self.broadcaster.publish(WSMessageType.INCIDENT, payload)
        except Exception:
            # a malformed message from one bus must not take down the bridge
            log.exception("failed to handle mqtt message on %s", topic)
