/**
 * One work order, and the three buttons that move it.
 *
 * This is the write path. "Start inspection" and "Mark repaired" PATCH the
 * real endpoint — the same `/api/events/{id}/status` the console calls — and
 * the console's kanban moves within a second because the API broadcasts
 * EVENT_UPDATED to every socket. Nothing here is local-only, and nothing here
 * fakes the transition and reconciles later: if the PATCH fails, the status
 * does not change and the crew is told, because a crew that believes a repair
 * was logged when it was not is how an SLA breaches silently.
 *
 * The action offered is always the *next* rung, never a free choice of status.
 * A dropdown of nine workflow states on a phone, in the sun, with gloves on,
 * is an invitation to set the wrong one.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  ClipboardCheck,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Ruler,
  Wrench,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { LazyMap } from '../../components/map/LazyMap';
import {
  classLabel,
  distanceLabel,
  distanceM,
  SEVERITY_DETAIL,
  severityChipClass,
  STATUS_HEX,
  statusChipClass,
  timeAgo,
} from '../../lib/display';
import { MY_TEAM, recommendedTreatment, slaFor } from '../../lib/crew';
import { useGeolocation } from '../../lib/useGeolocation';
import { haptic } from '../../lib/haptics';
import type { UTEvent, WorkflowStatus } from '../../lib/types';

/** The one step this order can take next, or null when it is finished here. */
function nextRung(status: WorkflowStatus): { to: WorkflowStatus; label: string } | null {
  if (status === 'AUTHORITY_NOTIFIED' || status === 'MAINTENANCE_ASSIGNED') {
    return { to: 'INSPECTION', label: 'Start inspection' };
  }
  if (status === 'INSPECTION') return { to: 'REPAIR_COMPLETED', label: 'Mark repaired' };
  return null;
}

