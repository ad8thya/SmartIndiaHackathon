/** What this crew is actually on the hook for today. Owned by M6. */

import { CheckCircle2, ClipboardList, Clock, MapPin } from 'lucide-react';
import { useField, MY_TEAM } from '../store';
import { SEVERITY_COLOR, STATUS_LABEL, slaText } from '../lib/api';

export function MyTasks() {
  const tasks = useField((s) => s.myTasks());
  const advance = useField((s) => s.advance);
  const go = useField((s) => s.go);

  const overdue = tasks.filter((task) => slaText(task.sla_due).overdue).length;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-white/5 px-4 py-3">
        <h1 className="text-base font-bold tracking-tight">My Tasks</h1>
        <p className="text-[11px] text-slate-500">
          {MY_TEAM} · {tasks.length} assigned
          {overdue > 0 && <span className="text-red-400"> · {overdue} overdue</span>}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle2 size={30} className="mx-auto text-emerald-500/50" />
            <p className="mt-2 text-sm text-slate-400">Nothing assigned to you.</p>
            <p className="mt-1 text-[11px] text-slate-600">
              The control room dispatches work from the command centre.
            </p>
          </div>
        ) : (
          tasks.map((task) => {
            const sla = slaText(task.sla_due);
            return (
              <div key={task.event_id} className="border-b border-white/5 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => go('detail', task.event_id)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${SEVERITY_COLOR[task.severity]}`}
                  >
                    <ClipboardList size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-100">
                      {task.detection_class.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-slate-500">
                      <MapPin size={10} /> {task.road_segment_id ?? 'unlocated'}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="rounded border border-white/10 bg-ink-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {STATUS_LABEL[task.status]}
                      </span>
                      <span
                        className={`flex items-center gap-1 text-[10px] ${
                          sla.overdue ? 'text-red-400' : 'text-slate-600'
                        }`}
                      >
                        <Clock size={9} /> {sla.text}
                      </span>
                    </span>
                  </span>
                </button>

                {task.status !== 'REPAIR_COMPLETED' && (
                  <button
                    type="button"
                    onClick={() => void advance(task.event_id, 'REPAIR_COMPLETED')}
                    className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-ink-900 active:opacity-80"
                  >
                    <CheckCircle2 size={16} /> Mark repaired
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
