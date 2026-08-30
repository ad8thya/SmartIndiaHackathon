/**
 * ══════════════════════════════════════════════════════════════════════════
 *  M2 OWNS THIS FILE (with WhatIfPanel.tsx). Nobody else edits it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Network traffic state: which corridors are moving, which are not, and what
 * that is costing the bus fleet in delay.
 *
 * TODO (M2):
 *   · replace the density bar chart with a 24h time series once the API keeps
 *     history (ask M5 for /api/roads/{id}/history)
 *   · show the fundamental diagram (density vs flow) for the selected road —
 *     it is the one chart that makes a traffic engineer trust the numbers
 *   · surface which buses are contributing samples to each corridor
 */

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Gauge, Flame, TrendingDown, Waves } from 'lucide-react';
import type { PanelProps, RoadCondition } from '../lib/types';
import { RISK_HEX, riskChipClass } from '../lib/colors';
import { useStore } from '../store/useStore';
import { pct } from '../lib/format';

export function TrafficPanel({ roads, selected, onSelect }: PanelProps) {
  const showHeatmap = useStore((s) => s.showHeatmap);
  const toggleHeatmap = useStore((s) => s.toggleHeatmap);

  const sorted = useMemo(
    () => [...roads].sort((a, b) => b.congestion_pct - a.congestion_pct),
    [roads],
  );
  const bottlenecks = sorted.slice(0, 8);
  const selectedRoad = roads.find((road) => road.road_id === selected) ?? null;

  const networkAverage = roads.length
    ? roads.reduce((total, road) => total + road.congestion_pct, 0) / roads.length
    : 0;
  const totalDelay = roads.reduce((total, road) => total + road.bus_delay_min, 0);

  if (roads.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-xs text-slate-500">
        No road conditions yet — the API returns them from M2&apos;s TrafficAnalyzer once it is up.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── network summary ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 border-b border-white/5 p-3">
        <Stat icon={<Gauge size={13} />} label="Network" value={pct(networkAverage)} />
        <Stat
          icon={<TrendingDown size={13} />}
          label="Fleet delay"
          value={`${totalDelay.toFixed(0)}m`}
          tone="warn"
        />
        <Stat
          icon={<Waves size={13} />}
          label="Corridors"
          value={String(roads.length)}
        />
      </div>

      <div className="border-b border-white/5 px-3 py-2">
        <button
          type="button"
          onClick={toggleHeatmap}
          className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            showHeatmap
              ? 'border-orange-400/40 bg-orange-500/10 text-orange-300'
              : 'border-white/10 bg-ink-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Flame size={13} /> Congestion heatmap
          </span>
          <span className="font-mono text-[10px] uppercase">{showHeatmap ? 'on' : 'off'}</span>
        </button>
      </div>

      {/* ── bottlenecks chart ─────────────────────────────────────────── */}
      <div className="border-b border-white/5 p-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Worst corridors now
        </h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bottlenecks.map((road) => ({
                name: road.name.replace(/ (Road|Salai|High Road)$/, ''),
                congestion: Math.round(road.congestion_pct),
                road_id: road.road_id,
                risk: road.risk_level,
              }))}
              layout="vertical"
              margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            >
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tick={{ fill: '#94a3b8', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{
                  background: '#0d1220',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: number) => [`${value}% congested`, '']}
              />
              <Bar
                dataKey="congestion"
                radius={[0, 4, 4, 0]}
                onClick={(data: { road_id?: string }) => data.road_id && onSelect(data.road_id)}
                cursor="pointer"
              >
                {bottlenecks.map((road) => (
                  <Cell key={road.road_id} fill={RISK_HEX[road.risk_level]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── selected road detail ──────────────────────────────────────── */}
      {selectedRoad && <RoadDetail road={selectedRoad} />}

      {/* ── every corridor ────────────────────────────────────────────── */}
      <div className="flex-1">
        <h3 className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          All corridors
        </h3>
        {sorted.map((road) => (
          <button
            key={road.road_id}
            type="button"
            onClick={() => onSelect(road.road_id === selected ? null : road.road_id)}
            className={`flex w-full items-center gap-2 border-b border-white/5 px-3 py-2 text-left transition-colors ${
              road.road_id === selected ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-slate-200">{road.name}</span>
              <span className="font-mono text-[10px] text-slate-600">{road.road_id}</span>
            </span>
            <span className="text-right">
              <span className="block font-mono text-xs text-slate-300">
                {road.avg_speed_kmph.toFixed(0)} km/h
              </span>
              <span className={`text-[9px] uppercase ${riskChipClass(road.risk_level).split(' ')[1]}`}>
                {road.risk_level}
              </span>
            </span>
            <span className="h-8 w-1.5 overflow-hidden rounded-full bg-ink-900">
              <span
                className="block w-full rounded-full transition-all"
                style={{
                  height: `${road.congestion_pct}%`,
                  marginTop: `${100 - road.congestion_pct}%`,
                  background: RISK_HEX[road.risk_level],
                }}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RoadDetail({ road }: { road: RoadCondition }) {
  const defects = Object.entries(road.defect_counts);
  return (
    <div className="border-b border-white/5 bg-ink-900/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{road.name}</h3>
          <p className="font-mono text-[10px] text-slate-500">{road.road_id}</p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${riskChipClass(road.risk_level)}`}>
          {road.risk_level}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Congestion" value={pct(road.congestion_pct)} />
        <Metric label="Avg speed" value={`${road.avg_speed_kmph.toFixed(1)} km/h`} />
        <Metric label="Density" value={`${road.density.toFixed(0)} veh/km`} />
        <Metric label="Bus delay" value={`${road.bus_delay_min.toFixed(1)} min`} />
      </dl>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
          <span>Pavement condition index</span>
          <span className="font-mono text-slate-300">{road.pci_score.toFixed(0)}/100</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-900">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${road.pci_score}%`,
              background:
                road.pci_score > 70 ? '#22c55e' : road.pci_score > 40 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
      </div>

      {defects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {defects.map(([name, count]) => (
            <span
              key={name}
              className="rounded-full border border-white/10 bg-ink-700 px-2 py-0.5 text-[10px] text-slate-400"
            >
              {name.replace(/_/g, ' ').toLowerCase()} <span className="font-mono">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-700/60 px-2 py-2">
      <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${tone === 'warn' ? 'text-amber-400' : 'text-slate-500'}`}>
        {icon} {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/5 bg-ink-800/60 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="font-mono text-xs text-slate-200">{value}</dd>
    </div>
  );
}
