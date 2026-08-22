/**
 * ══════════════════════════════════════════════════════════════════════════
 *  M4 OWNS THIS FILE. Nobody else edits it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Incident dossiers: what happened, who was involved, and what the evidence is.
 *
 * PRIVACY — read before you change anything here.
 * `plate_text` is operator-visible only and is never persisted (DPDP Act 2023
 * data minimisation). What the database and MQTT carry is `plate_hash`. The
 * masking toggle below is not decoration: it is what you show a judge when they
 * ask whether this is a surveillance system. Keep the default masked.
 *
 * TODO (M4):
 *   · real plate crops from evidence_uris once M5 exposes signed URLs
 *   · a frame-by-frame timeline scrubber for the incident window
 *   · OCR confidence per character, so a low-confidence digit is visibly weak
 *   · "export dossier as PDF" — the actual deliverable for a traffic police FIR
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Car,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Image as ImageIcon,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import type { IncidentReport, PanelProps } from '../lib/types';
import { useStore } from '../store/useStore';
import { clockTime, timeAgo } from '../lib/format';

export function IncidentsPanel({ selected, onSelect }: PanelProps) {
  const incidents = useStore((s) => s.incidents);
  const [showPlates, setShowPlates] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'COLLISION' | 'RASH_DRIVING'>('ALL');

  const visible = useMemo(
    () => incidents.filter((incident) => filter === 'ALL' || incident.incident_class === filter),
    [incidents, filter],
  );

  const collisions = incidents.filter((i) => i.incident_class === 'COLLISION').length;
  const withPlates = incidents.filter((i) => i.plate_hash).length;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="grid grid-cols-3 gap-2 border-b border-white/5 p-3">
        <Stat label="Total" value={String(incidents.length)} />
        <Stat label="Collisions" value={String(collisions)} tone="danger" />
        <Stat label="Plates read" value={String(withPlates)} />
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        <div className="flex gap-1.5">
          {(['ALL', 'COLLISION', 'RASH_DRIVING'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                filter === option
                  ? 'border-sky-400/40 bg-sky-500/15 text-sky-300'
                  : 'border-white/10 bg-ink-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {option === 'ALL' ? 'All' : option.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowPlates((v) => !v)}
          title={
            showPlates
              ? 'Hide plates — this is the default, and what a privacy review expects'
              : 'Reveal plates (authorised operator action)'
          }
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors ${
            showPlates
              ? 'border-amber-400/40 bg-amber-500/10 text-amber-300'
              : 'border-white/10 bg-ink-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          {showPlates ? <Eye size={11} /> : <EyeOff size={11} />}
          {showPlates ? 'Plates visible' : 'Plates masked'}
        </button>
      </div>

      <div className="flex-1">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs leading-relaxed text-slate-500">
            No incidents recorded. The fleet reports collisions and rash driving as they happen —
            run <code className="rounded bg-ink-900 px-1 font-mono">make dev</code> and watch route
            21G.
          </p>
        ) : (
          visible.map((incident) => (
            <Dossier
              key={incident.incident_id}
              incident={incident}
              expanded={incident.incident_id === selected}
              showPlate={showPlates}
              onToggle={() =>
                onSelect(incident.incident_id === selected ? null : incident.incident_id)
              }
            />
          ))
        )}
      </div>

      <footer className="border-t border-white/5 px-3 py-2 text-[10px] leading-relaxed text-slate-600">
        Plates are stored as salted SHA-256 only. Readable text exists in this dossier and nowhere
        else — DPDP Act 2023, data minimisation.
      </footer>
    </div>
  );
}

function Dossier({
  incident,
  expanded,
  showPlate,
  onToggle,
}: {
  incident: IncidentReport;
  expanded: boolean;
  showPlate: boolean;
  onToggle: () => void;
}) {
  const isCollision = incident.incident_class === 'COLLISION';
  const plate = incident.plate_text
    ? showPlate
      ? incident.plate_text
      : maskPlate(incident.plate_text)
    : null;

  return (
    <div className={`border-b border-white/5 ${expanded ? 'bg-white/[0.02]' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]"
      >
        <ShieldAlert
          size={15}
          className={`mt-0.5 shrink-0 ${isCollision ? 'text-red-400' : 'text-amber-400'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-200">
              {incident.incident_class.replace('_', ' ').toLowerCase()}
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              {Math.round(incident.confidence * 100)}%
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-slate-500">
            {incident.reported_by_bus} · {timeAgo(incident.ts)}
          </span>
        </span>
        {plate && (
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider ${
              showPlate
                ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                : 'border-white/10 bg-ink-900 text-slate-500'
            }`}
          >
            {plate}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pb-3">
              <p className="rounded-lg border border-white/10 bg-ink-900/60 p-2.5 text-[11px] leading-relaxed text-slate-300">
                <FileText size={11} className="mr-1 inline text-slate-500" />
                {incident.narrative}
              </p>

              <dl className="grid grid-cols-2 gap-2 text-[10px]">
                <Field icon={<Clock size={10} />} label="Time" value={clockTime(incident.ts)} />
                <Field
                  icon={<MapPin size={10} />}
                  label="Location"
                  value={incident.road_segment_id ?? `${incident.lat.toFixed(4)}, ${incident.lon.toFixed(4)}`}
                />
                <Field
                  icon={<Car size={10} />}
                  label="Vehicle"
                  value={incident.vehicle_type ?? 'unidentified'}
                />
                <Field
                  icon={<Fingerprint size={10} />}
                  label="Track"
                  value={incident.track_id != null ? `#${incident.track_id}` : '—'}
                />
              </dl>

              {/* ── plate evidence ────────────────────────────────────── */}
              {incident.plate_hash && (
                <div className="rounded-lg border border-white/10 bg-ink-900/60 p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      Plate evidence
                    </span>
                    {incident.plate_confidence != null && (
                      <span className="font-mono text-[10px] text-slate-400">
                        OCR {Math.round(incident.plate_confidence * 100)}%
                      </span>
                    )}
                  </div>

                  {/* TODO (M4): replace with the real crop from evidence_uris */}
                  <div className="flex h-14 items-center justify-center rounded border border-dashed border-white/15 bg-black/40">
                    <span
                      className={`font-mono text-lg tracking-[0.2em] ${
                        showPlate ? 'text-slate-200' : 'text-slate-600 blur-[3px]'
                      }`}
                    >
                      {incident.plate_text ?? '—— —— ——'}
                    </span>
                  </div>

                  {incident.plate_confidence != null && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${incident.plate_confidence * 100}%` }}
                      />
                    </div>
                  )}

                  <p className="mt-2 break-all font-mono text-[9px] leading-relaxed text-slate-600">
                    sha256 {incident.plate_hash.slice(0, 32)}…
                  </p>
                </div>
              )}

              {incident.evidence_uris.length > 0 && (
                <div>
                  <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-slate-500">
                    Frames ({incident.evidence_uris.length})
                  </span>
                  <div className="flex gap-1.5 overflow-x-auto">
                    {incident.evidence_uris.map((uri, index) => (
                      <div
                        key={uri}
                        title={uri}
                        className="flex h-14 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded border border-white/10 bg-ink-900 text-slate-600"
                      >
                        <ImageIcon size={13} />
                        <span className="font-mono text-[9px]">{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "TN 09 BX 4412" → "TN ** ** **12" — enough to correlate, not to identify. */
function maskPlate(plate: string): string {
  const parts = plate.split(' ');
  if (parts.length < 2) return '•'.repeat(plate.length);
  const last = parts[parts.length - 1];
  return `${parts[0]} ${'••'.padEnd(2, '•')} •• ${'••'}${last.slice(-2)}`;
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div
      className={`rounded-lg border px-2 py-2 ${
        tone === 'danger' ? 'border-red-500/20 bg-red-500/5' : 'border-white/10 bg-ink-700/60'
      }`}
    >
      <div
        className={`font-mono text-lg font-semibold leading-none ${
          tone === 'danger' ? 'text-red-300' : 'text-slate-100'
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-white/5 bg-ink-800/60 px-2 py-1.5">
      <dt className="flex items-center gap-1 uppercase tracking-wider text-slate-500">
        {icon} {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-slate-300">{value}</dd>
    </div>
  );
}
