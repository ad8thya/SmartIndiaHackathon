/**
 * Citizen feedback. There is no `/api/reports` endpoint yet — this stores
 * submissions in localStorage rather than pretending a round trip happened.
 * It's a real, usable form; it's just honest that "your council" doesn't
 * see it yet. Wiring it up later is: add the endpoint, swap the body of
 * `submitReport` in store.ts to call it, done — this screen doesn't change.
 */

import { useState } from 'react';
import { CheckCircle2, MessageSquarePlus } from 'lucide-react';
import { useRoles } from '../store';
import { timeAgo } from '../lib/api';

export function Report() {
  const submitReport = useRoles((s) => s.submitReport);
  const reports = useRoles((s) => s.citizenReports);
  const [text, setText] = useState('');

  return (
    <div className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto p-4 lg:p-6">
      <h1 className="text-base font-bold tracking-tight text-ink">Report something</h1>
      <p className="mt-1 text-[12px] text-muted">
        A pothole, a broken signal, anything on your street.
      </p>
      <p className="mt-2 rounded-lg bg-surface2 px-3 py-2 text-[11px] leading-relaxed text-muted">
        Reports are saved on this device only. There is no submission endpoint yet, so nothing
        is sent to a ward office — the form is here so the workflow is real when it is wired up.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe what you saw and where…"
        rows={4}
        className="mt-4 w-full rounded-xl border border-line bg-surface2 p-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent/50"
      />
      <button
        type="button"
        disabled={!text.trim()}
        onClick={() => {
          submitReport(text.trim());
          setText('');
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        <MessageSquarePlus size={16} /> Submit report
      </button>

      {reports.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-wider text-muted">
            Your reports
          </h2>
          <div className="space-y-2">
            {reports.map((report) => (
              <div key={report.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface2 p-3">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-[12px] text-ink">{report.text}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{timeAgo(report.ts)} ago</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
