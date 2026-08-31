/**
 * The stand-in for a screen that T4 has not built yet.
 *
 * The rule for this app is that no route is ever blank and no button ever
 * does nothing — a tab that renders empty is indistinguishable from a crash,
 * and in a demo it will be read as one. So an unbuilt screen says what it is
 * going to be, in the same card shapes as the real thing, and offers
 * somewhere to go.
 *
 * Every use of this is a T4 to-do. When the file that imports it becomes
 * real, the import goes with it; when nothing imports it any more, delete it.
 */

import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Hammer } from 'lucide-react';

export function Placeholder({
  icon: Icon = Hammer,
  title,
  body,
  bullets = [],
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  bullets?: string[];
  action?: { to: string; label: string };
}) {
  return (
    <div className="px-4 pb-8 pt-4">
      <div className="ut-card flex flex-col items-center px-5 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-ink/[0.05] text-ink-muted">
          <Icon size={24} />
        </span>
        <h2 className="mt-4 text-[17px] font-medium leading-tight">{title}</h2>
        <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-ink-soft">{body}</p>

        {action ? (
          <Link
            to={action.to}
            className="ut-touch mt-5 flex items-center gap-1.5 rounded-[12px] bg-accent px-5 py-2.5 text-[14px] font-medium text-white"
          >
            {action.label}
            <ChevronRight size={16} />
          </Link>
        ) : null}
      </div>

      {bullets.length > 0 ? (
        <>
          <div className="mt-5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-[11px] font-medium uppercase tracking-[1.1px] text-ink-muted">
              Coming on this screen
            </span>
          </div>
          <ul className="mt-2.5 flex flex-col gap-2">
            {bullets.map((line) => (
              <li key={line} className="ut-card p-3.5 text-[13px] leading-relaxed text-ink-soft">
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
