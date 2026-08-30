/**
 * Field-app facade over the ONE shared API client and the ONE generated
 * contract-type module (`src/lib`). This file holds only field-specific
 * presentation helpers — no contract types are mirrored here.
 */

import { api as shared } from '../../lib/api';
import type { Severity, UTEvent, WorkflowStatus } from '../../lib/types';

export type { Severity, WorkflowStatus };
export type FieldEvent = UTEvent;

export const api = {
  events: (limit = 200) => shared.events({ limit }),
  event: (id: string) => shared.event(id),
  setStatus: (id: string, status: WorkflowStatus, notes?: string, team?: string) =>
    shared.setEventStatus(id, { status, notes, assigned_team: team }),
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  SMALL: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  MEDIUM: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  LARGE: 'text-red-400 border-red-500/30 bg-red-500/10',
};

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  DETECTED: 'Detected',
  AI_VERIFIED: 'AI verified',
  AUTHORITY_NOTIFIED: 'Notified',
  INSPECTION: 'Inspecting',
  MAINTENANCE_ASSIGNED: 'Assigned to me',
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
