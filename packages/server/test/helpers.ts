// Test helpers: start a real server on an ephemeral port and drive real ws clients.
import { WebSocket } from 'ws';
import { startServer, type ServerHandle } from '../src/main';
import type { ServerMsg } from '../src/protocol';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export async function start(): Promise<{ server: ServerHandle; url: string }> {
  const server = await startServer({
    port: 0,
    clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-rooms-')),
    hub: {},
  });
  return { server, url: `ws://127.0.0.1:${server.port}/ws` };
}

/** A thin scripted ws client with a queue of received messages. */
export class TestClient {
  private ws!: WebSocket;
  readonly inbox: { msg: ServerMsg; raw: string }[] = [];
  private cursor = 0;
  private waiters: { test: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  private opened: Promise<void>;

  constructor(url: string, opts: { autoPong?: boolean } = {}) {
    this.opened = new Promise((resolve, reject) => {
      // autoPong: false is for heartbeat tests (docs/PROTOCOL.md pong timeout).
      // ws honours the option at runtime; @types/ws 8.5.13 does not declare it yet.
      this.ws =
        opts.autoPong === false
          ? new WebSocket(url, { autoPong: false } as unknown as import('ws').ClientOptions)
          : new WebSocket(url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const raw = data.toString();
        const msg = JSON.parse(raw) as ServerMsg;
        this.inbox.push({ msg, raw });
        const idx = this.waiters.findIndex((w) => w.test(msg));
        if (idx !== -1) {
          const [w] = this.waiters.splice(idx, 1);
          w.resolve(msg);
        }
      });
    });
  }

  get closed(): boolean {
    return this.ws.readyState === WebSocket.CLOSED;
  }

  open(): Promise<void> {
    return this.opened;
  }

  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }

  /** Next unconsumed message matching the predicate (then waits for it if needed). */
  next(test: (m: ServerMsg) => boolean, timeoutMs = 5000): Promise<ServerMsg> {
    for (let i = this.cursor; i < this.inbox.length; i++) {
      if (test(this.inbox[i].msg)) {
        this.cursor = i + 1;
        return Promise.resolve(this.inbox[i].msg);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for message`)), timeoutMs);
      this.waiters.push({
        test: (m) => test(m),
        resolve: (m) => {
          clearTimeout(timer);
          this.cursor = this.inbox.findIndex((x) => x.msg === m) + 1;
          resolve(m);
        },
      });
    });
  }

  /** Wait for the next `state` message and return it. */
  state(timeoutMs = 5000): Promise<Extract<ServerMsg, { type: 'state' }>> {
    return this.next((m) => m.type === 'state', timeoutMs) as Promise<Extract<ServerMsg, { type: 'state' }>>;
  }

  /** Next error with the given code. */
  error(code: string, timeoutMs = 5000): Promise<Extract<ServerMsg, { type: 'error' }>> {
    return this.next(
      (m) => m.type === 'error' && m.code === code,
      timeoutMs,
    ) as Promise<Extract<ServerMsg, { type: 'error' }>>;
  }

  close(): void {
    this.ws.close();
  }

  /** Close event as a promise (code + reason). */
  closeEvent(): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
      this.ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
  }
}

export type WelcomeMsg = Extract<ServerMsg, { type: 'welcome' }>;
export type RoomMsg = Extract<ServerMsg, { type: 'room' }>;
export type StateMsg = Extract<ServerMsg, { type: 'state' }>;
export type EventsMsg = Extract<ServerMsg, { type: 'events' }>;
export type ErrorMsg = Extract<ServerMsg, { type: 'error' }>;

export interface Player {
  client: TestClient;
  name: string;
  token?: string;
}

/** Fresh client that says hello and stores its token. */
export async function connect(url: string, name: string, token?: string): Promise<Player> {
  const client = new TestClient(url);
  await client.open();
  client.send({ type: 'hello', name, ...(token ? { sessionToken: token } : {}) });
  const welcome = (await client.next((m) => m.type === 'welcome')) as Extract<ServerMsg, { type: 'welcome' }>;
  return { client, name, token: welcome.sessionToken };
}

/** Create a room with `n` players, make everyone ready, host starts. Returns the clients. */
export async function startRoom(url: string, n = 3, options?: Record<string, unknown>): Promise<Player[]> {
  const players: Player[] = [];
  for (let i = 0; i < n; i++) players.push(await connect(url, `player-${i + 1}`));
  let code = '';
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      players[0].client.send({ type: 'createRoom', playerCount: n, ...(options ? { options } : {}) });
    } else {
      players[i].client.send({ type: 'joinRoom', code });
    }
    const room = (await players[i].client.next((m) => m.type === 'room')) as Extract<
      ServerMsg,
      { type: 'room' }
    >;
    code = room.code;
  }
  for (const p of players) p.client.send({ type: 'setReady', ready: true });
  // Wait until every seat is ready on the server (leftover join-broadcast messages have
  // ready=false, so this cannot be satisfied by stale messages).
  for (const p of players) {
    await p.client.next((m) => m.type === 'room' && m.seats.length === n && m.seats.every((s) => s.ready));
  }
  players[0].client.send({ type: 'startGame' });
  const states = await Promise.all(players.map((p) => p.client.state()));
  if (states.some((s) => !s.view || !Array.isArray(s.legal))) throw new Error('bad initial state');
  return players;
}

export async function shutdown(server: ServerHandle, players: Player[]): Promise<void> {
  for (const p of players) p.client.close();
  await server.close();
}

export const lastOf = <T>(arr: T[]): T => arr[arr.length - 1];
