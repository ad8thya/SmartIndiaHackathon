/**
 * The phone-sized map. Owned by M6.
 *
 * Same committed PMTiles basemap as the operator MapCanvas, but rendered
 * through maplibre's own circle layers rather than deck.gl — one WebGL
 * context, no extruded geometry, which is what keeps it smooth on a
 * mid-range phone. It replaces the hand-drawn `<svg>` grids the field and
 * roles apps used to fake a map with.
 *
 * Light theme for citizen-facing screens, dark for crew/operator screens.
 * Both come from the same tiles.
 */

import { useMemo, useState } from 'react';
import BaseMap, { Layer, Source, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { buildMapStyle, type MapTheme } from '../lib/mapStyle';

export interface LitePoint {
  id: string;
  lon: number;
  lat: number;
  color: string;
  radius: number;
  label: string;
}

export interface LiteBus {
  id: string;
  lon: number;
  lat: number;
  label: string;
}

/** Chennai, framed to the seeded route extent. */
const VIEW = { longitude: 80.2407, latitude: 13.05, zoom: 11.4 };

function toFeatureCollection(points: LitePoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      id: point.id,
      geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] },
      properties: { id: point.id, color: point.color, radius: point.radius, label: point.label },
    })),
  };
}

export function LiteMap({
  theme = 'light',
  points,
  buses = [],
  onSelect,
  className = '',
}: {
  theme?: MapTheme;
  points: LitePoint[];
  buses?: LiteBus[];
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const style = useMemo<StyleSpecification>(() => buildMapStyle(theme), [theme]);
  const pointData = useMemo(() => toFeatureCollection(points), [points]);
  const busData = useMemo(
    () =>
      toFeatureCollection(
        buses.map((bus) => ({ ...bus, color: '#38bdf8', radius: 5, label: bus.label })),
      ),
    [buses],
  );

  const handleClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const id = feature?.properties?.id as string | undefined;
    if (id && onSelect) onSelect(id);
  };

  return (
    <div className={`relative h-full w-full ${className}`}>
      <BaseMap
        initialViewState={VIEW}
        mapStyle={style}
        reuseMaps
        attributionControl={false}
        interactiveLayerIds={['lite-points']}
        onClick={handleClick}
        onMouseMove={(event: MapLayerMouseEvent) =>
          setHover((event.features?.[0]?.properties?.label as string | undefined) ?? null)
        }
        onMouseLeave={() => setHover(null)}
        cursor={hover ? 'pointer' : 'grab'}
        style={{ width: '100%', height: '100%' }}
      >
        <Source id="lite-buses" type="geojson" data={busData}>
          <Layer
            id="lite-buses"
            type="circle"
            paint={{
              'circle-radius': 5,
              'circle-color': '#0ea5e9',
              'circle-stroke-width': 2,
              'circle-stroke-color': theme === 'dark' ? '#0b1220' : '#ffffff',
            }}
          />
        </Source>

        <Source id="lite-points" type="geojson" data={pointData}>
          <Layer
            id="lite-points"
            type="circle"
            paint={{
              'circle-radius': ['get', 'radius'],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.85,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': theme === 'dark' ? '#0b1220' : '#ffffff',
            }}
          />
        </Source>
      </BaseMap>

      {hover && (
        <div
          className={`pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full px-3 py-1.5 text-[11px] shadow-lg ${
            theme === 'dark' ? 'bg-ink-800/95 text-slate-200' : 'bg-white/95 text-ink'
          }`}
        >
          {hover}
        </div>
      )}
    </div>
  );
}
