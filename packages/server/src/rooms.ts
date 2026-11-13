// Rooms, lobby and game hosting (docs/PROTOCOL.md). The hub is authoritative: every action
// is validated by the engine and clients only ever receive redacted data
// (getPlayerView / getEventsView for their own seat). Tokens are hashed with SHA-256 and
// compared in constant time; raw tokens, the seed and raw game state never leave here.
import * as crypto from 'node:crypto';
import {
  IllegalActionError,
  applyAction,
  createGame,
  getEventsView,
  getLegalActions,
  getPlayerView,
  replay,
  validateAction,
  type Action,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@hexgame/engine';
import { CODE_RE, parseClientMessage, type ClientMsg, type ServerMsg } from './protocol';
import { RoomStore, type PersistedRoom } from './store';

export interface Conn {
  readonly id: number;
  send(msg: ServerMsg): void;
  close(code: number, reason: string): void;
}

export interface ConnRecord {
  conn: Conn;
  helloed: boolean;
  /** Raw session token - only ever echoed back to its own connection. */
  token: string;
  name: string;
  roomCode: string | null;
  seat: PlayerId | null;
  /** Failed joinRoom attempts on this connection (brute-force budget, see limits.ts). */
  failedJoins: number;
}

interface RoomPlayer {
  name: string;
  tokenHash: string;
  ready: boolean;
}

interface Room {
  code: string;
  playerCount: number;
  options: { largeTableMode?: 'paired' | 'extraBuild'; vpToWin?: number };
  /** Host is tracked by token hash so seat compaction cannot break it. */
  hostHash: string;
  started: boolean;
  players: RoomPlayer[];
  game?: { state: GameState; actions: Action[] };
  /** Timestamp from which the room has had zero connected players, or null. */
  emptySince: number | null;
}

export interface HubOptions {
  store?: RoomStore;
  /** Max concurrent rooms (docs/PROTOCOL.md: 50). */
  roomLimit?: number;
  /** Delete rooms with no connected player after this long (default 30 min). */
  idleMs?: number;
}

export const DEFAULT_ROOM_LIMIT = 50;
export const DEFAULT_IDLE_MS = 30 * 60 * 1000;
/** Failed joinRoom attempts allowed per connection before it is closed (docs/PROTOCOL.md: 10). */
export const MAX_FAILED_JOINS = 10;
/** Application-defined WebSocket close codes (4000-4999 range). */
export const CLOSE_SEAT_TAKEN_OVER = 4000;
export const CLOSE_KICKED = 4001;
export const CLOSE_TOO_MANY_JOINS = 4002;

const seatOf = (index: number): PlayerId => `p${index + 1}`;

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

/** Constant-time comparison of two SHA-256 hex hashes. */
function hashEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function randomToken(): string {
  return crypto.randomBytes(16).toString('base64url');
}

function randomSeed(): string {
  return `srv-${crypto.randomBytes(16).toString('base64url')}`;
}

/** Room code alphabet: A-Z0-9 without O/0/I/1 (32 chars -> 33.5M codes). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Hub {
  private readonly conns = new Map<number, ConnRecord>();
  private readonly rooms = new Map<string, Room>();
  private nextConnId = 1;

  private readonly store?: RoomStore;
  private readonly roomLimit: number;
  private readonly idleMs: number;

  constructor(opts: HubOptions = {}) {
    this.store = opts.store;
    this.roomLimit = opts.roomLimit ?? DEFAULT_ROOM_LIMIT;
    this.idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  }

  newConnId(): number {
    return this.nextConnId++;
  }

  attach(conn: Conn): ConnRecord {
    const rec: ConnRecord = {
      conn,
      helloed: false,
      token: '',
      name: '',
      roomCode: null,
      seat: null,
      failedJoins: 0,
    };
    this.conns.set(conn.id, rec);
    return rec;
  }

  detach(connId: number): void {
    const rec = this.conns.get(connId);
    if (!rec) return;
    this.conns.delete(connId);
    if (rec.roomCode) {
      const room = this.rooms.get(rec.roomCode);
      rec.roomCode = null;
      rec.seat = null;
      if (room) this.afterRoomChange(room);
    }
  }

  /** Remove rooms that have had no connected player for idleMs (docs/PROTOCOL.md: 30 min). */
  sweep(now = Date.now()): void {
    for (const room of [...this.rooms.values()]) {
      // One broken room (e.g. a locked file on Windows) must never kill the process.
      try {
        if (room.emptySince !== null && now - room.emptySince >= this.idleMs) {
          this.store?.delete(room.code);
          this.rooms.delete(room.code);
          console.log(`[room] ${room.code} deleted (no connected player)`);
        }
      } catch (e) {
        console.error(`[room] sweep failed for ${room.code}: ${String(e)}`);
      }
    }
  }

  /** Restore started games from the store after a server restart. Returns the room count. */
  restore(): number {
    if (!this.store) return 0;
    let count = 0;
    for (const p of this.store.loadAll()) {
      try {
        if (!isRestorable(p)) {
          console.error(`[room] skipping invalid persisted room ${JSON.stringify(p.code)}: bad shape`);
          continue;
        }
        const state = replay(p.init, p.actions);
        const players: RoomPlayer[] = p.seats.map((s) => ({
          name: s.name,
          tokenHash: s.tokenHash,
          ready: true,
        }));
        const hostIdx = Math.max(0, players.findIndex((_, i) => seatOf(i) === p.hostSeat));
        const room: Room = {
          code: p.code,
          playerCount: p.playerCount,
          options: p.options,
          hostHash: players[hostIdx]?.tokenHash ?? '',
          started: true,
          players,
          game: { state, actions: [...p.actions] },
          emptySince: Date.now(),
        };
        this.rooms.set(room.code, room);
        count++;
      } catch (e) {
        console.error(`[room] failed to restore ${p.code}: ${String(e)}`);
      }
    }
    return count;
  }

  // ------------------------------------------------------------------ dispatch

  /** Entry point for one raw text frame (rate limiting / frame size are handled by main.ts). */
  handleMessage(conn: Conn, text: string): void {
    const rec = this.conns.get(conn.id);
    if (!rec) return;
    const parsed = parseClientMessage(text);
    if (!parsed.ok) {
      this.error(conn, undefined, parsed.code, parsed.message);
      return;
    }
    this.dispatch(rec, parsed.msg);
  }

  private dispatch(rec: ConnRecord, msg: ClientMsg): void {
    if (msg.type !== 'hello' && !rec.helloed) {
      this.error(rec.conn, msg.reqId, 'NEEDS_HELLO', 'Send a hello message first.');
      return;
    }
    switch (msg.type) {
      case 'hello':
        this.onHello(rec, msg);
        break;
      case 'createRoom':
        this.onCreateRoom(rec, msg);
        break;
      case 'joinRoom':
        this.onJoinRoom(rec, msg);
        break;
      case 'leaveRoom':
        this.onLeaveRoom(rec, msg);
        break;
      case 'setReady':
        this.onSetReady(rec, msg);
        break;
      case 'startGame':
        this.onStartGame(rec, msg);
        break;
      case 'kick':
        this.onKick(rec, msg);
        break;
      case 'action':
        this.onAction(rec, msg);
        break;
      case 'requestState':
        this.onRequestState(rec, msg);
        break;
    }
  }

  private error(conn: Conn, reqId: string | undefined, code: string, message: string): void {
    conn.send({ type: 'error', reqId, code, message });
  }

  // ------------------------------------------------------------------ lobby

  private onHello(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'hello' }>): void {
    let renamed = false;
    if (!rec.helloed) {
      rec.helloed = true;
      rec.name = msg.name;
      rec.token = msg.sessionToken ?? randomToken();
    } else if (msg.name !== rec.name) {
      // A repeated hello renames the player, in the lobby and in a running game
      // (docs/PROTOCOL.md). The connection's existing token stays authoritative.
      rec.name = msg.name;
      renamed = true;
    }
    // The reply to the hello goes out before any room broadcast.
    rec.conn.send({ type: 'welcome', sessionToken: rec.token, name: rec.name });
    if (renamed) {
      const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
      const idx =
        room && rec.token
          ? room.players.findIndex((p) => hashEquals(p.tokenHash, hashToken(rec.token)))
          : -1;
      if (room && idx !== -1) {
        room.players[idx].name = msg.name;
        this.broadcastRoom(room);
      }
    }
  }

  private onCreateRoom(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'createRoom' }>): void {
    if (rec.roomCode) {
      this.error(rec.conn, msg.reqId, 'ALREADY_IN_ROOM', 'You are already in a room; leave it first.');
      return;
    }
    if (this.rooms.size >= this.roomLimit) {
      this.error(rec.conn, msg.reqId, 'ROOM_LIMIT', 'The server is full; try again later.');
      return;
    }
    const player: RoomPlayer = { name: rec.name, tokenHash: hashToken(rec.token), ready: false };
    const room: Room = {
      code: this.generateCode(),
      playerCount: msg.playerCount,
      options: msg.options ?? {},
      hostHash: player.tokenHash,
      started: false,
      players: [player],
      emptySince: null,
    };
    this.rooms.set(room.code, room);
    this.attachToRoom(rec, room, 0);
    console.log(`[room] ${room.code} created by ${safeName(rec.name)} (${room.playerCount} seats)`);
    this.afterRoomChange(room);
    rec.conn.send({ type: 'room', ...this.roomMsg(room, rec) });
  }

  private onJoinRoom(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'joinRoom' }>): void {
    if (rec.roomCode) {
      this.error(rec.conn, msg.reqId, 'ALREADY_IN_ROOM', 'You are already in a room; leave it first.');
      return;
    }
    const room = this.rooms.get(msg.code);
    if (!room) return this.failJoin(rec, msg, 'NO_SUCH_ROOM', 'No room with that code exists.');
    const tokenHash = hashToken(rec.token);
    const reclaimIdx = room.players.findIndex((p) => hashEquals(p.tokenHash, tokenHash));
    if (reclaimIdx !== -1) {
      // Reconnect: the session token restores the seat, also while the game is running.
      // If a live connection already holds this seat, the NEW connection wins and the
      // old one is closed with SEAT_TAKEN_OVER (docs/PROTOCOL.md).
      this.takeoverSeat(room, tokenHash, rec.conn.id);
      room.players[reclaimIdx].name = rec.name;
      this.attachToRoom(rec, room, reclaimIdx);
      this.afterRoomChange(room);
      console.log(`[room] ${room.code} ${rec.seat} reconnected`);
      rec.conn.send({ type: 'room', ...this.roomMsg(room, rec) });
      if (room.started) this.sendState(rec, room);
      return;
    }
    if (room.started) {
      return this.failJoin(rec, msg, 'GAME_STARTED', 'That game has already started.');
    }
    if (room.players.length >= room.playerCount) {
      return this.failJoin(rec, msg, 'ROOM_FULL', 'That room is full.');
    }
    room.players.push({ name: rec.name, tokenHash, ready: false });
    this.attachToRoom(rec, room, room.players.length - 1);
    console.log(`[room] ${room.code} ${rec.seat} joined (${safeName(rec.name)})`);
    this.afterRoomChange(room);
    this.broadcastRoom(room);
    rec.conn.send({ type: 'room', ...this.roomMsg(room, rec) });
  }

  private onLeaveRoom(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'leaveRoom' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    if (!room || !rec.seat) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    if (!room.started) {
      const idx = room.players.findIndex((p) => hashEquals(p.tokenHash, hashToken(rec.token)));
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.players.length > 0 && room.players[0].tokenHash !== room.hostHash) {
          room.hostHash = room.players[0].tokenHash; // host becomes the first remaining seat
        }
        console.log(`[room] ${room.code} ${rec.seat} left`);
      }
    } else {
      // After start the seat is kept for reconnect; leaving just disconnects.
      console.log(`[room] ${room.code} ${rec.seat} left (seat kept)`);
    }
    rec.roomCode = null;
    rec.seat = null;
    this.reseatConns(room);
    this.afterRoomChange(room);
    this.broadcastRoom(room);
  }

  private onSetReady(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'setReady' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    const idx = room && rec.token ? room.players.findIndex((p) => hashEquals(p.tokenHash, hashToken(rec.token))) : -1;
    if (!room || !rec.seat || idx === -1) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    if (room.started) {
      this.error(rec.conn, msg.reqId, 'GAME_STARTED', 'The game has already started.');
      return;
    }
    room.players[idx].ready = msg.ready;
    this.afterRoomChange(room);
    this.broadcastRoom(room);
  }

  private onStartGame(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'startGame' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    if (!room || !rec.seat) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    if (room.started) {
      this.error(rec.conn, msg.reqId, 'GAME_STARTED', 'The game has already started.');
      return;
    }
    if (!hashEquals(room.hostHash, hashToken(rec.token))) {
      this.error(rec.conn, msg.reqId, 'NOT_HOST', 'Only the host can start the game.');
      return;
    }
    if (room.players.length !== room.playerCount) {
      this.error(rec.conn, msg.reqId, 'ROOM_NOT_FULL', 'All seats must be filled before the game can start.');
      return;
    }
    if (!room.players.every((p) => p.ready)) {
      this.error(rec.conn, msg.reqId, 'NOT_READY', 'Every player must be ready before the game can start.');
      return;
    }
    const opts = room.options;
    const state = createGame({
      seed: randomSeed(),
      playerCount: room.playerCount,
      ...(opts.largeTableMode !== undefined ? { largeTableMode: opts.largeTableMode } : {}),
      ...(opts.vpToWin !== undefined ? { vpToWin: opts.vpToWin } : {}),
    });
    room.started = true;
    room.game = { state, actions: [] };
    console.log(`[room] ${room.code} game started (${room.playerCount} players)`);
    this.persist(room);
    this.afterRoomChange(room);
    for (const r of this.connsInRoom(room)) {
      r.conn.send({ type: 'events', events: [], seq: 0 });
      this.sendState(r, room);
    }
    this.broadcastRoom(room);
  }

  // ------------------------------------------------------------------ game

  /** Host-only, lobby-only: free a seat and close that player's connection (docs/PROTOCOL.md). */
  private onKick(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'kick' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    if (!room || !rec.seat) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    if (room.started) {
      this.error(rec.conn, msg.reqId, 'GAME_STARTED', 'Players can only be kicked in the lobby.');
      return;
    }
    if (!hashEquals(room.hostHash, hashToken(rec.token))) {
      this.error(rec.conn, msg.reqId, 'NOT_HOST', 'Only the host can kick a player.');
      return;
    }
    if (msg.seat === rec.seat) {
      this.error(rec.conn, msg.reqId, 'BAD_KICK', 'You cannot kick yourself; leave the room instead.');
      return;
    }
    const idx = Number(msg.seat.slice(1)) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= room.players.length) {
      this.error(rec.conn, msg.reqId, 'BAD_KICK', 'That seat is empty.');
      return;
    }
    const [removed] = room.players.splice(idx, 1);
    for (const r of [...this.conns.values()]) {
      if (r.roomCode !== room.code || !r.token) continue;
      if (!hashEquals(hashToken(r.token), removed.tokenHash)) continue;
      console.log(`[room] ${room.code} ${msg.seat} kicked (${safeName(removed.name)})`);
      r.conn.close(CLOSE_KICKED, 'KICKED');
      this.detach(r.conn.id);
    }
    this.reseatConns(room);
    this.afterRoomChange(room);
    this.broadcastRoom(room);
  }

  private onAction(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'action' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    const game = room?.game;
    if (!room || !game || !rec.seat) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_GAME', 'No game is running.');
      return;
    }
    const action = msg.action as { player?: unknown };
    // The server decides the seat; a client that names another seat is impersonating it.
    // The reply never echoes the client's input (no String() on hostile objects).
    if (action.player !== rec.seat) {
      this.error(rec.conn, msg.reqId, 'IMPERSONATION', `Actions must use your own seat (${rec.seat}).`);
      return;
    }
    const v = validateAction(game.state, msg.action as Action);
    if (!v.ok) {
      this.error(rec.conn, msg.reqId, v.code, v.message);
      return;
    }
    let events: GameEvent[];
    try {
      const res = applyAction(game.state, msg.action as Action);
      game.state = res.state;
      events = res.events;
    } catch (e) {
      if (e instanceof IllegalActionError) {
        this.error(rec.conn, msg.reqId, e.code, e.message);
        return;
      }
      throw e;
    }
    game.actions.push(msg.action as Action);
    this.persist(room);
    const a = msg.action as { t?: string };
    console.log(`[room] ${room.code} action #${game.state.log.length} ${String(a.t)} by ${rec.seat}`);
    if (game.state.winner) {
      console.log(`[room] ${room.code} game over, winner ${String(game.state.winner)}`);
    }
    // Every connected seat receives events then state, redacted for that seat.
    for (const r of this.connsInRoom(room)) {
      r.conn.send({ type: 'events', events: getEventsView(events, r.seat), seq: game.state.log.length });
      this.sendState(r, room);
    }
  }

  private onRequestState(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'requestState' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    if (!room || !rec.seat) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    rec.conn.send({ type: 'room', ...this.roomMsg(room, rec) });
    if (room.started) this.sendState(rec, room);
  }

  // ------------------------------------------------------------------ helpers

  /** A failed joinRoom: error reply, budget count, close after MAX_FAILED_JOINS. */
  private failJoin(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'joinRoom' }>, code: string, message: string): void {
    this.error(rec.conn, msg.reqId, code, message);
    rec.failedJoins++;
    if (rec.failedJoins >= MAX_FAILED_JOINS) {
      console.log(`[conn] ${rec.conn.id} closed after ${rec.failedJoins} failed joins`);
      rec.conn.close(CLOSE_TOO_MANY_JOINS, 'TOO_MANY_FAILED_JOINS');
    }
  }

  /** Close every live connection other than `keepConnId` that holds the seat with this token. */
  private takeoverSeat(room: Room, tokenHash: string, keepConnId: number): void {
    for (const r of [...this.conns.values()]) {
      if (r.conn.id === keepConnId || r.roomCode !== room.code) continue;
      if (!r.token || !hashEquals(hashToken(r.token), tokenHash)) continue;
      console.log(`[room] ${room.code} ${r.seat} taken over (old connection closed)`);
      r.conn.close(CLOSE_SEAT_TAKEN_OVER, 'SEAT_TAKEN_OVER');
      this.detach(r.conn.id);
    }
  }

  private attachToRoom(rec: ConnRecord, room: Room, playerIdx: number): void {
    rec.roomCode = room.code;
    rec.seat = seatOf(playerIdx);
  }

  private connsInRoom(room: Room): ConnRecord[] {
    return [...this.conns.values()].filter((r) => r.roomCode === room.code && r.seat !== null);
  }

  private connectedFlags(room: Room): boolean[] {
    const taken = new Set(
      [...this.conns.values()]
        .filter((r) => r.roomCode === room.code && r.seat !== null)
        .map((r) => Number(r.seat!.slice(1)) - 1),
    );
    return room.players.map((_, i) => taken.has(i));
  }

  /** Seats are derived from join order; after any list change, re-map live connections. */
  private reseatConns(room: Room): void {
    for (const r of this.connsInRoom(room)) {
      const idx = room.players.findIndex((p) => hashEquals(p.tokenHash, hashToken(r.token)));
      if (idx === -1) {
        r.roomCode = null;
        r.seat = null;
      } else {
        r.seat = seatOf(idx);
      }
    }
  }

  private roomMsg(room: Room, rec: ConnRecord): Omit<Extract<ServerMsg, { type: 'room' }>, 'type'> {
    const connected = this.connectedFlags(room);
    const hostIdx = Math.max(0, room.players.findIndex((p) => hashEquals(p.tokenHash, room.hostHash)));
    return {
      code: room.code,
      hostSeat: seatOf(hostIdx),
      playerCount: room.playerCount,
      options: room.options,
      seats: room.players.map((p, i) => ({
        seat: seatOf(i),
        name: p.name,
        connected: connected[i],
        ready: p.ready,
      })),
      you: rec.seat,
      started: room.started,
    };
  }

  /** One `room` message per connection in the room, each with its own `you`/`connected` flags. */
  private broadcastRoom(room: Room): void {
    for (const r of this.connsInRoom(room)) {
      r.conn.send({ type: 'room', ...this.roomMsg(room, r) });
    }
  }

  private afterRoomChange(room: Room): void {
    const anyConnected = this.connectedFlags(room).some(Boolean);
    room.emptySince = anyConnected ? null : (room.emptySince ?? Date.now());
  }

  private sendState(rec: ConnRecord, room: Room): void {
    const game = room.game;
    if (!game || !rec.seat) return;
    rec.conn.send({
      type: 'state',
      view: getPlayerView(game.state, rec.seat),
      legal: getLegalActions(game.state, rec.seat),
      seq: game.state.log.length,
    });
  }

  private persist(room: Room): void {
    if (!room.game || !this.store) return;
    const hostIdx = Math.max(0, room.players.findIndex((p) => hashEquals(p.tokenHash, room.hostHash)));
    this.store.save({
      code: room.code,
      hostSeat: seatOf(hostIdx),
      playerCount: room.playerCount,
      options: room.options,
      seats: room.players.map((s) => ({ name: s.name, tokenHash: s.tokenHash })),
      init: room.game.state.init,
      actions: room.game.actions,
    });
  }

  private generateCode(): string {
    for (;;) {
      const bytes = crypto.randomBytes(5);
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
  }
}

/** Log names/actions without quoting user content. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_. -]/g, '?').slice(0, 24);
}

/**
 * Shape checks on persisted data before it reaches a Room (security review #6): a tampered
 * file must never put a traversal `code` or nonsense seat list into memory.
 */
function isRestorable(p: PersistedRoom): boolean {
  if (!CODE_RE.test(p.code)) return false;
  if (!Number.isInteger(p.playerCount) || p.playerCount < 3 || p.playerCount > 6) return false;
  if (p.seats.length !== p.playerCount) return false;
  const hostIdx = Number(p.hostSeat.slice(1)) - 1;
  return Number.isInteger(hostIdx) && hostIdx >= 0 && hostIdx < p.playerCount;
}
