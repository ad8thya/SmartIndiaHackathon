/**
 * Everything this person has sent, with where it got to.
 *
 * Each card expands into a timeline rather than pushing a detail route: a
 * report has perhaps five facts attached, and a whole screen to show five
 * facts is a navigation step charged for nothing.
 */

import { useMemo, useState } from 'react';
import { FileText, MapPin, Plus } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block, Step } from '../../components/blocks/types';
import { useMyReports } from '../../lib/useReports';
import { API_BASE } from '../../lib/api';
import {
  CATEGORY_LABEL,
  REPORT_STATUS_LABEL,
  timeAgo,
} from '../../lib/display';
import type { CitizenReport, ReportStatus } from '../../lib/types';

/** The ladder a report climbs, in order, for the timeline. */
const LADDER: ReportStatus[] = ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];

function timeline(report: CitizenReport): Step[] {
  // REJECTED and LINKED are not rungs — one ends the ladder early, the other
  // is a side note — so they get their own final step rather than being
  // forced into a sequence they are not part of.
  if (report.status === 'REJECTED') {
    return [
      { id: 'sent', label: 'Sent', detail: timeAgo(report.created_at), state: 'done' },
      { id: 'closed', label: 'Closed without action', state: 'current' },
    ];
  }

  const reached = LADDER.indexOf(report.status === 'LINKED' ? 'ACKNOWLEDGED' : report.status);
  const steps: Step[] = LADDER.map((rung, index) => ({
    id: rung,
    label: REPORT_STATUS_LABEL[rung],
    detail: index === 0 ? timeAgo(report.created_at) : undefined,
    state: index < reached ? 'done' : index === reached ? 'current' : 'todo',
  }));

  if (report.status === 'LINKED') {
    steps.splice(2, 0, {
      id: 'linked',
      label: 'Matched to a problem the city already knew about',
      detail: 'Your report was added to an existing case.',
      state: 'current',
    });
  }
  return steps;
}

export function MyReportsScreen() {
  const { reports, error } = useMyReports();
  const [open, setOpen] = useState<string | null>(null);

  const blocks = useMemo<Block[]>(() => {
    if (reports === null && !error) return [{ kind: 'skeleton', id: 'loading', rows: 3 }];

    if (error) {
      return [
        {
          kind: 'empty',
          id: 'error',
          icon: FileText,
          title: 'Could not load your reports',
          sub: 'You are offline, or the city service is not reachable right now. Your sent reports are safe — this screen just cannot show them yet.',
        },
      ];
    }

    if (!reports?.length) {
      return [
        {
          kind: 'empty',
          id: 'none',
          icon: FileText,
          title: 'Nothing sent yet',
          sub: 'Reports you send appear here, with their status and what happened to them.',
          action: { label: 'Report an issue', to: '/citizen/report', icon: Plus },
        },
      ];
    }

    const list: Block[] = [
      {
        kind: 'cards',
        id: 'reports',
        items: reports.map((report) => ({
          id: report.report_id,
          title: CATEGORY_LABEL[report.category],
          sub: report.description || report.address || 'No description',
          meta: timeAgo(report.created_at),
          chips: [
            {
              label: REPORT_STATUS_LABEL[report.status],
              tone:
                report.status === 'RESOLVED'
                  ? 'good'
                  : report.status === 'REJECTED'
                    ? 'neutral'
                    : report.status === 'SUBMITTED'
                      ? 'accent'
                      : 'warn',
            },
          ],
          photoUri: report.photo_uri ? `${API_BASE}${report.photo_uri}` : undefined,
          photoBadge: report.photo_uri ? 'Your photo' : undefined,
          details: report.address ? [{ icon: MapPin, text: report.address }] : undefined,
          onClick: () => setOpen(open === report.report_id ? null : report.report_id),
        })),
      },
    ];

    // The expanded timeline is injected right after the card list rather than
    // inside it — a card is a card, and nesting a variable-height timeline in
    // one would make every card in the list re-layout when one opens.
    const opened = reports.find((report) => report.report_id === open);
    if (opened) {
      list.push(
        { kind: 'label', id: 'tl-label', text: `${CATEGORY_LABEL[opened.category]} · history` },
        { kind: 'steps', id: `tl-${opened.report_id}`, steps: timeline(opened) },
        {
          kind: 'note',
          id: 'tl-id',
          text: `Report ID ${opened.report_id.slice(0, 8).toUpperCase()} · sent ${timeAgo(opened.created_at)}`,
        },
      );
    }

    return list;
  }, [reports, error, open]);

  return (
    <>
      <BlockRenderer blocks={blocks} />
      {/* Kept out of the block list: a status legend is chrome, not content. */}
      {reports?.length ? (
        <p className="px-5 pb-8 text-[11px] leading-relaxed text-ink-faint">
          Tap a report to see its history. Statuses are set by the municipal staff handling it.
        </p>
      ) : null}
    </>
  );
}
