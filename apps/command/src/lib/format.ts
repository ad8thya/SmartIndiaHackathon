/** Small formatting helpers shared by every panel. Owned by M6. */

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function pct(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export function inr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function compact(value: number): string {
  return new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(value);
}

/** "+6.0 min" / "−2.5 min" — the sign is the point, so it is always shown. */
export function signedMinutes(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(1)} min`;
}

/** SLA clock: how long is left, or how far past due. */
export function slaLabel(slaDue: string | null, now: Date = new Date()): {
  text: string;
  breached: boolean;
} {
  if (!slaDue) return { text: 'no SLA', breached: false };
  const remaining = new Date(slaDue).getTime() - now.getTime();
  const hours = Math.abs(remaining) / 3_600_000;
  const text =
    hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
  return remaining < 0
    ? { text: `${text} overdue`, breached: true }
    : { text: `${text} left`, breached: false };
}
