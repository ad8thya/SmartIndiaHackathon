"""WS /ws/live — the realtime channel. Owned by M5.

One envelope shape for everything (``contracts.WSMessage``), discriminated on
``type``. M6 writes one parser and never has to renegotiate.

On connect the client gets a HELLO carrying the whole current picture, so the
map is correct immediately rather than filling in as messages trickle past.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from contracts import WSMessage, WSMessageType
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..hub import broadcaster, state

log = logging.getLogger("urban-twin.ws")
router = APIRouter(tags=["realtime"])


@router.websocket("/ws/live")
async def live(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = broadcaster.subscribe()
    log.info("websocket connected (%d total)", broadcaster.subscriber_count)

    try:
        await websocket.send_text(_hello().model_dump_json())
        pump = asyncio.create_task(_pump(websocket, queue))
        try:
            # we do not expect client messages, but reading keeps the socket
            # honest and gives us a clean disconnect signal
            while True:
                await websocket.receive_text()
        finally:
            pump.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await pump
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket failed")
    finally:
        broadcaster.unsubscribe(queue)
        log.info("websocket closed (%d remain)", broadcaster.subscriber_count)


async def _pump(websocket: WebSocket, queue: asyncio.Queue[str]) -> None:
    while True:
        message = await queue.get()
        await websocket.send_text(message)


# TODO (M5): the events array below comes from LiveState only, not from
# routers/events.py::merged_events(), so a fresh browser against a fresh API
# gets an empty map until the REST bootstrap lands. Harmless today only because
# App.tsx calls bootstrap() alongside connect() — but HELLO and /api/events can
# disagree, which is the same class of bug as the open_events drift.
def _hello() -> WSMessage:
    from datetime import UTC, datetime

    return WSMessage(
        type=WSMessageType.HELLO,
        ts=datetime.now(tz=UTC),
        payload={
            "buses": [position.model_dump(mode="json") for position in state.buses.values()],
            "events": [event.model_dump(mode="json") for event in state.event_list()],
            "incidents": [
                incident.model_dump(mode="json") for incident in list(state.incidents)[:50]
            ],
            "server_time": datetime.now(tz=UTC).isoformat(),
        },
    )
