/**
 * RBAC matrix, in code. Source of truth for the human-readable version:
 * `apps/roles/README.md`. Keep the two in sync — this file drives what the
 * app actually shows/allows; the README explains it to a person.
 *
 * One shell, one set of shared screens (Feed / Map / Incidents / Analytics /
 * MyBus / Report), and every role differs only by this config — which tabs
 * it sees, which detection classes its feed is scoped to, and which write
 * actions it's allowed. That's deliberate: eight bespoke apps would mean
 * eight copies of the same event card to keep in sync for the rest of the
 * project; one data-driven shell means a permission change is a one-line
 * diff here instead of a hunt through eight folders.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Ambulance,
  Bus,
  Construction,
  Crown,
  LandPlot,
  Siren,
  User,
  Wrench,
} from 'lucide-react';
import type { DetectionClass, WorkflowStatus } from '../lib/api';

export type RoleId =
  | 'bus-driver'
  | 'municipal-authority'
  | 'road-maintenance'
  | 'traffic-police'
  | 'emergency-team'
  | 'citizen'
  | 'urban-planner'
  | 'smart-city-admin';

export type TabId =
  | 'feed'
  | 'map'
  | 'incidents'
  | 'analytics'
  | 'bus'
  | 'report'
  | 'admin'
  | 'route';

export type ReportLevel = 'none' | 'limited' | 'full';
export type AnalyticsLevel = 'none' | 'limited' | 'traffic' | 'full';

export interface RoleConfig {
  id: RoleId;
  label: string;
  tagline: string;
  icon: LucideIcon;
  /** shown on the role picker card, mirrors the README RBAC table exactly */
  permissions: {
    view: string;
    report: ReportLevel;
    reportLabel: string;
    analytics: AnalyticsLevel;
    analyticsLabel: string;
    approve: boolean;
    admin: boolean;
  };
  tabs: Array<{ id: TabId; label: string }>;
  /** which detection classes this role's Feed/Map is scoped to; undefined = all */
  feedClasses?: DetectionClass[];
  /**
   * This role sees the *public* dataset only — confirmed, acted-on events with
   * no operator internals attached. Set for `citizen`; see PUBLIC_STATUSES.
   */
  publicOnly?: boolean;
  homeTab: TabId;
}

/**
 * What a member of the public is allowed to see on the map.
 *
 * The workflow ladder starts with machine output: DETECTED is one bus with low
 * confidence, AI_VERIFIED is corroborated but nobody has looked at it yet.
 * Publishing those would put unreviewed algorithmic accusations about specific
 * streets in front of citizens, and REJECTED would publish the ones the city
 * looked at and disagreed with. So the public map starts at
 * AUTHORITY_NOTIFIED — the rung where a human has been told and the city owns
 * the item — and runs to RESOLVED.
 *
 * The operator console is unaffected: it still shows all nine states. This is
 * the one place the two datasets deliberately differ.
 */
export const PUBLIC_STATUSES: ReadonlySet<WorkflowStatus> = new Set<WorkflowStatus>([
  'AUTHORITY_NOTIFIED',
  'INSPECTION',
  'MAINTENANCE_ASSIGNED',
  'REPAIR_COMPLETED',
  'VERIFIED',
  'RESOLVED',
]);

/**
 * Plain-language status for the public map. An operator reads
 * "MAINTENANCE_ASSIGNED"; a citizen should read "being fixed" — and should
 * never be shown a confidence score or which bus saw it.
 */
export const PUBLIC_STATUS_LABEL: Record<string, string> = {
  AUTHORITY_NOTIFIED: 'Reported to the city',
  INSPECTION: 'Being inspected',
  MAINTENANCE_ASSIGNED: 'Repair scheduled',
  REPAIR_COMPLETED: 'Repaired',
  VERIFIED: 'Repair verified',
  RESOLVED: 'Fixed',
};

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

const SAFETY_CLASSES: DetectionClass[] = ['RASH_DRIVING', 'COLLISION', 'NEAR_MISS'];

