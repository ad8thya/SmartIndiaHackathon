/**
 * ══════════════════════════════════════════════════════════════════════════
 *  M3 OWNS THIS FILE (M2 contributes the recommendations feed). Nobody else
 *  edits it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The AI intelligence layer's home in the command centre:
 *   1. Urban Risk Index — top-10 roads, a score bar, an expandable component
 *      breakdown. The breakdown is the whole point, not decoration: a risk
 *      score with no attribution is not decision support, it is a guess with
 *      a UI. See contracts.UrbanRiskScore.
 *   2. Dangerous junctions ranking (the same 10 roads, road-first framing)
 *   3. Recommendations feed — priority chips and rationale
 *   4. Near-miss list — distinct icon from IncidentsPanel's collision markers
 *
 * Props are the shared `PanelProps` shape, same as every other panel. This
 * panel's own data (risk ranking, recommendations, near-misses) comes from
 * the store, not a direct fetch — see useStore's refreshIntelligence.
 *
 * TODO (M3/M2):
 *   · click-through from a recommendation's evidence_event_ids to the actual
 *     Event rows once M2's real implementation resolves them (see
 *     services/recommend/impl.py)
 *   · a per-road risk trend, once repair-outcome history exists
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Gauge,
  MapPinned,
  Wrench,
  Zap,
} from 'lucide-react';
import type { PanelProps } from '../lib/types';
import { useStore } from '../store/useStore';
import { CLASS_LABEL, riskBandChipClass } from '../lib/colors';
import { timeAgo } from '../lib/format';

export function IntelligencePanel({ selected, onSelect }: PanelProps) {
  const dangerousJunctions = useStore((s) => s.dangerousJunctions);
  const recommendations = useStore((s) => s.recommendations);
  const nearMisses = useStore((s) => s.nearMisses);
  const riskDetails = useStore((s) => s.riskDetails);
  const fetchRoadRisk = useStore((s) => s.fetchRoadRisk);

  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleExpand = (roadId: string) => {
    const next = expanded === roadId ? null : roadId;
    setExpanded(next);
    onSelect(roadId === selected ? null : roadId);
    if (next && !riskDetails[roadId]) void fetchRoadRisk(roadId);
  };

  const maxScore = Math.max(1, ...dangerousJunctions.map((j) => j.risk_score));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── urban risk index ─────────────────────────────────────────── */}
      <div className="border-b border-white/5 p-3">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          <Gauge size={12} /> Urban risk index — top {dangerousJunctions.length || 10}
        </h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          A transparent weighted score, not a black box — click a row for the
          component breakdown behind its number.
        </p>
      </div>

      {dangerousJunctions.length > 0 ? (
        <div className="border-b border-white/5">
          {dangerousJunctions.map((junction) => {
            const isOpen = expanded === junction.road_id;
            const detail = riskDetails[junction.road_id];
            return (
              <div key={junction.road_id} className="border-b border-white/5">
                <button
                  type="button"
                  onClick={() => toggleExpand(junction.road_id)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    isOpen ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  {isOpen ? (
                    <ChevronDown size={13} className="shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight size={13} className="shrink-0 text-slate-500" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-slate-200">{junction.name}</span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink-900">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(junction.risk_score / maxScore) * 100}%`,
                          background:
                            junction.risk_band === 'CRITICAL'
                              ? '#dc2626'
                              : junction.risk_band === 'HIGH'
                                ? '#f97316'
                                : junction.risk_band === 'MODERATE'
                                  ? '#facc15'
                                  : '#22c55e',
                        }}
                      />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-sm font-semibold text-slate-100">
                      {junction.risk_score.toFixed(0)}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[9px] uppercase ${riskBandChipClass(junction.risk_band)}`}
                    >
                      {junction.risk_band}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-white/5 bg-ink-900/40 px-4 py-3">
                    {detail ? (
                      <ul className="space-y-1.5">
                        {detail.explanation.map((line, index) => (
                          <li
                            key={`${junction.road_id}-${index}`}
                            className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400"
                          >
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500">Loading breakdown…</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="border-b border-white/5 px-4 py-5 text-center text-[11px] leading-relaxed text-slate-500">
          No risk scores yet — they populate once the traffic and fusion layers
          have something to score.
        </p>
      )}

      {/* ── recommendations ──────────────────────────────────────────── */}
      <div className="border-b border-white/5 p-3">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          <Wrench size={12} /> Recommendations ({recommendations.length})
        </h3>
      </div>
      {recommendations.length > 0 ? (
        <div className="border-b border-white/5">
          {recommendations.slice(0, 20).map((rec) => (
            <div key={rec.rec_id} className="border-b border-white/5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-xs text-slate-200">
                  {rec.rec_type.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[9px] uppercase ${riskBandChipClass(rec.priority)}`}
                >
                  {rec.priority}
                </span>
              </div>
              <span className="mt-0.5 block font-mono text-[10px] text-slate-600">
                {rec.road_id}
              </span>
              <ul className="mt-1.5 space-y-1">
                {rec.rationale.map((line, index) => (
                  <li
                    key={`${rec.rec_id}-${index}`}
                    className="text-[10px] leading-relaxed text-slate-500"
                  >
                    · {line}
                  </li>
                ))}
              </ul>
              {rec.estimated_beneficiaries != null && (
                <span className="mt-1 block text-[10px] text-slate-600">
                  ~{rec.estimated_beneficiaries.toLocaleString('en-IN')} estimated beneficiaries
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="border-b border-white/5 px-4 py-5 text-center text-[11px] leading-relaxed text-slate-500">
          No recommendations right now — an unremarkable road gets none, not a
          fabricated one.
        </p>
      )}

      {/* ── near-misses ───────────────────────────────────────────────── */}
      <div className="p-3">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          <Zap size={12} /> Near-misses ({nearMisses.length})
        </h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          A vehicle-pedestrian conflict with no contact — quantified by
          time-to-collision, not a milder shade of a collision.
        </p>

        {nearMisses.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {nearMisses.map((nm) => (
              <div
                key={nm.nm_id}
                className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2"
              >
                <MapPinned size={13} className="shrink-0 text-amber-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-slate-200">
                    {nm.road_id} · TTC {nm.min_ttc_seconds.toFixed(1)}s
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {nm.bus_id} · {nm.closing_speed_kmph.toFixed(0)} km/h · {timeAgo(nm.ts)}
                  </span>
                </span>
                <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase text-amber-300">
                  {CLASS_LABEL.NEAR_MISS}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500">
            No near-miss events yet.
          </p>
        )}
      </div>
    </div>
  );
}
