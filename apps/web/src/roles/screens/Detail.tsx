/**
 * One event or incident dossier, and the actions this role is allowed to
 * take on it. Shared across every role — permissions come from
 * roles/config.ts, never from which screen you happen to be on.
 */

import { useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  MapPin,
  Navigation,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useRoles } from '../store';
import { PUBLIC_STATUS_LABEL, ROLES } from '../roles/config';
import { StatusLadder } from '../components/StatusLadder';
import { SEVERITY_COLOR, STATUS_LABEL, slaText, timeAgo, titleCase, type WorkflowStatus } from '../lib/api';
import { evidenceImage } from '../../lib/evidence';

const ACTIONS: Array<{ status: WorkflowStatus; label: string; tone: string; icon: React.ReactNode }> = [
  {
    status: 'INSPECTION',
    label: 'On site — inspecting',
    tone: 'bg-amber-500 text-white',
    icon: <ShieldCheck size={17} />,
  },
  {
    status: 'MAINTENANCE_ASSIGNED',
    label: 'Dispatch for repair',
    tone: 'bg-accent text-white',
    icon: <CheckCircle2 size={17} />,
  },
  {
    status: 'REPAIR_COMPLETED',
    label: 'Approve — repair complete',
    tone: 'bg-emerald-600 text-white',
    icon: <CheckCircle2 size={17} />,
  },
  {
    status: 'REJECTED',
    label: 'Reject — not a defect',
    tone: 'bg-surface2 text-ink border border-line',
    icon: <XCircle size={17} />,
  },
];

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
      <dt className="flex items-center gap-1 text-[10px] tracking-wider text-muted">
        {icon} {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-xs text-ink">{value}</dd>
    </div>
  );
}

export function Detail() {
  const role = useRoles((s) => s.role)!;
  const kind = useRoles((s) => s.detailKind);
  const event = useRoles((s) => s.activeEvent());
  const incident = useRoles((s) => s.activeIncident());
  const closeDetail = useRoles((s) => s.closeDetail);
  const advance = useRoles((s) => s.advance);
  const [notes, setNotes] = useState('');
  const canApprove = ROLES[role].permissions.approve;
  //  A citizen gets the public view of the same record: what it is, where it
  //  is, and what the city is doing about it. No confidence score, no bus
  //  count, no sighting count, no raw workflow enum, no SLA clock — those are
  //  the city's operational internals, and publishing them would also expose
  //  which bus was where and when. See PUBLIC_STATUSES in roles/config.ts.
  const publicView = Boolean(ROLES[role].publicOnly);

  if (kind === 'incident' && incident) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2">
          <button
            type="button"
            onClick={closeDetail}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="truncate text-sm font-medium text-ink">
            {titleCase(incident.incident_class)}
          </h1>
        </header>
        <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-ink">{incident.narrative}</p>
          <dl className="grid grid-cols-2 gap-2">
            <Fact icon={<MapPin size={12} />} label="Location" value={incident.road_segment_id ?? '—'} />
            <Fact
              icon={<ShieldCheck size={12} />}
              label="Confidence"
              value={`${Math.round(incident.confidence * 100)}%`}
            />
            <Fact icon={<Camera size={12} />} label="Evidence" value={String(incident.evidence_uris.length)} />
            <Fact icon={<Users size={12} />} label="Reported by" value={incident.reported_by_bus} />
          </dl>
          <p className="text-[11px] leading-relaxed text-muted">
            Logged {timeAgo(incident.ts)} ago. Vehicle plate details are operator-visible only and
            are never persisted (DPDP Act 2023).
          </p>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${incident.lat},${incident.lon}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2 py-3.5 text-sm font-medium text-ink"
          >
            <Navigation size={16} /> Navigate here
          </a>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">That report is no longer in your list.</p>
        <button type="button" onClick={closeDetail} className="rounded-lg bg-surface2 px-4 py-3 text-sm">
          Back
        </button>
      </div>
    );
  }

  const sla = slaText(event.sla_due);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-2">
        <button
          type="button"
          onClick={closeDetail}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="truncate text-sm font-medium text-ink">{titleCase(event.detection_class)}</h1>
      </header>

      <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto pb-4">
        <div className="relative border-b border-line bg-surface2">
          <img
            src={evidenceImage({
              id: event.event_id,
              detectionClass: event.detection_class,
              severity: event.severity,
              ts: event.first_seen,
            })}
            alt={`Synthetic evidence card for ${titleCase(event.detection_class)}`}
            className="h-40 w-full object-cover"
          />
          <div className="px-4 py-2 text-center text-muted">
            <p className="text-[11px]">
              {publicView
                ? 'Reported by the city bus fleet'
                : `${event.evidence_uris.length} evidence frame${
                    event.evidence_uris.length === 1 ? '' : 's'
                  } · ${
                    event.distinct_bus_count > 1 ? 'actual sighting, corroborated' : 'single sighting'
                  }`}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${SEVERITY_COLOR[event.severity]}`}>
              {event.severity}
            </span>
            <span className="rounded-lg border border-line bg-surface2 px-2.5 py-1 text-[11px] text-ink/70">
              {publicView ? PUBLIC_STATUS_LABEL[event.status] : STATUS_LABEL[event.status]}
            </span>
            {!publicView && (
              <span
                className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                  sla.overdue ? 'border-red-200 bg-red-50 text-red-700' : 'border-line bg-surface2 text-muted'
                }`}
              >
                SLA {sla.text}
              </span>
            )}
          </div>

          {publicView ? (
            <>
              <dl className="grid grid-cols-2 gap-2">
                <Fact icon={<MapPin size={12} />} label="Street" value={event.road_segment_id ?? '—'} />
                <Fact icon={<Camera size={12} />} label="Reported" value={`${timeAgo(event.first_seen)} ago`} />
              </dl>
              <p className="text-[11px] leading-relaxed text-muted">
                Spotted by buses in service and confirmed by the city. Detection confidence,
                which vehicles saw it and internal workflow timings are not published.
              </p>
            </>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2">
                <Fact icon={<MapPin size={12} />} label="Location" value={event.road_segment_id ?? '—'} />
                <Fact
                  icon={<ShieldCheck size={12} />}
                  label="Confidence"
                  value={`${Math.round(event.fused_confidence * 100)}%`}
                />
                <Fact icon={<Users size={12} />} label="Buses" value={String(event.distinct_bus_count)} />
                <Fact icon={<Camera size={12} />} label="Sightings" value={String(event.observation_count)} />
              </dl>

              <StatusLadder status={event.status} />

              <p className="text-[11px] leading-relaxed text-muted">
                First reported {timeAgo(event.first_seen)} ago, last confirmed {timeAgo(event.last_seen)} ago
                {event.assigned_team ? ` · ${event.assigned_team}` : ''}.
              </p>
            </>
          )}

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lon}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2 py-3.5 text-sm font-medium text-ink"
          >
            <Navigation size={16} /> Navigate here
          </a>

          {canApprove ? (
            <>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes for the record"
                rows={3}
                className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent/50"
              />
              <div className="space-y-2 pt-1">
                {ACTIONS.map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    onClick={() => {
                      void advance(event.event_id, action.status, notes || undefined);
                      setNotes('');
                      closeDetail();
                    }}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium ${action.tone}`}
                  >
                    {action.icon} {action.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-line bg-surface2 px-3 py-2.5 text-[11px] text-muted">
              {publicView
                ? 'This is a public record of work the city has accepted. Use Report to tell them about something new.'
                : 'Your role can view this report but not change its workflow status.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
