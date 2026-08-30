/**
 * MapLibre dark style. Owned by M6.
 *
 * Two of them: a hosted CARTO vector style for when there is network, and a
 * fully self-contained fallback that needs none. The fallback is not a nicety —
 * hackathon venue wifi fails, and a twin that renders buildings, routes, buses
 * and events over a flat dark ground is still a working demo. A blank white
 * screen is not.
 */

import type { StyleSpecification } from 'maplibre-gl';

export const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** No sources, no network, no tiles. Just the ground the twin sits on. */
export const OFFLINE_DARK: StyleSpecification = {
  version: 8,
  name: 'urban-twin-offline-dark',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#080b14' } }],
};

/**
 * Probe the hosted style once. Returns the URL if reachable, otherwise the
 * inline fallback. Called once at mount — never per render.
 */
export async function resolveMapStyle(
  timeoutMs = 2500,
): Promise<string | StyleSpecification> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(CARTO_DARK, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok ? CARTO_DARK : OFFLINE_DARK;
  } catch {
    return OFFLINE_DARK;
  }
}

/** Chennai Central. */
export const INITIAL_VIEW = {
  longitude: Number(import.meta.env.VITE_MAP_CENTER_LON ?? 80.2707),
  latitude: Number(import.meta.env.VITE_MAP_CENTER_LAT ?? 13.0827),
  zoom: 12.2,
  // 45° by default so the 3D reads immediately — a flat map looks like a map,
  // a pitched one looks like a twin
  pitch: 45,
  bearing: -18,
};
