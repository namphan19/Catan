// One player's connection to a Boschtan server (docs/PROTOCOL.md): hello + session token,
// lobby, game state, event and chat buffers, automatic reconnect that reclaims the seat.
import * as fs from 'node:fs';
import * as path from 'node:path';
import WebSocket from 'ws';
import type { Action, GameEvent, PlayerView } from '@hexgame/engine';
import { eventStr, type Ctx, type SeatInfo } from './describe';

export interface RoomInfo {
  code: string;
  hostSeat: string;
  playerCount: number;
  options: Record<string, unknown>;
  seats: (SeatInfo & { avatar?: string })[];
  you: string | null;
  started: boolean;
}

export interface ChatLine {
  id: number;
  seat: string;
  name: string;
  text: string;
  at: number;
}

interface ServerMsg {
  type: string;
  reqId?: string;
  [k: string]: unknown;
}

export interface Note {
  n: number;
  at: number;
  text: string;
}

type Waiter = (m: ServerMsg | null) => boolean;

export class GameClient {
  url: string;
  name: string;
  token: string | null = null;
  ws: WebSocket | null = null;
  welcomed = false;
  room: RoomInfo | null = null;
  view: PlayerView | null = null;
  legal: Action[] = [];
  seq = -1;
  /** Bumps on every state message (also ones without a new log entry). */
  stateVersion = 0;
  notes: Note[] = [];
  chat: ChatLine[] = [];
  /** Read cursors for "what is new since the agent last looked". */
  notesRead = 0;
  chatRead = 0;
  lastError: { code: string; message: string } | null = null;
  private noteSeq = 0;
  private waiters = new Set<Waiter>();
  private reqSeq = 0;
  private closing = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = 2000;
  private connecting: Promise<void> | null = null;

  constructor(url: string, name: string, private readonly dataDir: string) {
    this.url = url;
    this.name = name;
    this.loadSaved();
  }

  // ------------------------------------------------------------ persistence

