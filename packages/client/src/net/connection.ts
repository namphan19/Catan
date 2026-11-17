// WebSocket connection to the M2 server (docs/PROTOCOL.md). Owns: the socket URL, the
// hello handshake (name + stored sessionToken), auto-reconnect with backoff, re-joining the
// room and requestState after a drop, and a reqId per request. Message handling itself stays
// in the shell via the onMessage callback.
import type { OutMsg, ServerMsg } from './protocol';

/** Reconnect delays: 1 s, 2 s, 5 s, then capped at 10 s. */
const BACKOFF_MS = [1000, 2000, 5000, 10000];

export interface ConnectionHandlers {
  /** Display name for the hello (may change between reconnects). */
  getName: () => string;
  /** Stored sessionToken for the hello (null on first ever connect). */
  getToken: () => string | null;
  /** Called with the fresh token from the welcome message. */
  setToken: (token: string) => void;
  /** Room code to re-join after a reconnect, or null when not in a room. */
  getRoom: () => string | null;
  /** Every server message, already parsed. */
  onMessage: (msg: ServerMsg) => void;
  /** Connection status changes; false while the socket is down/retrying. */
  onStatus: (online: boolean) => void;
  /** Application close codes (4000 SEAT_TAKEN_OVER, 4001 KICKED): no reconnect happens;
   * the shell shows the translated reason. Absent -> treated like any other close. */
  onClosed?: (code: number, reason: string) => void;
}

export class Connection {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reqSeq = 0;
  private stopped = false;

  constructor(private readonly h: ConnectionHandlers) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  /** Stop for good (leaving the online screen): no more reconnects. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
  }

  /** Send one message with a fresh reqId. Returns the reqId (for matching error replies). */
  send(msg: OutMsg): string {
    const reqId = `r${++this.reqSeq}`;
    this.rawSend({ ...msg, reqId });
    return reqId;
  }

  /** Send (or repeat) the hello handshake. Repeat it before create/join so the server always
   *  has the latest display name; the server treats a repeated hello as a rename. */
  hello(): void {
    const token = this.h.getToken();
    this.rawSend({ type: 'hello', name: this.h.getName(), ...(token ? { sessionToken: token } : {}) });
  }

  // ------------------------------------------------------------------ internals

  private url(): string {
    return `${location.origin.replace(/^http/, 'ws')}/ws`;
  }

  private open(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.h.onStatus(true);
      this.hello();
      // After a drop (or a page reload) the seat is reclaimed by re-joining with the same
      // token; the server answers with the room and, if started, the current state.
      const room = this.h.getRoom();
      if (room) {
        this.rawSend({ type: 'joinRoom', code: room });
        this.rawSend({ type: 'requestState' });
      }
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data) as ServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'welcome') this.h.setToken(msg.sessionToken);
      this.h.onMessage(msg);
    };
    // onclose fires after every failed attempt too; it drives the retry loop. Application
    // close codes 4000/4001 (SEAT_TAKEN_OVER / KICKED) are final: no reconnect, the shell
    // shows the translated reason instead (docs/PROTOCOL.md).
    ws.onclose = (ev) => {
      if (this.ws === ws) {
        this.ws = null;
        this.h.onStatus(false);
      }
      if (ev.code >= 4000 && ev.code <= 4999) {
        this.stopped = true;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.h.onClosed?.(ev.code, ev.reason ?? '');
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* close follows; nothing to do here */
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer !== null) return;
    const delay = BACKOFF_MS[Math.min(this.retry, BACKOFF_MS.length - 1)];
    this.retry += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }

  private rawSend(msg: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
