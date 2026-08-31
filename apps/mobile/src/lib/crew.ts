/**
 * What a maintenance crew's queue is, derived from events.
 *
 * There is no separate work-order feed for the phone: an event that has
 * reached the assignment rungs of the workflow IS a work order, and inventing
 * a second source of truth is how the console and the phone would come to
 * disagree about whether a repair is done.
 *
 * `MY_TEAM` is hardcoded, exactly like the console's old field view. It is the one
 * piece of "identity" a crew has, and with no auth (store/session.ts) there is
 * nothing to derive it from. Written down here rather than spread across
 * screens, so the day real auth arrives there is one line to change.
 */

import { Clock, MapPin, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Severity, WorkflowStatus } from './types';
import type { StoredEvent } from './useEvents';
import { distanceLabel, distanceM } from './display';

/** The crew this phone belongs to. No auth exists to derive it — see above. */
export const MY_TEAM = 'GCC-Zone-13-Adyar';

/** Rungs where an event is somebody's job. */
export const QUEUE_STATUSES: readonly WorkflowStatus[] = [
  'AUTHORITY_NOTIFIED',
  'INSPECTION',
  'MAINTENANCE_ASSIGNED',
];

/** Rungs where the work is done but a bus has not re-scanned it yet. */
export const AWAITING_VERIFICATION: readonly WorkflowStatus[] = ['REPAIR_COMPLETED'];

/**
 * The classes a road crew can actually be dispatched to.
 *
 * Mirrors `INFRASTRUCTURE_CLASSES` in the contracts. The status ladder is
 * shared by every detection class, so an escalated COLLISION or NEAR_MISS
 * reaches AUTHORITY_NOTIFIED exactly like a pothole does — and without this
 * guard it lands in a maintenance queue with an SLA countdown, an IRC:82
 * severity and a "recommended treatment", none of which mean anything for a
 * road-traffic incident. Those belong to Emergency Team.
 *
 * Latent rather than theoretical: on the seeded network no safety class has
 * escalated that far yet, so this fires zero times today and would fire
 * silently the first time one does.
 */
const CREW_CLASSES: readonly string[] = [
  'POTHOLE',
  'LONGITUDINAL_CRACK',
  'TRANSVERSE_CRACK',
  'ALLIGATOR_CRACK',
  'WATERLOGGING',
  'DAMAGED_DIVIDER',
  'DAMAGED_SIGN',
  'ZEBRA_CROSSING',
];

/** True when this is road work, at a rung where somebody owns it. */
export function isQueued(event: StoredEvent): boolean {
  return QUEUE_STATUSES.includes(event.status) && CREW_CLASSES.includes(event.detection_class);
}

/**
 * IRC:82-2015 treatment for a defect. The standard governs surface distress;
 * anything outside it returns null rather than a guess, because a crew acting
 * on a fabricated recommendation is worse than a crew reading "not specified".
 */
export function recommendedTreatment(
  detectionClass: string,
  severity: Severity,
): { treatment: string; note: string } | null {
  const CRACKS = ['LONGITUDINAL_CRACK', 'TRANSVERSE_CRACK', 'ALLIGATOR_CRACK'];

  if (detectionClass === 'POTHOLE') {
    return severity === 'LARGE'
      ? {
          treatment: 'Full-depth patch',
          note: 'Cut back to sound material, tack coat, hot mix in layers, compact.',
        }
      : {
          treatment: severity === 'MEDIUM' ? 'Hot-mix patch' : 'Cold-mix patch',
          note: 'Clean and dry the hole, fill proud, compact flush with the surface.',
        };
  }
  if (CRACKS.includes(detectionClass)) {
    return severity === 'LARGE'
      ? { treatment: 'Mill and overlay', note: 'Cracking is through the layer; sealing will not hold.' }
      : { treatment: 'Crack sealing', note: 'Rout, clean and seal with bituminous filler.' };
  }
  if (detectionClass === 'WATERLOGGING') {
    return { treatment: 'Clear drainage', note: 'Standing water is a drainage fault, not a surface one.' };
  }
  if (detectionClass === 'ZEBRA_CROSSING') {
    return { treatment: 'Repaint marking', note: 'Thermoplastic, after the surface is clean and dry.' };
  }
  if (detectionClass === 'DAMAGED_SIGN' || detectionClass === 'DAMAGED_DIVIDER') {
    return { treatment: 'Replace the unit', note: 'A structural item — repair is rarely economic.' };
  }
  return null;
}

/** SLA hours by severity. Mirrors contracts.sla_hours. */
export function slaHours(severity: Severity): number {
  return { LARGE: 24, MEDIUM: 72, SMALL: 168 }[severity];
}

export interface Sla {
  dueAt: number;
  msLeft: number;
  overdue: boolean;
  label: string;
  tone: 'good' | 'warn' | 'bad';
}

/**
 * The countdown a crew works to.
 *
 * `sla_due` is authoritative when the server sent one. When it did not, this
 * derives one from first_seen + the severity window rather than showing
 * nothing — but the two cases must not be conflated silently, so the caller is
 * told which it got via `derived`.
 */
export function slaFor(event: StoredEvent, now = Date.now()): Sla & { derived: boolean } {
  // `sla_due` is null when the server never set one, and UNDEFINED on a
  // citizen session, where the field is not sent at all (see projection.py).
  // Both mean the same thing here — derive the window from first_seen — and
  // the caller is told via `derived` so the UI can say the date is inferred.
  const explicit = event.sla_due ?? null;
  const derived = explicit === null;
  const dueAt = derived
    ? new Date(event.first_seen).getTime() + slaHours(event.severity) * 3_600_000
    : new Date(explicit).getTime();

  const msLeft = dueAt - now;
  const overdue = msLeft < 0;
  const hours = Math.abs(msLeft) / 3_600_000;

  const amount =
    hours < 1
      ? `${Math.round(Math.abs(msLeft) / 60_000)} min`
      : hours < 48
        ? `${Math.round(hours)} h`
        : `${Math.round(hours / 24)} days`;

  return {
    dueAt,
    msLeft,
    overdue,
    derived,
    label: overdue ? `${amount} overdue` : `${amount} left`,
    tone: overdue ? 'bad' : hours < 6 ? 'warn' : 'good',
  };
}

/** Icon+text rows for a queue card. */
export function orderDetails(
  event: StoredEvent,
  from: { lat: number; lon: number } | null,
): { icon: LucideIcon; text: string }[] {
  const rows: { icon: LucideIcon; text: string }[] = [];
  if (from) {
    rows.push({
      icon: MapPin,
      text: `${distanceLabel(distanceM(from, event))} away`,
    });
  } else if (event.road_segment_id) {
    rows.push({ icon: MapPin, text: event.road_segment_id });
  }
  const treatment = recommendedTreatment(event.detection_class, event.severity);
  if (treatment) rows.push({ icon: Wrench, text: treatment.treatment });
  rows.push({ icon: Clock, text: `${slaHours(event.severity)} h target` });
  return rows;
}
