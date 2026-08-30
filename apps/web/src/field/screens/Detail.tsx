/** One defect, and the buttons a crew actually presses. Owned by M6. */

import { useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  MapPin,
  Navigation,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useField } from '../store';
import { SEVERITY_COLOR, STATUS_LABEL, slaText, timeAgo, type WorkflowStatus } from '../lib/api';
import { evidenceImage } from '../../lib/evidence';

/** What a crew on site can actually say. Deliberately three big buttons. */
const ACTIONS: Array<{ status: WorkflowStatus; label: string; tone: string; icon: React.ReactNode }> = [
  {
    status: 'INSPECTION',
    label: 'On site — inspecting',
    tone: 'bg-amber-500 text-ink-900',
    icon: <ShieldCheck size={17} />,
  },
  {
    status: 'REPAIR_COMPLETED',
    label: 'Repair complete',
    tone: 'bg-emerald-500 text-ink-900',
    icon: <CheckCircle2 size={17} />,
  },
  {
    status: 'REJECTED',
    label: 'Not a defect',
    tone: 'bg-ink-600 text-slate-300',
    icon: <XCircle size={17} />,
  },
];

export function Detail() {
  const event = useField((s) => s.active());
  const go = useField((s) => s.go);
  const advance = useField((s) => s.advance);
  const [notes, setNotes] = useState('');

  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-slate-500">That report is no longer in your list.</p>
        <button
          type="button"
          onClick={() => go('feed')}
          className="rounded-lg bg-ink-700 px-4 py-3 text-sm"
        >
          Back to feed
        </button>
      </div>
    );
  }

  const sla = slaText(event.sla_due);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/5 px-2 py-2">
        <button
          type="button"
          onClick={() => go('feed')}
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 active:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft size={19} />
        </button>
        <h1 className="truncate text-sm font-semibold">
          {event.detection_class.replace(/_/g, ' ').toLowerCase()}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {/* evidence */}
        <div className="relative border-b border-white/5 bg-ink-800">
          <img
            src={evidenceImage({
              id: event.event_id,
              detectionClass: event.detection_class,
              severity: event.severity,
              ts: event.first_seen,
            })}
            alt={`Synthetic evidence card for ${event.detection_class}`}
            className="h-44 w-full object-cover"
          />
          <p className="absolute bottom-1.5 right-2 text-[9px] text-slate-500">
            {event.evidence_uris.length} frame{event.evidence_uris.length === 1 ? '' : 's'} on file
          </p>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${SEVERITY_COLOR[event.severity]}`}
            >
              {event.severity}
            </span>
            <span className="rounded-lg border border-white/10 bg-ink-700 px-2.5 py-1 text-[11px] text-slate-300">
              {STATUS_LABEL[event.status]}
            </span>
            <span
              className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                sla.overdue
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-white/10 bg-ink-700 text-slate-400'
              }`}
            >
              SLA {sla.text}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-2">
            <Fact icon={<MapPin size={12} />} label="Location" value={event.road_segment_id ?? '—'} />
            <Fact
              icon={<ShieldCheck size={12} />}
              label="Confidence"
              value={`${Math.round(event.fused_confidence * 100)}%`}
            />
            <Fact icon={<Users size={12} />} label="Buses" value={String(event.distinct_bus_count)} />
            <Fact icon={<Camera size={12} />} label="Sightings" value={String(event.observation_count)} />
          </dl>

          <p className="text-[11px] leading-relaxed text-slate-500">
            First reported {timeAgo(event.first_seen)} ago, last confirmed {timeAgo(event.last_seen)} ago
            {event.assigned_team ? ` · ${event.assigned_team}` : ''}.
          </p>

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lon}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-ink-700 py-3.5 text-sm font-medium text-slate-200 active:bg-ink-600"
          >
            <Navigation size={16} /> Navigate here
          </a>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes for the record — materials used, obstructions, anything the office needs"
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-ink-800 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-400/40"
          />

          <div className="space-y-2 pt-1">
            {ACTIONS.map((action) => (
              <button
                key={action.status}
                type="button"
                onClick={() => {
                  void advance(event.event_id, action.status, notes || undefined);
                  setNotes('');
                  go('feed');
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold active:opacity-80 ${action.tone}`}
              >
                {action.icon} {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-ink-800 px-3 py-2.5">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        {icon} {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-xs text-slate-200">{value}</dd>
    </div>
  );
}
