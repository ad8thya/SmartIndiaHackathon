/**
 * Analytics — one screen, three tiers (`limited` / `traffic` / `full`),
 * driven by roles/config.ts so a permission change never touches this file.
 */

import { Download } from 'lucide-react';
import { useRoles } from '../store';
import { ROLES } from '../roles/config';
import { RISK_BAND_COLOR, timeAgo, titleCase } from '../lib/api';

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface2 px-3.5 py-3">
      <p className="text-[10px] tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-medium text-ink">{value}</p>
    </div>
  );
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Analytics() {
  const role = useRoles((s) => s.role)!;
  const summary = useRoles((s) => s.summary);
  const roads = useRoles((s) => s.roads);
  const recommendations = useRoles((s) => s.recommendations);
  const junctions = useRoles((s) => s.dangerousJunctions);
  const level = ROLES[role].permissions.analytics;

  return (
    <div className="mx-auto min-h-0 max-w-4xl flex-1 overflow-y-auto p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-medium tracking-tight text-ink">Analytics</h1>
            <span className="rounded-full border border-line bg-surface2 px-2 py-0.5 text-[10px] font-medium text-muted">
              {ROLES[role].permissions.analyticsLabel}
            </span>
          </div>
          {summary && (
            <p className="text-[11px] text-muted">Updated {timeAgo(summary.generated_at)} ago</p>
          )}
        </div>
        {level === 'full' && roads.length > 0 && (
          <button
            type="button"
            onClick={() => downloadCsv('urban-twin-roads.csv', roads as unknown as Record<string, unknown>[])}
            className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-[12px] font-medium text-white"
          >
            <Download size={13} /> Export roads CSV
          </button>
        )}
      </div>

      {!summary ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Kpi label="Buses online" value={summary.buses_online} />
            <Kpi label="Open events" value={summary.open_events} />
            <Kpi label="Incidents today" value={summary.incidents_today} />
            <Kpi label="SLA breaches" value={summary.sla_breaches} />
            {level !== 'limited' && (
              <>
                <Kpi label="Avg speed" value={`${summary.avg_network_speed_kmph.toFixed(0)} km/h`} />
                <Kpi label="Km surveyed today" value={summary.km_surveyed_today.toFixed(0)} />
              </>
            )}
            {level === 'full' && (
              <>
                <Kpi label="Critical risk roads" value={summary.critical_risk_roads} />
                <Kpi label="Near-misses (7d)" value={summary.near_misses_7d} />
              </>
            )}
          </div>

          {level === 'full' && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-medium text-ink">
                Infrastructure recommendations
              </h2>
              {recommendations.length === 0 ? (
                <p className="text-[12px] text-muted">None open right now.</p>
              ) : (
                <div className="space-y-2">
                  {recommendations.slice(0, 8).map((rec) => (
                    <div key={rec.rec_id} className="rounded-xl border border-line bg-surface2 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-ink">{titleCase(rec.rec_type)}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${RISK_BAND_COLOR[rec.priority]}`}>
                          {rec.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted">{rec.rationale[0]}</p>
                    </div>
                  ))}
                </div>
              )}

              <h2 className="mb-2 mt-6 text-sm font-medium text-ink">Most dangerous junctions</h2>
              <div className="space-y-2">
                {junctions.map((j) => (
                  <div key={j.road_id} className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2.5">
                    <span className="truncate text-[12px] font-medium text-ink">{j.name}</span>
                    <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${RISK_BAND_COLOR[j.risk_band]}`}>
                      {j.risk_score.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {level === 'traffic' && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-medium text-ink">Congested roads</h2>
              <div className="space-y-2">
                {[...roads]
                  .sort((a, b) => b.congestion_pct - a.congestion_pct)
                  .slice(0, 10)
                  .map((road) => (
                    <div key={road.road_id} className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2.5">
                      <span className="truncate text-[12px] font-medium text-ink">{road.name}</span>
                      <span className="font-mono text-[11px] text-muted">{road.congestion_pct.toFixed(0)}%</span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
