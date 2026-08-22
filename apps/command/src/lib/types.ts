/**
 * TypeScript mirror of `packages/contracts`. Owned by M6.
 *
 * These types are hand-mirrored rather than generated, because the generator
 * would be one more thing to keep running during a seven-day sprint. The
 * `contractsAreInSync` test in `src/test/contracts.test.ts` fetches the live
 * OpenAPI schema and fails if this file has drifted — so drift is caught, it
 * just is not auto-fixed.
 *
 * FROZEN alongside packages/contracts. Same rules apply.
 */

export type DetectionClass =
  | 'POTHOLE'
  | 'LONGITUDINAL_CRACK'
  | 'TRANSVERSE_CRACK'
  | 'ALLIGATOR_CRACK'
  | 'WATERLOGGING'
  | 'DAMAGED_DIVIDER'
  | 'MISSING_SIGN'
  | 'FADED_ZEBRA'
  | 'VEHICLE'
  | 'PEDESTRIAN'
  | 'PEDESTRIAN_RISK'
  | 'RASH_DRIVING'
  | 'COLLISION';

export type Severity = 'SMALL' | 'MEDIUM' | 'LARGE';

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

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

export type WSMessageType =
  | 'HELLO'
  | 'BUS_POSITION'
  | 'EVENT_NEW'
  | 'EVENT_UPDATED'
  | 'ROAD_CONDITION'
  | 'INCIDENT'
  | 'TICK';

/** The eight classes that always carry a severity. */
export const INFRASTRUCTURE_CLASSES: readonly DetectionClass[] = [
  'POTHOLE',
  'LONGITUDINAL_CRACK',
  'TRANSVERSE_CRACK',
  'ALLIGATOR_CRACK',
  'WATERLOGGING',
  'DAMAGED_DIVIDER',
  'MISSING_SIGN',
  'FADED_ZEBRA',
] as const;

export const WORKFLOW_ORDER: readonly WorkflowStatus[] = [
  'DETECTED',
  'AI_VERIFIED',
  'AUTHORITY_NOTIFIED',
  'INSPECTION',
  'MAINTENANCE_ASSIGNED',
  'REPAIR_COMPLETED',
  'VERIFIED',
  'RESOLVED',
  'REJECTED',
] as const;

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Observation {
  obs_id: string;
  bus_id: string;
  route_id: string;
  ts: string;
  lat: number;
  lon: number;
  gps_accuracy_m: number;
  heading_deg: number;
  speed_kmph: number;
  detection_class: DetectionClass;
  raw_confidence: number;
  severity: Severity | null;
  bbox: BBox | null;
  evidence_uri: string | null;
  plate_hash: string | null;
  track_id: number | null;
  reid_embedding: number[] | null;
}

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

/** GeoJSON order throughout: [lon, lat]. */
export type LonLat = [number, number];

export interface UTRoute {
  route_id: string;
  name: string;
  polyline: LonLat[];
  stops: string[];
  color: string;
  length_km: number;
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
}

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
  /** Operator-visible only. Never persisted — see DPDP Act 2023 notes in M4. */
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
}

export interface HealthStatus {
  ok: boolean;
  database: boolean;
  postgis: boolean;
  redis: boolean;
  mqtt: boolean;
  version: string;
  detail: Record<string, string>;
}

export interface WSMessage<T = Record<string, unknown>> {
  type: WSMessageType;
  ts: string;
  payload: T;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }>;
}

/**
 * Every panel receives exactly these props. One shape, five owners, no
 * negotiation — and a panel can be developed in isolation against mock props.
 */
export interface PanelProps {
  events: UTEvent[];
  roads: RoadCondition[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}
