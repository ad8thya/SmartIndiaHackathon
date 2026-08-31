/**
 * Citizen home. The hero banner and four big action cards, straight from the
 * design — a block list, not a hand-built component.
 *
 * Everything here is a large touch target because this is the one role that is
 * not a trained user. A municipal operator learns the console; a citizen opens
 * this once, in the street, holding a phone in one hand.
 */

import { useMemo } from 'react';
import { CloudOff, Lightbulb } from 'lucide-react';
import { BlockRenderer } from '../../components/blocks/BlockRenderer';
import type { Block } from '../../components/blocks/types';
import { useSession } from '../../store/session';
import { useMyReports } from '../../lib/useReports';

export function CitizenHomeScreen() {
  const session = useSession((s) => s.session)!;
  const { reports, error } = useMyReports();

  const open = (reports ?? []).filter(
    (report) => report.status !== 'RESOLVED' && report.status !== 'REJECTED',
  ).length;

  const blocks = useMemo<Block[]>(
    () => [
      {
        kind: 'hero',
        id: 'hero',
        emoji: '📸',
        title: 'See a problem? Send a photo.',
        sub: 'It reaches the city in seconds.',
      },
      {
        kind: 'guide',
        id: 'guide',
        icon: error ? CloudOff : Lightbulb,
        text: error
          ? 'You are offline. You can still write a report — it will need signal to send.'
          : open > 0
            ? `You have ${open} report${open === 1 ? '' : 's'} still open. Tap “My reports” to see where ${open === 1 ? 'it has' : 'they have'} got to.`
            : 'A photo and your location are enough. Everything else is optional.',
      },
      {
        kind: 'hub',
        id: 'hub',
        cards: [
          {
            id: 'report',
            emoji: '📸',
            title: 'Report an issue',
            sub: 'Photo, location, done',
            to: '/citizen/report',
            accent: '#10B981',
            tint: 'rgba(16,185,129,0.12)',
          },
          {
            id: 'conditions',
            emoji: '🗺️',
            title: 'Road conditions',
            sub: 'Confirmed problems near you',
            to: '/citizen/conditions',
            accent: '#2563EB',
            tint: 'rgba(37,99,235,0.10)',
          },
          {
            id: 'reports',
            emoji: '📋',
            title: 'My reports',
            sub: error ? 'Tap to retry' : open > 0 ? `${open} still open` : 'What happened to what you sent',
            to: '/citizen/reports',
            accent: '#D97706',
            tint: 'rgba(217,119,6,0.12)',
          },
          {
            id: 'alerts',
            emoji: '🔔',
            title: 'Alerts',
            sub: 'Notices for your area',
            to: '/citizen/alerts',
            accent: '#7C3AED',
            tint: 'rgba(124,58,237,0.12)',
          },
        ],
      },
      {
        kind: 'note',
        id: 'who',
        text: `Signed in as ${session.displayName}. Your name is shown to the municipal staff handling your report, and to nobody else.`,
      },
    ],
    [open, error, session.displayName],
  );

  return <BlockRenderer blocks={blocks} />;
}
