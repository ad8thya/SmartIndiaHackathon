/**
 * The shared component vocabulary. Owned by M6.
 *
 * Built once, used by every panel, every role view and both phone shells. A
 * screen that hand-rolls its own status chip will drift from the map's colours
 * within a day — that has already happened once in this repo, which is why
 * these exist.
 *
 * Everything here is presentational: no fetching, no store access, no routing.
 * Pass data in, get a rendered thing out.
 */

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

import {
  RISK_BAND_HEX,
  SEVERITY_HEX,
  SEVERITY_LABEL,
  STATUS_HEX,
  STATUS_LABEL,
  TRANSITION,
  TRANSITION_FAST,
} from '../../lib/tokens';
import type { RiskBand, Severity, WorkflowStatus } from '../../lib/types';

// ── StatusPill ──────────────────────────────────────────────────────────────
/**
 * One workflow status. The dot carries the colour so the text stays readable
 * at small sizes, and the colour transitions rather than cutting — an event
 * escalating from amber to red should be *seen* to escalate.
 */
export function StatusPill({
  status,
  label,
  compact = false,
}: {
  status: WorkflowStatus;
  /** override the wording, e.g. the citizen-facing plain-language version */
  label?: string;
  compact?: boolean;
}) {
  const color = STATUS_HEX[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
      style={{ borderColor: `${color}44`, backgroundColor: `${color}14`, color }}
    >
      <motion.span
        layout
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        animate={{ backgroundColor: color }}
        transition={TRANSITION}
      />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

// ── SeverityChip ────────────────────────────────────────────────────────────
export function SeverityChip({ severity, compact = false }: { severity: Severity; compact?: boolean }) {
  const color = SEVERITY_HEX[severity];
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
      style={{ borderColor: `${color}44`, backgroundColor: `${color}14`, color }}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

// ── RiskChip ────────────────────────────────────────────────────────────────
export function RiskChip({ band, score }: { band: RiskBand; score?: number | null }) {
  const color = RISK_BAND_HEX[band];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]"
      style={{ borderColor: `${color}44`, backgroundColor: `${color}14`, color }}
    >
      {band.toLowerCase().replace(/^./, (c) => c.toUpperCase())}
      {score != null && <span className="font-mono tabular-nums opacity-80">{score.toFixed(0)}</span>}
    </span>
  );
}

// ── ConfidenceBar ───────────────────────────────────────────────────────────
/**
 * The corroboration read, and the single most interrogated number in the
 * product. It deliberately leads with the **bus count**, not the confidence
 * percentage: three vehicles seeing the same pothole is the evidence; the
 * percentage is derived from it.
 */
export function ConfidenceBar({
  confidence,
  busCount,
  observationCount,
}: {
  confidence: number;
  busCount: number;
  observationCount?: number;
}) {
  const pct = Math.round(confidence * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-300">
          Detected by {busCount} bus{busCount === 1 ? '' : 'es'}
        </span>
        <span className="font-mono tabular-nums text-slate-400">{pct}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: busCount >= 3 ? '#ef4444' : busCount >= 2 ? '#f59e0b' : '#94a3b8' }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={TRANSITION}
        />
      </div>
      {observationCount != null && (
        <p className="mt-1 text-[10px] text-slate-500">
          {observationCount} sighting{observationCount === 1 ? '' : 's'} fused
        </p>
      )}
    </div>
  );
}

