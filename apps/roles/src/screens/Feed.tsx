/** Live event feed — shared across every role whose tab set includes "feed",
 * scoped to that role's detection classes (see roles/config.ts). */

import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { useRoles } from '../store';
import { ROLES } from '../roles/config';
import { SEVERITY_COLOR, STATUS_LABEL, slaText, timeAgo, titleCase } from '../lib/api';

export function Feed() {
  const role = useRoles((s) => s.role)!;
  const events = useRoles((s) => s.scopedEvents());
  const loading = useRoles((s) => s.loading);
  const error = useRoles((s) => s.error);
  const load = useRoles((s) => s.load);
  const openDetail = useRoles((s) => s.openDetail);
  const tabLabel = ROLES[role].tabs.find((t) => t.id === 'feed')?.label ?? 'Live event feed';

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 lg:px-6">
        <div>
          <h1 className="text-base font-bold tracking-tight text-ink">{tabLabel}</h1>
          <p className="text-[11px] text-muted">{events.length} open</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-muted"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Cannot reach the API — {error}
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 block w-full rounded-lg bg-amber-100 py-2 text-amber-900"
            >
              Retry
            </button>
          </div>
        )}

        {!error && events.length === 0 && !loading && (
          <p className="px-6 py-12 text-center text-sm text-muted">Nothing here yet.</p>
        )}

        <div className="mx-auto max-w-3xl divide-y divide-line lg:px-6">
          {events.map((event) => {
            const sla = slaText(event.sla_due);
            return (
              <button
                key={event.event_id}
                type="button"
                onClick={() => openDetail('event', event.event_id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface2 lg:rounded-xl lg:px-3"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${SEVERITY_COLOR[event.severity]}`}
                >
                  <AlertTriangle size={17} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {titleCase(event.detection_class)}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                    {event.road_segment_id ?? 'unlocated'} · {timeAgo(event.last_seen)} ago
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <span className="rounded border border-line bg-surface2 px-1.5 py-0.5 text-[10px] text-ink/70">
                      {STATUS_LABEL[event.status]}
                    </span>
                    <span className={`text-[10px] ${sla.overdue ? 'text-red-600' : 'text-muted'}`}>
                      SLA {sla.text}
                    </span>
                  </span>
                </span>

                <ChevronRight size={17} className="shrink-0 text-muted" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
