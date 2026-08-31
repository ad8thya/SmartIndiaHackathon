/**
 * Real basemap, zero network.
 *
 * The tiles are a committed Protomaps extract of Chennai
 * (`assets/map/chennai.pmtiles`, 17 MB) decoded in the browser by the
 * pmtiles protocol. Glyphs and sprites are vendored beside it. Streets, water,
 * parks and labels all render with the venue wifi dead — the offline path IS
 * the primary path, there is no CDN fallback to fail over to.
 *
 * **This app ships no basemap of its own.** `public/map` is a symlink to the
 * repo-level `assets/map` for dev, and the production build drops `dist/map`
 * because the API serves `/map` from MAP_DIR. One extract in git, one on disk,
 * one in the image — see vite.config.ts and spa.py::mount_map.
 *
 * `window.location.origin` is what makes that work in both places without a
 * flag: on a laptop it is `http://192.168.x.x:5176` and vite serves the
 * symlink; in the container it is the API's origin and `/map/...` is the
 * API's own mount. A hardcoded host would break one of the two, silently, and
 * only on someone else's machine.
 *
 * Light, not dark. The console runs dark because operators sit in front of it
 * for hours; a phone is read outdoors in Chennai sunlight.
 */

import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import themeLayers from 'protomaps-themes-base';
import type { StyleSpecification } from 'maplibre-gl';

let protocolRegistered = false;

/** Idempotent: maplibre throws if the same protocol is added twice, and React
 *  strict mode mounts every component twice in dev. */
function ensureProtocol(): void {
  if (protocolRegistered) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

export function buildMapStyle(): StyleSpecification {
  ensureProtocol();
  const origin = window.location.origin;
  return {
    version: 8,
    name: 'urban-twin-mobile',
    glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/v4/light`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${origin}/map/chennai.pmtiles`,
        attribution: '© OpenStreetMap · Protomaps',
      },
    },
    // The default export takes a theme *name* and returns ground and labels
    // together, fully painted. The named `layers()` export expects a Theme
    // object; handing it a string yields 56 layers with empty `paint` — an
    // invisible map that still reports as loaded.
    layers: themeLayers('protomaps', 'light', 'en'),
  } as StyleSpecification;
}

