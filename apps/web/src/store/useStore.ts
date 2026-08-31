/**
 * Zustand store — the single source of truth for the command centre. Owned by M6.
 *
 * Panels never fetch. They read from here and call actions. That keeps the five
 * panel owners out of each other's network code, and means the whole UI can be
 * driven from a test by calling `useStore.setState(...)`.
 */

import { create } from 'zustand';
import { api } from '../lib/api';
import { LiveSocket, type ConnectionState } from '../lib/ws';
import { getScope, resolveRole, type RoleId } from '../lib/roleScope';
import { ESCALATION_RUNGS } from '../lib/tokens';
import type {
  AnalyticsSummary,
  BusPosition,
  CitizenReport,
  DangerousJunction,
  DetectionClass,
  IncidentReport,
  InfrastructureRecommendation,
  NearMissEvent,
  RoadCondition,
  Severity,
  UrbanRiskScore,
  UTEvent,
  UTRoute,
  WSMessage,
  WhatIfResult,
  WorkflowStatus,
} from '../lib/types';

export interface Filters {
  statuses: WorkflowStatus[];
  classes: DetectionClass[];
  severities: Severity[];
  minConfidence: number;
  search: string;
}

const EMPTY_FILTERS: Filters = {
  statuses: [],
  classes: [],
  severities: [],
  minConfidence: 0,
  search: '',
};

/**
 * One rung climbed on the fusion ladder — the moment a defect goes from a
 * single bus's guess to something the city owns.
 *
 * Note what is deliberately *not* here: which bus corroborated it. `Event`
 * carries `distinct_bus_count`, not the ids behind it, and the WebSocket
 * payload is a plain `Event` — so naming a specific bus would mean inventing
 * one. The toast states the count, which is true.
 */
export interface Escalation {
  eventId: string;
  from: WorkflowStatus;
  to: WorkflowStatus;
  busCount: number;
  detectionClass: DetectionClass;
  roadSegmentId: string | null;
  /** epoch ms, so the map can fade the pulse out on a wall clock */
  at: number;
}

export interface TickerEntry {
  id: string;
  kind: 'event' | 'incident' | 'status';
  text: string;
  at: string;
  eventId?: string;
}

interface Store {
  // ── data ────────────────────────────────────────────────────────────────
  buses: Record<string, BusPosition>;
  events: Record<string, UTEvent>;
  routes: UTRoute[];
  roads: RoadCondition[];
  incidents: IncidentReport[];
  /**
   * Reports filed by the public from apps/mobile. Kept beside `incidents`
   * rather than merged into `events`: a citizen report carries no confidence
   * and has not been corroborated by anything, and folding it into the event
   * map would let it look like a fused detection.
   */
  reports: CitizenReport[];
  summary: AnalyticsSummary | null;
  whatIf: WhatIfResult[];
  ticker: TickerEntry[];
  /** most recent ladder climbs, newest first — see Escalation */
  escalations: Escalation[];

  // ── AI intelligence layer ─────────────────────────────────────────────────
  dangerousJunctions: DangerousJunction[];
  recommendations: InfrastructureRecommendation[];
  nearMisses: NearMissEvent[];
  /** lazily populated per road — see IntelligencePanel's expandable rows */
  riskDetails: Record<string, UrbanRiskScore>;

  // ── ui ──────────────────────────────────────────────────────────────────
  selectedEventId: string | null;
  selectedRoadId: string | null;
  activePanel: string;
  filters: Filters;
  showHeatmap: boolean;
  showBuildings: boolean;
  showPhone: boolean;
  showRiskLayer: boolean;
  connection: ConnectionState;
  lastError: string | null;
  loading: boolean;

  // ── role scope (see lib/roleScope.ts) ──────────────────────────────────
  /** null = no scope applied — either no/unrecognised ?role=, or the viewer
   *  cleared it via overrideScope(). Every consumer must treat null as "show
   *  everything", never as "show nothing". */
  role: RoleId | null;
  scopeOverridden: boolean;

