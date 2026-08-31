/**
 * The app's one WebSocket. Same envelope and same reconnect policy as
 * the console's client, with two additions a phone needs and a desktop does not.
 *
 * **Jitter.** A depot full of crew phones on the same wifi all lose the API at
 * the same moment when it restarts, and a fixed backoff makes them all retry
 * at the same moment too — repeatedly. A random 0–30% spread breaks that up.
 *
 * **Reconnect on resume.** A phone suspends background tabs, and the socket
 * dies without an error anyone sees. Coming back to the app after ten minutes
 * would otherwise sit on a maxed-out 10s backoff, or worse, look connected
 * while receiving nothing. `visibilitychange` and `online` both reset the
 * backoff and retry immediately, because the user is now looking at the screen
 * and the network probably just came back.
 */

import { API_BASE } from './api';
import type { WSMessage } from './types';

export const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  `${API_BASE.replace(/^http/, 'ws')}/ws/live`;

export type ConnectionState = 'connecting' | 'open' | 'closed';

interface Options {
  url?: string;
  onMessage: (message: WSMessage) => void;
  onState?: (state: ConnectionState) => void;
  baseBackoff?: number;
  maxBackoff?: number;
}

export class LiveSocket {
  private socket: WebSocket | null = null;
  private backoff: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;
  private readonly url: string;
  private readonly baseBackoff: number;
  private readonly maxBackoff: number;
  private readonly onResume = () => {
    // Only when the user is actually looking at it — a background tab firing
    // `online` should not start a reconnect storm from a pocket.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.backoff = this.baseBackoff;
    this.connect();
  };

  constructor(private readonly options: Options) {
    this.url = options.url ?? WS_URL;
    this.baseBackoff = options.baseBackoff ?? 500;
    this.maxBackoff = options.maxBackoff ?? 10_000;
    this.backoff = this.baseBackoff;
  }

  connect(): void {
    this.closedByUs = false;
    this.options.onState?.('connecting');

    if (typeof window !== 'undefined') {
      // Idempotent: the same function reference cannot be added twice.
      window.addEventListener('online', this.onResume);
      document.addEventListener('visibilitychange', this.onResume);
    }

    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.backoff = this.baseBackoff;
      this.options.onState?.('open');
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      try {
        this.options.onMessage(JSON.parse(event.data) as WSMessage);
      } catch {
        // one malformed frame must not tear down the socket
      }
    };

    this.socket.onerror = () => this.socket?.close();

    this.socket.onclose = () => {
      this.options.onState?.('closed');
      if (!this.closedByUs) this.scheduleReconnect();
    };
  }

  close(): void {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onResume);
      document.removeEventListener('visibilitychange', this.onResume);
    }
    this.socket?.close();
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.timer) clearTimeout(this.timer);
    // 0–30% jitter. See the header: a depot of phones reconnecting in lockstep
    // is a self-inflicted thundering herd.
    const delay = this.backoff * (1 + Math.random() * 0.3);
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}
