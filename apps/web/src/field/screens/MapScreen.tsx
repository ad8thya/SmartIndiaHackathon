/**
 * The crew's map. Owned by M6.
 *
 * The real Chennai basemap — the same committed Protomaps extract the command
 * centre uses — rendered through `LiteMap` (maplibre circle layers, one WebGL
 * context, no extruded geometry). That keeps it fast on a mid-range Android
 * phone at a roadside and, because the tiles ship with the app, it still
 * works when there is no signal at all. It answers the only question a crew
 * has while they are standing there: *what else is near me.*
 */

import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { useField } from '../store';
import { LiteMap, type LitePoint } from '../../components/LiteMap';

const SEVERITY_STYLE = {
  LARGE: { color: '#ef4444', radius: 9 },
  MEDIUM: { color: '#f59e0b', radius: 7 },
  SMALL: { color: '#38bdf8', radius: 5 },
} as const;

export function MapScreen() {
  const events = useField((s) => s.events);
  const go = useField((s) => s.go);
  const [severityOnly, setSeverityOnly] = useState(false);

  const points = useMemo<LitePoint[]>(() => {
    const visible = severityOnly ? events.filter((e) => e.severity === 'LARGE') : events;
    return visible.map((event) => ({
      id: event.event_id,
      lon: event.lon,
      lat: event.lat,
      label: `${event.detection_class.replace(/_/g, ' ').toLowerCase()} · ${event.severity.toLowerCase()}`,
      ...SEVERITY_STYLE[event.severity],
    }));
  }, [events, severityOnly]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <h1 className="text-base tracking-tight">Nearby</h1>
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
        <LiteMap theme="dark" points={points} onSelect={(id) => go('detail', id)} />

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-white/10 bg-ink-900/85 px-2.5 py-2 text-[10px] backdrop-blur">
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
        </div>
      </div>

      <div className="shrink-0 border-t border-white/5 px-4 py-2">
        <p className="text-[10px] leading-relaxed text-slate-600">
          Tap a defect to open the report. Map tiles ship with the app, so this keeps working
          with no signal.
        </p>
      </div>
    </div>
  );
}
