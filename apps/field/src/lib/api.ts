/**
 * Field app API client. Owned by M6.
 *
 * Deliberately a separate small file rather than a shared package: the field
 * app must stay installable and buildable on its own, and the surface it needs
 * is a fraction of the command centre's.
 */

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

export type Severity = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface FieldEvent {
  event_id: string;
  lat: number;
  lon: number;
  road_segment_id: string | null;
  detection_class: string;
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

const BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:8000`;

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export const api = {
  events: (limit = 200) => json<FieldEvent[]>(`/api/events?limit=${limit}`),
  event: (id: string) => json<FieldEvent>(`/api/events/${id}`),
  setStatus: (id: string, status: WorkflowStatus, notes?: string, team?: string) =>
    json<FieldEvent>(`/api/events/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes, assigned_team: team }),
    }),
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
