"""WS /ws/live — the realtime channel. Owned by M5.

One envelope shape for everything (``contracts.WSMessage``), discriminated on
``type``. M6 writes one parser and never has to renegotiate.

On connect the client gets a HELLO carrying the whole current picture, so the
map is correct immediately rather than filling in as messages trickle past.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging

from contracts import WSMessage, WSMessageType
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..hub import broadcaster, state
from ..projection import PUBLIC_STATUSES, is_public, project_event, project_payload

log = logging.getLogger("urban-twin.ws")
router = APIRouter(tags=["realtime"])


@router.websocket("/ws/live")
async def live(
    websocket: WebSocket,
    audience: str = Query(
        default="operator",
        description="'public' strips operator-only fields and non-public events",
    ),
    reporter: str | None = Query(
        default=None,
        description="on a public socket, receive report updates for this reporter only",
    ),
) -> None:
    """The realtime channel.

    `audience=public` is the citizen socket. It is not a display preference:
    the projection happens before `send_text`, so a citizen's device never
    receives `fused_confidence`, `assigned_team` or the rest, and never
    receives an event below AUTHORITY_NOTIFIED at all.

    Filtering the REST fetch but not this would look correct for the first
    second of a session and leak for the rest of it — the fetch happens once,
    the socket runs for as long as the app is open.
    """
    await websocket.accept()
    public = audience == "public"
    queue = broadcaster.subscribe()
    log.info(
        "websocket connected, audience=%s (%d total)",
        "public" if public else "operator",
        broadcaster.subscriber_count,
    )

    try:
        await websocket.send_text(_hello(public=public).model_dump_json())
        pump = asyncio.create_task(
            _pump(websocket, queue, public=public, reporter=reporter if public else None)
        )
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


async def _pump(
    websocket: WebSocket,
    queue: asyncio.Queue[str],
    *,
    public: bool,
    reporter: str | None,
) -> None:
    while True:
        message = await queue.get()
        if public:
            projected = _for_public(message, reporter=reporter)
            if projected is None:
                continue
            message = projected
        await websocket.send_text(message)


#: Frame types a public socket may receive AT ALL. An allowlist, not a
#: denylist, and that distinction is load-bearing: the first version passed
#: unrecognised types straight through, which quietly forwarded INCIDENT —
#: a collision dossier carrying evidence URIs, a written narrative and a
#: plate hash — to every citizen device with the app open.
#:
#: Adding a message type must therefore be a deliberate decision about whether
#: the public may see it, not something that happens by default.
_PUBLIC_FRAME_TYPES: frozenset[str] = frozenset(
    {
        WSMessageType.HELLO.value,
        WSMessageType.EVENT_NEW.value,
        WSMessageType.EVENT_UPDATED.value,
        WSMessageType.ROAD_CONDITION.value,
        WSMessageType.BUS_POSITION.value,
        WSMessageType.TICK.value,
    }
)

#: Report frames are conditionally allowed: a citizen receives updates about
#: THEIR OWN reports and nobody else's. See `_is_mine`.
_REPORT_FRAME_TYPES: frozenset[str] = frozenset(
    {WSMessageType.REPORT_NEW.value, WSMessageType.REPORT_UPDATED.value}
)

#: Deliberately absent from the allowlist above:
#:   INCIDENT           — collision dossier: narrative, evidence, plate hash
#:   INCIDENT_RESPONSE  — which crew is responding, and when


def _is_mine(payload: dict[str, object], reporter: str | None) -> bool:
    """Whether this report belongs to the citizen on the other end.

    Matched on `reporter_name`, which is the display name the phone signed in
    with. That is exactly as weak as it sounds — this prototype has no
    authentication (see apps/mobile/src/store/session.ts), so there is no
    identity to match on and a client could claim any name.

    It is still worth doing. Without it a citizen socket receives every
    report every other citizen files, names included, which is a different
    and worse thing than a weak filter. When real auth arrives this becomes a
    check against the authenticated subject and nothing else changes.

    A socket that gave no `reporter` gets no report frames at all — the safe
    default, since "no name" cannot mean "everyone's".
    """
    if not reporter:
        return False
    return payload.get("reporter_name") == reporter


def _for_public(message: str, *, reporter: str | None = None) -> str | None:
    """Project one frame for a citizen socket, or drop it entirely.

    Returns None when the frame must not be sent — an event below
    AUTHORITY_NOTIFIED is not "an event with fewer fields", it is not the
    public's business that it exists at all.

    Anything unparseable or unrecognised is dropped rather than forwarded.
    That is the safe direction: forwarding an unknown shape from an operator
    channel to a public one is exactly the leak this function exists to stop.
    """
    try:
        frame = json.loads(message)
    except (ValueError, TypeError):
        return None

    frame_type = frame.get("type")

    if frame_type in _REPORT_FRAME_TYPES:
        # A citizen's own report, and only their own. CitizenReport carries no
        # operator fields, so the payload passes through unprojected — what it
        # does carry is the reporter's own name, which is theirs to see.
        return message if _is_mine(frame.get("payload") or {}, reporter) else None

    if frame_type not in _PUBLIC_FRAME_TYPES:
        return None

    if frame_type not in {WSMessageType.EVENT_NEW.value, WSMessageType.EVENT_UPDATED.value}:
        return message

    payload = frame.get("payload") or {}
    if payload.get("status") not in {status.value for status in PUBLIC_STATUSES}:
        return None

    frame["payload"] = project_payload(payload)
    return json.dumps(frame)


# TODO (M5): the events array below comes from LiveState only, not from
# routers/events.py::merged_events(), so a fresh browser against a fresh API
# gets an empty map until the REST bootstrap lands. Harmless today only because
# App.tsx calls bootstrap() alongside connect() — but HELLO and /api/events can
# disagree, which is the same class of bug as the open_events drift.
def _hello(*, public: bool = False) -> WSMessage:
    from datetime import UTC, datetime

    return WSMessage(
        type=WSMessageType.HELLO,
        ts=datetime.now(tz=UTC),
        payload={
            "buses": [position.model_dump(mode="json") for position in state.buses.values()],
            # The opening snapshot is the largest single payload a client ever
            # receives, so it is the worst place to forget the projection.
            "events": [
                project_event(event) if public else event.model_dump(mode="json")
                for event in state.event_list()
                if not public or is_public(event)
            ],
            # Incident dossiers carry narratives and plate evidence. A citizen
            # socket gets none of them — this is not a projection, it is an
            # omission, and there is no public incident feed by design.
            "incidents": []
            if public
            else [incident.model_dump(mode="json") for incident in list(state.incidents)[:50]],
            "server_time": datetime.now(tz=UTC).isoformat(),
        },
    )
