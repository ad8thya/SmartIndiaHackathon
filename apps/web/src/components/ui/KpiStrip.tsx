/**
 * The KPI strip. Owned by M6.
 *
 * Numbers count to their new value rather than snapping (see AnimatedNumber),
 * because the strip refreshes on a timer and a silent jump is invisible. Each
 * cell is optional so a role scope can show a subset without the layout
 * collapsing into a ragged row.
 */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

import { AnimatedNumber, Skeleton } from './index';
import { STAGGER_ITEM } from '../../lib/tokens';

export interface Kpi {
  key: string;
  icon: ReactNode;
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  tone?: 'default' | 'warn' | 'good';
  /** shown instead of the number when the value is not a number */
  text?: string;
}

export function KpiStrip({ items, loading }: { items: Kpi[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center gap-6 px-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-2 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center overflow-x-auto">
      {items.map((item) => {
        const tone =
          item.tone === 'warn'
            ? 'text-amber-300'
            : item.tone === 'good'
              ? 'text-emerald-300'
              : 'text-sky-300';
        return (
          <motion.div
            key={item.key}
            {...STAGGER_ITEM}
            className="flex shrink-0 items-center gap-2.5 border-r border-white/5 px-4 last:border-none"
          >
            <span className={tone}>{item.icon}</span>
            <div className="leading-tight">
              <div className="font-mono text-sm tabular-nums text-slate-100">
                {item.text ?? (
                  <AnimatedNumber
                    value={item.value}
                    decimals={item.decimals ?? 0}
                    suffix={item.suffix ?? ''}
                  />
                )}
              </div>
              <div className="text-[10px] tracking-wide text-slate-500">{item.label}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
