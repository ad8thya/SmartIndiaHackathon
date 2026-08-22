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
import type {
  AnalyticsSummary,
  BusPosition,
  DetectionClass,
  IncidentReport,
  RoadCondition,
  Severity,
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
  summary: AnalyticsSummary | null;
  whatIf: WhatIfResult[];
  ticker: TickerEntry[];

  // ── ui ──────────────────────────────────────────────────────────────────
  selectedEventId: string | null;
  selectedRoadId: string | null;
  activePanel: string;
  filters: Filters;
  showHeatmap: boolean;
  showBuildings: boolean;
  showPhone: boolean;
  connection: ConnectionState;
  lastError: string | null;
  loading: boolean;

  // ── actions ─────────────────────────────────────────────────────────────
  bootstrap: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
  refreshRoads: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  refreshIncidents: () => Promise<void>;
  runWhatIf: (closedRoadIds: string[], reason?: string) => Promise<void>;
  advanceStatus: (eventId: string, status: WorkflowStatus, team?: string, notes?: string) => Promise<void>;

  selectEvent: (id: string | null) => void;
  selectRoad: (id: string | null) => void;
  setPanel: (panel: string) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  toggleHeatmap: () => void;
  toggleBuildings: () => void;
  togglePhone: () => void;

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
  summary: null,
  whatIf: [],
  ticker: [],

  selectedEventId: null,
  selectedRoadId: null,
  activePanel: 'defects',
  filters: EMPTY_FILTERS,
  showHeatmap: false,
  showBuildings: true,
  showPhone: false,
  connection: 'closed',
  lastError: null,
  loading: true,

  // ── bootstrap ───────────────────────────────────────────────────────────
  async bootstrap() {
    set({ loading: true, lastError: null });
    try {
      const [routes, events, roads, incidents, summary, fleet] = await Promise.all([
        api.routes(),
        api.events({ limit: 2000 }),
        api.roads(),
        api.incidents({ limit: 100 }),
        api.summary(),
        api.fleet(),
      ]);
      set({
        routes,
        roads,
        incidents,
        summary,
        events: Object.fromEntries(events.map((event) => [event.event_id, event])),
        buses: Object.fromEntries(fleet.map((bus) => [bus.bus_id, bus])),
        loading: false,
      });
    } catch (error) {
      // the map still renders — it just has nothing on it yet
      set({ lastError: (error as Error).message, loading: false });
    }
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
            set({
              events: { ...get().events, [event.event_id]: event },
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
  toggleHeatmap: () => set({ showHeatmap: !get().showHeatmap }),
  toggleBuildings: () => set({ showBuildings: !get().showBuildings }),
  togglePhone: () => set({ showPhone: !get().showPhone }),

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
