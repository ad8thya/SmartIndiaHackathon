/**
 * Role-scoping for the command centre. Owned by M6.
 *
 * NOT an access-control system — there is no auth anywhere in Urban Twin yet
 * (see apps/field's hardcoded MY_TEAM, apps/roles' localStorage-only role).
 * A `?role=` query param pre-seeds which panels/KPIs/event classes a demo
 * viewer sees by default. It is a starting point, not a lock: `TopBar`'s
 * "Show everything" control calls `overrideScope()`, which resets the global
 * filters and un-restricts panels/KPIs for the rest of the session. Never
 * gate a write action or a data fetch on `role` — only on-screen visibility.
 *
 * Safe-default is load-bearing: `resolveRole` returns `null` for anything it
 * doesn't recognise (missing param, typo, or a role apps/roles keeps for
 * itself — bus-driver, citizen). Every consumer of `getScope()` must treat
 * `null` as "no restriction" — never as "restrict to nothing". Opening
 * localhost:5173 directly, with no query param, must show the full app.
 */

import type { DetectionClass } from './types';

export type RoleId =
  | 'bus-driver'
  | 'municipal-authority'
  | 'road-maintenance'
  | 'traffic-police'
  | 'emergency-team'
  | 'citizen'
  | 'urban-planner'
  | 'smart-city-admin';

const KNOWN_ROLES: readonly RoleId[] = [
  'bus-driver',
  'municipal-authority',
  'road-maintenance',
  'traffic-police',
  'emergency-team',
  'citizen',
  'urban-planner',
  'smart-city-admin',
];

export type KpiKey = 'buses' | 'km' | 'events' | 'speed' | 'sla';

export interface RoleScope {
  label: string;
  /** Sidebar tab ids (see Sidebar.tsx's TABS) this role sees, in order. */
  panels: string[];
  /** pre-seeds Filters.classes; undefined = no class restriction. */
  classes?: DetectionClass[];
  kpis: KpiKey[];
}

const INFRA_CLASSES: DetectionClass[] = [
  'POTHOLE',
  'LONGITUDINAL_CRACK',
  'TRANSVERSE_CRACK',
  'ALLIGATOR_CRACK',
  'WATERLOGGING',
  'DAMAGED_DIVIDER',
  'DAMAGED_SIGN',
  'ZEBRA_CROSSING',
];

const SAFETY_CLASSES: DetectionClass[] = ['PEDESTRIAN_RISK', 'RASH_DRIVING', 'COLLISION', 'NEAR_MISS'];

/**
 * Deliberately only 6 of the 8 roles. Bus Driver and Citizen are absent on
 * purpose, not by omission: neither fits a fixed-layout desktop console
 * (App.tsx is `h-screen w-screen` with no responsive breakpoint below `lg`),
 * and both already have a real, purpose-built screen in apps/roles (MyBus,
 * Report). If either id reaches this map anyway, `getScope` returns `null`
 * (the same "show everything" path as an unrecognised role) rather than
 * forcing them into a console that was never built for them.
 */
export const ROLE_SCOPES: Partial<Record<RoleId, RoleScope>> = {
  'municipal-authority': {
    label: 'Municipal Authority',
    panels: ['defects', 'reports', 'traffic', 'whatif', 'risk', 'incidents', 'intelligence'],
    kpis: ['buses', 'km', 'events', 'speed', 'sla'],
  },
  'road-maintenance': {
    label: 'Road Maintenance',
    panels: ['defects', 'reports'],
    classes: INFRA_CLASSES,
    kpis: ['events', 'sla'],
  },
  'traffic-police': {
    label: 'Traffic Police',
    panels: ['traffic', 'incidents', 'intelligence'],
    classes: SAFETY_CLASSES,
    kpis: ['buses', 'speed', 'events'],
  },
  'emergency-team': {
    label: 'Emergency Team',
    panels: ['incidents', 'intelligence'],
    classes: SAFETY_CLASSES,
    kpis: ['buses', 'events'],
  },
  'urban-planner': {
    label: 'Urban Planner',
    panels: ['intelligence', 'risk', 'whatif'],
    kpis: ['km', 'speed'],
  },
  'smart-city-admin': {
    label: 'Smart City Admin',
    panels: ['defects', 'reports', 'traffic', 'whatif', 'risk', 'incidents', 'intelligence'],
    kpis: ['buses', 'km', 'events', 'speed', 'sla'],
  },
};

/** Strict allowlist. Missing, malformed, empty, or unrecognised → null. */
export function resolveRole(raw: string | null): RoleId | null {
  if (!raw) return null;
  return (KNOWN_ROLES as readonly string[]).includes(raw) ? (raw as RoleId) : null;
}

/** null means "no restriction" — render everything. Never returns an empty scope. */
export function getScope(role: RoleId | null): RoleScope | null {
  if (!role) return null;
  return ROLE_SCOPES[role] ?? null;
}
