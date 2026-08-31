/**
 * One socket, one cache, for the whole app.
 *
 * Every screen reads from here rather than fetching for itself. That is not
 * only about duplicate requests: before this, two screens showing the same
 * event could disagree, because each had fetched at a different moment and
 * neither knew when the other's copy went stale. There is now one copy and one
 * moment it was last correct.
 *
 * **The ingest filter is a privacy boundary, not a display option.**
 * On a citizen session, an event below AUTHORITY_NOTIFIED never enters this
 * store at all — not fetched, not merged from the socket, not held in memory
 * behind a flag. The role is fixed for the life of a session (switching signs
 * you out), so there is no path where the filter is on for the fetch and off
 * for the socket, which is exactly the kind of asymmetry that leaks.
 *
 * Screens still map through `toPublicEvent` before rendering. Two independent
 * gates for the same property is deliberate; either one failing is a bug, both
 * failing is a breach.
 */

import { create } from 'zustand';
import { api } from '../lib/api';
import { PUBLIC_STATUSES } from '../lib/display';
import { LiveSocket, type ConnectionState } from '../lib/ws';
import type {
  CitizenReport,
  IncidentReport,
  IncidentResponse,
  UTEvent,
  WSMessage,
} from '../lib/types';
import type { MobileRoleId } from '../roles/catalog';

/** How long without any frame before the connection is treated as suspect. */
const STALE_AFTER_MS = 45_000;

interface LiveState {
  connection: ConnectionState;
  /** ms epoch of the last frame of any kind, including TICK. */
  lastFrameAt: number | null;
  /** True once the first REST hydrate has finished, successfully or not. */
  hydrated: boolean;
  /** Set when the initial load failed — the screens' "you are offline" case. */
  loadError: string | null;

  events: Record<string, UTEvent>;
  reports: CitizenReport[];
  incidents: IncidentReport[];
  /**
   * incident_id → the latest response any crew has made.
   *
   * Keyed rather than a list because "where is this incident up to" is the
   * only question the screens ask, and the full history is a separate
   * endpoint for the one screen that wants it.
   */
  responses: Record<string, IncidentResponse>;

  /** Merge a response we just wrote, without waiting for the broadcast. */
  applyResponse: (response: IncidentResponse) => void;

  connect: (role: MobileRoleId) => void;
  disconnect: () => void;
  hydrate: (role: MobileRoleId) => Promise<void>;

  eventList: () => UTEvent[];
}

/** Module-level, not in the store: it is a resource, not rendered state. */
let socket: LiveSocket | null = null;

function isPublicStatus(status: UTEvent['status']): boolean {
  return (PUBLIC_STATUSES as readonly string[]).includes(status);
}

/** The one place the role decides what may enter the cache. */
function admits(role: MobileRoleId, event: UTEvent): boolean {
  return role === 'citizen' ? isPublicStatus(event.status) : true;
}

