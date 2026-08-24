"""M3 MOCK — pedestrian sightings, with occasional risk near school zones.

Behaviour the demo depends on:

  * away from a school zone the bus sees ordinary PEDESTRIANs at a low rate
  * inside one of the three seeded school zones the rate climbs, and a fraction
    of those become PEDESTRIAN_RISK
  * a bus doing more than the zone speed limit escalates risk sharply, which is
    the story the RiskPanel tells: *speed near schools is the controllable
    variable*

PEDESTRIAN and PEDESTRIAN_RISK are not infrastructure classes, so they carry no
severity — the Observation validator only demands severity for the eight defect
classes.
"""

from __future__ import annotations

import random
from uuid import uuid4

from citydata import SCHOOL_ZONES, SchoolZoneSpec, haversine_m
from contracts import BBox, DetectionClass, Frame, FrameMeta, Observation

from .config import PedestrianSettings, get_settings


class MockPedestrianRiskDetector:
    """Satisfies :class:`contracts.PedestrianRiskDetector`."""

    def __init__(self, settings: PedestrianSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._zones = list(SCHOOL_ZONES)
        self._track_seq = 1000

    # ── Protocol ────────────────────────────────────────────────────────────
    def detect(self, frame: Frame, meta: FrameMeta) -> list[Observation]:
        rng = random.Random(f"ped:{meta.bus_id}:{meta.frame_idx}:{meta.ts.timestamp():.0f}")
        zone = self._zone_containing(meta)

        if zone is None:
            # ordinary street: the occasional pedestrian, never flagged as risk
            if rng.random() > 0.06:
                return []
            return [self._observation(meta, rng, DetectionClass.PEDESTRIAN, zone=None)]

        observations = [
            self._observation(meta, rng, DetectionClass.PEDESTRIAN, zone=zone)
            for _ in range(rng.randint(1, 3))
        ]

        if rng.random() < self._risk_probability(meta):
            observations.append(
                self._observation(meta, rng, DetectionClass.PEDESTRIAN_RISK, zone=zone)
            )
        return observations

    # ── internals ───────────────────────────────────────────────────────────
    def _zone_containing(self, meta: FrameMeta) -> SchoolZoneSpec | None:
        for zone in self._zones:
            distance = haversine_m(meta.lat, meta.lon, zone.center[1], zone.center[0])
            if distance <= max(zone.radius_m, self.settings.SCHOOL_ZONE_RADIUS_M):
                return zone
        return None

    def _risk_probability(self, meta: FrameMeta) -> float:
        """Speeding past a school is the thing that turns a sighting into a risk."""
        probability = self.settings.RISK_EVENT_RATE
        over = meta.speed_kmph - self.settings.SCHOOL_ZONE_SPEED_LIMIT_KMPH
        if over > 0:
            probability += min(0.4, over * 0.02)
        return min(probability, 0.9)

    def _observation(
        self,
        meta: FrameMeta,
        rng: random.Random,
        detection_class: DetectionClass,
        zone: SchoolZoneSpec | None,
    ) -> Observation:
        self._track_seq += 1
        is_risk = detection_class is DetectionClass.PEDESTRIAN_RISK
        confidence = rng.uniform(0.71, 0.94) if is_risk else rng.uniform(0.55, 0.88)

        # people appear roughly where the bus is, spread across the carriageway
        spread = 1.2e-4 if zone is not None else 2.0e-4
        return Observation(
            obs_id=uuid4(),
            bus_id=meta.bus_id,
            route_id=meta.route_id,
            ts=meta.ts,
            lat=meta.lat + rng.uniform(-spread, spread),
            lon=meta.lon + rng.uniform(-spread, spread),
            gps_accuracy_m=meta.gps_accuracy_m,
            heading_deg=meta.heading_deg,
            speed_kmph=meta.speed_kmph,
            detection_class=detection_class,
            raw_confidence=round(confidence, 3),
            severity=None,  # not an infrastructure class — severity stays None
            bbox=self._person_bbox(rng),
            track_id=self._track_seq,
            evidence_uri=(
                f"{self.settings.PEDESTRIAN_EVIDENCE_BASE_URI}/"
                f"ped-{(zone.zone_id if zone else 'street')}-{uuid4().hex[:10]}.jpg"
            )
            if is_risk
            else None,
        )

    @staticmethod
    def _person_bbox(rng: random.Random) -> BBox:
        """Roughly person-shaped: about 1:2.5 width to height, upright in frame."""
        height = rng.uniform(90, 260)
        width = height / rng.uniform(2.2, 3.0)
        x1 = rng.uniform(40, 1280 - width - 40)
        y1 = rng.uniform(200, 720 - height - 20)
        return BBox(
            x1=round(x1, 1), y1=round(y1, 1), x2=round(x1 + width, 1), y2=round(y1 + height, 1)
        )
