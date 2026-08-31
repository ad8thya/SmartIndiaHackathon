/**
 * Loading / error / empty status for a full-bleed map screen.
 *
 * List screens use skeleton cards, which occupy the space content will fill.
 * A map cannot do that — the canvas is already the whole screen, and a
 * skeleton over it would hide the one thing the user came for. So a map says
 * its state in a small pill pinned to the canvas instead, and the map keeps
 * rendering underneath.
 *
 * The distinction that matters is between "nothing here" and "I could not
 * ask". An empty map and an unreachable API look identical, and telling a
 * crew "no work orders" when the truth is "no signal" is the stale-data lie
 * this app is not allowed to tell.
 */

import { CloudOff, Loader2 } from 'lucide-react';

export function MapStatus({
  loading,
  error,
  count,
  emptyLabel,
  countLabel,
}: {
  loading: boolean;
  error: string | null;
  count: number;
  /** Shown when the API answered and there is genuinely nothing. */
  emptyLabel: string;
  /** Renders the normal state, e.g. "12 confirmed nearby". */
  countLabel: (count: number) => string;
}) {
  if (loading) {
    return (
      <Pill>
        <Loader2 size={12} className="animate-spin text-accent" />
        Loading…
      </Pill>
    );
  }

  if (error) {
    return (
      <Pill tone="warn">
        <CloudOff size={12} className="text-amber" />
        Offline — showing what this phone already had
      </Pill>
    );
  }

  return (
    <Pill>
      <span className={`h-1.5 w-1.5 rounded-full ${count > 0 ? 'bg-emerald' : 'bg-ink-faint'}`} />
      {count > 0 ? countLabel(count) : emptyLabel}
    </Pill>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div
      className={`pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-[0_1px_4px_rgba(0,0,0,0.08)] backdrop-blur ${
        tone === 'warn' ? 'border-amber/30 bg-amber/15 text-amber' : 'border-line bg-card/95'
      }`}
    >
      {children}
    </div>
  );
}
