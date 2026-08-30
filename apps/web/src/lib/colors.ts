/**
 * Colour helpers. Owned by M6.
 *
 * The vocabulary itself lives in `tokens.ts` — this file only turns it into
 * the shapes consumers need: deck.gl RGBA tuples and tailwind class strings.
 * Re-exported here so the panels that already import from `colors` keep
 * working; new code can import either.
 */

import {
  RISK_BAND_HEX,
  RISK_HEX,
  SEVERITY_HEX,
  STATUS_HEX,
  STATUS_LABEL,
} from './tokens';
import type { DetectionClass, RiskBand, RiskLevel, Severity, WorkflowStatus } from './types';

export { RISK_BAND_HEX, RISK_HEX, SEVERITY_HEX, STATUS_HEX, STATUS_LABEL };

export type RGBA = [number, number, number, number];

export const CLASS_LABEL: Record<DetectionClass, string> = {
  POTHOLE: 'Pothole',
  LONGITUDINAL_CRACK: 'Longitudinal crack',
  TRANSVERSE_CRACK: 'Transverse crack',
  ALLIGATOR_CRACK: 'Alligator crack',
  WATERLOGGING: 'Waterlogging',
  DAMAGED_DIVIDER: 'Damaged divider',
  DAMAGED_SIGN: 'Damaged sign',
  ZEBRA_CROSSING: 'Zebra crossing',
  VEHICLE: 'Vehicle',
  PEDESTRIAN: 'Pedestrian',
  PEDESTRIAN_RISK: 'Pedestrian at risk',
  RASH_DRIVING: 'Rash driving',
  COLLISION: 'Collision',
  NEAR_MISS: 'Near miss',
};

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
    alpha,
  ];
}

export function statusColor(status: WorkflowStatus, alpha = 220): RGBA {
  return hexToRgba(STATUS_HEX[status], alpha);
}

/** Congestion 0–100 → green through amber to red. */
export function congestionColor(pct: number, alpha = 200): RGBA {
  const t = Math.min(Math.max(pct, 0), 100) / 100;
  const r = t < 0.5 ? Math.round(80 + t * 2 * 175) : 255;
  const g = t < 0.5 ? 200 : Math.round(200 - (t - 0.5) * 2 * 180);
  return [r, g, 70, alpha];
}

/** Tailwind class helpers, so panels do not hand-roll conditional strings. */
export function statusChipClass(status: WorkflowStatus): string {
  if (status === 'DETECTED' || status === 'REJECTED')
    return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  if (status === 'AUTHORITY_NOTIFIED')
    return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (status === 'RESOLVED' || status === 'VERIFIED' || status === 'REPAIR_COMPLETED')
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
}

export function severityChipClass(severity: Severity): string {
  return {
    SMALL: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    LARGE: 'bg-red-500/15 text-red-300 border-red-500/30',
  }[severity];
}

export function riskChipClass(risk: RiskLevel): string {
  return {
    LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    MODERATE: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    SEVERE: 'bg-red-500/15 text-red-300 border-red-500/30',
  }[risk];
}

export function riskBandChipClass(band: RiskBand): string {
  return {
    LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    MODERATE: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    CRITICAL: 'bg-red-500/15 text-red-300 border-red-500/30',
  }[band];
}
