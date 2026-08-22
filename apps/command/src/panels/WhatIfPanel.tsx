/**
 * ══════════════════════════════════════════════════════════════════════════
 *  M2 OWNS THIS FILE (with TrafficPanel.tsx). Nobody else edits it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The counterfactual: pick roads, close them, see what it costs every route.
 * This is the panel that turns a dashboard into a decision tool, and it is
 * usually the one a judge remembers.
 *
 * TODO (M2):
 *   · draw `diversion_polyline` on the map when a result is selected
 *     (the data is already in the response — add a deck.gl PathLayer via the
 *     store rather than reaching into MapCanvas, which M6 owns)
 *   · a time-of-day slider: closing a road at 03:00 is not closing it at 18:00
 *   · save/compare two scenarios side by side
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  CircleSlash,
  Play,
  RotateCcw,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { PanelProps } from '../lib/types';
import { useStore } from '../store/useStore';
import { compact, signedMinutes } from '../lib/format';

const REASONS = ['Metro works', 'Monsoon waterlogging', 'Road resurfacing', 'Public event'];

export function WhatIfPanel({ roads, selected, onSelect }: PanelProps) {
  const results = useStore((s) => s.whatIf);
  const runWhatIf = useStore((s) => s.runWhatIf);
  const [closed, setClosed] = useState<string[]>([]);
  const [reason, setReason] = useState(REASONS[0]);
  const [running, setRunning] = useState(false);

  const toggle = (roadId: string) =>
    setClosed((current) =>
      current.includes(roadId) ? current.filter((id) => id !== roadId) : [...current, roadId],
    );

  const run = async () => {
    if (closed.length === 0) return;
    setRunning(true);
    try {
      await runWhatIf(closed, reason);
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setClosed([]);
    void useStore.setState({ whatIf: [] });
  };

  const affected = results.filter((result) => result.delta_min > 0);
  const worst = affected.reduce(
    (max, result) => (result.delta_min > max ? result.delta_min : max),
    0,
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-white/5 p-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          1 · Choose roads to close
        </h3>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          Pick one or more corridors. The twin re-routes every bus service and reports the delay.
        </p>
      </div>

      {/* ── road picker ───────────────────────────────────────────────── */}
      <div className="max-h-56 overflow-y-auto border-b border-white/5">
        {roads.map((road) => {
          const isClosed = closed.includes(road.road_id);
          return (
            <button
              key={road.road_id}
              type="button"
              onClick={() => {
                toggle(road.road_id);
                onSelect(road.road_id);
              }}
              className={`flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left text-xs transition-colors ${
                isClosed
                  ? 'bg-red-500/10 text-red-200'
                  : road.road_id === selected
                    ? 'bg-sky-500/10'
                    : 'hover:bg-white/[0.03]'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isClosed ? 'border-red-400/50 bg-red-500/20' : 'border-white/15'
                }`}
              >
                {isClosed && <CircleSlash size={10} className="text-red-300" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-200">{road.name}</span>
                <span className="font-mono text-[10px] text-slate-600">{road.road_id}</span>
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {road.congestion_pct.toFixed(0)}%
              </span>
            </button>
          );
        })}
      </div>

      {/* ── run ───────────────────────────────────────────────────────── */}
      <div className="border-b border-white/5 p-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          2 · Reason
        </h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {REASONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setReason(option)}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                reason === option
                  ? 'border-sky-400/40 bg-sky-500/15 text-sky-300'
                  : 'border-white/10 bg-ink-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={closed.length === 0 || running}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-xs font-semibold text-ink-900 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-ink-600 disabled:text-slate-500"
          >
            <Play size={13} />
            {running ? 'Simulating…' : `Close ${closed.length || 0} road${closed.length === 1 ? '' : 's'}`}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-white/10 bg-ink-700 px-2.5 text-slate-400 hover:text-slate-200"
            title="Reset"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* ── results ───────────────────────────────────────────────────── */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {results.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-4 py-8 text-center text-xs leading-relaxed text-slate-500"
            >
              Select a corridor and run the simulation. Every route gets a row — including the
              ones that are unaffected, because &ldquo;no result&rdquo; reads as &ldquo;not
              computed&rdquo;.
            </motion.p>
          ) : (
            <motion.div key="results" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  3 · Impact
                </h3>
                <span className="text-[10px] text-slate-500">
                  {affected.length} of {results.length} routes affected · worst{' '}
                  <span className="font-mono text-amber-300">{signedMinutes(worst)}</span>
                </span>
              </div>

              {results
                .slice()
                .sort((a, b) => b.delta_min - a.delta_min)
                .map((result) => (
                  <div
                    key={result.route_id}
                    className="flex items-center gap-3 border-b border-white/5 px-3 py-2.5"
                  >
                    <span className="w-10 shrink-0 font-mono text-xs font-semibold text-slate-200">
                      {result.route_id}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="font-mono">{result.baseline_min.toFixed(0)}m</span>
                        <span className="text-slate-600">→</span>
                        <span
                          className={`font-mono font-semibold ${
                            result.delta_min > 0 ? 'text-amber-300' : 'text-slate-300'
                          }`}
                        >
                          {result.simulated_min.toFixed(0)}m
                        </span>
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink-900">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (result.delta_min / Math.max(worst, 1)) * 100)}%`,
                            background: result.recommended ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </span>
                      {result.affected_passengers > 0 && (
                        <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-600">
                          <Users size={9} /> {compact(result.affected_passengers)} passengers/trip
                        </span>
                      )}
                    </span>

                    <span className="text-right">
                      <span
                        className={`block font-mono text-sm font-semibold ${
                          result.delta_min === 0
                            ? 'text-slate-500'
                            : result.recommended
                              ? 'text-amber-300'
                              : 'text-red-400'
                        }`}
                      >
                        {result.delta_min === 0 ? '—' : signedMinutes(result.delta_min)}
                      </span>
                      <span
                        className={`flex items-center justify-end gap-1 text-[9px] uppercase ${
                          result.recommended ? 'text-emerald-400' : 'text-red-400'
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
