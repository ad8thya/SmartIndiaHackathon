/** Incident dossiers — traffic police / smart-city-admin. */

import { ChevronRight, RefreshCw, ShieldAlert } from 'lucide-react';
import { useRoles } from '../store';
import { timeAgo, titleCase } from '../lib/api';

export function Incidents() {
  const incidents = useRoles((s) => s.incidents);
  const loading = useRoles((s) => s.loading);
  const load = useRoles((s) => s.load);
  const openDetail = useRoles((s) => s.openDetail);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 lg:px-6">
        <div>
          <h1 className="text-base font-medium tracking-tight text-ink">Incidents</h1>
          <p className="text-[11px] text-muted">{incidents.length} on record</p>
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
        {incidents.length === 0 && !loading && (
          <p className="px-6 py-12 text-center text-sm text-muted">No incidents reported.</p>
        )}

        <div className="mx-auto max-w-3xl divide-y divide-line lg:px-6">
          {incidents.map((incident) => (
            <button
              key={incident.incident_id}
              type="button"
              onClick={() => openDetail('incident', incident.incident_id)}
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface2 lg:rounded-xl lg:px-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">
                <ShieldAlert size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {titleCase(incident.incident_class)}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-ink/70">
                  {incident.narrative}
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-muted">
                  {incident.road_segment_id ?? 'unlocated'} · {timeAgo(incident.ts)} ago ·{' '}
                  {incident.reported_by_bus}
                </span>
              </span>
              <ChevronRight size={17} className="mt-1 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
