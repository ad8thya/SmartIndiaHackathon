/**
 * Role portal state.
 *
 * No login yet anywhere in Urban Twin (field app has the same shape: a
 * hardcoded MY_TEAM until real auth lands) — so "who am I" here is just a
 * role picked on this device and remembered in localStorage. Swapping this
 * for a real identity provider later only touches this file: every screen
 * reads permissions off `ROLES[role]`, never off a token.
 */

import { create } from 'zustand';
import {
  api,
  type AnalyticsSummary,
  type BusPosition,
  type DangerousJunction,
  type IncidentReport,
  type InfrastructureRecommendation,
  type RoadCondition,
  type UTEvent,
  type WhatIfResult,
  type WorkflowStatus,
} from './lib/api';
import { PUBLIC_STATUSES, ROLES, type RoleId, type TabId } from './roles/config';

const ROLE_KEY = 'urban-twin.role';
const REPORTS_KEY = 'urban-twin.citizen-reports';

/** Assigned-team identity for road-maintenance, same convention as apps/field. */
export const MY_TEAM = 'GCC-Zone-13-Adyar';

export interface CitizenReport {
  id: string;
  text: string;
  lat: number | null;
  lon: number | null;
  ts: string;
}

type DetailKind = 'event' | 'incident' | null;

interface State {
  role: RoleId | null;
  tab: TabId;
  roleSheetOpen: boolean;
  detailKind: DetailKind;
  detailId: string | null;

  events: UTEvent[];
  incidents: IncidentReport[];
  roads: RoadCondition[];
  buses: BusPosition[];
  summary: AnalyticsSummary | null;
  recommendations: InfrastructureRecommendation[];
  dangerousJunctions: DangerousJunction[];
  citizenReports: CitizenReport[];
  whatIfResults: WhatIfResult[];

  selectedBusId: string | null;
  /** basemap theme — both come from the same committed PMTiles extract */
  mapStyle: 'light' | 'dark';
  selectedRoadId: string | null;

  loading: boolean;
  simulating: boolean;
  error: string | null;
  toast: string | null;

  chooseRole: (role: RoleId) => void;
  setRoleFromRoute: (role: RoleId, screen?: string | null) => void;
  openRoleSheet: () => void;
  closeRoleSheet: () => void;
  signOut: () => void;

  go: (tab: TabId) => void;
  openDetail: (kind: Exclude<DetailKind, null>, id: string) => void;
  closeDetail: () => void;

  setMapStyle: (style: 'light' | 'dark') => void;
  selectRoad: (id: string | null) => void;
  selectBus: (id: string | null) => void;

  load: () => Promise<void>;
  advance: (id: string, status: WorkflowStatus, notes?: string) => Promise<void>;
  submitReport: (text: string, lat?: number, lon?: number) => void;
  runWhatIf: (closedRoadIds: string[], reason?: string) => Promise<void>;
  clearWhatIf: () => void;
  clearToast: () => void;

  scopedEvents: () => UTEvent[];
  activeEvent: () => UTEvent | null;
  activeIncident: () => IncidentReport | null;
}

function readRole(): RoleId | null {
  try {
    const stored = localStorage.getItem(ROLE_KEY);
    return stored && stored in ROLES ? (stored as RoleId) : null;
  } catch {
    return null;
  }
}

function readReports(): CitizenReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    return raw ? (JSON.parse(raw) as CitizenReport[]) : [];
  } catch {
    return [];
  }
}

