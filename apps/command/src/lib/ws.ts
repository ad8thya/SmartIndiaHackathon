/**
 * WebSocket client with automatic reconnect. Owned by M6.
 *
 * One envelope shape (`WSMessage`), one parser, one reconnect policy. The
 * backoff matters more than it looks: `uvicorn --reload` restarts the API every
 * time M5 saves a file, and without backoff the browser opens a hundred sockets
 * a second against a server that is still booting.
 */

import type { WSMessage, WSMessageType } from './types';

export const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:8000/ws/live';

export type WSHandler = (message: WSMessage) => void;
export type ConnectionState = 'connecting' | 'open' | 'closed';
export type StateHandler = (state: ConnectionState) => void;

interface Options {
  url?: string;
  onMessage: WSHandler;
  onState?: StateHandler;
  /** ms; doubles on each failure up to maxBackoff */
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

  constructor(private readonly options: Options) {
    this.url = options.url ?? WS_URL;
    this.baseBackoff = options.baseBackoff ?? 500;
    this.maxBackoff = options.maxBackoff ?? 10_000;
    this.backoff = this.baseBackoff;
  }

  connect(): void {
    this.closedByUs = false;
    this.options.onState?.('connecting');

    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.backoff = this.baseBackoff; // a good connection resets the penalty
      this.options.onState?.('open');
    };

    this.socket.onmessage = (event: MessageEvent<string>) => {
      try {
        this.options.onMessage(JSON.parse(event.data) as WSMessage);
      } catch {
        // one malformed frame must not tear down the socket
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };

    this.socket.onclose = () => {
      this.options.onState?.('closed');
      if (!this.closedByUs) this.scheduleReconnect();
    };
  }

  /** The server does not expect client messages, but this keeps the API open. */
  send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    }
  }

  close(): void {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}

/** Narrow a message by type without repeating the cast at every call site. */
export function isType<T>(message: WSMessage, type: WSMessageType): WSMessage<T> | null {
  return message.type === type ? (message as unknown as WSMessage<T>) : null;
}
