"""Background task: observations → events → websocket → postgres. Owned by M5.

This is the loop that makes pins appear and escalate during a demo. Every few
seconds it hands the observation buffer to M3's fuser, diffs the result against
what the UI already knows, and pushes only the changes.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from contracts import Event

from services.fusion import get_event_fuser

from .config import ApiSettings
from .hub import Broadcaster, LiveState

log = logging.getLogger("urban-twin.fusion")


class FusionLoop:
    def __init__(self, settings: ApiSettings, state: LiveState, broadcaster: Broadcaster) -> None:
        self.settings = settings
        self.state = state
        self.broadcaster = broadcaster
        self._pending: dict[str, Event] = {}

    async def tick(self) -> None:
        observations = self.state.recent_observations()
        if not observations:
            return

        events = get_event_fuser().fuse(observations)
        changed = 0

        for event in events:
            previous = self.state.events.get(event.event_id)
            if previous is not None and _same(previous, event):
                continue
            # a human decision outranks the fuser: never demote an event that an
            # operator has already moved along the workflow
            if previous is not None and _human_owned(previous):
                event = event.model_copy(
                    update={
                        "status": previous.status,
                        "assigned_team": previous.assigned_team,
                    }
                )
                if _same(previous, event):
                    continue

            message_type = self.state.apply_event(event)
            self.broadcaster.publish(message_type, event.model_dump(mode="json"))
            self._pending[str(event.event_id)] = event
            changed += 1

        if changed:
            log.debug("fused %d observations → %d changed events", len(observations), changed)
            await self._flush()

    async def _flush(self) -> None:
        """Persist changed events. Failure here is survivable — memory is still right."""
        if not self._pending:
            return
        batch = list(self._pending.values())[: self.settings.EVENT_FLUSH_BATCH]
        try:
            from db import Event as EventRow
            from db import point, session_scope
            from sqlalchemy.dialects.postgresql import insert

            rows = [
                {
                    "event_id": event.event_id,
                    "geom": point(event.lat, event.lon),
                    "road_segment_id": event.road_segment_id,
                    "detection_class": str(event.detection_class),
                    "severity": str(event.severity),
                    "fused_confidence": event.fused_confidence,
                    "observation_count": event.observation_count,
                    "distinct_bus_count": event.distinct_bus_count,
                    "first_seen": event.first_seen,
                    "last_seen": event.last_seen,
                    "status": str(event.status),
                    "assigned_team": event.assigned_team,
                    "sla_due": event.sla_due,
                    "evidence_uris": event.evidence_uris,
                    "updated_at": datetime.now(tz=UTC),
                }
                for event in batch
            ]
            async with session_scope() as session:
                statement = insert(EventRow).values(rows)
                await session.execute(
                    statement.on_conflict_do_update(
                        index_elements=[EventRow.event_id],
                        set_={
                            "fused_confidence": statement.excluded.fused_confidence,
                            "observation_count": statement.excluded.observation_count,
                            "distinct_bus_count": statement.excluded.distinct_bus_count,
                            "last_seen": statement.excluded.last_seen,
                            "status": statement.excluded.status,
                            "severity": statement.excluded.severity,
                            "evidence_uris": statement.excluded.evidence_uris,
                            "updated_at": statement.excluded.updated_at,
                        },
                    )
                )
            for event in batch:
                self._pending.pop(str(event.event_id), None)
        except Exception as exc:
            log.warning("event flush deferred (%s) — memory cache is still current", exc)


def _same(a: Event, b: Event) -> bool:
    """Only push a frame when something the UI renders has actually changed."""
    return (
        a.status == b.status
        and a.severity == b.severity
        and a.observation_count == b.observation_count
        and a.distinct_bus_count == b.distinct_bus_count
        and abs(a.fused_confidence - b.fused_confidence) < 0.005
    )


def _human_owned(event: Event) -> bool:
    from contracts import STATUS_ORDER, WorkflowStatus

    return STATUS_ORDER[event.status] > STATUS_ORDER[WorkflowStatus.AUTHORITY_NOTIFIED]
