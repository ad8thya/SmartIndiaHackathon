/**
 * Real basemap, zero network. Owned by M6.
 *
 * The vector tiles are a committed Protomaps extract of the seeded route
 * extent + 2 km (`public/map/chennai.pmtiles`, ~9 MB), served by the app
 * itself and decoded by the pmtiles protocol. Glyphs and sprites are vendored
 * under `public/map/` too — so streets, water, parks and labels all render
 * with the venue wifi dead. No API key, no tile server, no fallback needed:
 * the offline path IS the primary path.
 *
 * Light + dark are the same tiles with different Protomaps themes: operator
 * screens run dark, the citizen-facing screens run light.
 */

import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import themeLayers from 'protomaps-themes-base';
import type { StyleSpecification } from 'maplibre-gl';

let protocolRegistered = false;

function ensureProtocol(): void {
  if (protocolRegistered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

/** The two Protomaps theme names this app ships sprites for. */
export type MapTheme = 'light' | 'dark';

export function buildMapStyle(theme: MapTheme): StyleSpecification {
  ensureProtocol();
  const origin = window.location.origin;
  return {
    version: 8,
    name: `urban-twin-${theme}`,
    glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${origin}/map/chennai.pmtiles`,
        attribution: '© OpenStreetMap · Protomaps',
      },
    },
    // The default export is the one that takes a theme *name* and returns the
    // ground and the labels together, fully painted. The named `layers()`
    // export expects a Theme object instead, and handing it a string yields
    // 56 layers with empty `paint` — an invisible map that still "renders".
    layers: themeLayers('protomaps', theme, 'en'),
  } as StyleSpecification;
}

/** Kept for tests and as a belt-and-braces fallback if the pmtiles file is
 * missing from a fresh partial clone. */
export const OFFLINE_DARK: StyleSpecification = {
  version: 8,
  name: 'urban-twin-offline-dark',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#080b14' } }],
};

/** The committed extract is the style now — no CDN probe, no network. */
export async function resolveMapStyle(): Promise<StyleSpecification> {
  try {
    return buildMapStyle('dark');
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