export const useLive = create<LiveState>((set, get) => ({
  connection: 'closed',
  lastFrameAt: null,
  hydrated: false,
  loadError: null,
  events: {},
  reports: [],
  incidents: [],
  responses: {},

  async hydrate(role) {
    // Each request is settled independently: a failing incidents endpoint must
    // not leave the map empty, which is what a single Promise.all would do.
    const [events, reports, incidents, responses] = await Promise.allSettled([
      api.events(role === 'citizen' ? { status: [...PUBLIC_STATUSES], limit: 500 } : { limit: 500 }),
      api.reports({ limit: 200 }),
      api.incidents({ limit: 50 }),
      // Only the role that acts on them asks for them.
      role === 'emergency-team' ? api.incidentResponses() : Promise.resolve([]),
    ]);

    const nextEvents: Record<string, UTEvent> = {};
    if (events.status === 'fulfilled') {
      for (const event of events.value) {
        if (admits(role, event)) nextEvents[event.event_id] = event;
      }
    }

    set({
      events: nextEvents,
      reports: reports.status === 'fulfilled' ? reports.value : [],
      incidents: incidents.status === 'fulfilled' ? incidents.value : [],
      responses:
        responses.status === 'fulfilled'
          ? Object.fromEntries(responses.value.map((r) => [r.incident_id, r]))
          : {},
      hydrated: true,
      // Only a total failure is "offline". One endpoint being down is a gap,
      // not a disconnection, and telling the user they have no signal when
      // they do is its own kind of lie.
      loadError:
        events.status === 'rejected' &&
        reports.status === 'rejected' &&
        incidents.status === 'rejected'
          ? 'could not reach the city service'
          : null,
    });
  },

  connect(role) {
    if (socket) return;

    void get().hydrate(role);

    socket = new LiveSocket({
      onState: (connection) => set({ connection }),
      onMessage: (message: WSMessage) => {
        set({ lastFrameAt: Date.now() });

        switch (message.type) {
          case 'HELLO': {
            // The server's opening snapshot. Merged rather than replacing, so
            // a reconnect does not blank the screen mid-scroll.
            const payload = message.payload as {
              events?: UTEvent[];
              incidents?: IncidentReport[];
            };
            const merged = { ...get().events };
            for (const event of payload.events ?? []) {
              if (admits(role, event)) merged[event.event_id] = event;
            }
            set({
              events: merged,
              incidents: payload.incidents?.length ? payload.incidents : get().incidents,
            });
            break;
          }

          case 'EVENT_NEW':
          case 'EVENT_UPDATED': {
            const event = message.payload as unknown as UTEvent;
            if (!admits(role, event)) {
              // A citizen session watching an event fall back below the public
              // line — REJECTED, say — must drop the copy it already has, not
              // keep showing the last public version of it.
              if (get().events[event.event_id]) {
                const next = { ...get().events };
                delete next[event.event_id];
                set({ events: next });
              }
              break;
            }
            set({ events: { ...get().events, [event.event_id]: event } });
            break;
          }

          case 'REPORT_NEW': {
            const report = message.payload as unknown as CitizenReport;
            if (get().reports.some((existing) => existing.report_id === report.report_id)) break;
            set({ reports: [report, ...get().reports].slice(0, 500) });
            break;
          }

          case 'INCIDENT_RESPONSE': {
            // Another crew moved on an incident. Last write wins, which is
            // correct: the API refuses backwards transitions, so a frame that
            // arrives is always at least as advanced as what we hold.
            const response = message.payload as unknown as IncidentResponse;
            set({
              responses: { ...get().responses, [response.incident_id]: response },
            });
            break;
          }

          case 'INCIDENT': {
            const incident = message.payload as unknown as IncidentReport;
            set({ incidents: [incident, ...get().incidents].slice(0, 200) });
            break;
          }

          // BUS_POSITION and ROAD_CONDITION arrive several times a second. The
          // phone has no screen that shows a moving fleet, and re-rendering the
          // whole tree for data nothing displays is the single easiest way to
          // make a phone hot. TICK is a keepalive; `lastFrameAt` above is the
          // only thing that needs it.
          case 'BUS_POSITION':
          case 'ROAD_CONDITION':
          case 'TICK':
          default:
            break;
        }
      },
    });

    socket.connect();
  },

  applyResponse(response) {
    set({ responses: { ...get().responses, [response.incident_id]: response } });
  },

  disconnect() {
    socket?.close();
    socket = null;
    set({ connection: 'closed' });
  },

  eventList: () => Object.values(get().events),
}));

/**
 * True when the app should say it is not live.
 *
 * "Closed" is the obvious case. The subtler one is a socket that is open and
 * silent: the server sends TICK, so a long gap means the connection is dead in
 * a way neither end has noticed. Showing a confident, live-looking screen full
 * of stale data is worse than saying so.
 */
export function isOffline(state: {
  connection: ConnectionState;
  lastFrameAt: number | null;
  hydrated: boolean;
}): boolean {
  if (state.connection === 'closed') return true;
  if (state.lastFrameAt === null) return false;
  return Date.now() - state.lastFrameAt > STALE_AFTER_MS;
}