  private savePath(): string {
    const safe = (this.url + '__' + this.name).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 120);
    return path.join(this.dataDir, `${safe}.json`);
  }
  private loadSaved(): void {
    try {
      const j = JSON.parse(fs.readFileSync(this.savePath(), 'utf8')) as { token?: string; room?: string };
      this.token = j.token ?? null;
      this.savedRoom = j.room ?? null;
    } catch {
      /* first run */
    }
  }
  savedRoom: string | null = null;
  private persist(): void {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.savePath(), JSON.stringify({ token: this.token, room: this.room?.code ?? this.savedRoom }));
    } catch {
      /* not fatal */
    }
  }

  ctx(): Ctx | null {
    if (!this.view) return null;
    return { view: this.view, seats: this.room?.seats ?? [], me: this.room?.you ?? null };
  }

  note(text: string): void {
    this.notes.push({ n: ++this.noteSeq, at: Date.now(), text });
    if (this.notes.length > 500) {
      const drop = this.notes.length - 500;
      this.notes.splice(0, drop);
      this.notesRead = Math.max(0, this.notesRead - drop);
    }
  }

  // ------------------------------------------------------------ connection

  get open(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && this.welcomed;
  }

  /** Connect (retrying while a sleeping host such as Render wakes up) and say hello. */
  async connect(timeoutMs = 90_000): Promise<void> {
    if (this.open) return;
    this.closing = false;
    this.connecting ??= this.connectLoop(timeoutMs).finally(() => (this.connecting = null));
    return this.connecting;
  }

  private async connectLoop(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastErr = '';
    while (Date.now() < deadline) {
      try {
        await this.connectOnce();
        return;
      } catch (e) {
        lastErr = (e as Error).message;
        await sleep(Math.min(5000, Math.max(0, deadline - Date.now())));
      }
    }
    throw new Error(`Could not connect to ${this.url}: ${lastErr}`);
  }

  private connectOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, { handshakeTimeout: 20_000 });
      let settled = false;
      ws.on('error', (e) => {
        if (!settled) {
          settled = true;
          reject(e);
        }
      });
      ws.on('open', () => {
        this.ws = ws;
        this.welcomed = false;
        this.rawSend({ type: 'hello', name: this.name, ...(this.token ? { sessionToken: this.token } : {}) });
      });
      ws.on('message', (d) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(String(d)) as ServerMsg;
        } catch {
          return;
        }
        if (m.type === 'welcome' && !settled) {
          settled = true;
          resolve();
        }
        this.onMessage(m);
      });
      ws.on('close', (code, reason) => {
        if (this.ws === ws) {
          this.ws = null;
          this.welcomed = false;
        }
        if (!settled) {
          settled = true;
          reject(new Error(`closed ${code} ${String(reason)}`));
          return;
        }
        this.note(`(connection closed ${code}${reason.length ? ' ' + String(reason) : ''})`);
        this.wake(null);
        if (!this.closing && String(reason) !== 'SEAT_TAKEN_OVER' && String(reason) !== 'KICKED') this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect(60_000);
        this.backoff = 2000;
        const code = this.room?.code ?? this.savedRoom;
        if (code) this.rawSend({ type: 'joinRoom', code });
        this.note('(reconnected)');
      } catch {
        this.backoff = Math.min(30_000, this.backoff * 2);
        this.scheduleReconnect();
      }
    }, this.backoff);
  }

  disconnect(): void {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.welcomed = false;
  }

  private rawSend(m: object): void {
    this.ws?.send(JSON.stringify(m));
  }

  // ------------------------------------------------------------ messages

  private onMessage(m: ServerMsg): void {
    switch (m.type) {
      case 'welcome':
        this.welcomed = true;
        this.token = m.sessionToken as string;
        this.persist();
        break;
      case 'room': {
        const prev = this.room;
        this.room = m as unknown as RoomInfo;
        this.savedRoom = this.room.code;
        this.persist();
        this.noteRoomChanges(prev, this.room);
        break;
      }
      case 'state':
        this.view = m.view as PlayerView;
        this.legal = m.legal as Action[];
        this.seq = m.seq as number;
        this.stateVersion++;
        break;
      case 'events': {
        const c = this.ctx();
        for (const ev of m.events as GameEvent[]) {
          const t = c ? eventStr(c, ev) : JSON.stringify(ev);
          if (t) this.note(t);
        }
        break;
      }
      case 'chat':
        this.addChat(m.message as ChatLine);
        break;
      case 'chatHistory':
        for (const l of m.messages as ChatLine[]) this.addChat(l, true);
        break;
      case 'afk':
        this.note(`${m.seat} ${m.name} ${m.afk ? 'is away (a bot plays for them)' : 'is back'}`);
        break;
      case 'error':
        this.lastError = { code: m.code as string, message: m.message as string };
        if (!m.reqId) this.note(`(server error ${m.code}: ${m.message})`);
        break;
    }
    this.wake(m);
  }

  private addChat(l: ChatLine, history = false): void {
    if (this.chat.some((x) => x.id === l.id && x.at === l.at)) return;
    this.chat.push(l);
    if (history && l.seat === this.room?.you) this.chatRead = this.chat.length;
    if (this.chat.length > 300) {
      this.chat.shift();
      this.chatRead = Math.max(0, this.chatRead - 1);
    }
  }

  private noteRoomChanges(prev: RoomInfo | null, next: RoomInfo): void {
    if (!prev || prev.code !== next.code) {
      this.note(`Joined room ${next.code} as ${next.you}`);
      return;
    }
    for (const s of next.seats) {
      const o = prev.seats.find((x) => x.seat === s.seat);
      if (!o) this.note(`${s.seat} ${s.name}${s.bot ? ` (bot ${s.bot})` : ''} joined the room`);
      else if (o.connected !== s.connected) this.note(`${s.seat} ${s.name} ${s.connected ? 'reconnected' : 'went offline'}`);
    }
    for (const o of prev.seats) if (!next.seats.some((s) => s.seat === o.seat)) this.note(`${o.seat} ${o.name} left the room`);
    if (!prev.started && next.started) this.note('*** The game has started ***');
  }

  private wake(m: ServerMsg | null): void {
    for (const w of [...this.waiters]) if (w(m)) this.waiters.delete(w);
  }

  /** Resolve when `pred` accepts a message (null = connection closed), or after timeoutMs. */
  waitFor(pred: Waiter, timeoutMs: number): Promise<ServerMsg | null | 'timeout'> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(w);
        resolve('timeout');
      }, timeoutMs);
      const w: Waiter = (m) => {
        if (!pred(m)) return false;
        clearTimeout(timer);
        resolve(m);
        return true;
      };
      this.waiters.add(w);
    });
  }

  /**
   * Send a request and wait for its outcome: an error carrying our reqId, or the first message
   * `done` accepts. Returns the error text, or null on success.
   */
  async request(msg: Record<string, unknown>, done: (m: ServerMsg) => boolean, timeoutMs = 15_000): Promise<string | null> {
    await this.connect();
    const reqId = `a${++this.reqSeq}`;
    const p = this.waitFor((m) => !m || (m.type === 'error' && m.reqId === reqId) || done(m), timeoutMs);
    this.rawSend({ ...msg, reqId });
    const r = await p;
    if (r === 'timeout') return null; // no explicit refusal: treat as accepted, caller re-reads state
    if (r === null) return 'The connection closed before the server answered (it reconnects automatically; try again).';
    if (r.type === 'error') return `${r.code}: ${r.message}`;
    return null;
  }

  /** Fire-and-forget message that has no specific reply (chat, ready...), still reporting refusals. */
  async send(msg: Record<string, unknown>, settleMs = 1500): Promise<string | null> {
    return this.request(msg, () => false, settleMs);
  }

  /** Send a game action; resolves after the server logged it (or refused it). */
  async act(action: Action): Promise<string | null> {
    const me = this.room?.you;
    const before = this.seq;
    return this.request(
      { type: 'action', action },
      (m) => {
        if (m.type !== 'state') return false;
        const v = m.view as PlayerView;
        return (m.seq as number) > before && v.log.slice(Math.max(0, before)).some((l) => l.action.player === me && l.action.t === action.t);
      },
      20_000,
    );
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Accept https://host, host, ws(s)://host or ws(s)://host/ws and return the WebSocket endpoint. */
export function wsUrl(u: string): string {
  let s = u.trim().replace(/\/+$/, '');
  s = s.replace(/^http/, 'ws');
  if (!/^wss?:\/\//.test(s)) s = `wss://${s}`;
  if (!s.endsWith('/ws')) s += '/ws';
  return s;
}
