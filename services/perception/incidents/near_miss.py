"""M4 · Near-miss detection — mock scaffolding for the AI intelligence layer.

This is the platform's most novel feature: a vehicle-pedestrian conflict with
no contact, quantified by time-to-collision. See `impl.py` for the fully
commented TODO on the real approach — it needs ZERO new models.

Two things live here, and they are deliberately independent:

  1. `MockNearMissDetector` — scripted, per-tick, called from the replay
     simulator like the other perception mocks. It fires once per junction per
     replay loop and emits an Observation with `detection_class=NEAR_MISS`,
     which flows through the *normal fusion path* exactly like a pothole or a
     collision (see `contracts.FUSABLE_CLASSES`). This is what makes near-miss
     events show up as escalating workflow items on the map.

  2. `scripted_near_misses()` — a pure function over the same three junctions,
     independent of replay having run at all. `GET /api/near-misses` calls
     this directly (the same "ask the detector for the scripted scene" pattern
     `routers/incidents.py` already uses for the hit-and-run dossier), so the
     rich `NearMissEvent` list (TTC, track ids, closing speed) is always
     available even from a cold API process in a different container from the
     replay simulator.

Both read the same `_JUNCTIONS` table, so the two views of "near-miss" never
disagree about where or how severe.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid5

from citydata import haversine_m, segment_by_id
from contracts import DetectionClass, Frame, FrameMeta, NearMissEvent, Observation, Severity

#: stable namespace so a scripted junction keeps the same nm_id run after run
_NM_NAMESPACE = UUID("7b3d9a10-4e2a-4c8b-9a77-1f6d5c2e8b90")


@dataclass(frozen=True)
class _Junction:
    """A plausible near-miss scene: a school-adjacent crossing on a seeded
    corridor, watched by one specific bus on its route.

    ``lat``/``lon`` are derived from the segment's own centre (via
    ``citydata.segment_by_id``), not hand-picked — a hand-picked coordinate
    near a school zone can miss the route's actual polyline by a kilometre,
    and then the bus that is supposed to witness it never comes within range.
    """

    key: str
    road_id: str
    bus_id: str
    lat: float
    lon: float
    min_ttc_seconds: float
    closing_speed_kmph: float
    severity: Severity
    near: str  # narrative only — the school zone this junction is styled on


def _junction(
    key: str,
    road_id: str,
    bus_id: str,
    min_ttc_seconds: float,
    closing_speed_kmph: float,
    severity: Severity,
    near: str,
) -> _Junction:
    lon, lat = segment_by_id(road_id).center
    return _Junction(
        key, road_id, bus_id, lat, lon, min_ttc_seconds, closing_speed_kmph, severity, near
    )


#: Three scripted junctions, one per route, styled on real school zones from
#: citydata.SCHOOL_ZONES — the same reason M3's pedestrian mock fires there.
#: Do not renumber these keys, the nm_id is derived from them.
_JUNCTIONS: tuple[_Junction, ...] = (
    _junction(
        key="ra-puram-crossing",
        road_id="SEG-27B-002",
        bus_id="MTC-ADYAR-1042",
        min_ttc_seconds=0.6,
        closing_speed_kmph=42.0,
        severity=Severity.LARGE,
        near="Chettinad Vidyashram, R.A. Puram",
    ),
    _junction(
        key="gopalapuram-signal",
        road_id="SEG-42A-002",
        bus_id="MTC-PERAMBUR-2217",
        min_ttc_seconds=1.1,
        closing_speed_kmph=22.0,
        severity=Severity.MEDIUM,
        near="DAV Boys, Gopalapuram",
    ),
    _junction(
        key="nungambakkam-crossing",
        road_id="SEG-570-002",
        bus_id="MTC-KOYAMBEDU-4408",
        min_ttc_seconds=0.9,
        closing_speed_kmph=30.0,
        severity=Severity.MEDIUM,
        near="Chennai Girls Hr Sec, Nungambakkam",
    ),
)

#: bus passing within this radius of a junction counts as witnessing it
_TRIGGER_RADIUS_M = 300.0


def _confidence_from_ttc(ttc_seconds: float) -> float:
    """Lower TTC reads as a more unambiguous, more confident detection —
    a near-collision is easier to be sure about than a borderline one."""
    return round(max(0.55, min(0.95, 1.4 - ttc_seconds * 0.4)), 2)


def _build_event(junction: _Junction, ts: datetime, vehicle_track_id: int) -> NearMissEvent:
    return NearMissEvent(
        nm_id=uuid5(_NM_NAMESPACE, junction.key),
        lat=junction.lat,
        lon=junction.lon,
        road_id=junction.road_id,
        ts=ts,
        bus_id=junction.bus_id,
        vehicle_track_id=vehicle_track_id,
        pedestrian_track_id=vehicle_track_id + 1,
        min_ttc_seconds=junction.min_ttc_seconds,
        closing_speed_kmph=junction.closing_speed_kmph,
        severity=junction.severity,
        evidence_uri=f"s3://urban-twin/evidence/near-miss-{junction.key}.jpg",
    )


def _near_miss_to_observation(nm: NearMissEvent, meta: FrameMeta) -> Observation:
    return Observation(
        bus_id=nm.bus_id,
        route_id=meta.route_id,
        ts=nm.ts,
        lat=nm.lat,
        lon=nm.lon,
        gps_accuracy_m=meta.gps_accuracy_m,
        heading_deg=meta.heading_deg,
        speed_kmph=meta.speed_kmph,
        detection_class=DetectionClass.NEAR_MISS,
        raw_confidence=_confidence_from_ttc(nm.min_ttc_seconds),
        severity=nm.severity,
        evidence_uri=nm.evidence_uri,
        track_id=nm.vehicle_track_id,
    )


class MockNearMissDetector:
    """Scripted near-miss events at three plausible junctions.

    Same "fires once per replay loop" shape as `MockIncidentDetector`'s
    scripted hit-and-run: each junction fires once, `reset()` re-arms all
    three for the next loop, so the demo tells the same three stories every
    time it runs.
    """

    def __init__(self) -> None:
        self._fired: set[str] = set()
        self._track_seq = 700
        #: every NearMissEvent this instance has emitted, for callers that
        #: want the rich model rather than the Observation it produced
        self.history: list[NearMissEvent] = []

    def detect(self, frame: Frame, meta: FrameMeta) -> list[Observation]:
        """`frame` is ignored, exactly like the incident mock: this reads
        geography and the bus id, not pixels."""
        observations: list[Observation] = []
        for junction in _JUNCTIONS:
            if junction.key in self._fired:
                continue
            if meta.bus_id != junction.bus_id:
                continue
            if haversine_m(meta.lat, meta.lon, junction.lat, junction.lon) > _TRIGGER_RADIUS_M:
                continue

            self._fired.add(junction.key)
            self._track_seq += 2
            nm = _build_event(junction, meta.ts, self._track_seq)
            self.history.append(nm)
            observations.append(_near_miss_to_observation(nm, meta))
        return observations

    def reset(self) -> None:
        """Let every scripted junction fire again — the replay loop calls this
        at each terminus, same as the incident detector."""
        self._fired.clear()


def scripted_near_misses(now: datetime) -> list[NearMissEvent]:
    """The ~3 scripted near-miss events, independent of replay having run.

    Deterministic and pure: same `now` in, same events out, spread over the
    last few days so `since`/bbox filtering on `GET /api/near-misses` has
    something to filter.
    """
    events: list[NearMissEvent] = []
    for index, junction in enumerate(_JUNCTIONS):
        ts = now - timedelta(hours=6 + index * 30)
        events.append(_build_event(junction, ts, 700 + index * 2))
    return events
