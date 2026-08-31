/**
 * Where the map starts and how close it gets. Constants only.
 *
 * These live apart from `mapStyle.ts` deliberately: that module imports
 * maplibre-gl, and maplibre is ~900 kB that only map screens should pay for
 * (see components/map/LazyMap.tsx). `useGeolocation` needs a fallback centre
 * and nothing else, and importing it from `mapStyle` pulled the entire map
 * engine back into the main bundle through a single number.
 *
 * Nothing in this file may import maplibre, directly or transitively.
 */

/** Chennai Central. Same centre the console uses. */
export const INITIAL_VIEW = {
  lon: 80.2707,
  lat: 13.0827,
  zoom: 12.4,
};

/** How close "recentre on me" gets. Street level, not building level. */
export const LOCATE_ZOOM = 15.5;