export const useRoles = create<State>((set, get) => ({
  role: readRole(),
  tab: readRole() ? ROLES[readRole() as RoleId].homeTab : 'feed',
  roleSheetOpen: false,
  detailKind: null,
  detailId: null,

  events: [],
  incidents: [],
  roads: [],
  buses: [],
  summary: null,
  recommendations: [],
  dangerousJunctions: [],
  citizenReports: readReports(),
  whatIfResults: [],

  selectedBusId: null,
  mapStyle: 'light',
  selectedRoadId: null,

  loading: false,
  simulating: false,
  error: null,
  toast: null,

  chooseRole: (role) => {
    // Every role is a route of this ONE app now: /app/:role. A full
    // navigation (not set-state) so the URL is always the identity — the
    // router then mounts either the command console (operator roles) or
    // this phone-shaped shell (citizen, bus-driver).
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* private browsing / storage disabled — harmless */
    }
    window.location.href = `/app/${role}`;
  },

  /** Called by the router when /app/:role mounts the roles shell. */
  setRoleFromRoute: (role: RoleId, screen?: string | null) => {
    const tabs = ROLES[role].tabs;
    const tab =
      screen && tabs.some((t) => t.id === screen)
        ? (screen as TabId)
        : ROLES[role].homeTab;
    if (get().role !== role || get().tab !== tab) {
      set({ role, tab, roleSheetOpen: false });
    }
  },

  openRoleSheet: () => set({ roleSheetOpen: true }),
  closeRoleSheet: () => set({ roleSheetOpen: false }),

  signOut: () => {
    try {
      localStorage.removeItem(ROLE_KEY);
    } catch {
      /* ignore */
    }
    set({ role: null, roleSheetOpen: false });
    window.location.href = '/';
  },

  go: (tab) => set({ tab, detailKind: null, detailId: null }),

  openDetail: (kind, id) => set({ detailKind: kind, detailId: id }),
  closeDetail: () => set({ detailKind: null, detailId: null }),

  setMapStyle: (mapStyle) => set({ mapStyle }),
  selectRoad: (selectedRoadId) => set({ selectedRoadId }),
  selectBus: (selectedBusId) => set({ selectedBusId }),

  async load() {
    const role = get().role;
    if (!role) return;
    set({ loading: true, error: null });
    try {
      const config = ROLES[role];
      const wantsAnalytics = config.permissions.analytics !== 'none';
      const [events, roads, buses, incidents, summary, recommendations, junctions] =
        await Promise.all([
          config.tabs.some((t) => t.id === 'feed' || t.id === 'map')
            ? api.events({ limit: 300 })
            : Promise.resolve([]),
          config.tabs.some((t) => t.id === 'map' || t.id === 'analytics' || t.id === 'route')
            ? api.roads()
            : Promise.resolve([]),
          role === 'bus-driver' || role === 'smart-city-admin'
            ? api.fleet()
            : Promise.resolve([]),
          config.tabs.some((t) => t.id === 'incidents')
            ? api.incidents({ limit: 100 })
            : Promise.resolve([]),
          wantsAnalytics ? api.summary() : Promise.resolve(null),
          wantsAnalytics && config.permissions.analytics === 'full'
            ? api.recommendations({ limit: 50 } as never)
            : Promise.resolve([]),
          wantsAnalytics && config.permissions.analytics === 'full'
            ? api.dangerousJunctions(10)
            : Promise.resolve([]),
        ]);
      set({
        events,
        roads,
        buses,
        incidents,
        summary,
        recommendations,
        dangerousJunctions: junctions,
        loading: false,
        selectedBusId: get().selectedBusId ?? buses[0]?.bus_id ?? null,
      });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  async advance(id, status, notes) {
    const previous = get().events;
    set({
      events: previous.map((event) => (event.event_id === id ? { ...event, status } : event)),
      toast: 'Saving…',
    });
    try {
      const updated = await api.setEventStatus(id, { status, notes, assigned_team: MY_TEAM });
      set({
        events: get().events.map((event) => (event.event_id === id ? updated : event)),
        toast: 'Saved',
      });
    } catch (error) {
      set({ events: previous, toast: `Failed — ${(error as Error).message}` });
    }
    setTimeout(() => set({ toast: null }), 2200);
  },

  submitReport: (text, lat, lon) => {
    const report: CitizenReport = {
      id: crypto.randomUUID(),
      text,
      lat: lat ?? null,
      lon: lon ?? null,
      ts: new Date().toISOString(),
    };
    const reports = [report, ...get().citizenReports];
    set({ citizenReports: reports, toast: 'Saved on this device' });
    try {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
    } catch {
      /* ignore */
    }
    setTimeout(() => set({ toast: null }), 2400);
  },

  async runWhatIf(closedRoadIds, reason) {
    if (closedRoadIds.length === 0) return;
    set({ simulating: true });
    try {
      const results = await api.simulate({ closed_road_ids: closedRoadIds, reason });
      set({ whatIfResults: results, simulating: false });
    } catch (error) {
      set({ simulating: false, toast: `Simulation failed — ${(error as Error).message}` });
      setTimeout(() => set({ toast: null }), 2400);
    }
  },

  clearWhatIf: () => set({ whatIfResults: [] }),

  clearToast: () => set({ toast: null }),

  scopedEvents: () => {
    const role = get().role;
    const config = role ? ROLES[role] : null;
    let events = get().events;

    // The public map is genuinely a different dataset, not a restyled operator
    // one: a citizen sees only what the city has actually confirmed and acted
    // on. Unverified machine output (DETECTED, AI_VERIFIED) and rejected
    // reports never leave the operator console. See PUBLIC_STATUSES.
    if (config?.publicOnly) {
      events = events.filter((event) => PUBLIC_STATUSES.has(event.status));
    }

    const classes = config?.feedClasses;
    if (!classes) return events;
    const wanted = new Set(classes);
    return events.filter((event) => wanted.has(event.detection_class));
  },

  activeEvent: () => get().events.find((event) => event.event_id === get().detailId) ?? null,
  activeIncident: () =>
    get().incidents.find((incident) => incident.incident_id === get().detailId) ?? null,
}));
