"""M1 MOCK — plausible road defects without a single tensor.

The demo runs on this for the first four days, so it is written to be
*convincing* rather than minimal:

  * defects appear at fixed hotspots (``citydata.DEFECT_HOTSPOTS``) so the same
    pothole shows up every lap and fusion has something to corroborate
  * confidence jitters around a per-hotspot baseline, so the fused confidence
    climbs the way it would with a real detector
  * severity follows the hotspot's IRC class, with occasional one-step drift
  * a small fraction of frames produce an unscripted new defect, so the map
    keeps growing during a long demo

Determinism: the RNG is seeded per (bus, hotspot) pass, so a replay at the same
speed produces the same story twice. That matters when you are rehearsing.
"""

from __future__ import annotations

import random
from uuid import uuid4

from citydata import DEFECT_HOTSPOTS, HotspotSpec, haversine_m
from contracts import (
    BBox,
    DetectionClass,
    Frame,
    FrameMeta,
    Observation,
    Severity,
)

from .config import DefectSettings, get_settings

#: classes the "novel defect" path is allowed to invent
_NOVEL_CLASSES = (
    DetectionClass.POTHOLE,
    DetectionClass.LONGITUDINAL_CRACK,
    DetectionClass.TRANSVERSE_CRACK,
    DetectionClass.FADED_ZEBRA,
)

_SEVERITY_LADDER = (Severity.SMALL, Severity.MEDIUM, Severity.LARGE)


class MockDefectDetector:
    """Satisfies :class:`contracts.DefectDetector`. No model, no GPU, no frame."""

    def __init__(self, settings: DefectSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._hotspots = list(DEFECT_HOTSPOTS)
        #: how many times each (bus, hotspot) pair has fired — drives confidence growth
        self._pass_count: dict[tuple[str, str], int] = {}

    # ── Protocol ────────────────────────────────────────────────────────────
    def detect(self, frame: Frame, meta: FrameMeta) -> list[Observation]:
        """Return the defects visible from this bus at this instant.

        ``frame`` is ignored — the mock reads geography, not pixels.
        """
        if meta.speed_kmph < self.settings.DEFECT_MIN_SPEED_KMPH:
            # a stopped bus produces near-identical frames; a real detector
            # would flood the pipeline, so both mock and impl suppress here
            return []

        rng = random.Random(f"{meta.bus_id}:{meta.frame_idx}:{meta.ts.timestamp():.0f}")
        observations: list[Observation] = []

        for hotspot in self._nearby(meta):
            observations.append(self._observation_for(hotspot, meta, rng))

        if rng.random() < self.settings.DEFECT_NOVEL_RATE:
            observations.append(self._novel_observation(meta, rng))

        return observations

    # ── internals ───────────────────────────────────────────────────────────
    def _nearby(self, meta: FrameMeta) -> list[HotspotSpec]:
        radius = self.settings.DEFECT_HOTSPOT_RADIUS_M
        return [
            hotspot
            for hotspot in self._hotspots
            if haversine_m(meta.lat, meta.lon, hotspot.center[1], hotspot.center[0]) <= radius
        ]

    def _observation_for(
        self, hotspot: HotspotSpec, meta: FrameMeta, rng: random.Random
    ) -> Observation:
        key = (meta.bus_id, hotspot.hotspot_id)
        passes = self._pass_count.get(key, 0) + 1
        self._pass_count[key] = passes

        # each repeat pass nudges confidence up a little, the way a real
        # detector gets luckier with more looks at the same object
        confidence = hotspot.base_confidence + min(0.06, 0.015 * (passes - 1))
        confidence += rng.uniform(-0.05, 0.05)
        confidence = min(max(confidence, 0.30), 0.98)

        severity = self._drifted_severity(hotspot.severity, rng)

        return Observation(
            obs_id=uuid4(),
            bus_id=meta.bus_id,
            route_id=meta.route_id,
            ts=meta.ts,
            # Report the hotspot's true location, blurred by GPS error.
            # ±3e-5° is about ±3.3 m, which is what a consumer GNSS receiver
            # with a clear sky actually achieves. Do not widen this casually:
            # noise larger than about a third of the fusion grid cell (25 m)
            # starts splitting one pothole into several events.
            lat=hotspot.center[1] + rng.uniform(-3e-5, 3e-5),
            lon=hotspot.center[0] + rng.uniform(-3e-5, 3e-5),
            gps_accuracy_m=meta.gps_accuracy_m,
            heading_deg=meta.heading_deg,
            speed_kmph=meta.speed_kmph,
            detection_class=DetectionClass(hotspot.detection_class),
            raw_confidence=round(confidence, 3),
            severity=severity,
            bbox=self._plausible_bbox(severity, rng),
            evidence_uri=(
                f"{self.settings.DEFECT_EVIDENCE_BASE_URI}/"
                f"{hotspot.hotspot_id}-{meta.bus_id}-{passes:03d}.jpg"
            ),
        )

    def _novel_observation(self, meta: FrameMeta, rng: random.Random) -> Observation:
        detection_class = rng.choice(_NOVEL_CLASSES)
        severity = rng.choices(_SEVERITY_LADDER, weights=(6, 3, 1))[0]
        return Observation(
            obs_id=uuid4(),
            bus_id=meta.bus_id,
            route_id=meta.route_id,
            ts=meta.ts,
            lat=meta.lat + rng.uniform(-2e-4, 2e-4),
            lon=meta.lon + rng.uniform(-2e-4, 2e-4),
            gps_accuracy_m=meta.gps_accuracy_m,
            heading_deg=meta.heading_deg,
            speed_kmph=meta.speed_kmph,
            detection_class=detection_class,
            raw_confidence=round(rng.uniform(0.48, 0.79), 3),
            severity=severity,
            bbox=self._plausible_bbox(severity, rng),
            evidence_uri=f"{self.settings.DEFECT_EVIDENCE_BASE_URI}/novel-{uuid4().hex[:12]}.jpg",
        )

    @staticmethod
    def _drifted_severity(base: str, rng: random.Random) -> Severity:
        """Occasionally disagree by one class — real detectors are not consistent."""
        severity = Severity(base)
        if rng.random() > 0.15:
            return severity
        index = _SEVERITY_LADDER.index(severity)
        index = min(max(index + rng.choice((-1, 1)), 0), len(_SEVERITY_LADDER) - 1)
        return _SEVERITY_LADDER[index]

    @staticmethod
    def _plausible_bbox(severity: Severity, rng: random.Random) -> BBox:
        """Bigger defects occupy more of a 1280x720 frame, low in the image."""
        scale = {Severity.SMALL: 0.06, Severity.MEDIUM: 0.12, Severity.LARGE: 0.22}[severity]
        width = 1280 * scale * rng.uniform(0.8, 1.2)
        height = width * rng.uniform(0.45, 0.8)
        x1 = rng.uniform(120, 1280 - width - 120)
        y1 = rng.uniform(400, 720 - height - 20)  # road surface sits low in frame
        return BBox(
            x1=round(x1, 1), y1=round(y1, 1), x2=round(x1 + width, 1), y2=round(y1 + height, 1)
        )
