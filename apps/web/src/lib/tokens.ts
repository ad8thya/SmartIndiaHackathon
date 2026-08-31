/**
 * The design system, in one file. Owned by M6.
 *
 * Every screen reads from here. If a colour, a duration or a radius appears
 * as a literal anywhere else, that is a bug — the whole point is that eight
 * role views and three shells still read as one product.
 *
 * Two rules that are easy to break and expensive to fix:
 *   · **Two font weights.** 400 and 500. Never 600, never 700. The Inter
 *     import in index.html only fetches those two, so a `font-bold` renders
 *     as synthetic bold and looks wrong rather than heavy.
 *   · **No gradients, no accent stripes, no decorative bars.** Colour carries
 *     meaning here — status, severity, risk. A decorative gradient competes
 *     with the ones that mean something.
 */

import type { RiskBand, RiskLevel, Severity, WorkflowStatus } from './types';

// ── motion ──────────────────────────────────────────────────────────────────
/**
 * Everything eased, nothing bouncy. This is government software: motion
 * explains what changed, it does not perform. No spring physics, no overshoot.
 */
export const MOTION = {
  /** a chip changing colour, a hover */
  fast: 0.14,
  /** the default: panel slides, list entry, page transitions */
  base: 0.22,
  /** drawers and anything crossing a large distance */
  slow: 0.36,
  /** the consensus escalation pulse — deliberately long enough to notice */
  escalate: 1.6,
  /** map camera moves */
  flyTo: 1200,
  /** staggered list entry, per item */
  stagger: 0.03,
} as const;

/** A single standard ease. `easeOut` for entrances, `easeInOut` for moves. */
export const EASE = [0.22, 0.61, 0.36, 1] as const;

export const TRANSITION = { duration: MOTION.base, ease: EASE } as const;
export const TRANSITION_FAST = { duration: MOTION.fast, ease: EASE } as const;
export const TRANSITION_SLOW = { duration: MOTION.slow, ease: EASE } as const;

/** Staggered list entry — spread onto the container, `ITEM` onto each child. */
export const STAGGER_CONTAINER = {
  animate: { transition: { staggerChildren: MOTION.stagger } },
} as const;

export const STAGGER_ITEM = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: TRANSITION,
} as const;

// ── status ──────────────────────────────────────────────────────────────────
/**
 * The escalation story, in colour: **grey → amber → red**, then green once it
 * is fixed. That is the single most important thing the map communicates, so
 * these four are fixed points and everything else shades between them.
 *
 *   DETECTED            grey    one bus, unverified
 *   AI_VERIFIED         amber   corroborated, nobody has looked yet
 *   AUTHORITY_NOTIFIED  red     confirmed — the city has been told
 *   ...through repair...
 *   RESOLVED            green   fixed
 */
export const STATUS_HEX: Record<WorkflowStatus, string> = {
  DETECTED: '#94a3b8',
  AI_VERIFIED: '#f59e0b',
  AUTHORITY_NOTIFIED: '#ef4444',
  INSPECTION: '#fb923c',
  MAINTENANCE_ASSIGNED: '#facc15',
  REPAIR_COMPLETED: '#4ade80',
  VERIFIED: '#22c55e',
  RESOLVED: '#16a34a',
  REJECTED: '#64748b',
};

/** Sentence case throughout — never SHOUTING, never Title Case. */
export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  DETECTED: 'Detected',
  AI_VERIFIED: 'AI verified',
  AUTHORITY_NOTIFIED: 'Confirmed',
  INSPECTION: 'Inspection',
  MAINTENANCE_ASSIGNED: 'Crew assigned',
  REPAIR_COMPLETED: 'Repair complete',
  VERIFIED: 'Verified',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};

/** The three rungs the fusion ladder actually escalates through. */
export const ESCALATION_RUNGS: readonly WorkflowStatus[] = [
  'DETECTED',
  'AI_VERIFIED',
  'AUTHORITY_NOTIFIED',
];

/** The rung where a defect becomes the city's problem — the demo's punchline. */
export const CONFIRMED_STATUS: WorkflowStatus = 'AUTHORITY_NOTIFIED';

// ── severity (IRC:82-2015) ──────────────────────────────────────────────────
export const SEVERITY_HEX: Record<Severity, string> = {
  SMALL: '#38bdf8',
  MEDIUM: '#f59e0b',
  LARGE: '#ef4444',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  SMALL: 'Small',
  MEDIUM: 'Medium',
  LARGE: 'Large',
};

// ── risk ────────────────────────────────────────────────────────────────────
/** M2's traffic/PCI blend. Top band SEVERE. */
export const RISK_HEX: Record<RiskLevel, string> = {
  LOW: '#22c55e',
  MODERATE: '#facc15',
  HIGH: '#f97316',
  SEVERE: '#ef4444',
};

/** The urban risk index's own scale. Top band CRITICAL — deliberately not the
 * same enum as RiskLevel above; see the contracts docstring. */
export const RISK_BAND_HEX: Record<RiskBand, string> = {
  LOW: '#22c55e',
  MODERATE: '#facc15',
  HIGH: '#f97316',
  CRITICAL: '#dc2626',
};

// ── scale ───────────────────────────────────────────────────────────────────
/**
 * Type scale, in the tailwind classes that express it. Named by role rather
 * than size so a screen asks for "the label style", not "10 pixels".
 */
export const TYPE = {
  /** screen titles */
  title: 'text-base font-medium tracking-tight',
  /** panel and card headings */
  heading: 'text-sm font-medium',
  /** body copy */
  body: 'text-[13px] font-normal',
  /** the default in dense operator panels */
  dense: 'text-[11px] font-normal',
  /** section labels above a group */
  label: 'text-[10px] font-medium tracking-wide',
  /** numbers that want to line up */
  metric: 'font-mono text-sm font-medium tabular-nums',
  /** the big number on a KPI */
  metricLarge: 'font-mono text-lg font-medium tabular-nums leading-none',
} as const;

/** Radii. Small for chips, medium for cards, large for sheets and phones. */
export const RADIUS = {
  chip: 'rounded',
  control: 'rounded-md',
  card: 'rounded-lg',
  panel: 'rounded-xl',
  sheet: 'rounded-2xl',
} as const;

/** Shadows. Operator surfaces are flat; only floating things cast one. */
export const SHADOW = {
  none: '',
  card: 'shadow-sm shadow-black/20',
  floating: 'shadow-xl shadow-black/40',
  drawer: 'shadow-2xl shadow-black/50',
} as const;
