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
import { COMMAND_ROLES, ROLES, type RoleId, type TabId } from './roles/config';

const COMMAND_PORT = (import.meta.env.VITE_COMMAND_PORT as string | undefined) ?? '5173';

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
  mapStyle: 'street' | 'satellite';
  selectedRoadId: string | null;

  loading: boolean;
  simulating: boolean;
  error: string | null;
  toast: string | null;

  chooseRole: (role: RoleId) => void;
  openRoleSheet: () => void;
  closeRoleSheet: () => void;
  signOut: () => void;

  go: (tab: TabId) => void;
  openDetail: (kind: Exclude<DetailKind, null>, id: string) => void;
  closeDetail: () => void;

  setMapStyle: (style: 'street' | 'satellite') => void;
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
  mapStyle: 'street',
  selectedRoadId: null,

  loading: false,
  simulating: false,
  error: null,
  toast: null,

  chooseRole: (role) => {
    // The 6 operator/authority roles live in apps/command now (scoped —
    // see apps/command/src/lib/roleScope.ts), not in this app's own shell.
    // A full navigation, not an iframe: command is a fixed-layout desktop
    // console, the opposite of what PhoneFrame does for the field app.
    if (COMMAND_ROLES.includes(role)) {
      window.location.href = `${window.location.protocol}//${window.location.hostname}:${COMMAND_PORT}/?role=${role}`;
      return;
    }
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* private browsing / storage disabled — role just won't survive a reload */
    }
    set({ role, tab: ROLES[role].homeTab, roleSheetOpen: false });
    void get().load();
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
    set({ citizenReports: reports, toast: 'Thanks — logged for your ward office' });
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
    const classes = role ? ROLES[role].feedClasses : undefined;
    const events = get().events;
    if (!classes) return events;
    const wanted = new Set(classes);
    return events.filter((event) => wanted.has(event.detection_class));
  },

  activeEvent: () => get().events.find((event) => event.event_id === get().detailId) ?? null,
  activeIncident: () =>
    get().incidents.find((incident) => incident.incident_id === get().detailId) ?? null,
}));
