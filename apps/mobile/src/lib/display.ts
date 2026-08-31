/**
 * How the phone renders the shared vocabulary: colours, chips, and the
 * plain-language labels a member of the public should read instead of an enum.
 *
 * The console has its own version of this in apps/web/src/lib/colors.ts, tuned
 * for a dark operator screen. These two are allowed to differ — one is read in
 * a control room, the other in sunlight — but they must never disagree about
 * *meaning*: green is a thing that is done, red is a thing that is not.
 */

import type {
  ReportCategory,
  ReportStatus,
  Severity,
  WorkflowStatus,
} from './types';

// ── the workflow ladder ─────────────────────────────────────────────────────

/** Marker fill on the map. Light-theme values, not the console's. */
export const STATUS_HEX: Record<WorkflowStatus, string> = {
  DETECTED: '#94A3B8',
  AI_VERIFIED: '#64748B',
  AUTHORITY_NOTIFIED: '#DC2626',
  INSPECTION: '#EA580C',
  MAINTENANCE_ASSIGNED: '#D97706',
  REPAIR_COMPLETED: '#16A34A',
  VERIFIED: '#10B981',
  RESOLVED: '#10B981',
  REJECTED: '#94A3B8',
};

export function statusChipClass(status: WorkflowStatus): string {
  if (status === 'DETECTED' || status === 'REJECTED') return 'bg-ink/[0.06] text-ink-muted';
  if (status === 'AUTHORITY_NOTIFIED') return 'bg-danger/10 text-danger';
  if (status === 'REPAIR_COMPLETED' || status === 'VERIFIED' || status === 'RESOLVED')
    return 'bg-emerald/12 text-emerald';
  return 'bg-amber/12 text-amber';
}

/**
 * Plain language for the public map.
 *
 * An operator reads "MAINTENANCE_ASSIGNED"; a citizen should read "repair
 * scheduled". Same wording as apps/web's PUBLIC_STATUS_LABEL — deliberately,
 * so the same defect does not describe itself two different ways depending on
 * which screen you are standing in front of.
 */
export const PUBLIC_STATUS_LABEL: Partial<Record<WorkflowStatus, string>> = {
  AUTHORITY_NOTIFIED: 'Reported to the city',
  INSPECTION: 'Being inspected',
  MAINTENANCE_ASSIGNED: 'Repair scheduled',
  REPAIR_COMPLETED: 'Repaired',
  VERIFIED: 'Repair verified',
  RESOLVED: 'Fixed',
};

/**
 * What a member of the public is allowed to see on the map.
 *
 * The ladder starts with machine output: DETECTED is one bus with low
 * confidence, AI_VERIFIED is corroborated but nobody has looked at it. Showing
 * those would put unreviewed algorithmic accusations about specific streets in
 * front of citizens, and REJECTED would publish the ones the city looked at and
 * disagreed with. So the public map starts at AUTHORITY_NOTIFIED — the rung
 * where a human has been told and the city owns the item — and runs to
 * RESOLVED.
 *
 * Identical to apps/web's PUBLIC_STATUSES. If the two ever disagree, the
 * stricter one is right.
 */
export const PUBLIC_STATUSES: readonly WorkflowStatus[] = [
  'AUTHORITY_NOTIFIED',
  'INSPECTION',
  'MAINTENANCE_ASSIGNED',
  'REPAIR_COMPLETED',
  'VERIFIED',
  'RESOLVED',
];

export function isPublic(status: WorkflowStatus): boolean {
  return PUBLIC_STATUSES.includes(status);
}

// ── severity ────────────────────────────────────────────────────────────────

export const SEVERITY_HEX: Record<Severity, string> = {
  SMALL: '#2563EB',
  MEDIUM: '#D97706',
  LARGE: '#DC2626',
};

export function severityChipClass(severity: Severity): string {
  return {
    SMALL: 'bg-accent/10 text-accent',
    MEDIUM: 'bg-amber/12 text-amber',
    LARGE: 'bg-danger/10 text-danger',
  }[severity];
}

/** IRC:82-2015 dimensional classes. A crew is entitled to know what it means. */
export const SEVERITY_DETAIL: Record<Severity, string> = {
  SMALL: 'under 100 mm across, under 25 mm deep',
  MEDIUM: '100–300 mm across, 25–50 mm deep',
  LARGE: 'over 300 mm across, over 50 mm deep',
};

// ── detection classes, in words ─────────────────────────────────────────────

export const CLASS_LABEL: Record<string, string> = {
  POTHOLE: 'Pothole',
  LONGITUDINAL_CRACK: 'Lengthwise crack',
  TRANSVERSE_CRACK: 'Crosswise crack',
  ALLIGATOR_CRACK: 'Cracked surface',
  WATERLOGGING: 'Waterlogging',
  DAMAGED_DIVIDER: 'Damaged divider',
  DAMAGED_SIGN: 'Damaged sign',
  ZEBRA_CROSSING: 'Faded crossing',
  PEDESTRIAN_RISK: 'Pedestrian risk',
  RASH_DRIVING: 'Rash driving',
  COLLISION: 'Collision',
  NEAR_MISS: 'Near miss',
  PEDESTRIAN: 'Pedestrian',
};

export function classLabel(value: string): string {
  return CLASS_LABEL[value] ?? value.replace(/_/g, ' ').toLowerCase();
}

// ── citizen reports ─────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  POTHOLE: 'Pothole',
  WATERLOGGING: 'Waterlogging',
  DAMAGED_SIGN: 'Sign or marking',
  STREETLIGHT: 'Streetlight',
  GARBAGE: 'Garbage',
  OTHER: 'Something else',
};

export const CATEGORY_EMOJI: Record<ReportCategory, string> = {
  POTHOLE: '🕳️',
  WATERLOGGING: '💧',
  DAMAGED_SIGN: '🚧',
  STREETLIGHT: '💡',
  GARBAGE: '🗑️',
  OTHER: '📍',
};

/** What the person who filed it should read. Never the enum. */
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  SUBMITTED: 'Sent',
  ACKNOWLEDGED: 'Seen by the city',
  LINKED: 'Matched to a known problem',
  IN_PROGRESS: 'Being fixed',
  RESOLVED: 'Fixed',
  REJECTED: 'Closed without action',
};

export function reportStatusChipClass(status: ReportStatus): string {
  if (status === 'RESOLVED') return 'bg-emerald/12 text-emerald';
  if (status === 'REJECTED') return 'bg-ink/[0.06] text-ink-muted';
  if (status === 'SUBMITTED') return 'bg-accent/10 text-accent';
  return 'bg-amber/12 text-amber';
}

// ── time ────────────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Metres between two points. Same haversine the backend uses. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanceLabel(metres: number): string {
  return metres < 950 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}
