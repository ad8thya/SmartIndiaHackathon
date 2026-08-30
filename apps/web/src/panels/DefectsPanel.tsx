/**
 * ══════════════════════════════════════════════════════════════════════════
 *  M1 OWNS THIS FILE. Nobody else edits it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Road defect backlog: what the fleet has found, how bad it is, and where it
 * sits in the repair workflow.
 *
 * Props are the shared `PanelProps` shape — identical for all five panels:
 *   { events, roads, selected, onSelect }
 *
 * TODO (M1), roughly one per day:
 *   · evidence thumbnails from event.evidence_uris (they are object-store keys
 *     today; ask M5 for a signed-URL endpoint when you need real images)
 *   · an IRC:82-2015 severity explainer — judges will ask what SMALL/MEDIUM/
 *     LARGE actually mean, and a tooltip citing the standard answers it
 *   · a PCI trend sparkline per road segment
 *   · bulk assign: select several defects on one corridor, dispatch one crew
 */

import { useMemo, useState } from 'react';
import {
  Camera,
  ChevronRight,
  Filter,
  Layers3,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { DetectionClass, PanelProps, Severity, UTEvent } from '../lib/types';
import { INFRASTRUCTURE_CLASSES } from '../lib/types';
import {
  CLASS_LABEL,
  STATUS_LABEL,
  severityChipClass,
  statusChipClass,
} from '../lib/colors';
import { slaLabel, timeAgo } from '../lib/format';
import { evidenceImage } from '../lib/evidence';

const SEVERITIES: Severity[] = ['LARGE', 'MEDIUM', 'SMALL'];

export function DefectsPanel({ events, selected, onSelect }: PanelProps) {
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null);
  const [classFilter, setClassFilter] = useState<DetectionClass | null>(null);

  /** this panel only ever shows the eight infrastructure classes */
  const defects = useMemo(
    () =>
      events
        .filter((event) => INFRASTRUCTURE_CLASSES.includes(event.detection_class))
        .filter((event) => !severityFilter || event.severity === severityFilter)
        .filter((event) => !classFilter || event.detection_class === classFilter),
    [events, severityFilter, classFilter],
  );

  const counts = useMemo(() => {
    const bySeverity: Record<Severity, number> = { SMALL: 0, MEDIUM: 0, LARGE: 0 };
    const byClass = new Map<DetectionClass, number>();
    for (const event of events) {
      if (!INFRASTRUCTURE_CLASSES.includes(event.detection_class)) continue;
      bySeverity[event.severity] += 1;
      byClass.set(event.detection_class, (byClass.get(event.detection_class) ?? 0) + 1);
    }
    return { bySeverity, byClass: [...byClass.entries()].sort((a, b) => b[1] - a[1]) };
  }, [events]);

  return (
    <div className="flex h-full flex-col">
      {/* ── severity summary, doubles as a filter ─────────────────────── */}
      <div className="grid grid-cols-3 gap-2 border-b border-white/5 p-3">
        {SEVERITIES.map((severity) => {
          const active = severityFilter === severity;
          return (
            <button
              key={severity}
              type="button"
              onClick={() => setSeverityFilter(active ? null : severity)}
              className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                active ? severityChipClass(severity) : 'border-white/10 bg-ink-700/60 hover:bg-ink-600/60'
              }`}
            >
              <div className="font-mono text-lg font-semibold leading-none text-slate-100">
                {counts.bySeverity[severity]}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
                {severity}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── class filter chips ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 border-b border-white/5 px-3 py-2">
        <span className="flex items-center gap-1 pr-1 text-[10px] uppercase tracking-wider text-slate-500">
          <Filter size={11} /> Type
        </span>
        {counts.byClass.map(([detectionClass, count]) => {
          const active = classFilter === detectionClass;
          return (
            <button
              key={detectionClass}
              type="button"
              onClick={() => setClassFilter(active ? null : detectionClass)}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                active
                  ? 'border-sky-400/40 bg-sky-500/15 text-sky-300'
                  : 'border-white/10 bg-ink-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {CLASS_LABEL[detectionClass]} <span className="font-mono opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── the backlog ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {defects.length === 0 ? (
          <EmptyState hasFilters={Boolean(severityFilter || classFilter)} />
        ) : (
          defects.map((event) => (
            <DefectRow
              key={event.event_id}
              event={event}
              active={event.event_id === selected}
              onSelect={() => onSelect(event.event_id === selected ? null : event.event_id)}
            />
          ))
        )}
      </div>

      <footer className="border-t border-white/5 px-3 py-2 text-[10px] text-slate-500">
        {defects.length} of {events.filter((e) => INFRASTRUCTURE_CLASSES.includes(e.detection_class)).length} defects
        · severity per IRC:82-2015
      </footer>
    </div>
  );
}

function DefectRow({
  event,
  active,
  onSelect,
}: {
  event: UTEvent;
  active: boolean;
  onSelect: () => void;
}) {
  const sla = slaLabel(event.sla_due);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col gap-1.5 border-b border-white/5 px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center gap-2">
        <TriangleAlert
          size={14}
          className={event.severity === 'LARGE' ? 'text-red-400' : 'text-amber-400'}
        />
        <span className="flex-1 truncate text-xs font-medium text-slate-200">
          {CLASS_LABEL[event.detection_class]}
        </span>
        <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase ${severityChipClass(event.severity)}`}>
          {event.severity}
        </span>
        <ChevronRight size={13} className="text-slate-600" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[10px] text-slate-500">
        <span className="font-mono">{event.road_segment_id ?? 'unlocated'}</span>
        <span className="flex items-center gap-1">
          <ShieldCheck size={10} />
          {Math.round(event.fused_confidence * 100)}%
        </span>
        <span className="flex items-center gap-1">
          <Layers3 size={10} />
          {event.distinct_bus_count} bus{event.distinct_bus_count > 1 ? 'es' : ''}
        </span>
        {event.evidence_uris.length > 0 && (
          <span className="flex items-center gap-1">
            <Camera size={10} />
            {event.evidence_uris.length}
          </span>
        )}
        <span>{timeAgo(event.last_seen)}</span>
      </div>

      <div className="flex items-center gap-2 pl-6">
        <span className={`rounded border px-1.5 py-0.5 text-[9px] ${statusChipClass(event.status)}`}>
          {STATUS_LABEL[event.status]}
        </span>
        <span className={`text-[10px] ${sla.breached ? 'text-red-400' : 'text-slate-600'}`}>
          {sla.text}
        </span>
      </div>

      {active && event.evidence_uris.length > 0 && (
        <div className="mt-1 flex gap-1.5 pl-6">
          {event.evidence_uris.slice(0, 4).map((uri, index) => (
            <img
              key={uri}
              src={evidenceImage(
                {
                  id: `${event.event_id}-${index}`,
                  detectionClass: event.detection_class,
                  severity: event.severity,
                  ts: event.first_seen,
                },
                true,
              )}
              alt={`Synthetic evidence crop for ${event.detection_class}`}
              title={`${uri} — synthetic placeholder, no camera feed yet`}
              className="h-12 w-16 rounded border border-white/10 object-cover"
            />
          ))}
        </div>
      )}
    </button>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="px-4 py-8 text-center">
      <ShieldCheck size={26} className="mx-auto text-emerald-500/50" />
      <p className="mt-2 text-xs text-slate-400">
        {hasFilters ? 'No defects match these filters.' : 'No road defects reported yet.'}
      </p>
      {!hasFilters && (
        <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
          Run <code className="rounded bg-ink-900 px-1 font-mono">make dev</code> — defects appear
          as buses drive past known hotspots.
        </p>
      )}
    </div>
  );
}
