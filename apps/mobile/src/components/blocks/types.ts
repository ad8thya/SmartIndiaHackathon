/**
 * A screen is a list of typed blocks.
 *
 * This is the one idea worth keeping from the design canvas export. Every
 * screen there is a config-driven array of blocks — `label`, `cards`,
 * `controls`, `emptyAction` — rendered by one dispatcher. The export expressed
 * it as a stack of `<sc-if b.isFoo>` branches with no types; here it is a
 * discriminated union, so the compiler enforces what that file only hoped for:
 * a block carries exactly the fields its kind needs, and adding a kind without
 * handling it fails the build rather than rendering nothing.
 *
 * The payoff is that adding a screen to a role is a config change. Four roles
 * with four or five screens each is twenty screens; twenty bespoke components
 * is twenty copies of the same card to keep in sync for the rest of the
 * project.
 *
 * `custom` is the escape hatch, and it is meant to stay rare. If a screen is
 * mostly `custom`, it wanted a component, not a block list — the citizen
 * report wizard and the map screens are exactly that, and they are components.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** A tinted pill. `tone` is meaning, not colour — the renderer picks the hue. */
export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad';

export interface Chip {
  label: string;
  tone?: Tone;
}

export interface BlockAction {
  label: string;
  /** A route to navigate to, or a handler. Exactly one — never neither. */
  to?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  tone?: Tone;
}

/** The big touch-target cards on the citizen home screen. */
export interface HubCard {
  id: string;
  emoji: string;
  title: string;
  sub: string;
  to: string;
  /** Left border colour, as a hex string. */
  accent: string;
  tint: string;
}

/** The workhorse: one row in almost every list in the app. */
export interface InfoCard {
  id: string;
  title: string;
  sub?: string;
  chips?: Chip[];
  /** Right-aligned, small — a timestamp or a distance. */
  meta?: string;
  photoUri?: string;
  photoBadge?: string;
  /** Icon + text rows under a divider. */
  details?: { icon: LucideIcon; text: string }[];
  /** 0–1. Renders a thin bar with `progressLabel` beside it. */
  progress?: number;
  progressLabel?: string;
  progressTone?: Tone;
  /** Left edge stripe. Used by Emergency, where severity must read instantly. */
  stripe?: Tone;
  primary?: BlockAction;
  secondary?: BlockAction;
  /** Whole-card tap, for cards that open a detail screen. */
  to?: string;
  onClick?: () => void;
}

export interface Kpi {
  id: string;
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
}

export interface ListRow {
  id: string;
  icon?: LucideIcon;
  label: string;
  value?: string;
  tone?: Tone;
  to?: string;
  onClick?: () => void;
}

/** A vertical timeline. Used for a report's history and a work order's steps. */
export interface Step {
  id: string;
  label: string;
  detail?: string;
  state: 'done' | 'current' | 'todo';
}

export type Block =
  /** A small uppercase section heading with a dot, as in the design. */
  | { kind: 'label'; id: string; text: string }
  /** The emerald citizen banner. The ONLY gradient in this app. */
  | { kind: 'hero'; id: string; emoji: string; title: string; sub: string }
  /** The guided-onboarding strip: one line telling you what this screen is for. */
  | { kind: 'guide'; id: string; icon: LucideIcon; text: string; tone?: Tone }
  | { kind: 'hub'; id: string; cards: HubCard[] }
  | { kind: 'cards'; id: string; items: InfoCard[] }
  | { kind: 'kpis'; id: string; items: Kpi[] }
  | { kind: 'filters'; id: string; items: { id: string; label: string; count?: number; active: boolean; onClick: () => void }[] }
  | { kind: 'list'; id: string; rows: ListRow[] }
  | { kind: 'steps'; id: string; steps: Step[] }
  | { kind: 'note'; id: string; icon?: LucideIcon; text: string }
  | { kind: 'empty'; id: string; icon: LucideIcon; title: string; sub: string; action?: BlockAction }
  | { kind: 'skeleton'; id: string; rows?: number }
  | { kind: 'custom'; id: string; node: ReactNode };

/** Tailwind classes per tone. One table, so a tone means one thing everywhere. */
export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-ink/[0.06] text-ink-muted',
  accent: 'bg-accent/10 text-accent',
  good: 'bg-emerald/12 text-emerald',
  warn: 'bg-amber/12 text-amber',
  bad: 'bg-danger/10 text-danger',
};

export const TONE_SOLID: Record<Tone, string> = {
  neutral: 'bg-ink-soft text-white',
  accent: 'bg-accent text-white',
  good: 'bg-emerald text-white',
  warn: 'bg-amber text-white',
  bad: 'bg-danger text-white',
};

export const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-ink-faint',
  accent: 'bg-accent',
  good: 'bg-emerald',
  warn: 'bg-amber',
  bad: 'bg-danger',
};

export const TONE_STRIPE: Record<Tone, string> = {
  neutral: 'bg-ink-faint',
  accent: 'bg-accent',
  good: 'bg-emerald',
  warn: 'bg-amber',
  bad: 'bg-danger',
};