export function OrderScreen() {
  const { eventId = '' } = useParams();
  const { state: geo, locate } = useGeolocation();
  const [event, setEvent] = useState<UTEvent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  useEffect(() => {
    void api
      .event(eventId)
      .then(setEvent)
      .catch((cause: unknown) =>
        setLoadError(cause instanceof Error ? cause.message : 'could not load this order'),
      );
    locate();
  }, [eventId, locate]);

  const from = geo.status === 'ok' ? { lat: geo.lat, lon: geo.lon } : null;
  const step = event ? nextRung(event.status) : null;
  const treatment = event ? recommendedTreatment(event.detection_class, event.severity) : null;
  const sla = event ? slaFor(event) : null;

  const markers = useMemo(
    () =>
      event
        ? [
            {
              id: event.event_id,
              lat: event.lat,
              lon: event.lon,
              color: STATUS_HEX[event.status],
              emphasis: true,
            },
          ]
        : [],
    [event],
  );

  async function advance(to: WorkflowStatus) {
    if (!event || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      // The real endpoint. The console sees this within ~1s over /ws/live.
      const updated = await api.setEventStatus(event.event_id, {
        status: to,
        assigned_team: MY_TEAM,
        notes: note.trim() || undefined,
      });
      setEvent(updated);
      setNote('');
      haptic('confirm');
    } catch (cause) {
      haptic('warn');
      setActionError(
        cause instanceof ApiError
          ? `The city service refused the update (${cause.status}). Nothing was changed.`
          : 'Could not reach the city service. The order was NOT updated — try again when you have signal.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="px-4 pt-6">
        <div className="ut-card px-5 py-9 text-center">
          <AlertCircle size={24} className="mx-auto text-ink-muted" />
          <h1 className="mt-3 text-[16px] font-medium">Could not open this order</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{loadError}</p>
          <Link
            to="/crew"
            className="ut-touch mt-5 inline-flex items-center gap-1.5 rounded-[12px] bg-accent px-5 py-2.5 text-[14px] font-medium text-white"
          >
            <ArrowLeft size={15} /> Back to the queue
          </Link>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="px-4 pt-4">
        <div className="ut-card animate-pulse p-4">
          <div className="h-3 w-1/3 rounded bg-ink/[0.07]" />
          <div className="mt-3 h-5 w-2/3 rounded bg-ink/[0.07]" />
          <div className="mt-4 h-40 w-full rounded bg-ink/[0.05]" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="px-4 pt-3">
        <Link
          to="/crew"
          className="ut-touch inline-flex items-center gap-1 text-[13px] font-medium text-accent"
        >
          <ArrowLeft size={15} /> Queue
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${statusChipClass(event.status)}`}>
            {event.status.replace(/_/g, ' ').toLowerCase()}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${severityChipClass(event.severity)}`}>
            {event.severity.toLowerCase()}
          </span>
          {sla ? (
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                sla.overdue ? 'bg-danger/10 text-danger' : 'bg-ink/[0.06] text-ink-muted'
              }`}
            >
              {sla.label}
            </span>
          ) : null}
        </div>

        <h1 className="mt-2 text-[22px] font-medium leading-tight tracking-[-0.4px]">
          {classLabel(event.detection_class)}
        </h1>
        <p className="mt-1 text-[13px] text-ink-soft">
          {event.road_segment_id ?? 'Location below'} · last seen {timeAgo(event.last_seen)}
        </p>
      </div>

      {/* ── evidence ─────────────────────────────────────────────────────── */}
      <div className="mt-4 px-4">
        <SectionLabel text="Evidence" />
        {event.evidence_uris.length > 0 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {event.evidence_uris.map((uri) => (
              <img
                key={uri}
                src={uri}
                alt="Camera evidence"
                className="h-32 w-44 flex-none rounded-[10px] border border-line object-cover"
                // An object-store key that does not resolve to an image would
                // otherwise render as a broken-image glyph, which reads as a
                // bug rather than as "no photo was kept".
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ))}
          </div>
        ) : (
          <div className="ut-card mt-2 flex items-center gap-2.5 p-3.5">
            <Camera size={16} className="flex-none text-ink-faint" />
            <p className="text-[12px] leading-snug text-ink-soft">
              No frame was kept for this one. It was corroborated by {event.distinct_bus_count} bus
              {event.distinct_bus_count === 1 ? '' : 'es'} across {event.observation_count} passes.
            </p>
          </div>
        )}
      </div>

      {/* ── severity + treatment ─────────────────────────────────────────── */}
      <div className="mt-5 px-4">
        <SectionLabel text="Assessment" />
        <div className="ut-card mt-2 p-4">
          <Row icon={Ruler} label="IRC:82 severity" value={event.severity.toLowerCase()} />
          <p className="ml-6 mt-0.5 text-[11px] leading-snug text-ink-faint">
            {SEVERITY_DETAIL[event.severity]}
          </p>

          <div className="mt-3 border-t border-line pt-3">
            {treatment ? (
              <>
                <Row icon={Wrench} label="Recommended" value={treatment.treatment} />
                <p className="ml-6 mt-0.5 text-[11px] leading-snug text-ink-soft">
                  {treatment.note}
                </p>
              </>
            ) : (
              <p className="text-[12px] leading-snug text-ink-soft">
                No standard treatment applies to this class — use your judgement on site.
              </p>
            )}
          </div>

          {sla ? (
            <div className="mt-3 border-t border-line pt-3">
              <Row
                icon={Clock}
                label={sla.overdue ? 'Overdue by' : 'Time left'}
                value={sla.label.replace(/ (left|overdue)$/, '')}
              />
              {sla.derived ? (
                <p className="ml-6 mt-0.5 text-[11px] leading-snug text-ink-faint">
                  No due date was set on this order — this is the IRC:82 window for its severity,
                  counted from when it was first seen.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── where ────────────────────────────────────────────────────────── */}
      <div className="mt-5 px-4">
        <SectionLabel text="Location" />
        <div className="ut-card mt-2 overflow-hidden">
          <div className="h-48">
            <LazyMap markers={markers} user={from} center={{ lat: event.lat, lon: event.lon }} zoom={16} />
          </div>
          <div className="flex items-center gap-2.5 p-3.5">
            <MapPin size={15} className="flex-none text-ink-faint" />
            <div className="min-w-0 flex-1 text-[12px] text-ink-soft">
              <div className="font-mono text-[11px]">
                {event.lat.toFixed(5)}, {event.lon.toFixed(5)}
              </div>
              {from ? <div>{distanceLabel(distanceM(from, event))} from you</div> : null}
            </div>
            {/* Hands off to whatever the phone uses for navigation. A geo: URI
                opens Maps on both platforms; there is no in-app turn-by-turn
                and this does not pretend there is. */}
            <a
              href={`geo:${event.lat},${event.lon}?q=${event.lat},${event.lon}`}
              className="ut-touch flex flex-none items-center gap-1.5 rounded-[10px] bg-accent px-3 text-[13px] font-medium text-white"
            >
              <Navigation size={14} /> Navigate
            </a>
          </div>
        </div>
      </div>

      {/* ── act ──────────────────────────────────────────────────────────── */}
      <div className="mt-5 px-4">
        <SectionLabel text="Update this order" />

        {step ? (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Optional note — what you found, what you did"
              aria-label="Note"
              className="ut-card mt-2 w-full resize-none px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:border-accent"
            />

            <button
              onClick={() => advance(step.to)}
              disabled={busy}
              className="ut-touch mt-2.5 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[16px] font-medium text-white shadow-[0_4px_14px_rgba(37,99,235,0.3)] disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  {step.to === 'INSPECTION' ? <ClipboardCheck size={17} /> : <Check size={17} />}
                  {step.label}
                </>
              )}
            </button>
          </>
        ) : (
          <div className="ut-card mt-2 flex items-start gap-2.5 p-3.5">
            <Check size={16} className="mt-0.5 flex-none text-emerald" />
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {event.status === 'REPAIR_COMPLETED'
                ? 'Marked repaired. It stays on the verification list until a bus re-scans the road and confirms it.'
                : 'Nothing further for a crew to do on this order.'}
            </p>
          </div>
        )}

        {/* Photo/note attachment is honest about where it stops: there is no
            endpoint that accepts crew evidence yet (T5 built the citizen one),
            so this records the note locally and says so rather than
            pretending it uploaded. */}
        <button
          onClick={() => {
            haptic('tap');
            setPhotoNote(
              'Crew photos are not uploaded yet — only citizen reports have an upload endpoint. Your note above is sent with the status change.',
            );
          }}
          className="ut-touch mt-2.5 flex w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-card px-4 py-3 text-[14px] font-medium"
        >
          <Camera size={16} className="text-ink-soft" /> Add a photo
        </button>

        {photoNote ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 rounded-[10px] bg-ink/[0.04] px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft"
          >
            {photoNote}
          </motion.p>
        ) : null}

        {actionError ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2.5 flex items-start gap-2.5 rounded-[12px] bg-danger/10 px-3.5 py-3"
          >
            <AlertCircle size={15} className="mt-0.5 flex-none text-danger" />
            <p className="text-[12px] leading-relaxed text-danger">{actionError}</p>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="text-[11px] font-medium uppercase tracking-[1.1px] text-ink-muted">
        {text}
      </span>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wrench;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="flex-none text-ink-faint" />
      <span className="flex-1 text-[12px] text-ink-soft">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}
