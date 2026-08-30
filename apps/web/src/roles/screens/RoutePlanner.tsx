/**
 * "Plan a safe route" — the counterfactual tool from the original design:
 * close one or more roads, see the simulated impact on every bus route.
 * Same backend call apps/command's WhatIfPanel uses (`POST
 * /api/whatif/simulate`); this is the role-portal's version of the same
 * feature, for the roles that can act on it (municipal authority, urban
 * planner, smart city admin).
 */

import { useState } from 'react';
import { CheckCircle2, Play, RotateCcw, TriangleAlert, Users } from 'lucide-react';
import { useRoles } from '../store';

const REASONS = ['Metro works', 'Monsoon waterlogging', 'Road resurfacing', 'Public event'];
const MAX_CLOSED_ROADS = 5;

export function RoutePlanner() {
  const roads = useRoles((s) => s.roads);
  const results = useRoles((s) => s.whatIfResults);
  const simulating = useRoles((s) => s.simulating);
  const runWhatIf = useRoles((s) => s.runWhatIf);
  const clearWhatIf = useRoles((s) => s.clearWhatIf);
  const [closed, setClosed] = useState<string[]>([]);
  const [reason, setReason] = useState(REASONS[0]);

  const toggle = (roadId: string) =>
    setClosed((current) =>
      current.includes(roadId)
        ? current.filter((id) => id !== roadId)
        : current.length >= MAX_CLOSED_ROADS
          ? current
          : [...current, roadId],
    );

  const reset = () => {
    setClosed([]);
    clearWhatIf();
  };

  const affected = results.filter((r) => r.delta_min > 0);
  const worst = affected.reduce((max, r) => (r.delta_min > max ? r.delta_min : max), 0);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto p-4 lg:p-6">
      <h1 className="text-base font-bold tracking-tight text-ink">Plan a safe route</h1>
      <p className="mt-1 text-[12px] text-muted">
        Close a corridor and the twin re-routes every bus service to show what it costs.
      </p>

      <h2 className="mb-1.5 mt-5 text-[10px] font-semibold uppercase tracking-widest text-muted">
        1 · Choose roads to close (up to {MAX_CLOSED_ROADS})
      </h2>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
        {roads.length === 0 && <p className="p-3 text-[12px] text-muted">Loading roads…</p>}
        {roads.map((road) => {
          const isClosed = closed.includes(road.road_id);
          return (
            <button
              key={road.road_id}
              type="button"
              onClick={() => toggle(road.road_id)}
              className={`flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-[12px] last:border-b-0 ${
                isClosed ? 'bg-red-50 text-red-800' : 'hover:bg-surface2'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isClosed ? 'border-red-400 bg-red-100' : 'border-line'
                }`}
              >
                {isClosed && <span className="h-1.5 w-1.5 rounded-full bg-red-600" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{road.name}</span>
              <span className="font-mono text-[10px] text-muted">{road.congestion_pct.toFixed(0)}%</span>
            </button>
          );
        })}
      </div>

      <h2 className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-widest text-muted">
        2 · Reason
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setReason(option)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              reason === option ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line bg-surface2 text-ink/70'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void runWhatIf(closed, reason)}
          disabled={closed.length === 0 || simulating}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          <Play size={14} />
          {simulating ? 'Simulating…' : `Close ${closed.length || 0} road${closed.length === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex items-center justify-center rounded-xl border border-line bg-surface2 px-3.5 text-ink/70"
          title="Reset"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <h2 className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-widest text-muted">
        3 · Simulated route impact
      </h2>
      {results.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-muted">
          Select a corridor and run the simulation. Every route gets a row — including the ones
          that are unaffected.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted">
            {affected.length} of {results.length} routes affected · worst{' '}
            <span className="font-mono text-amber-700">+{worst.toFixed(0)}m</span>
          </p>
          <div className="space-y-2">
            {results
              .slice()
              .sort((a, b) => b.delta_min - a.delta_min)
              .map((result) => (
                <div key={result.route_id} className="flex items-center gap-3 rounded-xl border border-line bg-surface2 px-3 py-2.5">
                  <span className="w-12 shrink-0 font-mono text-[12px] font-semibold text-ink">
                    {result.route_id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink/70">
                      <span className="font-mono">{result.baseline_min.toFixed(0)}m</span>
                      <span className="text-muted">→</span>
                      <span className="font-mono font-semibold text-ink">{result.simulated_min.toFixed(0)}m</span>
                    </span>
                    {result.affected_passengers > 0 && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                        <Users size={9} /> {result.affected_passengers} passengers/trip
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span
                      className={`block font-mono text-sm font-semibold ${
                        result.delta_min === 0 ? 'text-muted' : result.recommended ? 'text-amber-700' : 'text-red-600'
                      }`}
                    >
                      {result.delta_min === 0 ? '—' : `+${result.delta_min.toFixed(0)}m`}
                    </span>
                    <span
                      className={`flex items-center justify-end gap-1 text-[9px] uppercase ${
                        result.recommended ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {result.recommended ? (
                        <>
                          <CheckCircle2 size={9} /> tolerable
                        </>
                      ) : (
                        <>
                          <TriangleAlert size={9} /> avoid
                        </>
                      )}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