// ── AnimatedNumber ──────────────────────────────────────────────────────────
/**
 * Counts to a new value rather than snapping. On a KPI strip that refreshes
 * every 8 seconds, a number that jumps is easy to miss; one that rolls is not.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    if (delta === 0) return;

    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      // easeOutCubic — fast then settling, never overshooting
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + delta * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="tabular-nums">
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────
/** A bare trend line. No axes, no grid — it answers "up or down", nothing more. */
export function Sparkline({
  values,
  color = '#38bdf8',
  width = 88,
  height = 24,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} className="rounded bg-white/5" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────
/**
 * What a screen shows instead of nothing. Every unbuilt or empty surface gets
 * one of these — a blank panel reads as a crash, and during a demo it *is* one.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  tone = 'dark',
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  tone?: 'dark' | 'light';
}) {
  const muted = tone === 'dark' ? 'text-slate-500' : 'text-muted';
  const heading = tone === 'dark' ? 'text-slate-300' : 'text-ink';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={TRANSITION}
      className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
    >
      {icon && <span className={muted}>{icon}</span>}
      <p className={`text-[13px] ${heading}`}>{title}</p>
      {body && <p className={`max-w-[34ch] text-[11px] leading-relaxed ${muted}`}>{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
/** A loading placeholder shaped like the thing it is waiting for. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-2.5 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── DataTable ───────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: string;
  /** right-align numbers so they compare down the column */
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

/**
 * A dense, sortable-by-caller table. Wide content scrolls inside its own
 * container so the page itself never scrolls sideways.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-white/5">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2 font-medium tracking-wide text-slate-500 ${
                  column.numeric ? 'text-right' : 'text-left'
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row);
            const active = key === selectedKey;
            return (
              <motion.tr
                key={key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...TRANSITION_FAST, delay: Math.min(index * 0.015, 0.2) }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-white/5 ${
                  onRowClick ? 'cursor-pointer hover:bg-white/[0.03]' : ''
                } ${active ? 'bg-sky-500/10' : ''}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 text-slate-300 ${
                      column.numeric ? 'text-right font-mono tabular-nums' : ''
                    }`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────
export interface TimelineStep {
  key: string;
  label: string;
  detail?: string;
  color?: string;
  done: boolean;
  current?: boolean;
}

/** The workflow ladder as a vertical trail. Used by the event drawer. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((step, index) => {
        const color = step.color ?? (step.done ? '#22c55e' : '#334155');
        return (
          <li key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
            {index < steps.length - 1 && (
              <span
                className="absolute left-[5px] top-3 h-full w-px"
                style={{ backgroundColor: step.done ? `${color}66` : '#1e293b' }}
              />
            )}
            <motion.span
              className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-ink-800"
              style={{ backgroundColor: color }}
              initial={{ scale: 0.6 }}
              animate={{ scale: step.current ? 1.15 : 1 }}
              transition={TRANSITION}
            />
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] ${step.done ? 'text-slate-200' : 'text-slate-500'}`}>
                {step.label}
              </p>
              {step.detail && <p className="text-[10px] text-slate-600">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Kanban ──────────────────────────────────────────────────────────────────
export interface KanbanColumn<T> {
  key: string;
  title: string;
  color?: string;
  items: T[];
}

/** Columns of cards. The board scrolls sideways; the page does not. */
export function Kanban<T>({
  columns,
  renderCard,
  cardKey,
  onCardClick,
}: {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => ReactNode;
  cardKey: (item: T) => string;
  onCardClick?: (item: T) => void;
}) {
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-3">
      {columns.map((column) => (
        <div key={column.key} className="flex w-60 shrink-0 flex-col">
          <div className="mb-2 flex items-center gap-2">
            {column.color && (
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
            )}
            <span className="text-[11px] text-slate-300">{column.title}</span>
            <span className="font-mono text-[10px] tabular-nums text-slate-600">
              {column.items.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {column.items.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[10px] text-slate-600">
                Nothing here
              </p>
            )}
            {column.items.map((item, index) => (
              <motion.button
                key={cardKey(item)}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...TRANSITION, delay: Math.min(index * 0.02, 0.2) }}
                onClick={onCardClick ? () => onCardClick(item) : undefined}
                className="w-full rounded-lg border border-white/10 bg-ink-700/60 p-2.5 text-left hover:border-white/20"
              >
                {renderCard(item)}
              </motion.button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MapHoverCard ────────────────────────────────────────────────────────────
/** The floating card that follows the cursor over the map. */
export function MapHoverCard({
  x,
  y,
  title,
  lines,
}: {
  x: number;
  y: number;
  title: string;
  lines?: string[];
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[260px] rounded-md border border-white/10 bg-ink-800/95 px-2.5 py-1.5 shadow-xl shadow-black/40 backdrop-blur"
      style={{ left: x + 12, top: y + 12 }}
    >
      <p className="text-[11px] text-slate-100">{title}</p>
      {lines?.map((line) => (
        <p key={line} className="text-[10px] text-slate-400">
          {line}
        </p>
      ))}
    </div>
  );
}

// ── FloatingControlBar ──────────────────────────────────────────────────────
/** The layer toggles that sit over the map rather than in the chrome. */
export function FloatingControlBar({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={TRANSITION}
      className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-lg border border-white/10 bg-ink-800/90 p-1 shadow-xl shadow-black/30 backdrop-blur"
    >
      {children}
    </motion.div>
  );
}

export function ControlButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md px-2 py-1.5 transition-colors ${
        active ? 'bg-sky-500/15 text-sky-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

// ── ErrorNote ───────────────────────────────────────────────────────────────
/** A non-fatal problem, stated plainly. Never a bare red box. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
