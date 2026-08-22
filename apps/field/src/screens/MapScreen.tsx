/**
 * A lightweight map for the crew. Owned by M6.
 *
 * Deliberately NOT deck.gl: this runs on a mid-range Android phone on mobile
 * data at a roadside. An SVG scatter of the defects around you, drawn from the
 * same event list, costs nothing and answers the only question a crew has —
 * *what else is near me while I am here*.
 */

import { useMemo, useState } from 'react';
import { Crosshair, Layers } from 'lucide-react';
import { useField } from '../store';

/** Chennai bounding box the seeded network sits inside. */
const BOUNDS = { minLon: 80.18, maxLon: 80.3, minLat: 12.97, maxLat: 13.13 };

export function MapScreen() {
  const events = useField((s) => s.events);
  const go = useField((s) => s.go);
  const [severityOnly, setSeverityOnly] = useState(false);

  const points = useMemo(() => {
    const visible = severityOnly ? events.filter((e) => e.severity === 'LARGE') : events;
    return visible.map((event) => ({
      id: event.event_id,
      severity: event.severity,
      status: event.status,
      x: ((event.lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * 100,
      y: (1 - (event.lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100,
      label: event.detection_class.replace(/_/g, ' ').toLowerCase(),
    }));
  }, [events, severityOnly]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <h1 className="text-base font-bold tracking-tight">Nearby</h1>
          <p className="text-[11px] text-slate-500">{points.length} defects in your zone</p>
        </div>
        <button
          type="button"
          onClick={() => setSeverityOnly((v) => !v)}
          className={`flex h-11 items-center gap-1.5 rounded-full px-3 text-[11px] ${
            severityOnly ? 'bg-red-500/20 text-red-300' : 'bg-ink-700 text-slate-400'
          }`}
        >
          <Layers size={14} /> {severityOnly ? 'Large only' : 'All'}
        </button>
      </header>

      <div className="relative min-h-0 flex-1 bg-ink-800">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          {/* a faint grid so the plot reads as a map, not a scatter chart */}
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} stroke="#1d2740" strokeWidth="0.15">
              <line x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="100" />
              <line x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} />
            </g>
          ))}

          {points.map((point) => (
            <circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={point.severity === 'LARGE' ? 1.8 : point.severity === 'MEDIUM' ? 1.3 : 0.9}
              className="cursor-pointer"
              fill={
                point.severity === 'LARGE'
                  ? '#ef4444'
                  : point.severity === 'MEDIUM'
                    ? '#f59e0b'
                    : '#38bdf8'
              }
              fillOpacity="0.85"
              onClick={() => go('detail', point.id)}
            />
          ))}

          {/* "you are here" — Chennai Central until real geolocation lands */}
          <circle cx="75" cy="47" r="1.4" fill="#22d3ee" />
          <circle cx="75" cy="47" r="3.5" fill="none" stroke="#22d3ee" strokeWidth="0.3" opacity="0.5" />
        </svg>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/10 bg-ink-900/85 px-2.5 py-2 text-[10px] backdrop-blur">
          {(['LARGE', 'MEDIUM', 'SMALL'] as const).map((severity) => (
            <div key={severity} className="flex items-center gap-1.5 py-0.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  severity === 'LARGE'
                    ? 'bg-red-500'
                    : severity === 'MEDIUM'
                      ? 'bg-amber-500'
                      : 'bg-sky-400'
                }`}
              />
              <span className="text-slate-400">{severity.toLowerCase()}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-1.5 border-t border-white/10 pt-1">
            <Crosshair size={9} className="text-cyan-400" />
            <span className="text-slate-400">you</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/5 px-4 py-2">
        <p className="text-[10px] leading-relaxed text-slate-600">
          Tap a dot to open the report. Deliberately lightweight — this runs on mobile data at a
          roadside, not on a control-room GPU.
        </p>
      </div>
    </div>
  );
}
