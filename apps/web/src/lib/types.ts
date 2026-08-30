/**
 * GENERATED from packages/contracts — do not edit by hand.
 * Regenerate with:  .venv/bin/python scripts/gen_frontend_types.py
 * contracts version: 1.1.0
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

export type Severity =
  | 'SMALL'
  | 'MEDIUM'
  | 'LARGE';

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

export type RiskLevel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'SEVERE';

export type RiskBand =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL';

export type RecommendationType =
  | 'ZEBRA_CROSSING'
  | 'SIGNAL_TIMING'
  | 'DIVIDER'
  | 'SIGNAGE'
  | 'STREET_LIGHT'
  | 'SPEED_CALMING'
  | 'DRAINAGE';

export type WSMessageType =
  | 'HELLO'
  | 'BUS_POSITION'
  | 'EVENT_NEW'
  | 'EVENT_UPDATED'
  | 'ROAD_CONDITION'
  | 'INCIDENT'
  | 'TICK';

export const INFRASTRUCTURE_CLASSES: readonly DetectionClass[] = [
  'POTHOLE',
  'LONGITUDINAL_CRACK',
  'TRANSVERSE_CRACK',
  'ALLIGATOR_CRACK',
  'WATERLOGGING',
  'DAMAGED_DIVIDER',
  'DAMAGED_SIGN',
  'ZEBRA_CROSSING',
] as const;

export const FUSABLE_CLASSES: readonly DetectionClass[] = [
  'POTHOLE',
  'LONGITUDINAL_CRACK',
  'TRANSVERSE_CRACK',
  'ALLIGATOR_CRACK',
  'WATERLOGGING',
  'DAMAGED_DIVIDER',
  'DAMAGED_SIGN',
  'ZEBRA_CROSSING',
  'PEDESTRIAN_RISK',
  'RASH_DRIVING',
  'COLLISION',
  'NEAR_MISS',
] as const;

/** GeoJSON order throughout: [lon, lat]. */
export type LonLat = [number, number];

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

/** API-level shape (routers/intelligence.py) — not a wire model in contracts. */
export interface DangerousJunction {
  road_id: string;
  name: string;
  lat: number;
  lon: number;
  risk_score: number;
  risk_band: RiskBand;
  near_miss_count_7d: number;
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
 * Every command-console panel receives exactly these props. One shape, five
 * owners, no negotiation — a panel can be developed against mock props.
 */
export interface PanelProps {
  events: UTEvent[];
  roads: RoadCondition[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

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
  urban_risk_score: number | null;
  risk_band: RiskBand | null;
  near_miss_count_7d: number;
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

export interface NearMissEvent {
  nm_id: string;
  lat: number;
  lon: number;
  road_id: string;
  ts: string;
  bus_id: string;
  vehicle_track_id: number;
  pedestrian_track_id: number;
  min_ttc_seconds: number;
  closing_speed_kmph: number;
  severity: Severity;
  evidence_uri: string | null;
}

export interface WhatIfRequest {
  closed_road_ids: string[];
  horizon_minutes: number;
  reason: string | null;
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
  plate_text: string | null;
  plate_hash: string | null;
  plate_confidence: number | null;
  evidence_uris: string[];
}

export interface WorkOrder {
  work_order_id: string;
  event_id: string;
  assigned_team: string;
  status: WorkflowStatus;
  created_at: string;
  sla_due: string | null;
  completed_at: string | null;
  notes: string | null;
  cost_estimate_inr: number | null;
  before_uri: string | null;
  after_uri: string | null;
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

export interface HealthStatus {
  ok: boolean;
  database: boolean;
  postgis: boolean;
  redis: boolean;
  mqtt: boolean;
  version: string;
  detail: Record<string, string>;
}
