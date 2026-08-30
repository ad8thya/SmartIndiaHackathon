/**
 * The workflow's status ladder, visualised — the color scheme is the one
 * already documented on WorkflowStatus in packages/contracts/src/contracts/
 * enums.py: "DETECTED is grey, the middle states are amber, REPAIR_COMPLETED
 * onward is green, REJECTED is struck through."
 */

import { X } from 'lucide-react';
import type { WorkflowStatus } from '../lib/api';

const LADDER: WorkflowStatus[] = [
  'DETECTED',
  'AI_VERIFIED',
  'AUTHORITY_NOTIFIED',
  'INSPECTION',
  'MAINTENANCE_ASSIGNED',
  'REPAIR_COMPLETED',
  'VERIFIED',
  'RESOLVED',
];

const SHORT_LABEL: Record<WorkflowStatus, string> = {
  DETECTED: 'Detected',
  AI_VERIFIED: 'AI verified',
  AUTHORITY_NOTIFIED: 'Notified',
  INSPECTION: 'Inspecting',
  MAINTENANCE_ASSIGNED: 'Assigned',
  REPAIR_COMPLETED: 'Repaired',
  VERIFIED: 'Verified',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};

function colorFor(status: WorkflowStatus, reached: boolean): string {
  if (!reached) return 'bg-line';
  if (status === 'DETECTED') return 'bg-slate-400';
  if (status === 'REPAIR_COMPLETED' || status === 'VERIFIED' || status === 'RESOLVED') {
    return 'bg-emerald-500';
  }
  return 'bg-amber-500';
}

export function StatusLadder({ status }: { status: WorkflowStatus }) {
  if (status === 'REJECTED') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600">
          <X size={13} />
        </span>
        <div>
          <p className="text-[10px] tracking-wider text-muted">Status ladder</p>
          <p className="text-[12px] font-medium text-ink line-through decoration-red-400">
            Workflow closed — rejected, not a defect
          </p>
        </div>
      </div>
    );
  }

  const index = LADDER.indexOf(status);

  return (
    <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
      <p className="mb-2 text-[10px] tracking-wider text-muted">Status ladder</p>
      <div className="flex items-center">
        {LADDER.map((step, i) => (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorFor(step, i <= index)}`}
              title={SHORT_LABEL[step]}
            />
            {i < LADDER.length - 1 && (
              <span className={`h-0.5 flex-1 ${i < index ? colorFor(step, true) : 'bg-line'}`} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-ink">{SHORT_LABEL[status]}</p>
    </div>
  );
}
