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
