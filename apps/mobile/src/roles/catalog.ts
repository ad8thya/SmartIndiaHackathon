/**
 * The four roles that live on a phone, and what each one is allowed to open.
 *
 * Urban Twin has eight roles. Four of them decide things at a desk and are
 * built in apps/web — Municipal Authority, Traffic Police, Urban Planner,
 * Smart City Admin. The four here act in the street. The `RoleId` strings are
 * deliberately the *same* strings apps/web uses (see
 * apps/web/src/roles/roles/config.ts) so that a role travelling over the
 * WebSocket, a query param, or a work-order assignment means the same thing on
 * both clients. Do not shorten them for the phone.
 *
 * Each role owns exactly one path prefix. That is what makes the permission
 * boundary in `RequireRole` a one-line check rather than a table of routes
 * somebody has to remember to update.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Ambulance,
  Bell,
  Bus,
  Camera,
  ClipboardList,
  FileText,
  Home,
  Map,
  Navigation,
  Route,
  ScanLine,
  Siren,
  SquarePen,
  User,
  Wrench,
} from 'lucide-react';

/** The four phone roles. Same spelling as apps/web's RoleId. */
export type MobileRoleId = 'citizen' | 'road-maintenance' | 'bus-driver' | 'emergency-team';

/** The four that are desktop-only. Named so the login screen can say why. */
export type DesktopRoleId =
  | 'municipal-authority'
  | 'traffic-police'
  | 'urban-planner'
  | 'smart-city-admin';

export const DESKTOP_ROLE_LABELS: Record<DesktopRoleId, string> = {
  'municipal-authority': 'Municipal Authority',
  'traffic-police': 'Traffic Police',
  'urban-planner': 'Urban Planner',
  'smart-city-admin': 'Smart City Admin',
};

export interface RoleTab {
  /** Absolute path. The first tab is the role's home. */
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface MobileRole {
  id: MobileRoleId;
  label: string;
  /** Shown on the tinted square in the top bar — the design's role chip. */
  initials: string;
  tagline: string;
  icon: LucideIcon;
  /** Tailwind classes for that chip, and for this role's accents. */
  tint: { bg: string; fg: string };
  /**
   * The one path prefix this role owns. Everything under it is this role's;
   * everything outside it shows the permission screen.
   */
  prefix: string;
  tabs: RoleTab[];
  /**
   * Plain sentences for the "not available for your role" screen. It has to
   * say what the role *can* do, otherwise it is a dead end with better
   * typography.
   */
  can: string[];
}

export const MOBILE_ROLES: Record<MobileRoleId, MobileRole> = {
  citizen: {
    id: 'citizen',
    label: 'Citizen',
    initials: 'CZ',
    tagline: 'Report a hazard, track the fix',
    icon: User,
    tint: { bg: 'bg-emerald/15', fg: 'text-emerald' },
    prefix: '/citizen',
    tabs: [
      { to: '/citizen', label: 'Home', icon: Home },
      { to: '/citizen/report', label: 'Report', icon: SquarePen },
      { to: '/citizen/reports', label: 'My reports', icon: FileText },
      { to: '/citizen/conditions', label: 'Roads', icon: Map },
      { to: '/citizen/alerts', label: 'Alerts', icon: Bell },
    ],
    can: [
      'Report a road hazard with a photo and your location',
      'Track what happened to the reports you sent',
      'See confirmed road conditions near you on a map',
      'Read alerts about roads near you',
    ],
  },
  'road-maintenance': {
    id: 'road-maintenance',
    label: 'Road Maintenance',
    initials: 'RM',
    tagline: 'Work the queue, close the order',
    icon: Wrench,
    tint: { bg: 'bg-amber/15', fg: 'text-amber' },
    prefix: '/crew',
    tabs: [
      { to: '/crew', label: 'My queue', icon: ClipboardList },
      { to: '/crew/map', label: 'Map', icon: Map },
      { to: '/crew/verification', label: 'Verify', icon: ScanLine },
    ],
    can: [
      'Open the work orders assigned to your crew',
      'Start an inspection and mark a repair complete',
      'Add a photo or a note to an order',
      'See which repairs are waiting on a bus re-scan',
    ],
  },
  'bus-driver': {
    id: 'bus-driver',
    label: 'Bus Driver',
    initials: 'BD',
    tagline: 'Your bus, your cameras, your route',
    icon: Bus,
    tint: { bg: 'bg-accent/15', fg: 'text-accent' },
    prefix: '/bus',
    tabs: [
      { to: '/bus', label: 'My bus', icon: Bus },
      { to: '/bus/cameras', label: 'Cameras', icon: Camera },
      { to: '/bus/route', label: 'Route', icon: Route },
    ],
    can: [
      'Check your bus, shift and route for today',
      'See whether your four cameras are online',
      'Follow today’s route and the stops still ahead',
    ],
  },
  'emergency-team': {
    id: 'emergency-team',
    label: 'Emergency Team',
    initials: 'ER',
    tagline: 'Accept, dispatch, close',
    icon: Ambulance,
    tint: { bg: 'bg-danger/15', fg: 'text-danger' },
    prefix: '/emergency',
    tabs: [
      { to: '/emergency', label: 'Alerts', icon: Siren },
      { to: '/emergency/dispatch', label: 'Dispatch', icon: Navigation },
      { to: '/emergency/log', label: 'Log', icon: FileText },
    ],
    can: [
      'See active incidents as they are raised',
      'Accept an incident and dispatch a unit',
      'Follow the route to the scene',
      'Read the log of incidents already closed',
    ],
  },
};

/** In login-screen order — citizen first, because that is the demo. */
export const MOBILE_ROLE_LIST: readonly MobileRole[] = [
  MOBILE_ROLES.citizen,
  MOBILE_ROLES['road-maintenance'],
  MOBILE_ROLES['bus-driver'],
  MOBILE_ROLES['emergency-team'],
];

export function isMobileRoleId(value: unknown): value is MobileRoleId {
  return typeof value === 'string' && value in MOBILE_ROLES;
}

/** The role that owns `path`, or null when nothing does (e.g. `/login`). */
export function roleOwningPath(path: string): MobileRole | null {
  return (
    MOBILE_ROLE_LIST.find(
      (role) => path === role.prefix || path.startsWith(`${role.prefix}/`),
    ) ?? null
  );
}
