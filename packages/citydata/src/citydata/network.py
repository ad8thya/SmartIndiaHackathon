"""Chennai demo network: six MTC routes, their road segments, buses, school zones.

This is *static reference data*, not a contract — but it is shared by the mocks,
the seeder and the replay simulator, so treat it as frozen alongside
``packages/contracts`` for the week. If you need a new hotspot for your own
mock, add one; do not renumber or rename the existing routes or segments,
because event ids in the seeded database refer to them.

Coordinates are approximate real Chennai landmarks in GeoJSON order (lon, lat).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .geometry import LonLat, densify, polyline_length_km

__all__ = [
    "BUSES",
    "CHENNAI_CENTER",
    "DEFECT_HOTSPOTS",
    "ROUTES",
    "SCHOOL_ZONES",
    "SEGMENTS",
    "BusSpec",
    "HotspotSpec",
    "RouteSpec",
    "SchoolZoneSpec",
    "SegmentSpec",
    "route_by_id",
    "segment_by_id",
    "segments_for_route",
]

#: Chennai Central. The map opens here.
CHENNAI_CENTER: LonLat = (80.2707, 13.0827)


@dataclass(frozen=True)
class RouteSpec:
    route_id: str
    name: str
    color: str
    stops: list[str]
    anchors: list[LonLat]
    #: named corridors the route runs along, in order — one per segment
    corridors: list[str]

    @property
    def polyline(self) -> list[LonLat]:
        return densify(self.anchors, per_leg=8)

    @property
    def length_km(self) -> float:
        return round(polyline_length_km(self.polyline), 2)


@dataclass(frozen=True)
class SegmentSpec:
    road_id: str
    name: str
    route_id: str
    #: representative point (lon, lat) — where the panel zooms to
    center: LonLat
    lanes: int = 2
    #: baseline free-flow speed, used by traffic + what-if maths
    free_flow_kmph: float = 45.0


@dataclass(frozen=True)
class BusSpec:
    bus_id: str
    route_id: str
    depot: str
    #: where on the route this bus starts, 0–1. Spread out so they never overlap.
    start_progress: float = 0.0
    device_serial: str = ""


@dataclass(frozen=True)
class SchoolZoneSpec:
    zone_id: str
    name: str
    center: LonLat
    radius_m: float = 150.0
    active_hours: str = "07:30-16:30"


@dataclass(frozen=True)
class HotspotSpec:
    """A place where a mock detector reliably fires. Keeps the demo repeatable."""

    hotspot_id: str
    road_id: str
    center: LonLat
    detection_class: str
    severity: str
    base_confidence: float
    note: str = ""
    evidence: list[str] = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Routes — six real MTC services
# ─────────────────────────────────────────────────────────────────────────────
ROUTES: list[RouteSpec] = [
    RouteSpec(
        route_id="27B",
        name="Adyar Depot ↔ Broadway",
        color="#38bdf8",
        stops=["Adyar Depot", "Saidapet", "T. Nagar", "Egmore", "Broadway"],
        anchors=[
            (80.2570, 13.0067),  # Adyar Depot
            (80.2231, 13.0213),  # Saidapet
            (80.2341, 13.0418),  # T. Nagar
            (80.2609, 13.0732),  # Egmore
            (80.2755, 13.0827),  # Chennai Central  ← shared trunk with 570 and M1
            (80.2870, 13.0930),  # Broadway
        ],
        # Egmore↔Central is the busiest trunk in the city and three of these six
        # services run it. That overlap is not decoration: it is what lets
        # different buses corroborate the same defect, which is the whole
        # premise of the platform.
        corridors=[
            "Sardar Patel Road",
            "Anna Salai",
            "Usman Road",
            "EVR Periyar Salai",
            "NSC Bose Road",
        ],
    ),
    RouteSpec(
        route_id="42A",
        name="Perambur ↔ Saidapet",
        color="#f472b6",
        stops=["Perambur", "Kilpauk", "Chetpet", "Nungambakkam", "Saidapet"],
        anchors=[
            (80.2334, 13.1103),  # Perambur
            (80.2400, 13.0790),  # Kilpauk
            (80.2430, 13.0715),  # Chetpet
            (80.2425, 13.0569),  # Nungambakkam
            (80.2231, 13.0213),  # Saidapet
        ],
        corridors=["Paper Mills Road", "Kilpauk Garden Road", "Sterling Road", "Anna Salai"],
    ),
    RouteSpec(
        route_id="51C",
        name="Thiruvanmiyur ↔ Koyambedu",
        color="#a78bfa",
        stops=["Thiruvanmiyur", "Adyar", "Guindy", "Vadapalani", "Koyambedu"],
        anchors=[
            (80.2594, 12.9830),  # Thiruvanmiyur
            (80.2570, 13.0067),  # Adyar
            (80.2206, 13.0067),  # Guindy
            (80.2121, 13.0500),  # Vadapalani
            (80.1948, 13.0694),  # Koyambedu
        ],
        corridors=["East Coast Road", "Sardar Patel Road", "Inner Ring Road", "Arcot Road"],
    ),
    RouteSpec(
        route_id="21G",
        name="Vyasarpadi ↔ Foreshore Estate",
        color="#34d399",
        stops=["Vyasarpadi", "Basin Bridge", "Chennai Central", "Marina Beach", "Foreshore Estate"],
        anchors=[
            (80.2560, 13.1180),  # Vyasarpadi
            (80.2740, 13.1010),  # Basin Bridge
            (80.2755, 13.0827),  # Chennai Central
            (80.2820, 13.0600),  # Marina
            (80.2790, 13.0330),  # Foreshore Estate
        ],
        corridors=[
            "Vyasarpadi Link Road",
            "Wall Tax Road",
            "Kamarajar Salai",
            "Santhome High Road",
        ],
    ),
    RouteSpec(
        route_id="570",
        name="Koyambedu ↔ Chennai Central",
        color="#fbbf24",
        stops=["Koyambedu", "Anna Nagar", "Aminjikarai", "Egmore", "Chennai Central"],
        anchors=[
            (80.1948, 13.0694),  # Koyambedu
            (80.2101, 13.0850),  # Anna Nagar
            (80.2230, 13.0730),  # Aminjikarai
            (80.2609, 13.0732),  # Egmore
            (80.2755, 13.0827),  # Chennai Central
        ],
        corridors=[
            "Jawaharlal Nehru Road",
            "2nd Avenue",
            "Nelson Manickam Road",
            "EVR Periyar Salai",
        ],
    ),
    RouteSpec(
        route_id="M1",
        name="Broadway ↔ Guindy (Mofussil)",
        color="#fb7185",
        stops=["Broadway", "Chennai Central", "Egmore", "Nungambakkam", "T. Nagar", "Guindy"],
        anchors=[
            (80.2870, 13.0930),  # Broadway
            (80.2755, 13.0827),  # Chennai Central
            (80.2609, 13.0732),  # Egmore
            (80.2425, 13.0569),  # Nungambakkam
            (80.2341, 13.0418),  # T. Nagar
            (80.2206, 13.0067),  # Guindy
        ],
        corridors=[
            "NSC Bose Road",
            "EVR Periyar Salai",
            "Nungambakkam High Road",
            "Usman Road",
            "Anna Salai",
        ],
    ),
]


def _build_segments() -> list[SegmentSpec]:
    """One segment per corridor leg of each route, evenly spaced along it."""
    segments: list[SegmentSpec] = []
    for route in ROUTES:
        anchors = route.anchors
        for index, corridor in enumerate(route.corridors):
            start, end = anchors[index], anchors[index + 1]
            center = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
            segments.append(
                SegmentSpec(
                    road_id=f"SEG-{route.route_id}-{index:03d}",
                    name=corridor,
                    route_id=route.route_id,
                    center=center,
                    lanes=3 if "Salai" in corridor or "Road" in corridor else 2,
                    free_flow_kmph=50.0 if "Salai" in corridor else 40.0,
                )
            )
    return segments


SEGMENTS: list[SegmentSpec] = _build_segments()


# ─────────────────────────────────────────────────────────────────────────────
# Fleet — depot names have no hyphens, the bus_id pattern is MTC-<DEPOT>-<4 digits>
# ─────────────────────────────────────────────────────────────────────────────
BUSES: list[BusSpec] = [
    BusSpec("MTC-ADYAR-1042", "27B", "Adyar", 0.00, "AIS140-TN-0000-1042"),
    BusSpec("MTC-PERAMBUR-2217", "42A", "Perambur", 0.18, "AIS140-TN-0000-2217"),
    BusSpec("MTC-TNAGAR-1875", "51C", "T. Nagar", 0.36, "AIS140-TN-0000-1875"),
    BusSpec("MTC-VYASARPADI-3311", "21G", "Vyasarpadi", 0.54, "AIS140-TN-0000-3311"),
    BusSpec("MTC-KOYAMBEDU-4408", "570", "Koyambedu", 0.72, "AIS140-TN-0000-4408"),
    BusSpec("MTC-BROADWAY-5090", "M1", "Broadway", 0.90, "AIS140-TN-0000-5090"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Three school zones — M3's pedestrian mock fires near these
# ─────────────────────────────────────────────────────────────────────────────
SCHOOL_ZONES: list[SchoolZoneSpec] = [
    SchoolZoneSpec("SZ-001", "Chettinad Vidyashram, R. A. Puram", (80.2601, 13.0195), 180.0),
    SchoolZoneSpec("SZ-002", "DAV Boys, Gopalapuram", (80.2559, 13.0530), 160.0),
    SchoolZoneSpec("SZ-003", "Chennai Girls Hr Sec, Nungambakkam", (80.2418, 13.0596), 150.0),
]


# ─────────────────────────────────────────────────────────────────────────────
# Defect hotspots — M1's mock emits here, so the demo is repeatable
# ─────────────────────────────────────────────────────────────────────────────
DEFECT_HOTSPOTS: list[HotspotSpec] = [
    HotspotSpec(
        "HS-01",
        "SEG-27B-000",
        (80.2470, 13.0130),
        "POTHOLE",
        "LARGE",
        0.91,
        "Recurring failure at the stormwater drain crossing.",
    ),
    HotspotSpec(
        "HS-02",
        "SEG-27B-001",
        (80.2290, 13.0310),
        "ALLIGATOR_CRACK",
        "MEDIUM",
        0.78,
        "Fatigue cracking in the kerbside lane.",
    ),
    HotspotSpec(
        "HS-03",
        "SEG-27B-002",
        (80.2480, 13.0580),
        "ZEBRA_CROSSING",
        "SMALL",
        0.72,
        "Crossing markings worn to under 30% coverage.",
    ),
    HotspotSpec(
        "HS-04",
        "SEG-42A-000",
        (80.2370, 13.0950),
        "POTHOLE",
        "MEDIUM",
        0.84,
        "Utility trench reinstatement settling.",
    ),
    HotspotSpec(
        "HS-05",
        "SEG-42A-002",
        (80.2428, 13.0640),
        "LONGITUDINAL_CRACK",
        "MEDIUM",
        0.69,
        "Joint opening along the lane line.",
    ),
    HotspotSpec(
        "HS-06",
        "SEG-51C-001",
        (80.2390, 13.0067),
        "WATERLOGGING",
        "LARGE",
        0.88,
        "Standing water after any rainfall over 15 mm.",
    ),
    HotspotSpec(
        "HS-07",
        "SEG-51C-002",
        (80.2160, 13.0280),
        "POTHOLE",
        "SMALL",
        0.66,
        "Shallow surface loss, monitor only.",
    ),
    HotspotSpec(
        "HS-08",
        "SEG-21G-001",
        (80.2750, 13.0920),
        "DAMAGED_DIVIDER",
        "MEDIUM",
        0.81,
        "Median kerb sheared by a heavy vehicle strike.",
    ),
    HotspotSpec(
        "HS-09",
        "SEG-21G-002",
        (80.2790, 13.0710),
        "POTHOLE",
        "LARGE",
        0.93,
        "Deep failure on the seaward carriageway.",
    ),
    HotspotSpec(
        "HS-10",
        "SEG-570-001",
        (80.2170, 13.0790),
        "TRANSVERSE_CRACK",
        "SMALL",
        0.64,
        "Thermal cracking, low priority.",
    ),
    HotspotSpec(
        "HS-11",
        "SEG-570-003",
        (80.2680, 13.0780),
        "DAMAGED_SIGN",
        "MEDIUM",
        0.75,
        "Speed limit plate bent and unreadable on the gantry.",
    ),
    HotspotSpec(
        "HS-12",
        "SEG-M1-001",
        (80.2680, 13.0780),
        "POTHOLE",
        "MEDIUM",
        0.80,
        "Approach to the signal, braking-zone rutting.",
    ),
    HotspotSpec(
        "HS-13",
        "SEG-M1-003",
        (80.2380, 13.0490),
        "ALLIGATOR_CRACK",
        "LARGE",
        0.86,
        "Extensive fatigue over a weak subgrade.",
    ),
    HotspotSpec(
        "HS-14",
        "SEG-M1-004",
        (80.2270, 13.0240),
        "WATERLOGGING",
        "MEDIUM",
        0.77,
        "Blocked gully at the underpass mouth.",
    ),
]


# ─────────────────────────────────────────────────────────────────────────────
def route_by_id(route_id: str) -> RouteSpec:
    for route in ROUTES:
        if route.route_id == route_id:
            return route
    raise KeyError(f"unknown route {route_id!r}")


def segments_for_route(route_id: str) -> list[SegmentSpec]:
    return [segment for segment in SEGMENTS if segment.route_id == route_id]


def segment_by_id(road_id: str) -> SegmentSpec:
    for segment in SEGMENTS:
        if segment.road_id == road_id:
            return segment
    raise KeyError(f"unknown road segment {road_id!r}")
