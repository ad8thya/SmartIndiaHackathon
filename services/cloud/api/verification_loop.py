"""The repair-verification tick. Owned by M5.

Glue between `services/cloud/repair_verification` — which knows the rule and
nothing about HTTP — and the API's state, database and socket. Runs as a
`Repeater`, the same way fusion does: a re-scan is something the world does
as buses drive, not something a client calls.
"""

from __future__ import annotations

import logging

from contracts import Event, WorkflowStatus, WSMessageType

from services.cloud.repair_verification import RepairVerifier

from .config import ApiSettings
from .hub import Broadcaster, LiveState

log = logging.getLogger("urban-twin.repair-verification")


class VerificationLoop:
    """Watches the fleet drive over repaired road and closes what it confirms."""

    def __init__(self, settings: ApiSettings, state: LiveState, broadcaster: Broadcaster) -> None:
        self.state = state
        self.broadcaster = broadcaster
        self.verifier = RepairVerifier(
            passes=settings.REPAIR_VERIFY_PASSES,
            min_buses=settings.REPAIR_VERIFY_MIN_BUSES,
            radius_m=settings.REPAIR_VERIFY_RADIUS_M,
            decay=settings.REPAIR_VERIFY_DECAY,
            stall_hours=settings.REPAIR_VERIFY_STALL_HOURS,
        )

    async def tick(self) -> None:
        changed = self.verifier.observe(
            events=self.state.event_list(),
            bus_positions=self.state.buses,
            recent_observations=self.state.recent_observations(500),
        )

        for event, progress, verified in changed:
            if verified:
                await self._close(event)
            else:
                # Below threshold, or the defect was seen again. Either way the
                # case stays open and only the system's belief moves.
                self._decay(event, progress.confidence)

    def _decay(self, event: Event, confidence: float) -> None:
        """Lower fused_confidence without touching the workflow rung.

        The mirror of fusion raising it. A crew's screen shows this as clean
        passes accumulating; nothing closes until the threshold is met.
        """
        if confidence == event.fused_confidence:
            return
        updated = event.model_copy(update={"fused_confidence": confidence})
        self.state.replace_event(updated)
        self.broadcaster.publish(WSMessageType.EVENT_UPDATED, updated.model_dump(mode="json"))

    async def _close(self, event: Event) -> None:
        """The fleet corroborated the repair. Close it, and tell everyone.

        Routed through the events router's own status path rather than writing
        the row here, so an auto-verification and an operator's PATCH take the
        identical route — including the citizen-report propagation, which is
        how somebody who reported the pothole finds out it is gone.
        """
        from .routers.events import apply_status_change

        await apply_status_change(
            event_id=event.event_id,
            status=WorkflowStatus.VERIFIED,
            state=self.state,
            broadcaster=self.broadcaster,
            notes="Auto-verified: the fleet re-scanned this road and the defect is gone.",
        )
        log.info("auto-verified %s", event.event_id)
