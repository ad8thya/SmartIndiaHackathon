/**
 * Roles-portal facade over the ONE shared API client and the ONE generated
 * contract-type module (`src/lib`). This file holds only the light-theme
 * presentation helpers the roles screens use — no contract types are
 * mirrored here.
 */

export { ApiError, api, type EventFilters } from '../../lib/api';
export type {
  AnalyticsSummary,
  BusPosition,
  DangerousJunction,
  DetectionClass,
  IncidentReport,
  InfrastructureRecommendation,
  LonLat,
  RecommendationType,
  RiskBand,
  RiskLevel,
  RoadCondition,
  Severity,
  UTEvent,
  UrbanRiskScore,
  WhatIfRequest,
  WhatIfResult,
  WorkflowStatus,
} from '../../lib/types';

import type { RiskBand, Severity, WorkflowStatus } from '../../lib/types';

/** light-theme chip styles — the roles portal renders on paper, not ink */
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
