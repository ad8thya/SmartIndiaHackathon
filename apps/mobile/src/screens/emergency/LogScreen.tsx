/**
 * Incidents this crew has closed.
 *
 * Closing is local to the phone, exactly like accepting — see
 * store/dispatch.ts. The note at the bottom says so, because a log that looks
 * like an official record and is not is worse than no log.
 */

import { useMemo } from 'react';
import { FileText, WifiOff } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { classLabel, timeAgo } from '../../lib/display';
import { useDispatch } from '../../store/dispatch';
import { useLive } from '../../store/live';

export function LogScreen() {
  const incidents = useLive((s) => s.incidents);
  const responses = useLive((s) => s.responses);
  const hydrated = useLive((s) => s.hydrated);
  const loadError = useLive((s) => s.loadError);
  const advance = useDispatch((s) => s.advance);

  const blocks = useMemo<Block[]>(() => {
    if (!hydrated) return [{ kind: 'skeleton', id: 'loading', rows: 3 }];

    // "Nothing logged" and "I could not reach the control room" are different
    // facts, and showing the first when the second is true is the stale-data
    // lie this app is not allowed to tell.
    if (loadError) {
      return [
        {
          kind: 'empty',
          id: 'offline',
          icon: WifiOff,
          title: 'Cannot reach the control room',
          sub: 'Your shift log will appear here as soon as you have signal. Anything you already closed was sent.',
        },
      ];
    }

    const closed = incidents.filter(
      (incident) => responses[incident.incident_id]?.state === 'CLOSED',
    );
    const open = incidents.filter((incident) => {
      const state = responses[incident.incident_id]?.state;
      return state !== undefined && state !== 'CLOSED';
    });

    const list: Block[] = [];

    if (open.length) {
      list.push(
        { kind: 'label', id: 'open-label', text: 'Still open with you' },
        {
          kind: 'cards',
          id: 'open',
          items: open.map((incident) => ({
            id: incident.incident_id,
            title: classLabel(incident.incident_class),
            sub: incident.narrative,
            meta: timeAgo(incident.ts),
            chips: [
              {
                label: responses[incident.incident_id].state.replace(/_/g, ' ').toLowerCase(),
                tone: 'warn' as const,
              },
            ],
            details: [
              {
                icon: FileText,
                text: `${responses[incident.incident_id].state.replace(/_/g, ' ').toLowerCase()} ${timeAgo(responses[incident.incident_id].at)}`,
              },
            ],
            primary: {
              label: 'Close',
              onClick: () => void advance(incident.incident_id, 'CLOSED'),
              tone: 'good' as const,
            },
          })),
        },
      );
    }

    if (closed.length) {
      list.push(
        { kind: 'label', id: 'closed-label', text: 'Closed' },
        {
          kind: 'cards',
          id: 'closed',
          items: closed.map((incident) => ({
            id: incident.incident_id,
            title: classLabel(incident.incident_class),
            sub: incident.narrative,
            meta: timeAgo(incident.ts),
            chips: [{ label: 'Closed', tone: 'neutral' as const }],
            details: [
              {
                icon: FileText,
                text: `Closed ${timeAgo(responses[incident.incident_id].at)} by ${responses[incident.incident_id].team || 'your unit'}`,
              },
            ],
          })),
        },
      );
    }

    if (list.length === 0) {
      return [
        {
          kind: 'empty',
          id: 'none',
          icon: FileText,
          title: 'Nothing logged yet',
          sub: 'Incidents you accept and close appear here so you can look back over the shift.',
          action: { label: 'Go to alerts', to: '/emergency' },
        },
      ];
    }

    list.push({
      kind: 'note',
      id: 'note',
      icon: FileText,
      text: 'Every state change is timestamped and kept by the control room, so the response interval is on the record. Closing an incident here closes it for everyone.',
    });

    return list;
  }, [incidents, responses, hydrated, loadError, advance]);

  return <BlockRenderer blocks={blocks} />;
}
