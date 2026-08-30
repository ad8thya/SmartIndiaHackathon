/** Bottom navigation. 44px+ targets, thumb-reachable. Owned by M6. */

import { ClipboardList, Map, Radio } from 'lucide-react';
import { useField, type Screen } from '../store';

const TABS: Array<{ id: Screen; label: string; icon: React.ReactNode }> = [
  { id: 'feed', label: 'Feed', icon: <Radio size={19} /> },
  { id: 'map', label: 'Nearby', icon: <Map size={19} /> },
  { id: 'tasks', label: 'Tasks', icon: <ClipboardList size={19} /> },
];

export function TabBar() {
  const screen = useField((s) => s.screen);
  const go = useField((s) => s.go);
  const taskCount = useField((s) => s.myTasks().length);

  // the detail screen is pushed from the feed, so keep Feed lit while it is open
  const current = screen === 'detail' ? 'feed' : screen;

  return (
    <nav className="flex shrink-0 border-t border-white/5 bg-ink-800/95 backdrop-blur">
      {TABS.map((tab) => {
        const active = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => go(tab.id)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 ${
              active ? 'text-sky-400' : 'text-slate-500'
            }`}
          >
            <span className="relative">
              {tab.icon}
              {tab.id === 'tasks' && taskCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-medium text-white">
                  {taskCount}
                </span>
              )}
            </span>
            <span className="text-[10px] tracking-wider">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
