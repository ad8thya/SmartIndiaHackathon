"""Watching the fleet drive over repaired road. Owned by M5.

Runs as a `Repeater` inside the API — no HTTP surface, because a re-scan is
something the world does, not something anyone calls. It reads the bus
positions the MQTT bridge is already putting into `LiveState` and decides
whether a repair has been corroborated as gone.

WHAT COUNTS AS A PASS
---------------------
A bus entering the stretch of its route that contains the defect, having
previously been outside it.

**By route progress, not by distance to a point.** Proximity to a sampled
position was the first attempt and it never fired once: the replay ticks once
a second at 60x, so a bus covers ~500 m between samples and simply teleports
over a 40 m radius. Measured against real telemetry the closest any bus came
to a repaired defect was 111 m. A test that a moving vehicle can jump over is
not a test.

`road_segment_id` encodes its own order along the route (`SEG-M1-000` is the
first of M1's five), and `BusPosition.progress` is where the bus is along that
route as a fraction. Segment k of n therefore occupies progress
[k/n, (k+1)/n] — **a band a bus cannot skip**, however coarse the sampling,
because progress is monotonic within a loop.

The entering edge still matters: a bus stuck in traffic inside the band is one
look at the road, not forty, and counting every tick would let one stationary
vehicle satisfy the whole threshold in under a minute.

Events with no `road_segment_id` fall back to the radius test. Those are rare
and the fallback is honest about being weaker.

WHAT MAKES A PASS DIRTY
-----------------------
The defect being re-detected **by the same standard that would confirm it in
the first place**: fresh observations of that class, at that place, from at
least `min_buses` distinct buses since the repair was claimed.

The symmetry runs all the way down. One bus not seeing a pothole is not
evidence it is gone; one bus seeing it again is not evidence it is still
there. A single re-detection can be a shadow, a wet patch, a manhole, or the
same model error that produced the original low-confidence sighting — which
is precisely why `services/cloud/consensus` never confirms on one bus either.
Resetting a crew's corroboration on one frame would let a single false
positive keep a closed work order open forever.

WHAT THIS DELIBERATELY DOES NOT DO
----------------------------------
It does not re-run the detector. `services/edge/defects` runs on the bus, and
its output arrives here as observations — asking it to re-analyse a frame the
API never had would mean shipping video to the cloud, which is the thing the
edge architecture exists to avoid.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from contracts import Event, WorkflowStatus, WSMessageType, haversine_m

from .policy import VerificationProgress, decayed, is_verified

#: route_id -> ordered road_segment_ids, built once from the seeded network.
#: Imported lazily inside the function that needs it so this module stays
#: importable without citydata (the tests construct segments by hand).
_SEGMENT_ORDER: dict[str, list[str]] | None = None


def _segment_order() -> dict[str, list[str]]:
    global _SEGMENT_ORDER
    if _SEGMENT_ORDER is None:
        from citydata import SEGMENTS

        order: dict[str, list[str]] = {}
        for segment in SEGMENTS:
            order.setdefault(segment.route_id, []).append(segment.road_id)
        for ids in order.values():
            ids.sort()
        _SEGMENT_ORDER = order
    return _SEGMENT_ORDER


def progress_band(road_segment_id: str | None) -> tuple[str, float, float] | None:
    """Where along its route one segment sits, as (route_id, start, end).

    `SEG-M1-002` is the third of M1's five, so it occupies progress 0.4-0.6.
    """
    if not road_segment_id:
        return None
    for route_id, ids in _segment_order().items():
        if road_segment_id in ids:
            index, total = ids.index(road_segment_id), len(ids)
            return route_id, index / total, (index + 1) / total
    return None


def progress_bands(
    road_segment_id: str | None, lat: float, lon: float, radius_m: float
) -> list[tuple[str, float, float]]:
    """Every route's band that covers this patch of tarmac.

    A band is per route, and that is not the same thing as a place. Three
    routes run over `EVR Periyar Salai`, and the seeded network models them as
    three separate segments — SEG-27B-003, SEG-570-003 and SEG-M1-001 — whose
    centres are **0 m apart**. A bus on 570 driving over the exact stone the
    27B pothole is in sits inside 570's band, not 27B's.

    Taking only the event's own segment therefore made cross-route
    corroboration impossible: every repair reached "clean passes from 1 bus"
    and stopped, on precisely the six segments where a second bus does exist.
    The band bought robustness against coarse sampling and quietly lost the
    thing the two-bus rule needs.

    So the bands are looked up by ROAD: the event's own segment, plus every
    segment co-located WITH THAT SEGMENT.

    Co-located with the segment, not with the event. An event is assigned to a
    segment by road, not by distance to its midpoint — one observed defect sat
    800 m from its own segment's centre, which is ordinary for a segment that
    is kilometres long. Searching around the *event* found nothing but the
    event's own route and silently reduced this back to the per-route
    behaviour it was written to replace: 19 clean passes, one bus, forever.
    Searching around the *segment* finds the roads that really are the same
    road.
    """
    from citydata import SEGMENTS

    by_id = {segment.road_id: segment for segment in SEGMENTS}
    anchor = by_id.get(road_segment_id or "")
    # No segment on the event: fall back to its own coordinates, which is all
    # there is to go on.
    anchor_lat, anchor_lon = (
        (anchor.center[1], anchor.center[0]) if anchor is not None else (lat, lon)
    )

    bands: list[tuple[str, float, float]] = []
    seen: set[str] = set()

    for segment in SEGMENTS:
        same_road = segment.road_id == road_segment_id or (
            haversine_m(anchor_lat, anchor_lon, segment.center[1], segment.center[0]) <= radius_m
        )
        if not same_road:
            continue
        band = progress_band(segment.road_id)
        if band is not None and band[0] not in seen:
            seen.add(band[0])
            bands.append(band)

    return bands

log = logging.getLogger("urban-twin.repair-verification")


def _newest_ts(observations: list[object]) -> datetime | None:
    """The latest timestamp in the buffer, on the buffer's own clock."""
    stamps = [getattr(o, "ts", None) for o in observations]
    real = [ts for ts in stamps if ts is not None]
    return max(real) if real else None

