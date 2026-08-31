/**
 * Citizen reports — the municipal backlog of things the public sent in from
 * apps/mobile. Added with T5; no existing owner, so M5/M6 by default.
 *
 * This is a separate panel rather than rows inside DefectsPanel for two
 * reasons, one social and one real:
 *
 *   · DefectsPanel says M1 owns it and nobody else edits it. Fair enough.
 *   · A citizen report is not a defect. It has no confidence, no corroborating
 *     bus, and no position on the fusion ladder — mixing the two lists would
 *     put an unverified photo from a phone next to an event three buses agreed
 *     on, styled identically. The panels stay separate so the difference stays
 *     visible.
 *
 * Nothing here links a report to an event. That is an operator's judgement
 * (`linked_event_id`), and there is deliberately no button that guesses it
 * from proximity — see the CitizenReport contract model.
 */

import { useMemo, useState } from 'react';
import { Camera, Inbox, MapPin, MessageSquare, User } from 'lucide-react';
import { useStore } from '../store/useStore';
import { API_BASE } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { CitizenReport, ReportCategory, ReportStatus } from '../lib/types';

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  POTHOLE: 'Pothole',
  WATERLOGGING: 'Waterlogging',
  DAMAGED_SIGN: 'Sign or marking',
  STREETLIGHT: 'Streetlight',
  GARBAGE: 'Garbage',
  OTHER: 'Other',
};

const STATUS_CHIP: Record<ReportStatus, string> = {
  SUBMITTED: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  ACKNOWLEDGED: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  LINKED: 'border-violet-400/30 bg-violet-500/10 text-violet-300',
  IN_PROGRESS: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  RESOLVED: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  REJECTED: 'border-white/10 bg-ink-900 text-slate-500',
};

export function ReportsPanel() {
  const reports = useStore((s) => s.reports);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const counts = useMemo(() => {
    const byCategory = new Map<ReportCategory, number>();
    for (const report of reports) {
      byCategory.set(report.category, (byCategory.get(report.category) ?? 0) + 1);
    }
    return [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  }, [reports]);

  const visible = category ? reports.filter((r) => r.category === category) : reports;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-white/5 p-3">
        {counts.length === 0 ? (
          <span className="text-[10px] text-slate-600">No reports yet</span>
        ) : (
          counts.map(([key, count]) => {
            const active = category === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(active ? null : key)}
                className={`rounded-md border px-2 py-1 text-[10px] transition-colors ${
                  active
                    ? 'border-sky-400/40 bg-sky-500/10 text-sky-300'
                    : 'border-white/10 bg-ink-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {CATEGORY_LABEL[key]} <span className="font-mono text-slate-500">{count}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Inbox size={22} className="mx-auto text-slate-600" />
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Nothing from the public yet. Open the phone app, sign in as Citizen and send a
              report — it appears here without a refresh.
            </p>
          </div>
        ) : (
          visible.map((report) => (
            <Row
              key={report.report_id}
              report={report}
              expanded={report.report_id === expanded}
              onToggle={() =>
                setExpanded(report.report_id === expanded ? null : report.report_id)
              }
            />
          ))
        )}
      </div>

      <footer className="border-t border-white/5 px-3 py-2 text-[10px] leading-relaxed text-slate-600">
        Reported by a member of the public, not corroborated by the fleet. Nothing here carries a
        confidence score, and no report is linked to an event automatically.
      </footer>
    </div>
  );
}

function Row({
  report,
  expanded,
  onToggle,
}: {
  report: CitizenReport;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`border-b border-white/5 ${expanded ? 'bg-white/[0.02]' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]"
      >
        {report.photo_uri ? (
          <Camera size={15} className="mt-0.5 shrink-0 text-emerald-400" />
        ) : (
          <MessageSquare size={15} className="mt-0.5 shrink-0 text-slate-500" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-200">
              {CATEGORY_LABEL[report.category]}
            </span>
            <span
              className={`rounded border px-1.5 py-px text-[9px] uppercase tracking-wide ${STATUS_CHIP[report.status]}`}
            >
              {report.status.replace(/_/g, ' ').toLowerCase()}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-slate-500">
            {report.address || `${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}`} ·{' '}
            {timeAgo(report.created_at)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {report.photo_uri && (
            /* photo_uri is a path this API serves, never a base64 data URI —
               see services/cloud/api/routers/reports.py. */
            <img
              src={`${API_BASE}${report.photo_uri}`}
              alt="Submitted by the reporter"
              className="mb-2 max-h-48 w-full rounded-lg border border-white/10 object-cover"
            />
          )}

          {report.description && (
            <p className="mb-2 text-[11px] leading-relaxed text-slate-300">{report.description}</p>
          )}

          <dl className="space-y-1 text-[10px] text-slate-500">
            <Meta icon={<User size={11} />} text={report.reporter_name || 'Name not given'} />
            <Meta
              icon={<MapPin size={11} />}
              text={`${report.lat.toFixed(5)}, ${report.lon.toFixed(5)}${report.ward ? ` · ${report.ward}` : ''}`}
            />
          </dl>

          <p className="mt-2 font-mono text-[9px] text-slate-600">{report.report_id}</p>

          {report.linked_event_id ? (
            <p className="mt-2 text-[10px] text-violet-300">
              Linked to event {report.linked_event_id.slice(0, 8)} by an operator.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-600">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
