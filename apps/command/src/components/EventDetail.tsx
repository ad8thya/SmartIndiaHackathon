/**
 * Floating detail card for the selected event. Owned by M6.
 *
 * This is the one place in the command centre where a human writes back to the
 * system — advancing an event through the workflow. Everything else is
 * machine-generated, which is exactly the property that makes the audit trail
 * meaningful.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Camera, MapPin, ShieldCheck, Users, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { CLASS_LABEL, STATUS_LABEL, severityChipClass, statusChipClass } from '../lib/colors';
import { slaLabel, timeAgo } from '../lib/format';
import { WORKFLOW_ORDER, type WorkflowStatus } from '../lib/types';

const TEAMS = [
  'GCC-Zone-13-Adyar',
  'GCC-Zone-9-Teynampet',
  'GCC-Zone-5-Royapuram',
  'Highways-Dept-Chennai-South',
];

export function EventDetail() {
  const eventId = useStore((s) => s.selectedEventId);
  const event = useStore((s) => (eventId ? s.events[eventId] : null));
  const selectEvent = useStore((s) => s.selectEvent);
  const advanceStatus = useStore((s) => s.advanceStatus);

  const next = event ? nextStatus(event.status) : null;
  const sla = event ? slaLabel(event.sla_due) : null;

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="absolute bottom-6 left-1/2 z-30 w-[420px] -translate-x-1/2 rounded-xl border border-white/10 bg-ink-800/95 p-4 shadow-2xl shadow-black/50 backdrop-blur"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                {CLASS_LABEL[event.detection_class]}
              </h2>
              <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-slate-500">
                <MapPin size={10} />
                {event.road_segment_id ?? `${event.lat.toFixed(5)}, ${event.lon.toFixed(5)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => selectEvent(null)}
              className="text-slate-500 hover:text-slate-200"
            >
              <X size={15} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-2 py-0.5 text-[10px] ${statusChipClass(event.status)}`}>
              {STATUS_LABEL[event.status]}
            </span>
            <span className={`rounded border px-2 py-0.5 text-[10px] ${severityChipClass(event.severity)}`}>
              {event.severity}
            </span>
            {sla && (
              <span
                className={`rounded border px-2 py-0.5 text-[10px] ${
                  sla.breached
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-white/10 bg-ink-700 text-slate-400'
                }`}
              >
                {sla.text}
              </span>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
            <Fact icon={<ShieldCheck size={11} />} label="Confidence" value={`${Math.round(event.fused_confidence * 100)}%`} />
            <Fact icon={<Users size={11} />} label="Buses" value={String(event.distinct_bus_count)} />
            <Fact icon={<Camera size={11} />} label="Sightings" value={String(event.observation_count)} />
          </dl>

          <p className="mt-2 text-[10px] text-slate-500">
            First seen {timeAgo(event.first_seen)} · last {timeAgo(event.last_seen)}
            {event.assigned_team && ` · ${event.assigned_team}`}
          </p>

          {next && (
            <div className="mt-3 flex items-center gap-2">
              <select
                defaultValue={event.assigned_team ?? TEAMS[0]}
                id="team-select"
                className="flex-1 rounded-md border border-white/10 bg-ink-700 px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-sky-400/40"
              >
                {TEAMS.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const select = document.getElementById('team-select') as HTMLSelectElement | null;
                  void advanceStatus(event.event_id, next, select?.value);
                }}
                className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-[11px] font-semibold text-ink-900 hover:bg-sky-400"
              >
                {STATUS_LABEL[next]} <ArrowRight size={12} />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The next rung a human can move this event to. */
function nextStatus(status: WorkflowStatus): WorkflowStatus | null {
  if (status === 'RESOLVED' || status === 'REJECTED') return null;
  const index = WORKFLOW_ORDER.indexOf(status);
  const next = WORKFLOW_ORDER[index + 1];
  return next === 'REJECTED' ? null : (next ?? null);
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
    <div className="rounded border border-white/5 bg-ink-900/60 px-2 py-1.5">
      <dt className="flex items-center gap-1 uppercase tracking-wider text-slate-500">
        {icon} {label}
      </dt>
      <dd className="mt-0.5 font-mono text-xs text-slate-200">{value}</dd>
    </div>
  );
}
