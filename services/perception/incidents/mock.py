"""M4 MOCK — one scripted hit-and-run, plus low-rate rash driving.

The demo needs a *story*, not statistics. So this mock scripts a single
memorable incident:

    A hatchback clips a two-wheeler on Kamarajar Salai and leaves the scene.
    Bus MTC-VYASARPADI-3311 on route 21G catches the plate: TN 09 BX 4412,
    OCR confidence 0.87.

That incident fires once per process (and once per replay loop), so the
IncidentsPanel always has a dossier to open. Around it, rash-driving reports
appear at a low rate so the list is not a single lonely row.

Privacy: ``plate_text`` is populated for the operator dossier only.
``plate_hash`` is what is persisted and what crosses MQTT.
"""

from __future__ import annotations

import random
from datetime import timedelta
from uuid import uuid4

from citydata import segment_by_id
from contracts import DetectionClass, Frame, FrameMeta, IncidentReport

from .config import IncidentSettings, get_settings, hash_plate

#: the scripted hit-and-run — fixed so the demo tells the same story every time
SCRIPTED_PLATE = "TN 09 BX 4412"
SCRIPTED_PLATE_CONFIDENCE = 0.87
SCRIPTED_SEGMENT = "SEG-21G-002"
SCRIPTED_BUS = "MTC-VYASARPADI-3311"
SCRIPTED_NARRATIVE = (
    "Silver hatchback changed lanes without indicating and clipped a two-wheeler "
    "at the kerb, then accelerated away without stopping. Rider remained upright. "
    "Plate recovered from the rear of the offending vehicle over 9 frames."
)

_RASH_NARRATIVES = (
    "Vehicle weaving across three lanes at speed, no indicators.",
    "Overtook the bus on the near side and cut back in within one vehicle length.",
    "Ran the signal approximately 4 seconds after it turned red.",
    "Sustained tailgating at under half a second headway.",
)
_VEHICLE_TYPES = ("hatchback", "sedan", "auto-rickshaw", "two-wheeler", "SUV", "light truck")


class MockIncidentDetector:
    """Satisfies :class:`contracts.IncidentDetector`."""

    def __init__(self, settings: IncidentSettings | None = None) -> None:
        self.settings = settings or get_settings()
        self._scripted_fired = False
        self._track_seq = 40

    # ── Protocol ────────────────────────────────────────────────────────────
    def process(self, frames: list[Frame], meta: FrameMeta) -> list[IncidentReport]:
        """``frames`` is ignored by the mock; it reads geography and luck."""
        rng = random.Random(f"inc:{meta.bus_id}:{meta.frame_idx}:{meta.ts.timestamp():.0f}")
        reports: list[IncidentReport] = []

        if self._should_fire_scripted(meta):
            self._scripted_fired = True
            reports.append(self._scripted_hit_and_run(meta))

        if rng.random() < 0.012:
            reports.append(self._rash_driving(meta, rng))

        return reports

    def reset(self) -> None:
        """Let the scripted incident fire again — the replay loop calls this."""
        self._scripted_fired = False

    # ── internals ───────────────────────────────────────────────────────────
    def _should_fire_scripted(self, meta: FrameMeta) -> bool:
        if self._scripted_fired:
            return False
        if meta.bus_id != SCRIPTED_BUS:
            return False
        segment = segment_by_id(SCRIPTED_SEGMENT)
        from citydata import haversine_m

        return haversine_m(meta.lat, meta.lon, segment.center[1], segment.center[0]) <= 400.0

    def _scripted_hit_and_run(self, meta: FrameMeta) -> IncidentReport:
        incident_id = uuid4()
        base = f"{self.settings.INCIDENT_EVIDENCE_BASE_URI}/incident-{incident_id.hex[:8]}"
        return IncidentReport(
            incident_id=incident_id,
            incident_class=DetectionClass.COLLISION,
            ts=meta.ts,
            lat=meta.lat,
            lon=meta.lon,
            road_segment_id=SCRIPTED_SEGMENT,
            reported_by_bus=meta.bus_id,
            narrative=SCRIPTED_NARRATIVE,
            confidence=SCRIPTED_PLATE_CONFIDENCE,
            track_id=44,
            vehicle_type="hatchback",
            plate_text=SCRIPTED_PLATE,  # operator dossier only
            plate_hash=hash_plate(SCRIPTED_PLATE, self.settings.PLATE_HASH_SALT),
            plate_confidence=SCRIPTED_PLATE_CONFIDENCE,
            evidence_uris=[
                f"{base}-wide.jpg",
                f"{base}-contact.jpg",
                f"{base}-plate.jpg",
                f"{base}-departure.jpg",
            ],
        )

    def _rash_driving(self, meta: FrameMeta, rng: random.Random) -> IncidentReport:
        self._track_seq += 1
        incident_id = uuid4()
        plate = self._fake_plate(rng)
        confidence = round(rng.uniform(0.61, 0.83), 2)
        # OCR is unreliable at speed; sometimes we see the behaviour but not the plate
        readable = rng.random() > 0.35
        # place it slightly behind the bus — the offending vehicle just passed
        offset = timedelta(seconds=rng.uniform(0.5, 2.0))
        return IncidentReport(
            incident_id=incident_id,
            incident_class=DetectionClass.RASH_DRIVING,
            ts=meta.ts - offset,
            lat=meta.lat + rng.uniform(-1e-4, 1e-4),
            lon=meta.lon + rng.uniform(-1e-4, 1e-4),
            road_segment_id=None,
            reported_by_bus=meta.bus_id,
            narrative=rng.choice(_RASH_NARRATIVES),
            confidence=round(rng.uniform(0.58, 0.88), 2),
            track_id=self._track_seq,
            vehicle_type=rng.choice(_VEHICLE_TYPES),
            plate_text=plate if readable else None,
            plate_hash=hash_plate(plate, self.settings.PLATE_HASH_SALT) if readable else None,
            plate_confidence=confidence if readable else None,
            evidence_uris=[
                f"{self.settings.INCIDENT_EVIDENCE_BASE_URI}/"
                f"incident-{incident_id.hex[:8]}-wide.jpg"
            ],
        )

    @staticmethod
    def _fake_plate(rng: random.Random) -> str:
        """Tamil Nadu format: TN <district 2d> <series 2 letters> <4 digits>."""
        district = rng.randint(1, 99)
        series = "".join(rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(2))
        number = rng.randint(1000, 9999)
        return f"TN {district:02d} {series} {number}"