export const ROLES: Record<RoleId, RoleConfig> = {
  'bus-driver': {
    id: 'bus-driver',
    label: 'Bus Driver',
    tagline: 'Own bus & camera status',
    icon: Bus,
    permissions: {
      view: 'Own Bus, Camera Status',
      report: 'none',
      reportLabel: '—',
      analytics: 'none',
      analyticsLabel: '—',
      approve: false,
      admin: false,
    },
    tabs: [{ id: 'bus', label: 'My Bus' }],
    homeTab: 'bus',
  },
  'municipal-authority': {
    id: 'municipal-authority',
    label: 'Municipal Authority',
    tagline: 'Full view, report & approve',
    icon: Crown,
    permissions: {
      view: 'Everything',
      report: 'full',
      reportLabel: 'Full',
      analytics: 'full',
      analyticsLabel: 'Full',
      approve: true,
      admin: false,
    },
    tabs: [
      { id: 'feed', label: 'Feed' },
      { id: 'map', label: 'Map' },
      { id: 'route', label: 'Plan Route' },
      { id: 'analytics', label: 'Analytics' },
    ],
    homeTab: 'feed',
  },
  'road-maintenance': {
    id: 'road-maintenance',
    label: 'Road Maintenance',
    tagline: 'Assigned roads & repair status',
    icon: Construction,
    permissions: {
      view: 'Assigned Roads, Repair Status',
      report: 'limited',
      reportLabel: 'Limited',
      analytics: 'none',
      analyticsLabel: '—',
      approve: true,
      admin: false,
    },
    tabs: [
      { id: 'feed', label: 'Work Orders' },
      { id: 'map', label: 'Map' },
    ],
    feedClasses: INFRA_CLASSES,
    homeTab: 'feed',
  },
  'traffic-police': {
    id: 'traffic-police',
    label: 'Traffic Police',
    tagline: 'Traffic & incidents',
    icon: Siren,
    permissions: {
      view: 'Traffic & Incidents',
      report: 'limited',
      reportLabel: 'Incident Actions',
      analytics: 'traffic',
      analyticsLabel: 'Traffic Analytics',
      approve: false,
      admin: false,
    },
    tabs: [
      { id: 'incidents', label: 'Incidents' },
      { id: 'map', label: 'Map' },
      { id: 'analytics', label: 'Traffic' },
    ],
    homeTab: 'incidents',
  },
  'emergency-team': {
    id: 'emergency-team',
    label: 'Emergency Team',
    tagline: 'Accident alerts & response',
    icon: Ambulance,
    permissions: {
      view: 'Accident Alerts',
      report: 'limited',
      reportLabel: 'Response Status',
      analytics: 'none',
      analyticsLabel: '—',
      approve: false,
      admin: false,
    },
    tabs: [
      { id: 'feed', label: 'Alerts' },
      { id: 'map', label: 'Map' },
    ],
    feedClasses: SAFETY_CLASSES,
    homeTab: 'feed',
  },
  citizen: {
    id: 'citizen',
    label: 'Citizen',
    tagline: 'Public map & feedback',
    icon: User,
    permissions: {
      view: 'Public Map',
      report: 'limited',
      reportLabel: 'Feedback',
      analytics: 'limited',
      analyticsLabel: 'Limited',
      approve: false,
      admin: false,
    },
    tabs: [
      { id: 'map', label: 'Map' },
      { id: 'report', label: 'Report' },
    ],
    publicOnly: true,
    homeTab: 'map',
  },
  'urban-planner': {
    id: 'urban-planner',
    label: 'Urban Planner',
    tagline: 'Analytics & export',
    icon: LandPlot,
    permissions: {
      view: 'Analytics',
      report: 'limited',
      reportLabel: 'Export',
      analytics: 'full',
      analyticsLabel: 'Full Analytics',
      approve: false,
      admin: false,
    },
    tabs: [
      { id: 'analytics', label: 'Analytics' },
      { id: 'route', label: 'Plan Route' },
    ],
    homeTab: 'analytics',
  },
  'smart-city-admin': {
    id: 'smart-city-admin',
    label: 'Smart City Admin',
    tagline: 'Everything, everywhere',
    icon: Wrench,
    permissions: {
      view: 'Everything',
      report: 'full',
      reportLabel: 'Everything',
      analytics: 'full',
      analyticsLabel: 'Everything',
      approve: true,
      admin: true,
    },
    tabs: [
      { id: 'feed', label: 'Feed' },
      { id: 'map', label: 'Map' },
      { id: 'incidents', label: 'Incidents' },
      { id: 'route', label: 'Plan Route' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'admin', label: 'Admin' },
    ],
    homeTab: 'feed',
  },
};

export const ROLE_ORDER: RoleId[] = [
  'citizen',
  'bus-driver',
  'road-maintenance',
  'traffic-police',
  'emergency-team',
  'municipal-authority',
  'urban-planner',
  'smart-city-admin',
];

/**
 * These 6 roles are operator/authority roles that make sense on a fixed-
 * layout desktop console — picking one redirects into apps/command
 * (`?role=<id>`, scoped there — see apps/command/src/lib/roleScope.ts)
 * instead of entering this app's own shell. `citizen` and `bus-driver` are
 * deliberately absent: neither fits a desktop operator dashboard, and both
 * already have a real phone-shaped screen here (Report, MyBus). Mirror any
 * change here in apps/command/src/lib/roleScope.ts's ROLE_SCOPES keys —
 * they must name the same 6 roles, or a role redirects into command and
 * finds no scope waiting (harmless — falls back to "show everything" — but
 * not what you meant).
 */
export const PHONE_ROLES: readonly RoleId[] = ['citizen', 'bus-driver'];

export const COMMAND_ROLES: readonly RoleId[] = [
  'municipal-authority',
  'road-maintenance',
  'traffic-police',
  'emergency-team',
  'urban-planner',
  'smart-city-admin',
];
