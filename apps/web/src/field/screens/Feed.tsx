/** Everything the fleet has found, newest first. Owned by M6. */

import { AlertTriangle, ChevronRight, Radio, RefreshCw } from 'lucide-react';
import { useField } from '../store';
import { SEVERITY_COLOR, STATUS_LABEL, slaText, timeAgo } from '../lib/api';
import { EmptyState, ErrorNote, SkeletonRows } from '../../components/ui';

export function Feed() {
  const events = useField((s) => s.events);
  const loading = useField((s) => s.loading);
  const error = useField((s) => s.error);
  const load = useField((s) => s.load);
  const go = useField((s) => s.go);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <h1 className="text-base font-medium tracking-tight">Field Reports</h1>
          <p className="text-[11px] text-slate-500">{events.length} open across your zone</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-700 text-slate-400 active:bg-ink-600"
          aria-label="Refresh"
        >
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="m-4">
            <ErrorNote>Cannot reach the API — {error}</ErrorNote>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 block w-full rounded-md bg-amber-500/20 py-2.5 text-[13px] text-amber-100 active:bg-amber-500/30"
            >
              Retry
            </button>
          </div>
        )}

        {loading && events.length === 0 && <SkeletonRows rows={5} />}

        {/* never a blank screen: an API that is down still gets an explanation
            and something to do about it */}
        {!loading && events.length === 0 && (
          <EmptyState
            icon={<Radio size={22} />}
            title={error ? 'No reports to show' : 'Nothing reported yet'}
            body={
              error
                ? 'The phone is working — it just cannot reach the platform. Reports will appear here as soon as it can.'
                : 'Defects appear here as buses drive past them. Start the fleet with make dev.'
            }
          />
        )}

        {events.map((event) => {
          const sla = slaText(event.sla_due);
          return (
            <button
              key={event.event_id}
              type="button"
              onClick={() => go('detail', event.event_id)}
              className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3.5 text-left active:bg-white/[0.04]"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${SEVERITY_COLOR[event.severity]}`}
              >
                <AlertTriangle size={17} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-100">
                  {event.detection_class.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                  {event.road_segment_id ?? 'unlocated'} · {timeAgo(event.last_seen)} ago
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className="rounded border border-white/10 bg-ink-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {STATUS_LABEL[event.status]}
                  </span>
                  <span
                    className={`text-[10px] ${sla.overdue ? 'text-red-400' : 'text-slate-600'}`}
                  >
                    SLA {sla.text}
                  </span>
                </span>
              </span>

              <ChevronRight size={17} className="shrink-0 text-slate-600" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
