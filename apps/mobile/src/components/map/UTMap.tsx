/**
 * The map. MapLibre GL + PMTiles, one component, every role.
 *
 * No Leaflet, no SVG grid, no styled div pretending to be a map. It is a real
 * vector basemap rendering from a committed extract with the network off —
 * see lib/mapStyle.ts.
 *
 * Markers are a GeoJSON source and two paint layers rather than DOM
 * `maplibregl.Marker` elements. That matters on a phone: a few hundred
 * absolutely-positioned divs that reposition on every frame of a pan is what
 * turns a smooth map into a stuttering one. Layers are drawn by the GPU and
 * are hit-tested with `queryRenderedFeatures`.
 *
 * Touch behaviour is set explicitly rather than left at the desktop defaults:
 * one finger pans, two fingers pinch-zoom, and neither rotates. Rotation on a
 * phone is almost always an accident during a pinch, and a map that ends up at
 * a 30° bearing nobody asked for reads as broken.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildMapStyle, INITIAL_VIEW, LOCATE_ZOOM } from '../../lib/mapStyle';

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  /** Fill colour. Callers map their own domain to this; the map has no opinion. */
  color: string;
  /** Drawn larger and with a ring. Use for the one thing the screen is about. */
  emphasis?: boolean;
  /** Optional short label drawn beside the dot, e.g. a work-order number. */
  label?: string;
}

export interface MapLine {
  id: string;
  /** [lon, lat] — GeoJSON order, like everything else on the wire. */
  coordinates: [number, number][];
  color: string;
  width?: number;
  dashed?: boolean;
}

export interface UserPosition {
  lat: number;
  lon: number;
  accuracy_m?: number;
}

const MARKERS_SOURCE = 'ut-markers';
const LINES_SOURCE = 'ut-lines';

function markerCollection(markers: MapMarker[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((marker) => ({
      type: 'Feature',
      id: marker.id,
      geometry: { type: 'Point', coordinates: [marker.lon, marker.lat] },
      properties: {
        id: marker.id,
        color: marker.color,
        radius: marker.emphasis ? 9 : 6.5,
        label: marker.label ?? '',
      },
    })),
  };
}

function lineCollection(lines: MapLine[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines.map((line) => ({
      type: 'Feature',
      id: line.id,
      geometry: { type: 'LineString', coordinates: line.coordinates },
      properties: {
        id: line.id,
        color: line.color,
        width: line.width ?? 4,
        dash: line.dashed ? 1 : 0,
      },
    })),
  };
}

export function UTMap({
  markers = [],
  lines = [],
  user,
  center,
  zoom,
  onSelectMarker,
  className = '',
}: {
  markers?: MapMarker[];
  lines?: MapLine[];
  user?: UserPosition | null;
  /** Fly here when it changes. Omit to leave the camera alone. */
  center?: { lat: number; lon: number } | null;
  zoom?: number;
  onSelectMarker?: (id: string) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Props the map event handlers need but that must not re-create the map.
  const selectRef = useRef(onSelectMarker);
  selectRef.current = onSelectMarker;

  // ── create once ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new maplibregl.Map({
      container: container.current,
      style: buildMapStyle(),
      center: [INITIAL_VIEW.lon, INITIAL_VIEW.lat],
      zoom: zoom ?? INITIAL_VIEW.zoom,
      attributionControl: false,
      // A phone has no cursor to hover with and no keyboard to pan with.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: false,
    });

    // Two fingers rotate by default. On a phone that fires during almost every
    // pinch, leaving the map at a bearing the user did not ask for.
    instance.touchZoomRotate.disableRotation();

    instance.on('load', () => {
      instance.addSource(LINES_SOURCE, { type: 'geojson', data: lineCollection([]) });
      instance.addLayer({
        id: 'ut-lines-casing',
        type: 'line',
        source: LINES_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['+', ['get', 'width'], 3],
          'line-opacity': 0.9,
        },
      });
      instance.addLayer({
        id: 'ut-lines',
        type: 'line',
        source: LINES_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
        },
      });

      instance.addSource(MARKERS_SOURCE, { type: 'geojson', data: markerCollection([]) });
      instance.addLayer({
        id: 'ut-markers-halo',
        type: 'circle',
        source: MARKERS_SOURCE,
        paint: {
          'circle-radius': ['+', ['get', 'radius'], 3],
          'circle-color': '#FFFFFF',
          'circle-opacity': 0.95,
        },
      });
      instance.addLayer({
        id: 'ut-markers',
        type: 'circle',
        source: MARKERS_SOURCE,
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
        },
      });

      setReady(true);
    });

    // A finger is not a mouse pointer: the tap target is padded so a dot the
    // size of a pea can still be hit by a thumb.
    const TAP_PADDING = 12;
    instance.on('click', (event) => {
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [event.point.x - TAP_PADDING, event.point.y - TAP_PADDING],
        [event.point.x + TAP_PADDING, event.point.y + TAP_PADDING],
      ];
      const hits: MapGeoJSONFeature[] = instance.queryRenderedFeatures(box, {
        layers: ['ut-markers'],
      });
      const id = hits[0]?.properties?.id;
      if (typeof id === 'string') selectRef.current?.(id);
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      setReady(false);
    };
    // Deliberately empty: the map is created once and updated by the effects
    // below. Re-creating it on a prop change would refetch every tile and
    // throw away the user's pan position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── data updates ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !map.current) return;
    const source = map.current.getSource(MARKERS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(markerCollection(markers));
  }, [markers, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const source = map.current.getSource(LINES_SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(lineCollection(lines));
  }, [lines, ready]);

  // ── the blue dot ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !map.current) return;
    if (!user) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      const element = document.createElement('div');
      element.className = 'ut-user-dot';
      // animate-utping, not a CSS `animation:` line — see index.css.
      element.innerHTML = '<span class="animate-utping"></span>';
      userMarker.current = new maplibregl.Marker({ element }).setLngLat([user.lon, user.lat]);
      userMarker.current.addTo(map.current);
    } else {
      userMarker.current.setLngLat([user.lon, user.lat]);
    }
  }, [user, ready]);

  // ── camera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !map.current || !center) return;
    map.current.easeTo({
      center: [center.lon, center.lat],
      zoom: zoom ?? LOCATE_ZOOM,
      duration: 620,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  }, [center, zoom, ready]);

  return <div ref={container} className={`h-full w-full ${className}`} />;
}
