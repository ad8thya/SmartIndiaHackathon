/**
 * Role portal API client.
 *
 * Deliberately self-contained (no shared package) — same reasoning as
 * apps/field: this app must stay installable and buildable on its own.
 *
 * Types are hand-mirrored from `packages/contracts/src/contracts` (the
 * FROZEN shared vocabulary), matching the *current* enum members there —
 * not the slightly-stale copy in apps/command/src/lib/types.ts (DAMAGED_SIGN
 * / ZEBRA_CROSSING there still read MISSING_SIGN / FADED_ZEBRA pre-rename).
 */

export type DetectionClass =
  | 'POTHOLE'
  | 'LONGITUDINAL_CRACK'
  | 'TRANSVERSE_CRACK'
  | 'ALLIGATOR_CRACK'
  | 'WATERLOGGING'
  | 'DAMAGED_DIVIDER'
  | 'DAMAGED_SIGN'
  | 'ZEBRA_CROSSING'
  | 'VEHICLE'
  | 'PEDESTRIAN'
  | 'PEDESTRIAN_RISK'
  | 'RASH_DRIVING'
  | 'COLLISION'
  | 'NEAR_MISS';

export type Severity = 'SMALL' | 'MEDIUM' | 'LARGE';
export type RiskBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

export type WorkflowStatus =
  | 'DETECTED'
  | 'AI_VERIFIED'
  | 'AUTHORITY_NOTIFIED'
  | 'INSPECTION'
  | 'MAINTENANCE_ASSIGNED'
  | 'REPAIR_COMPLETED'
  | 'VERIFIED'
  | 'RESOLVED'
  | 'REJECTED';

export type RecommendationType =
  | 'ZEBRA_CROSSING'
  | 'SIGNAL_TIMING'
  | 'DIVIDER'
  | 'SIGNAGE'
  | 'STREET_LIGHT'
  | 'SPEED_CALMING'
  | 'DRAINAGE';

export interface UTEvent {
  event_id: string;
  lat: number;
  lon: number;
  road_segment_id: string | null;
  detection_class: DetectionClass;
  severity: Severity;
  fused_confidence: number;
  observation_count: number;
  distinct_bus_count: number;
  first_seen: string;
  last_seen: string;
  status: WorkflowStatus;
  assigned_team: string | null;
  sla_due: string | null;
  evidence_uris: string[];
}

export interface BusPosition {
  bus_id: string;
  route_id: string;
  ts: string;
  lat: number;
  lon: number;
  heading_deg: number;
  speed_kmph: number;
  progress: number;
  occupancy_pct: number;
  next_stop: string | null;
  delay_min: number;
}

export interface RoadCondition {
  road_id: string;
  name: string;
  density: number;
  avg_speed_kmph: number;
  congestion_pct: number;
  pci_score: number;
  defect_counts: Record<string, number>;
  bus_delay_min: number;
  risk_level: RiskLevel;
  urban_risk_score: number | null;
  risk_band: RiskBand | null;
  near_miss_count_7d: number;
}

export interface IncidentReport {
  incident_id: string;
  incident_class: DetectionClass;
  ts: string;
  lat: number;
  lon: number;
  road_segment_id: string | null;
  reported_by_bus: string;
  narrative: string;
  confidence: number;
  track_id: number | null;
  vehicle_type: string | null;
  plate_text: string | null;
  plate_hash: string | null;
  plate_confidence: number | null;
  evidence_uris: string[];
}

export interface AnalyticsSummary {
  generated_at: string;
  buses_online: number;
  km_surveyed_today: number;
  open_events: number;
  events_by_status: Record<string, number>;
  events_by_class: Record<string, number>;
  avg_network_speed_kmph: number;
  incidents_today: number;
  sla_breaches: number;
  avg_resolution_hours: number;
  critical_risk_roads: number;
  open_recommendations: number;
  near_misses_7d: number;
}

export interface UrbanRiskScore {
  road_id: string;
  score: number;
  band: RiskBand;
  computed_at: string;
  components: Record<string, number>;
  explanation: string[];
}

