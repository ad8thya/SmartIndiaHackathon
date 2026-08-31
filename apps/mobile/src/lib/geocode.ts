/**
 * Reverse geocoding, offline.
 *
 * A hosted geocoder is one more thing to fail on stage, and `make demo`
 * promises the wifi can be unplugged — so instead of an address lookup the
 * phone names the nearest seeded road segment from the generated city
 * reference (`cityRef.ts`, from packages/citydata).
 *
 * The wording is deliberately hedged: "near Sardar Patel Road" and never
 * "12 Sardar Patel Road". This finds the closest of 26 known segment centres,
 * which is a landmark, not a postal address, and the field it fills is
 * editable precisely because the person standing there knows better. Claiming
 * more precision than that would be a lie that reads as a bug when a citizen
 * sees a street they are not on.
 *
 * The ward is the same hedge one level up. Chennai has 200 wards and this app
 * does not have their boundaries, so it reports the route corridor the segment
 * belongs to and says so.
 */

import { SEGMENTS, type SegmentRef } from './cityRef';
import { distanceM } from './display';

export interface Place {
  /** What goes in the editable address field. */
  address: string;
  /** Best-effort area label. Never presented as an authoritative ward id. */
  ward: string;
  segment: SegmentRef;
  distanceM: number;
}

/**
 * Past this, "near <street>" stops being a useful description — the nearest
 * seeded segment is a different neighbourhood and naming it would mislead.
 *
 * 3 km, not the 1.2 km this started at. `SEGMENTS` carries segment *midpoints*,
 * not road geometry, so a phone standing on a road is routinely 2 km from that
 * road's own centre point — a 4 km corridor's midpoint is 2 km from either end.
 * At 1.2 km the geocoder returned null across most of the seeded network and
 * the address field just stayed empty, under a caption claiming it had been
 * filled in.
 *
 * If `SEGMENTS` ever carries real polylines, this should become a
 * distance-to-line and the threshold should come back down.
 */
const TOO_FAR_M = 3_000;

export function reverseGeocode(lat: number, lon: number): Place | null {
  if (SEGMENTS.length === 0) return null;

  let best: SegmentRef = SEGMENTS[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const segment of SEGMENTS) {
    const metres = distanceM({ lat, lon }, { lat: segment.lat, lon: segment.lon });
    if (metres < bestDistance) {
      bestDistance = metres;
      best = segment;
    }
  }

  if (bestDistance > TOO_FAR_M) return null;

  return {
    address: `Near ${best.name}`,
    ward: `Route ${best.route_id} corridor`,
    segment: best,
    distanceM: bestDistance,
  };
}
