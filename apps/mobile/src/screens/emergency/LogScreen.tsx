/**
 * Incidents this crew has closed.
 *
 * Closing is local to the phone, exactly like accepting — see
 * store/dispatch.ts. The note at the bottom says so, because a log that looks
 * like an official record and is not is worse than no log.
 */

import { useEffect, useMemo, useState } from 'react';
import { FileText, RotateCcw } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { api } from '../../lib/api';
import { classLabel, timeAgo } from '../../lib/display';
import { useDispatch } from '../../store/dispatch';
import type { IncidentReport } from '../../lib/types';

export function LogScreen() {
  const [incidents, setIncidents] = useState<IncidentReport[] | null>(null);
  const responses = useDispatch((s) => s.responses);
  const setResponse = useDispatch((s) => s.set);
  const clear = useDispatch((s) => s.clear);

  useEffect(() => {
    void api
      .incidents({ limit: 100 })
      .then(setIncidents)
      .catch(() => setIncidents([]));
  }, []);

  const blocks = useMemo<Block[]>(() => {
    if (incidents === null) return [{ kind: 'skeleton', id: 'loading', rows: 3 }];

    const closed = incidents.filter(
      (incident) => responses[incident.incident_id]?.state === 'closed',
    );
    const open = incidents.filter((incident) => {
      const state = responses[incident.incident_id]?.state;
      return state === 'accepted' || state === 'dispatched';
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
                label: responses[incident.incident_id].state === 'dispatched' ? 'Dispatched' : 'Accepted',
                tone: 'warn' as const,
              },
            ],
            primary: {
              label: 'Close',
              onClick: () => setResponse(incident.incident_id, 'closed'),
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
            secondary: {
              label: 'Reopen',
              icon: RotateCcw,
              onClick: () => clear(incident.incident_id),
            },
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
      text: 'This log is stored on this phone only. It is a personal record of your shift, not the official incident record.',
    });

    return list;
  }, [incidents, responses, setResponse, clear]);

  return <BlockRenderer blocks={blocks} />;
}