export interface InfrastructureRecommendation {
  rec_id: string;
  road_id: string;
  lat: number;
  lon: number;
  rec_type: RecommendationType;
  priority: RiskBand;
  rationale: string[];
  evidence_event_ids: string[];
  estimated_beneficiaries: number | null;
  detected_at: string;
}

export interface DangerousJunction {
  road_id: string;
  name: string;
  lat: number;
  lon: number;
  risk_score: number;
  risk_band: RiskBand;
  near_miss_count_7d: number;
}

/** GeoJSON order throughout: [lon, lat]. */
export type LonLat = [number, number];

export interface WhatIfRequest {
  closed_road_ids: string[];
  horizon_minutes?: number;
  reason?: string | null;
}

export interface WhatIfResult {
  route_id: string;
  baseline_min: number;
  simulated_min: number;
  delta_min: number;
  recommended: boolean;
  diversion_polyline: LonLat[];
  affected_passengers: number;
}

const API_PORT = (import.meta.env.VITE_API_PORT as string | undefined) ?? '8000';

const BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;

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

function query(params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
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
  events: (filters: EventFilters = {}) => request<UTEvent[]>(`/api/events${query(filters)}`),
  event: (id: string) => request<UTEvent>(`/api/events/${id}`),
  setEventStatus: (
    id: string,
    body: { status: WorkflowStatus; assigned_team?: string; notes?: string },
  ) => request<UTEvent>(`/api/events/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) }),

  fleet: (routeId?: string) => request<BusPosition[]>(`/api/fleet${query({ route_id: routeId })}`),
  bus: (busId: string) => request<BusPosition>(`/api/fleet/${busId}`),

  roads: () => request<RoadCondition[]>('/api/roads'),
  roadRisk: (roadId: string) => request<UrbanRiskScore>(`/api/roads/${roadId}/risk`),

  incidents: (
    params: { [key: string]: unknown; class?: string; with_plate?: boolean; limit?: number } = {},
  ) => request<IncidentReport[]>(`/api/incidents${query(params)}`),

  summary: () => request<AnalyticsSummary>('/api/analytics/summary'),

  recommendations: (
    params: { [key: string]: unknown; type?: RecommendationType; priority?: RiskBand; road_id?: string } = {},
  ) => request<InfrastructureRecommendation[]>(`/api/recommendations${query(params)}`),

  dangerousJunctions: (limit = 10) =>
    request<DangerousJunction[]>(`/api/junctions/dangerous${query({ limit })}`),

  simulate: (body: WhatIfRequest) =>
    request<WhatIfResult[]>('/api/whatif/simulate', {
      method: 'POST',
      body: JSON.stringify({ horizon_minutes: 60, ...body }),
    }),
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  SMALL: 'text-sky-600 border-sky-200 bg-sky-50',
  MEDIUM: 'text-amber-600 border-amber-200 bg-amber-50',
  LARGE: 'text-red-600 border-red-200 bg-red-50',
};

export const RISK_BAND_COLOR: Record<RiskBand, string> = {
  LOW: 'text-emerald-600 border-emerald-200 bg-emerald-50',
  MODERATE: 'text-amber-600 border-amber-200 bg-amber-50',
  HIGH: 'text-orange-600 border-orange-200 bg-orange-50',
  CRITICAL: 'text-red-600 border-red-200 bg-red-50',
};

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  DETECTED: 'Detected',
  AI_VERIFIED: 'AI verified',
  AUTHORITY_NOTIFIED: 'Notified',
  INSPECTION: 'Inspecting',
  MAINTENANCE_ASSIGNED: 'Assigned',
  REPAIR_COMPLETED: 'Repaired',
  VERIFIED: 'Verified',
  RESOLVED: 'Closed',
  REJECTED: 'Rejected',
};

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export function slaText(slaDue: string | null): { text: string; overdue: boolean } {
  if (!slaDue) return { text: '—', overdue: false };
  const remaining = new Date(slaDue).getTime() - Date.now();
  const hours = Math.abs(remaining) / 3_600_000;
  const label = hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
  return remaining < 0 ? { text: `${label} over`, overdue: true } : { text: label, overdue: false };
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