  // ── actions ─────────────────────────────────────────────────────────────
  bootstrap: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  refreshRoads: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  refreshIncidents: () => Promise<void>;
  refreshIntelligence: () => Promise<void>;
  fetchRoadRisk: (roadId: string) => Promise<void>;
  runWhatIf: (closedRoadIds: string[], reason?: string) => Promise<void>;
  advanceStatus: (eventId: string, status: WorkflowStatus, team?: string, notes?: string) => Promise<void>;

  selectEvent: (id: string | null) => void;
  selectRoad: (id: string | null) => void;
  setPanel: (panel: string) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  /** drop an escalation once its pulse and toast have run their course */
  dismissEscalation: (eventId: string) => void;
  toggleHeatmap: () => void;
  toggleBuildings: () => void;
  togglePhone: () => void;
  toggleRiskLayer: () => void;
  /** Reads `role` from a `?role=` value, applies its scope's classes/panel
   *  if one exists. Called once from App.tsx on mount — not a live route,
   *  full reload is the intended way to switch roles (see BUILD.md). */
  initRole: (raw: string | null) => void;
  /** The constraint-#3 safety valve: un-restricts panels/KPIs/classes for
   *  the rest of the session without touching `role` itself (so the badge
   *  still shows who you're viewing as). */
  overrideScope: () => void;

  // ── derived ─────────────────────────────────────────────────────────────
  visibleEvents: () => UTEvent[];
  eventList: () => UTEvent[];
  busList: () => BusPosition[];
  roadById: (id: string | null) => RoadCondition | null;
}

let socket: LiveSocket | null = null;

function pushTicker(list: TickerEntry[], entry: TickerEntry): TickerEntry[] {
  return [entry, ...list].slice(0, 60);
}

