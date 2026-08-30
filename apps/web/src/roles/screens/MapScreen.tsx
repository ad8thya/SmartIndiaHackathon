/**
 * The role portal's map — the real basemap, not a drawing of one.
 *
 * Renders the committed Protomaps extract through `LiteMap` (maplibre circle
 * layers, one WebGL context) so it stays smooth on a mid-range phone and
 * works with no network at all. The hand-drawn `<svg>` grid this replaced
 * was a placeholder, and it looked like one.
 *
 * Roads (`/api/roads`) don't carry geometry in the current contracts, only a
 * road_id/name and condition metrics — so instead of fabricating coordinates
 * for them, they get their own selectable list beside the map, while the map
 * plots the things that do have lat/lon: events and buses.
 */

import { useMemo, useState } from 'react';
import { Layers, Moon, Sun } from 'lucide-react';
import { useRoles } from '../store';
import { LiteMap, type LiteBus, type LitePoint } from '../../components/LiteMap';
import { RISK_BAND_COLOR, titleCase } from '../lib/api';

const SEVERITY_STYLE = {
  LARGE: { color: '#ef4444', radius: 9 },
  MEDIUM: { color: '#f59e0b', radius: 7 },
  SMALL: { color: '#6D46C8', radius: 5 },
} as const;

export function MapScreen() {
  const events = useRoles((s) => s.scopedEvents());
  const buses = useRoles((s) => s.buses);
  const roads = useRoles((s) => s.roads);
  const mapStyle = useRoles((s) => s.mapStyle);
  const setMapStyle = useRoles((s) => s.setMapStyle);
  const selectedRoadId = useRoles((s) => s.selectedRoadId);
  const selectRoad = useRoles((s) => s.selectRoad);
  const openDetail = useRoles((s) => s.openDetail);
  const [severityOnly, setSeverityOnly] = useState(false);

  const points = useMemo<LitePoint[]>(() => {
    const visible = severityOnly ? events.filter((e) => e.severity === 'LARGE') : events;
    return visible.map((event) => ({
      id: event.event_id,
      lon: event.lon,
      lat: event.lat,
      label: `${titleCase(event.detection_class)} · ${event.severity.toLowerCase()}`,
      ...SEVERITY_STYLE[event.severity],
    }));
  }, [events, severityOnly]);

  const busPoints = useMemo<LiteBus[]>(
    () => buses.map((bus) => ({ id: bus.bus_id, lon: bus.lon, lat: bus.lat, label: bus.bus_id })),
    [buses],
  );

  const selectedRoad = roads.find((r) => r.road_id === selectedRoadId) ?? null;
  const isDark = mapStyle === 'dark';

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 lg:px-6">
          <div>
            <h1 className="text-base font-bold tracking-tight text-ink">Map</h1>
            <p className="text-[11px] text-muted">{points.length} events in view</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMapStyle(isDark ? 'light' : 'dark')}
              className="flex h-9 items-center gap-1.5 rounded-full bg-surface2 px-3 text-[11px] text-ink"
            >
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
              {isDark ? 'Light' : 'Dark'}
            </button>
            <button
              type="button"
              onClick={() => setSeverityOnly((v) => !v)}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] ${
                severityOnly ? 'bg-red-100 text-red-700' : 'bg-surface2 text-ink'
              }`}
            >
              <Layers size={13} /> {severityOnly ? 'Large only' : 'All'}
            </button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <LiteMap
            theme={isDark ? 'dark' : 'light'}
            points={points}
            buses={busPoints}
            onSelect={(id) => openDetail('event', id)}
          />

          <div
            className={`pointer-events-none absolute bottom-3 left-3 rounded-lg border px-2.5 py-2 text-[10px] backdrop-blur ${
              isDark ? 'border-white/10 bg-black/60 text-slate-200' : 'border-line bg-surface/90 text-ink'
            }`}
          >
            {(['LARGE', 'MEDIUM', 'SMALL'] as const).map((severity) => (
              <div key={severity} className="flex items-center gap-1.5 py-0.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    severity === 'LARGE' ? 'bg-red-500' : severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-accent'
                  }`}
                />
                <span className="opacity-80">{severity.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line lg:w-72 lg:border-l lg:border-t-0">
        <div className="border-b border-line px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Roads · scroll sideways for all columns
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 lg:flex-col lg:overflow-visible">
          {roads.slice(0, 30).map((road) => (
            <button
              key={road.road_id}
              type="button"
              onClick={() => selectRoad(road.road_id)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left text-[11px] lg:shrink lg:w-full ${
                road.road_id === selectedRoadId
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-line bg-surface hover:bg-surface2'
              }`}
            >
              <span className="block truncate font-medium text-ink">{road.name}</span>
              <span className="mt-0.5 block text-muted">PCI {road.pci_score.toFixed(0)}</span>
            </button>
          ))}
        </div>

        {selectedRoad && (
          <div className="border-t border-line p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted">Selected road</p>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-ink">{selectedRoad.name}</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-surface2 px-2.5 py-2">
                <p className="text-muted">Congestion</p>
                <p className="font-mono font-semibold text-ink">{selectedRoad.congestion_pct.toFixed(0)}%</p>
              </div>
              <div className="rounded-lg bg-surface2 px-2.5 py-2">
                <p className="text-muted">Avg speed</p>
                <p className="font-mono font-semibold text-ink">{selectedRoad.avg_speed_kmph.toFixed(0)} km/h</p>
              </div>
              {selectedRoad.risk_band && (
                <div className={`col-span-2 rounded-lg border px-2.5 py-2 ${RISK_BAND_COLOR[selectedRoad.risk_band]}`}>
                  <p className="opacity-70">Risk band</p>
                  <p className="font-semibold">{selectedRoad.risk_band}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
