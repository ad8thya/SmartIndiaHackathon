/**
 * Deterministic evidence placeholders. Owned by M6.
 *
 * There is no camera on any bus yet — `Observation.evidence_uri` points at an
 * `s3://` path the mocks invent and nothing writes. Every evidence slot in the
 * UI was therefore an empty grey box with a camera glyph in it, which reads as
 * "broken" rather than "not built".
 *
 * These render a *card*, not a fake photograph. Each one shows what the record
 * actually contains — class, severity, the bus that reported it, the time —
 * over an abstract pattern derived from the event id, and carries a SYNTHETIC
 * label so nobody can mistake it for a camera frame. Same event in, same card
 * out, across reloads and machines: the seed is a hash of the id.
 *
 * When real evidence lands, `evidenceImage()` is the one function to change.
 */

import type { DetectionClass, Severity } from './types';

const SEVERITY_COLOR: Record<Severity, string> = {
  SMALL: '#38bdf8',
  MEDIUM: '#f59e0b',
  LARGE: '#ef4444',
};

const CLASS_LABEL: Partial<Record<DetectionClass, string>> = {
  POTHOLE: 'Pothole',
  LONGITUDINAL_CRACK: 'Longitudinal crack',
  TRANSVERSE_CRACK: 'Transverse crack',
  ALLIGATOR_CRACK: 'Alligator crack',
  WATERLOGGING: 'Waterlogging',
  DAMAGED_DIVIDER: 'Damaged divider',
  DAMAGED_SIGN: 'Damaged sign',
  ZEBRA_CROSSING: 'Zebra crossing',
  PEDESTRIAN_RISK: 'Pedestrian at risk',
  RASH_DRIVING: 'Rash driving',
  COLLISION: 'Collision',
  NEAR_MISS: 'Near miss',
};

/** A tiny deterministic PRNG — same id always yields the same sequence. */
function seeded(id: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface EvidenceSubject {
  id: string;
  detectionClass: DetectionClass;
  severity: Severity;
  /** the reporting bus, when the record names one */
  busId?: string | null;
  ts?: string | null;
}

/**
 * An SVG data URI: a synthetic evidence card for one record.
 *
 * `compact` drops the caption block for thumbnail-sized slots.
 */
export function evidenceImage(subject: EvidenceSubject, compact = false): string {
  const random = seeded(subject.id);
  const accent = SEVERITY_COLOR[subject.severity];
  const width = 320;
  const height = compact ? 120 : 180;

  // an abstract "road surface": deterministic streaks, never a fake photo
  const streaks = Array.from({ length: 9 }, () => {
    const y = 10 + random() * (height - 20);
    const x = random() * width;
    const length = 30 + random() * 150;
    const opacity = (0.05 + random() * 0.14).toFixed(3);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${length.toFixed(1)}" height="${(1 + random() * 2).toFixed(1)}" fill="#94a3b8" opacity="${opacity}" rx="1"/>`;
  }).join('');

  // the "detection" — a bounding box where a detector would have drawn one
  const boxW = 60 + random() * 70;
  const boxH = 34 + random() * 40;
  const boxX = 24 + random() * (width - boxW - 48);
  const boxY = 18 + random() * (height - boxH - (compact ? 36 : 74));
  const bracket = 9;

  const corners = [
    [boxX, boxY, 1, 1],
    [boxX + boxW, boxY, -1, 1],
    [boxX, boxY + boxH, 1, -1],
    [boxX + boxW, boxY + boxH, -1, -1],
  ]
    .map(
      ([x, y, dx, dy]) =>
        `<path d="M${(x + dx * bracket).toFixed(1)} ${y.toFixed(1)} H${x.toFixed(1)} V${(y + dy * bracket).toFixed(1)}" stroke="${accent}" stroke-width="2" fill="none"/>`,
    )
    .join('');

  const label = CLASS_LABEL[subject.detectionClass] ?? subject.detectionClass;
  const time = subject.ts
    ? new Date(subject.ts).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

  const caption = compact
    ? ''
    : `<g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
         <text x="14" y="${height - 40}" fill="#e2e8f0" font-size="12">${escapeText(label)}</text>
         <text x="14" y="${height - 24}" fill="${accent}" font-size="10">${subject.severity}</text>
         <text x="${14 + 46}" y="${height - 24}" fill="#64748b" font-size="10">${escapeText(subject.busId ?? 'fleet')}</text>
         <text x="14" y="${height - 10}" fill="#475569" font-size="9">${escapeText(time)}</text>
       </g>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0d1220"/>
  <rect width="${width}" height="${height}" fill="#141b2e" opacity="0.6"/>
  ${streaks}
  <rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${accent}" opacity="0.12"/>
  <rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-dasharray="3 3"/>
  ${corners}
  <text x="${width - 10}" y="15" text-anchor="end" fill="#475569" font-size="8" font-family="ui-monospace, monospace" letter-spacing="1.5">SYNTHETIC</text>
  ${caption}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