#: The rung a repair sits at while the fleet is being asked to confirm it.
PENDING_STATUS = WorkflowStatus.REPAIR_COMPLETED


class RepairVerifier:
    """Tracks repaired defects until the fleet corroborates them, or stalls."""

    def __init__(
        self,
        *,
        passes: int,
        min_buses: int,
        radius_m: float,
        decay: float,
        stall_hours: float,
    ) -> None:
        self.passes = passes
        self.min_buses = min_buses
        self.radius_m = radius_m
        self.decay = decay
        self.stall_after = timedelta(hours=stall_hours)
        self._progress: dict[str, VerificationProgress] = {}
        #: (event_id, bus_id) pairs currently inside the radius, so a bus has
        #: to leave and come back before it counts again.
        self._inside: set[tuple[str, str]] = set()

    # ── reads ───────────────────────────────────────────────────────────────
    def progress_for(self, event_id: str) -> VerificationProgress | None:
        return self._progress.get(event_id)

    def all_progress(self) -> list[VerificationProgress]:
        return list(self._progress.values())

    def is_stalled(self, progress: VerificationProgress, now: datetime | None = None) -> bool:
        """No bus has driven this road for long enough that a crew should be
        told, rather than left watching a counter that is not moving."""
        now = now or datetime.now(tz=UTC)
        since = progress.last_pass_at or progress.pending_since
        return since is not None and (now - since) > self.stall_after

    def can_ever_verify(self, progress: VerificationProgress) -> bool:
        """Whether the distinct-bus threshold is reachable at all here.

        On this network there is ONE BUS PER ROUTE and only 6 of 26 segments
        are within reach of a second route, so on most roads a second bus will
        never come. Counting toward a total that cannot be reached is the
        "awaiting next pass" dead end one level further along, so the crew is
        told the truth instead and offered manual sign-off.
        """
        return len(progress.buses_seen) >= self.min_buses or self.min_buses <= 1

    # ── the tick ────────────────────────────────────────────────────────────
    def observe(
        self,
        *,
        events: list[Event],
        bus_positions: dict[str, object],
        recent_observations: list[object],
        now: datetime | None = None,
    ) -> list[tuple[Event, VerificationProgress, bool]]:
        """One sweep. Returns (event, progress, verified) for anything that moved.

        Pure with respect to the API: it mutates only its own state and hands
        back what changed, so the caller owns persistence and broadcasting and
        this stays testable without a database or a socket.
        """
        now = now or datetime.now(tz=UTC)
        pending = [event for event in events if event.status is PENDING_STATUS]
        live = {event.event_id.hex for event in pending}

        # Forget anything that left the pending rung, so a re-opened defect
        # starts its corroboration again rather than inheriting stale credit.
        for gone in set(self._progress) - live:
            self._progress.pop(gone, None)

        changed: list[tuple[Event, VerificationProgress, bool]] = []

        for event in pending:
            key = event.event_id.hex
            progress = self._progress.get(key)
            if progress is None:
                progress = VerificationProgress(
                    event_id=key,
                    road_segment_id=event.road_segment_id,
                    confidence=event.fused_confidence,
                    pending_since=now,
                    # The stream's own clock, not the wall clock. See the
                    # field's docstring — this is the difference between "the
                    # defect was seen again" and "the defect was seen before
                    # the repair, on a clock that runs four hours fast".
                    observations_watermark=_newest_ts(recent_observations),
                )
                self._progress[key] = progress

            bands = progress_bands(
                event.road_segment_id, event.lat, event.lon, self.radius_m
            )

            for bus_id, position in bus_positions.items():
                inside_now = self._is_on_the_defect(event, position, bands)
                pair = (key, bus_id)
                was_inside = pair in self._inside

                if inside_now:
                    self._inside.add(pair)
                else:
                    self._inside.discard(pair)

                # Only the entering edge is a pass.
                if not inside_now or was_inside:
                    continue

                progress.buses_seen.add(bus_id)
                progress.last_pass_at = now

                seen_again = self._defect_corroborated_again(
                    event, recent_observations, since=progress.observations_watermark
                )
                if seen_again:
                    progress.dirty_passes += 1
                    progress.clean_by_bus.clear()
                    progress.confidence = event.fused_confidence
                    log.info(
                        "%s: %s saw the defect again — repair not confirmed", key[:8], bus_id
                    )
                    changed.append((event, progress, False))
                    continue

                progress.clean_by_bus[bus_id] = progress.clean_by_bus.get(bus_id, 0) + 1
                verified = is_verified(progress, passes=self.passes, min_buses=self.min_buses)

                if not verified:
                    # Below threshold: decay, do not close. Evidence of absence
                    # lowers belief; it does not by itself end the case.
                    progress.confidence = decayed(progress.confidence, self.decay)
                    log.info(
                        "%s: clean pass %d/%d from %s (%d/%d buses) — confidence %.3f",
                        key[:8],
                        progress.clean_passes,
                        self.passes,
                        bus_id,
                        progress.distinct_clean_buses,
                        self.min_buses,
                        progress.confidence,
                    )
                else:
                    log.info(
                        "%s: verified — %d clean passes from %d buses",
                        key[:8],
                        progress.clean_passes,
                        progress.distinct_clean_buses,
                    )

                changed.append((event, progress, verified))

        return changed

    def _is_on_the_defect(
        self, event: Event, position: object, bands: list[tuple[str, float, float]]
    ) -> bool:
        """Is this bus currently on the stretch of road the defect is on?

        Any route's band over that tarmac counts — a bus cannot jump over a
        band the way it jumps over a 40 m circle, and looking up bands by
        place rather than by the event's own segment is what lets a second
        route's bus corroborate. Distance to the point is the fallback, used
        only when no segment covers the defect at all.
        """
        if bands:
            route_id = getattr(position, "route_id", None)
            progress = float(getattr(position, "progress", 0.0) or 0.0)
            return any(
                route_id == band_route and start <= progress < end
                for band_route, start, end in bands
            )

        return (
            haversine_m(
                event.lat,
                event.lon,
                position.lat,  # type: ignore[attr-defined]
                position.lon,  # type: ignore[attr-defined]
            )
            <= self.radius_m
        )

    def _defect_corroborated_again(
        self, event: Event, observations: list[object], *, since: datetime | None
    ) -> bool:
        """Have enough DISTINCT buses re-detected this defect since the repair?

        The same threshold that governs disappearance governs reappearance.
        One camera reporting a pothole where a crew just laid tarmac is as
        weak as one camera failing to report one — it can be a shadow, a wet
        patch, a manhole cover, or the same model error that produced the
        original low-confidence sighting. Requiring corroboration in both
        directions is what stops a single false positive holding a completed
        work order open indefinitely.
        """
        buses: set[str] = set()
        for observation in observations:
            if observation.detection_class is not event.detection_class:  # type: ignore[attr-defined]
                continue
            # STRICTLY newer than the watermark. `<` would count the very
            # observations the watermark was read from, so a repair would be
            # contradicted by the last sighting before it.
            if since is not None and observation.ts <= since:  # type: ignore[attr-defined]
                continue
            if (
                haversine_m(
                    event.lat,
                    event.lon,
                    observation.lat,  # type: ignore[attr-defined]
                    observation.lon,  # type: ignore[attr-defined]
                )
                <= self.radius_m
            ):
                buses.add(observation.bus_id)  # type: ignore[attr-defined]
                if len(buses) >= self.min_buses:
                    return True
        return False


__all__ = ["PENDING_STATUS", "RepairVerifier", "VerificationProgress", "WSMessageType"]
