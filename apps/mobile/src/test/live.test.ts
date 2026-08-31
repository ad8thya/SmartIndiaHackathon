/**
 * The live layer: what the store lets in, and when the app admits it is not
 * live.
 *
 * The ingest filter is the interesting one. It is a privacy boundary, and the
 * failure it guards against is asymmetric — a filter applied to the initial
 * fetch but not to the socket looks correct for the first second of every
 * session and then quietly leaks for the rest of it.
 */

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { isOffline, useLive } from '../store/live';
import type { UTEvent, WorkflowStatus } from '../lib/types';

function event(status: WorkflowStatus, id = 'e1'): UTEvent {
  return {
    event_id: id,
    lat: 13.0,
    lon: 80.2,
    road_segment_id: 'SEG-27B-000',
    detection_class: 'POTHOLE',
    severity: 'LARGE',
    fused_confidence: 0.91,
    observation_count: 7,
    distinct_bus_count: 3,
    first_seen: '2026-08-21T09:00:00Z',
    last_seen: '2026-08-21T09:30:00Z',
    status,
    assigned_team: 'GCC-Zone-13-Adyar',
    sla_due: '2026-08-24T09:00:00Z',
    evidence_uris: [],
  };
}

/**
 * Drives the store's socket handler without a real WebSocket: `connect` is
 * given a stub that captures the callbacks, so a frame can be fed in directly.
 */
function withSocket(role: 'citizen' | 'road-maintenance') {
  const handlers: { onMessage?: (m: unknown) => void; url?: string } = {};

  class SocketStub {
    constructor(options: { onMessage: (m: unknown) => void; url?: string }) {
      handlers.onMessage = options.onMessage;
      handlers.url = options.url;
    }
    connect() {}
    close() {}
  }

  // The mock must carry every export the store imports — `wsUrlFor` decides
  // which audience the socket asks for, and omitting it makes the store fail
  // to import rather than fail a useful assertion.
  vi.doMock('../lib/ws', () => ({
    LiveSocket: SocketStub,
    wsUrlFor: (audience: string) => `ws://test/ws/live?audience=${audience}`,
  }));
  return { handlers, role };
}

beforeEach(() => {
  useLive.setState({
    connection: 'closed',
    lastFrameAt: null,
    hydrated: false,
    loadError: null,
    events: {},
    reports: [],
    incidents: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('offline detection', () => {
  it('is offline when the socket is closed', () => {
    expect(isOffline({ connection: 'closed', lastFrameAt: Date.now(), hydrated: true })).toBe(true);
  });

  it('is not offline while connecting before any frame has arrived', () => {
    expect(isOffline({ connection: 'connecting', lastFrameAt: null, hydrated: true })).toBe(false);
  });

  it('is offline when the socket is open but has gone silent', () => {
    // The subtle case: the server sends TICK, so a long gap means the
    // connection is dead in a way neither end has noticed. A confident,
    // live-looking screen full of stale data is worse than saying so.
    expect(
      isOffline({ connection: 'open', lastFrameAt: Date.now() - 120_000, hydrated: true }),
    ).toBe(true);
    expect(isOffline({ connection: 'open', lastFrameAt: Date.now() - 5_000, hydrated: true })).toBe(
      false,
    );
  });
});

describe('the citizen ingest filter', () => {
  it('admits only public statuses onto a citizen session', async () => {
    vi.resetModules();
    const { handlers } = withSocket('citizen');
    const { useLive: store } = await import('../store/live');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    store.getState().connect('citizen');

    handlers.onMessage?.({
      type: 'EVENT_UPDATED',
      ts: new Date().toISOString(),
      payload: event('MAINTENANCE_ASSIGNED', 'public-1'),
    });
    handlers.onMessage?.({
      type: 'EVENT_UPDATED',
      ts: new Date().toISOString(),
      payload: event('DETECTED', 'private-1'),
    });

    const ids = Object.keys(store.getState().events);
    expect(ids).toContain('public-1');
    // Not merely hidden — never stored.
    expect(ids).not.toContain('private-1');

    store.getState().disconnect();
  });

  it('drops an event that falls back below the public line', async () => {
    vi.resetModules();
    const { handlers } = withSocket('citizen');
    const { useLive: store } = await import('../store/live');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    store.getState().connect('citizen');

    const ts = new Date().toISOString();
    handlers.onMessage?.({ type: 'EVENT_NEW', ts, payload: event('AUTHORITY_NOTIFIED', 'e9') });
    expect(Object.keys(store.getState().events)).toContain('e9');

    // The city looked at it and disagreed. A citizen must stop seeing it, not
    // keep the last public copy on their map forever.
    handlers.onMessage?.({ type: 'EVENT_UPDATED', ts, payload: event('REJECTED', 'e9') });
    expect(Object.keys(store.getState().events)).not.toContain('e9');

    store.getState().disconnect();
  });

  it('admits every status for an operational role', async () => {
    vi.resetModules();
    const { handlers } = withSocket('road-maintenance');
    const { useLive: store } = await import('../store/live');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    store.getState().connect('road-maintenance');

    const ts = new Date().toISOString();
    handlers.onMessage?.({ type: 'EVENT_NEW', ts, payload: event('DETECTED', 'raw-1') });
    expect(Object.keys(store.getState().events)).toContain('raw-1');

    store.getState().disconnect();
  });
});

describe('the socket asks for the right audience', () => {
  /**
   * The server projects per connection, so which audience the client asks for
   * IS the privacy boundary for everything after the first fetch. A citizen
   * session that opened an operator socket would look correct for one second
   * and stream operator fields for the rest of the session.
   */
  it('opens a public socket for a citizen', async () => {
    vi.resetModules();
    const { handlers } = withSocket('citizen');
    const { useLive: store } = await import('../store/live');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    store.getState().connect('citizen');
    expect(handlers.url).toContain('audience=public');
    store.getState().disconnect();
  });

  it('opens an operator socket for a crew', async () => {
    vi.resetModules();
    const { handlers } = withSocket('road-maintenance');
    const { useLive: store } = await import('../store/live');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    store.getState().connect('road-maintenance');
    expect(handlers.url).toContain('audience=operator');
    store.getState().disconnect();
  });
});

describe('report broadcasts', () => {
  it('adds a new report once, and ignores a duplicate frame', async () => {
    vi.resetModules();
    const { handlers } = withSocket('citizen');
    const { useLive: store } = await import('../store/live');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    store.getState().connect('citizen');

    const report = {
      report_id: 'r1',
      category: 'POTHOLE',
      description: 'x',
      lat: 13,
      lon: 80.2,
      address: '',
      photo_uri: null,
      reporter_name: 'A',
      ward: '',
      status: 'SUBMITTED',
      created_at: new Date().toISOString(),
      linked_event_id: null,
    };
    const ts = new Date().toISOString();

    handlers.onMessage?.({ type: 'REPORT_NEW', ts, payload: report });
    handlers.onMessage?.({ type: 'REPORT_NEW', ts, payload: report });

    // A reconnect re-sends what it already had; the list must not double up.
    expect(store.getState().reports).toHaveLength(1);

    store.getState().disconnect();
  });
});
