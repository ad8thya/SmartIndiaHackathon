/**
 * Typed HTTP client. Owned by M6.
 *
 * Every function returns a contract type from `./types`. Nothing else in the
 * app is allowed to call `fetch` directly — that way, when M5 changes a route,
 * exactly one file changes.
 */

import type {
  AnalyticsSummary,
  BusPosition,
  DangerousJunction,
  GeoJsonFeatureCollection,
  HealthStatus,
  IncidentReport,
  InfrastructureRecommendation,
  NearMissEvent,
  RecommendationType,
  RiskBand,
  RoadCondition,
  UrbanRiskScore,
  UTEvent,
  UTRoute,
  WhatIfRequest,
  WhatIfResult,
  WorkflowStatus,
} from './types';

/**
 * Where the API lives, from the browser's point of view.
 *
 * Two deployments, two answers, and getting this wrong breaks exactly one of
 * them — silently, and only once it is deployed:
 *
 *   · **dev** — vite serves the page on :5173 and the API is a separate
 *     process on :8000, so the port has to be swapped.
 *   · **demo / production** — FastAPI serves the page itself, so the API is
 *     on the *same origin*. Appending :8000 there points at a port nothing is
 *     listening on: on Railway the page is https://host (443) and every call
 *     would go to https://host:8000 and fail.
 *
 * So: an explicit VITE_API_BASE_URL always wins; otherwise the vite dev port
 * is the one case that needs the swap, and everything else is same-origin.
 */
function resolveApiOrigin(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (explicit) return explicit;

  const port = (import.meta.env.VITE_API_PORT as string | undefined) ?? '8000';
  if (import.meta.env.DEV) {
    // dev: hostname, not "localhost", so a phone on the LAN still resolves it.
    // We check DEV rather than a hardcoded port so it works even when Vite
    // auto-increments from 5173 to 5174/5175/… due to port conflicts.
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
  /** `minLon,minLat,maxLon,maxLat` */
  bbox?: string;
  since?: string;
  min_confidence?: number;
  limit?: number;
}

export const api = {
  health: () => request<HealthStatus>('/health'),

  fleet: (routeId?: string) => request<BusPosition[]>(`/api/fleet${query({ route_id: routeId })}`),
  bus: (busId: string) => request<BusPosition>(`/api/fleet/${busId}`),

  routesGeoJson: () => request<GeoJsonFeatureCollection>('/api/routes'),
  routes: () => request<UTRoute[]>('/api/routes/list'),

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

  roads: () => request<RoadCondition[]>('/api/roads'),
  roadCondition: (roadId: string) => request<RoadCondition>(`/api/roads/${roadId}/condition`),

  simulate: (body: WhatIfRequest) =>
    request<WhatIfResult[]>('/api/whatif/simulate', {
      method: 'POST',
      body: JSON.stringify({ horizon_minutes: 60, ...body }),
    }),

  incidents: (params: { [key: string]: unknown; class?: string; with_plate?: boolean; limit?: number } = {}) =>
    request<IncidentReport[]>(`/api/incidents${query(params)}`),

  summary: () => request<AnalyticsSummary>('/api/analytics/summary'),

  // ── AI intelligence layer ────────────────────────────────────────────────
  roadRisk: (roadId: string) => request<UrbanRiskScore>(`/api/roads/${roadId}/risk`),

  recommendations: (
    params: { [key: string]: unknown; type?: RecommendationType; priority?: RiskBand; road_id?: string } = {},
  ) => request<InfrastructureRecommendation[]>(`/api/recommendations${query(params)}`),

  nearMisses: (params: { [key: string]: unknown; bbox?: string; since?: string } = {}) =>
    request<NearMissEvent[]>(`/api/near-misses${query(params)}`),

  dangerousJunctions: (limit = 10) =>
    request<DangerousJunction[]>(`/api/junctions/dangerous${query({ limit })}`),
};

/** Building footprints for the 3D twin. Cached to disk at build time — this
 *  never hits Overpass at runtime. See `scripts/fetch_buildings.py`. */
export async function loadBuildings(): Promise<GeoJsonFeatureCollection | null> {
  try {
    const response = await fetch('/data/buildings.geojson');
    if (!response.ok) return null;
    return (await response.json()) as GeoJsonFeatureCollection;
  } catch {
    return null;
  }
}
