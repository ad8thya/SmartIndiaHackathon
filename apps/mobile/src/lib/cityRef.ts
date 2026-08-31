/**
 * GENERATED from packages/citydata — do not edit by hand.
 * Regenerate with:  .venv/bin/python scripts/gen_frontend_types.py
 *
 * Static facts about the seeded Chennai network. The UI reads counts from
 * here instead of hardcoding them, so adding a school zone or a route in
 * citydata updates every screen that mentions one.
 */

export interface SchoolZoneRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
  activeHours: string;
}

export const SCHOOL_ZONES: readonly SchoolZoneRef[] = [
  { id: "SZ-001", name: "Chettinad Vidyashram, R. A. Puram", lat: 13.0195, lon: 80.2601, radiusM: 180.0, activeHours: "07:30-16:30" },
  { id: "SZ-002", name: "DAV Boys, Gopalapuram", lat: 13.053, lon: 80.2559, radiusM: 160.0, activeHours: "07:30-16:30" },
  { id: "SZ-003", name: "Chennai Girls Hr Sec, Nungambakkam", lat: 13.0596, lon: 80.2418, radiusM: 150.0, activeHours: "07:30-16:30" },
] as const;

export const SCHOOL_ZONE_COUNT = 3;
export const ROUTE_COUNT = 6;
export const SEGMENT_COUNT = 26;
export const BUS_COUNT = 6;
export const DEFECT_HOTSPOT_COUNT = 14;
/** the speed limit inside a school zone, km/h — M3's pedestrian mock uses it */
export const SCHOOL_ZONE_SPEED_LIMIT_KMPH = 25;

export interface SegmentRef {
  road_id: string;
  name: string;
  route_id: string;
  lat: number;
  lon: number;
}

/**
 * Every seeded road segment with its name and centre.
 *
 * This is what lets apps/mobile reverse-geocode a citizen report to a street
 * name with the network off. A hosted geocoder would be one more thing to fail
 * on stage, and `make demo` promises the wifi can be unplugged — so the phone
 * names the nearest seeded segment instead, and says "nearest known road"
 * rather than claiming to be a postal address.
 */
export const SEGMENTS: readonly SegmentRef[] = [
  { road_id: "SEG-27B-000", name: "Sardar Patel Road", route_id: "27B", lat: 13.014, lon: 80.24005 },
  { road_id: "SEG-27B-001", name: "Anna Salai", route_id: "27B", lat: 13.03155, lon: 80.2286 },
  { road_id: "SEG-27B-002", name: "Usman Road", route_id: "27B", lat: 13.057500000000001, lon: 80.2475 },
  { road_id: "SEG-27B-003", name: "EVR Periyar Salai", route_id: "27B", lat: 13.077950000000001, lon: 80.26820000000001 },
  { road_id: "SEG-27B-004", name: "NSC Bose Road", route_id: "27B", lat: 13.08785, lon: 80.28125 },
  { road_id: "SEG-42A-000", name: "Paper Mills Road", route_id: "42A", lat: 13.094650000000001, lon: 80.2367 },
  { road_id: "SEG-42A-001", name: "Kilpauk Garden Road", route_id: "42A", lat: 13.07525, lon: 80.2415 },
  { road_id: "SEG-42A-002", name: "Sterling Road", route_id: "42A", lat: 13.0642, lon: 80.24275 },
  { road_id: "SEG-42A-003", name: "Anna Salai", route_id: "42A", lat: 13.039100000000001, lon: 80.2328 },
  { road_id: "SEG-51C-000", name: "East Coast Road", route_id: "51C", lat: 12.99485, lon: 80.2582 },
  { road_id: "SEG-51C-001", name: "Sardar Patel Road", route_id: "51C", lat: 13.0067, lon: 80.2388 },
  { road_id: "SEG-51C-002", name: "Inner Ring Road", route_id: "51C", lat: 13.02835, lon: 80.21635 },
  { road_id: "SEG-51C-003", name: "Arcot Road", route_id: "51C", lat: 13.0597, lon: 80.20345 },
  { road_id: "SEG-21G-000", name: "Vyasarpadi Link Road", route_id: "21G", lat: 13.1095, lon: 80.265 },
  { road_id: "SEG-21G-001", name: "Wall Tax Road", route_id: "21G", lat: 13.09185, lon: 80.27475 },
  { road_id: "SEG-21G-002", name: "Kamarajar Salai", route_id: "21G", lat: 13.07135, lon: 80.27875 },
  { road_id: "SEG-21G-003", name: "Santhome High Road", route_id: "21G", lat: 13.0465, lon: 80.28049999999999 },
  { road_id: "SEG-570-000", name: "Jawaharlal Nehru Road", route_id: "570", lat: 13.077200000000001, lon: 80.20245 },
  { road_id: "SEG-570-001", name: "2nd Avenue", route_id: "570", lat: 13.079, lon: 80.21655 },
  { road_id: "SEG-570-002", name: "Nelson Manickam Road", route_id: "570", lat: 13.0731, lon: 80.24195 },
  { road_id: "SEG-570-003", name: "EVR Periyar Salai", route_id: "570", lat: 13.077950000000001, lon: 80.26820000000001 },
  { road_id: "SEG-M1-000", name: "NSC Bose Road", route_id: "M1", lat: 13.08785, lon: 80.28125 },
  { road_id: "SEG-M1-001", name: "EVR Periyar Salai", route_id: "M1", lat: 13.077950000000001, lon: 80.26820000000001 },
  { road_id: "SEG-M1-002", name: "Nungambakkam High Road", route_id: "M1", lat: 13.06505, lon: 80.2517 },
  { road_id: "SEG-M1-003", name: "Usman Road", route_id: "M1", lat: 13.04935, lon: 80.23830000000001 },
  { road_id: "SEG-M1-004", name: "Anna Salai", route_id: "M1", lat: 13.02425, lon: 80.22735 },
];