export const useStore = create<Store>((set, get) => ({
  buses: {},
  events: {},
  routes: [],
  roads: [],
  incidents: [],
  reports: [],
  summary: null,
  whatIf: [],
  ticker: [],
  escalations: [],

  dangerousJunctions: [],
  recommendations: [],
  nearMisses: [],
  riskDetails: {},

  selectedEventId: null,
  selectedRoadId: null,
  activePanel: 'defects',
  filters: EMPTY_FILTERS,
  showHeatmap: false,
  showBuildings: true,
  showPhone: false,
  showRiskLayer: false,
  connection: 'closed',
  lastError: null,
  loading: true,

  role: null,
  scopeOverridden: false,

  // ── bootstrap ───────────────────────────────────────────────────────────
  async bootstrap() {
    set({ loading: true, lastError: null });
    try {
      const [routes, events, roads, incidents, reports, summary, fleet] = await Promise.all([
        api.routes(),
        api.events({ limit: 2000 }),
        api.roads(),
        api.incidents({ limit: 100 }),
        api.reports({ limit: 200 }),
        api.summary(),
        api.fleet(),
      ]);
      set({
        routes,
        roads,
        incidents,
        reports,
        summary,
        events: Object.fromEntries(events.map((event) => [event.event_id, event])),
        buses: Object.fromEntries(fleet.map((bus) => [bus.bus_id, bus])),
        loading: false,
      });
    } catch (error) {
      // the map still renders — it just has nothing on it yet
      set({ lastError: (error as Error).message, loading: false });
    }
    // independent of the critical path above — a slow intelligence layer must
    // not hold up the map or the event feed
    void get().refreshIntelligence();
  },

  connect() {
    if (socket) return;
    socket = new LiveSocket({
      onState: (connection) => set({ connection }),
      onMessage: (message: WSMessage) => {
        const state = get();
        switch (message.type) {
          case 'HELLO': {
            const payload = message.payload as {
              buses?: BusPosition[];
              events?: UTEvent[];
              incidents?: IncidentReport[];
            };
            set({
              buses: Object.fromEntries((payload.buses ?? []).map((b) => [b.bus_id, b])),
              events: {
                ...state.events,
                ...Object.fromEntries((payload.events ?? []).map((e) => [e.event_id, e])),
              },
              incidents: payload.incidents?.length ? payload.incidents : state.incidents,
            });
            break;
          }
          case 'BUS_POSITION': {
            const bus = message.payload as unknown as BusPosition;
            set({ buses: { ...get().buses, [bus.bus_id]: bus } });
            break;
          }
          case 'EVENT_NEW':
          case 'EVENT_UPDATED': {
            const event = message.payload as unknown as UTEvent;
            const previous = state.events[event.event_id];

            // ── the centrepiece ────────────────────────────────────────────
            // An event climbing the fusion ladder is the whole thesis of the
            // project: more buses seeing the same defect turns a guess into a
            // work order. When it happens we record it so the map can pulse
            // the pin and a toast can say what changed — otherwise the single
            // most important moment in the demo is a pin quietly changing hue.
            const climbed =
              previous !== undefined &&
              previous.status !== event.status &&
              ESCALATION_RUNGS.indexOf(event.status) > ESCALATION_RUNGS.indexOf(previous.status) &&
              ESCALATION_RUNGS.includes(event.status);

            const escalation: Escalation | null = climbed
              ? {
                  eventId: event.event_id,
                  from: previous.status,
                  to: event.status,
                  busCount: event.distinct_bus_count,
                  detectionClass: event.detection_class,
                  roadSegmentId: event.road_segment_id,
                  at: Date.now(),
                }
              : null;

            set({
              events: { ...get().events, [event.event_id]: event },
              escalations: escalation
                ? [escalation, ...get().escalations].slice(0, 12)
                : get().escalations,
              ticker: pushTicker(get().ticker, {
                id: `${event.event_id}-${event.status}-${message.ts}`,
                kind: message.type === 'EVENT_NEW' ? 'event' : 'status',
                text:
                  message.type === 'EVENT_NEW'
                    ? `${event.detection_class} detected · ${event.severity.toLowerCase()} · ${event.distinct_bus_count} bus${event.distinct_bus_count > 1 ? 'es' : ''}`
                    : `${event.detection_class} → ${event.status.replace(/_/g, ' ').toLowerCase()}`,
                at: message.ts,
                eventId: event.event_id,
              }),
            });
            break;
          }
          case 'INCIDENT': {
            const incident = message.payload as unknown as IncidentReport;
            set({
              incidents: [incident, ...get().incidents].slice(0, 200),
              ticker: pushTicker(get().ticker, {
                id: incident.incident_id,
                kind: 'incident',
                text: `${incident.incident_class.replace(/_/g, ' ')} reported by ${incident.reported_by_bus}`,
                at: incident.ts,
              }),
            });
            break;
          }
          case 'REPORT_NEW': {
            // A member of the public just sent this from their phone. It
            // reaches the backlog with no refresh, which is the half of T6
            // that used to be impossible: reports lived in the phone's
            // localStorage and never left the device at all.
            const report = message.payload as unknown as CitizenReport;
            if (get().reports.some((existing) => existing.report_id === report.report_id)) break;
            set({
              reports: [report, ...get().reports].slice(0, 500),
              ticker: pushTicker(get().ticker, {
                id: report.report_id,
                kind: 'incident',
                text: `Citizen report · ${report.category.replace(/_/g, ' ').toLowerCase()}${report.ward ? ` · ${report.ward}` : ''}`,
                at: report.created_at,
              }),
            });
            break;
          }
          case 'TICK':
          default:
            break;
        }
      },
    });
    socket.connect();
  },

  disconnect() {
    socket?.close();
    socket = null;
    set({ connection: 'closed' });
  },

  async refreshRoads() {
    try {
      set({ roads: await api.roads() });
    } catch (error) {
      set({ lastError: (error as Error).message });
    }
  },

  async refreshSummary() {
    try {
      set({ summary: await api.summary() });
    } catch {
      /* KPI strip keeps its last good numbers */
    }
  },

  async refreshIncidents() {
    try {
      set({ incidents: await api.incidents({ limit: 100 }) });
    } catch {
      /* keep what we have */
    }
  },

  async refreshIntelligence() {
    try {
      const [dangerousJunctions, recommendations, nearMisses] = await Promise.all([
        api.dangerousJunctions(10),
        api.recommendations(),
        api.nearMisses(),
      ]);
      set({ dangerousJunctions, recommendations, nearMisses });
    } catch {
      /* the panel keeps whatever it last had */
    }
  },

  async fetchRoadRisk(roadId) {
    try {
      const detail = await api.roadRisk(roadId);
      set({ riskDetails: { ...get().riskDetails, [roadId]: detail } });
    } catch {
      /* the row just stays collapsed */
    }
  },

  async runWhatIf(closedRoadIds, reason) {
    try {
      set({ whatIf: await api.simulate({ closed_road_ids: closedRoadIds, reason }) });
    } catch (error) {
      set({ lastError: (error as Error).message, whatIf: [] });
    }
  },

  async advanceStatus(eventId, status, team, notes) {
    // optimistic: the operator sees their own click land immediately
    const current = get().events[eventId];
    if (current) {
      set({ events: { ...get().events, [eventId]: { ...current, status } } });
    }
    try {
      const updated = await api.setEventStatus(eventId, {
        status,
        assigned_team: team,
        notes,
      });
      set({ events: { ...get().events, [eventId]: updated } });
    } catch (error) {
      if (current) set({ events: { ...get().events, [eventId]: current } }); // roll back
      set({ lastError: (error as Error).message });
    }
  },

  selectEvent: (id) => set({ selectedEventId: id }),
  selectRoad: (id) => set({ selectedRoadId: id }),
  setPanel: (activePanel) => set({ activePanel }),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  dismissEscalation: (eventId) =>
    set({ escalations: get().escalations.filter((item) => item.eventId !== eventId) }),
  toggleHeatmap: () => set({ showHeatmap: !get().showHeatmap }),
  toggleBuildings: () => set({ showBuildings: !get().showBuildings }),
  togglePhone: () => set({ showPhone: !get().showPhone }),
  toggleRiskLayer: () => set({ showRiskLayer: !get().showRiskLayer }),

  initRole: (raw) => {
    const role = resolveRole(raw);
    const scope = getScope(role);
    set({
      role,
      // scope is null for a missing/unrecognised/not-command-eligible role —
      // that must mean "no restriction", so filters/activePanel stay at
      // their normal defaults rather than being narrowed to nothing.
      ...(scope ? { filters: { ...EMPTY_FILTERS, classes: scope.classes ?? [] } } : {}),
      ...(scope && scope.panels.length ? { activePanel: scope.panels[0] } : {}),
    });
  },
  overrideScope: () => set({ scopeOverridden: true, filters: EMPTY_FILTERS }),

  // ── derived ─────────────────────────────────────────────────────────────
  eventList: () =>
    Object.values(get().events).sort(
      (a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
    ),

  visibleEvents: () => {
    const { statuses, classes, severities, minConfidence, search } = get().filters;
    const needle = search.trim().toLowerCase();
    return get()
      .eventList()
      .filter((event) => {
        if (statuses.length && !statuses.includes(event.status)) return false;
        if (classes.length && !classes.includes(event.detection_class)) return false;
        if (severities.length && !severities.includes(event.severity)) return false;
        if (event.fused_confidence < minConfidence) return false;
        if (needle) {
          const haystack =
            `${event.detection_class} ${event.road_segment_id ?? ''} ${event.assigned_team ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });
  },

  busList: () => Object.values(get().buses).sort((a, b) => a.bus_id.localeCompare(b.bus_id)),

  roadById: (id) => (id ? (get().roads.find((road) => road.road_id === id) ?? null) : null),
}));
