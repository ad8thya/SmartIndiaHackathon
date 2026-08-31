/**
 * Typed HTTP client for the mobile app.
 *
 * Same contract as the console's client and same origin-resolution rule — the two
 * apps are separate builds talking to one API, so the one thing they must not
 * disagree about is where that API is. Nothing outside this file calls `fetch`.
 */

import type {
  AnalyticsSummary,
  BusPosition,
  CameraStatus,
  CitizenReport,
  GeoJsonFeatureCollection,
  HealthStatus,
  IncidentReport,
  IncidentResponse,
  Observation,
  ReportCategory,
  ReportStatus,
  ResponseState,
  RoadCondition,
  UTEvent,
  UTRoute,
  WorkflowStatus,
} from './types';

/**
 * Where the API lives, from the phone's point of view.
 *
 * Three deployments, and getting this wrong breaks exactly one of them,
 * silently, after it ships:
 *
 *   · **dev on a laptop** — vite serves this app on :5176, the API is a
 *     separate process on :8000 (or whatever API_PORT says), so swap the port.
 *   · **dev on a real phone** — same, except `localhost` would mean the phone
 *     itself. Hence `window.location.hostname`, which is the laptop's LAN IP,
 *     never a hardcoded host.
 *   · **demo / production** — FastAPI serves the built app, so the API is the
 *     same origin. Appending a port there points at nothing.
 */
function resolveApiOrigin(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (explicit) return explicit;

  if (import.meta.env.DEV) {
    const port = (import.meta.env.VITE_API_PORT as string | undefined) ?? '8000';
    return `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  return window.location.origin;
}

export const API_BASE: string = resolveApiOrigin();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ApiError(
      `${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
      response.status,
      path,
    );
  }
  return (await response.json()) as T;
}

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export interface EventFilters {
  [key: string]: unknown;
  status?: WorkflowStatus[];
  class?: string[];
  bbox?: string;
  since?: string;
  min_confidence?: number;
  limit?: number;
}

export const api = {
  health: () => request<HealthStatus>('/health'),

  events: (filters: EventFilters = {}) => request<UTEvent[]>(`/api/events${query(filters)}`),
  event: (eventId: string) => request<UTEvent>(`/api/events/${eventId}`),

  setEventStatus: (
    eventId: string,
    body: { status: WorkflowStatus; assigned_team?: string; notes?: string },
  ) =>
    request<UTEvent>(`/api/events/${eventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  fleet: (routeId?: string) => request<BusPosition[]>(`/api/fleet${query({ route_id: routeId })}`),
  bus: (busId: string) => request<BusPosition>(`/api/fleet/${busId}`),

  routesGeoJson: () => request<GeoJsonFeatureCollection>('/api/routes'),
  routes: () => request<UTRoute[]>('/api/routes/list'),

  roads: () => request<RoadCondition[]>('/api/roads'),

  /**
   * Raw detections, before fusion. The ONLY record that names a bus — an
   * Event is a fusion of several and carries a count, not a list — so this is
   * the only way to answer "what did MY bus contribute". Server-side it reads
   * an in-memory ring buffer, so it is recent, not historical.
   */
  observations: (
    params: {
      [key: string]: unknown;
      bus_id?: string;
      route_id?: string;
      since?: string;
      limit?: number;
    } = {},
  ) => request<Observation[]>(`/api/observations${query(params)}`),

  incidents: (params: { [key: string]: unknown; limit?: number } = {}) =>
    request<IncidentReport[]>(`/api/incidents${query(params)}`),

  summary: () => request<AnalyticsSummary>('/api/analytics/summary'),

  // ── citizen reports ───────────────────────────────────────────────────────
  // The photo travels as a base64 data URI in the POST body and is decoded to
  // a file server-side; what comes back in `photo_uri` is a path. Nothing here
  // ever holds a data URI after the request completes — see
  // services/cloud/api/routers/reports.py.
  createReport: (body: {
    category: ReportCategory;
    description: string;
    lat: number;
    lon: number;
    address?: string;
    reporter_name?: string;
    ward?: string;
    photo?: string;
  }) =>
    request<CitizenReport>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  reports: (
    params: {
      [key: string]: unknown;
      status?: ReportStatus[];
      category?: ReportCategory[];
      ward?: string;
      reporter_name?: string;
      limit?: number;
    } = {},
  ) => request<CitizenReport[]>(`/api/reports${query(params)}`),

  report: (reportId: string) => request<CitizenReport>(`/api/reports/${reportId}`),

  // ── crew evidence ─────────────────────────────────────────────────────────
  /** A crew's own photo/note, appended to the event's evidence list. */
  addEvidence: (eventId: string, body: { photo?: string; note?: string; team?: string }) =>
    request<UTEvent>(`/api/events/${eventId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── emergency response ────────────────────────────────────────────────────
  /** Latest state per incident. */
  incidentResponses: () => request<IncidentResponse[]>('/api/incidents/responses'),

  /** Every state change for one incident, oldest first. */
  incidentResponseHistory: (incidentId: string) =>
    request<IncidentResponse[]>(`/api/incidents/${incidentId}/response`),

  /**
   * Advance a response. Forward-only except CLOSED — a 409 here means another
   * crew got there first, which the caller must show rather than swallow.
   */
  setIncidentResponse: (
    incidentId: string,
    body: { state: ResponseState; team?: string; note?: string },
  ) =>
    request<IncidentResponse>(`/api/incidents/${incidentId}/response`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // ── camera health ─────────────────────────────────────────────────────────
  /** Four rows per bus. `derived` says whether the state was sensed or inferred. */
  busCameras: (busId: string) => request<CameraStatus[]>(`/api/fleet/${busId}/cameras`),
};
