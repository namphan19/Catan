// Rooms, lobby and game hosting (docs/PROTOCOL.md). The hub is authoritative: every action
// is validated by the engine and clients only ever receive redacted data
// (getPlayerView / getEventsView for their own seat). Tokens are hashed with SHA-256 and
// compared in constant time; raw tokens, the seed and raw game state never leave here.
import * as crypto from 'node:crypto';
import {
  BOT_RESPOND_DELAY_MS,
  BOT_TRADE_WAIT_MS,
  IllegalActionError,
  applyAction,
  planBot,
  botRespondWaitMs,
  botTradeWaitMs,
  createGame,
  getEventsView,
  getLegalActions,
  getPlayerView,
  replay,
  validateAction,
  type Action,
  type BotPlan,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@hexgame/engine';
import {
  AFK_BOT_LEVEL, CODE_RE, parseClientMessage, type BotLevelName, type ChatMessage, type ClientMsg, type RoomOptions, type ServerMsg,
} from './protocol';
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
  /** Times of this connection's recent chat lines (chat rate limit). */
  chatTimes: number[];
}

interface RoomPlayer {
  name: string;
  tokenHash: string;
  ready: boolean;
  /** Server-side bot seat. Its token is random and never issued, so nobody can claim the seat. */
  bot?: BotLevelName;
  /** A human seat handed to its stand-in bot (AFK_BOT_LEVEL) until the owner takes it back. */
  afk?: boolean;
}

/** Who plays a seat on the server: its bot level, or undefined for a human at the controls. */
const botLevelOf = (p: RoomPlayer): BotLevelName | undefined => p.bot ?? (p.afk ? AFK_BOT_LEVEL : undefined);

interface Room {
  code: string;
  playerCount: number;
  options: RoomOptions;
  /** Host is tracked by token hash so seat compaction cannot break it. */
  hostHash: string;
  started: boolean;
  players: RoomPlayer[];
  game?: { state: GameState; actions: Action[] };
  /** Timestamp from which the room has had zero connected players, or null. */
  emptySince: number | null;
  /** Pending bot move. */
  botTimer?: ReturnType<typeof setTimeout>;
  /** When the currently open trade offer was made (bots cancel their own after botTradeWaitMs). */
  tradeSince?: number;
  /** An expert bot is searching; set `cancelled` to drop the result. */
  thinking?: { cancelled: boolean };
  /** The last CHAT_HISTORY chat lines (memory only, not persisted). */
  chat: ChatMessage[];
  /** Id of the last chat line. */
  chatSeq: number;
}

export interface HubOptions {
  store?: RoomStore;
  /** Max concurrent rooms (docs/PROTOCOL.md: 50). */
  roomLimit?: number;
  /** Delete rooms with no connected player after this long (default 30 min). */
  idleMs?: number;
  /** Pause before each bot move, so humans can follow (default 700 ms). */
  botDelayMs?: number;
  /** A bot waits this long for every answer to its trade offer before settling it (default 30 s). */
  botTradeWaitMs?: number;
  /** A bot holds back its answer to an offer this long while a human could still accept (default 8 s). */
  botRespondDelayMs?: number;
  /** Thinking time of 'expert' bots per searched decision (default 1500 ms). */
  botThinkMs?: number;
}

export const DEFAULT_BOT_THINK_MS = 1500;
/** Search slice: the event loop is free again after at most about this long. */
const THINK_SLICE_MS = 15;

export const DEFAULT_BOT_DELAY_MS = 700;
export const DEFAULT_BOT_TRADE_WAIT_MS = BOT_TRADE_WAIT_MS;
export const DEFAULT_BOT_RESPOND_DELAY_MS = BOT_RESPOND_DELAY_MS;
/** Bot seats are named "Bot", "Bot 2", ...; clients show the level from the seat's `bot` field. */
const BOT_NAME = 'Bot';

/** Chat lines a room keeps for players who join or reconnect later. */
export const CHAT_HISTORY = 50;
/** Chat rate limit per connection: at most CHAT_BURST lines per CHAT_WINDOW_MS. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

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
  private readonly botDelayMs: number;
  private readonly botTradeWaitMs: number;
  private readonly botRespondDelayMs: number;
  private readonly botThinkMs: number;

  constructor(opts: HubOptions = {}) {
    this.botThinkMs = opts.botThinkMs ?? DEFAULT_BOT_THINK_MS;
    this.store = opts.store;
    this.roomLimit = opts.roomLimit ?? DEFAULT_ROOM_LIMIT;
    this.idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
    this.botDelayMs = opts.botDelayMs ?? DEFAULT_BOT_DELAY_MS;
    this.botTradeWaitMs = opts.botTradeWaitMs ?? DEFAULT_BOT_TRADE_WAIT_MS;
    this.botRespondDelayMs = opts.botRespondDelayMs ?? DEFAULT_BOT_RESPOND_DELAY_MS;
  }

  /** Stop all pending bot moves (server shutdown, tests). */
  close(): void {
    for (const room of this.rooms.values()) {
      if (room.botTimer) clearTimeout(room.botTimer);
      room.botTimer = undefined;
      if (room.thinking) room.thinking.cancelled = true;
    }
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
      chatTimes: [],
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
          if (room.botTimer) clearTimeout(room.botTimer);
          this.store?.delete(room.code);
          this.rooms.delete(room.code);
          console.log(`[room] ${room.code} deleted (no connected player)`);
        }
      } catch (e) {
        console.error(`[room] sweep failed for ${room.code}: ${String(e)}`);
      }
    }
  }

  /** Persist every started room (graceful shutdown, docs/PROTOCOL.md). */
  persistAll(): void {
    for (const room of this.rooms.values()) {
      try {
        this.persist(room);
      } catch (e) {
        console.error(`[room] persist failed for ${room.code}: ${String(e)}`);
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
          ...(s.bot ? { bot: s.bot } : {}),
          ...(s.afk && !s.bot ? { afk: true } : {}),
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
          chat: [],
          chatSeq: 0,
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
      case 'addBot':
        this.onAddBot(rec, msg);
        break;
      case 'setAfk':
        this.onSetAfk(rec, msg);
        break;
      case 'chat':
        this.onChat(rec, msg);
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
      chat: [],
      chatSeq: 0,
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
      this.sendChatHistory(rec, room);
      if (room.started) {
        this.sendState(rec, room);
        this.scheduleBots(room); // bots pause while nobody is connected
      }
      return;
    }
    if (room.started) {
      return this.failJoin(rec, msg, 'GAME_STARTED', 'That game has already started.');
    }
    if (room.players.length >= room.playerCount) {
      return this.failJoin(rec, msg, 'ROOM_FULL', 'That room is full.');
    }
    room.players.push({ name: rec.name, tokenHash, ready: false });
    // A lobby left with only bots has no host: the first human to join takes over.
    if (!room.players.some((p) => !p.bot && hashEquals(p.tokenHash, room.hostHash))) room.hostHash = tokenHash;
    this.attachToRoom(rec, room, room.players.length - 1);
    console.log(`[room] ${room.code} ${rec.seat} joined (${safeName(rec.name)})`);
    this.afterRoomChange(room);
    this.broadcastRoom(room);
    rec.conn.send({ type: 'room', ...this.roomMsg(room, rec) });
    this.sendChatHistory(rec, room);
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
        // The host becomes the first remaining human seat (a bot can never host).
        const human = room.players.find((p) => !p.bot);
        if (human && human.tokenHash !== room.hostHash) room.hostHash = human.tokenHash;
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
      ...(opts.expansion ? { rulesets: ['base', opts.expansion] } : {}),
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
    this.scheduleBots(room);
  }

  /** Host-only, lobby-only: add a bot to the next free seat (docs/PROTOCOL.md). */
  private onAddBot(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'addBot' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    if (!room || !rec.seat) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    if (room.started) {
      this.error(rec.conn, msg.reqId, 'GAME_STARTED', 'Bots can only be added in the lobby.');
      return;
    }
    if (!hashEquals(room.hostHash, hashToken(rec.token))) {
      this.error(rec.conn, msg.reqId, 'NOT_HOST', 'Only the host can add a bot.');
      return;
    }
    if (room.players.length >= room.playerCount) {
      this.error(rec.conn, msg.reqId, 'ROOM_FULL', 'That room is full.');
      return;
    }
    const taken = new Set(room.players.map((p) => p.name));
    let name = BOT_NAME;
    for (let n = 2; taken.has(name); n++) name = `${BOT_NAME} ${n}`;
    room.players.push({ name, tokenHash: hashToken(randomToken()), ready: true, bot: msg.level });
    console.log(`[room] ${room.code} ${seatOf(room.players.length - 1)} bot added (${msg.level})`);
    this.afterRoomChange(room);
    this.broadcastRoom(room);
  }

  // ------------------------------------------------------------------ chat

  /** Lobby or game: relay a chat line to everyone in the room and keep it in the short history. */
  private onChat(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'chat' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    const idx = room && rec.token ? room.players.findIndex((p) => hashEquals(p.tokenHash, hashToken(rec.token))) : -1;
    if (!room || !rec.seat || idx === -1) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    const now = Date.now();
    rec.chatTimes = rec.chatTimes.filter((at) => now - at < CHAT_WINDOW_MS);
    if (rec.chatTimes.length >= CHAT_BURST) {
      this.error(rec.conn, msg.reqId, 'CHAT_RATE', 'You are sending chat messages too fast.');
      return;
    }
    rec.chatTimes.push(now);
    const message: ChatMessage = { id: ++room.chatSeq, seat: seatOf(idx), name: room.players[idx].name, text: msg.text, at: now };
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY) room.chat.splice(0, room.chat.length - CHAT_HISTORY);
    for (const r of this.connsInRoom(room)) r.conn.send({ type: 'chat', message });
  }

  private sendChatHistory(rec: ConnRecord, room: Room): void {
    rec.conn.send({ type: 'chatHistory', messages: room.chat });
  }

  // ------------------------------------------------------------------ game

  /**
   * Running game only: hand my seat to a stand-in bot while I am away, or take it back
   * (docs/PROTOCOL.md). Everyone in the room gets an `afk` notice (clients show a popup) and the
   * room message carries the seat's `afk` flag. My own actions are refused while the bot plays.
   */
  private onSetAfk(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'setAfk' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    const idx = room && rec.token ? room.players.findIndex((p) => hashEquals(p.tokenHash, hashToken(rec.token))) : -1;
    if (!room || !rec.seat || idx === -1) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    if (!room.game) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_GAME', 'No game is running.');
      return;
    }
    if (msg.afk && room.game.state.winner) {
      this.error(rec.conn, msg.reqId, 'GAME_OVER', 'The game is over.');
      return;
    }
    const player = room.players[idx];
    if (!!player.afk === msg.afk) {
      rec.conn.send({ type: 'room', ...this.roomMsg(room, rec) }); // already so: just resync
      return;
    }
    if (msg.afk) player.afk = true;
    else delete player.afk;
    console.log(`[room] ${room.code} ${rec.seat} ${msg.afk ? 'away, stand-in bot plays' : 'back at the controls'}`);
    this.persist(room);
    for (const r of this.connsInRoom(room)) {
      r.conn.send({ type: 'afk', seat: seatOf(idx), name: player.name, afk: msg.afk });
    }
    this.broadcastRoom(room);
    // Taking the seat back sends fresh legal actions; handing it over lets the bot move.
    if (!msg.afk) this.sendState(rec, room);
    this.rescheduleBots(room);
  }

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
    if (room.players[Number(rec.seat.slice(1)) - 1]?.afk) {
      this.error(rec.conn, msg.reqId, 'AFK_ACTIVE', 'A stand-in bot plays your seat; take it back first.');
      return;
    }
    const v = validateAction(game.state, msg.action as Action);
    if (!v.ok) {
      this.error(rec.conn, msg.reqId, v.code, v.message);
      return;
    }
    try {
      this.commit(room, msg.action as Action, rec.seat);
    } catch (e) {
      if (e instanceof IllegalActionError) {
        this.error(rec.conn, msg.reqId, e.code, e.message);
        return;
      }
      throw e;
    }
  }

  /** Apply a validated action, persist, broadcast redacted results, then let bots move. */
  private commit(room: Room, action: Action, by: PlayerId): void {
    const game = room.game!;
    const hadTrade = !!game.state.trade;
    const res = applyAction(game.state, action);
    game.state = res.state;
    const events: GameEvent[] = res.events;
    // A fresh offer (also one that replaces an open offer) restarts the offer clock.
    if (game.state.trade && (!hadTrade || action.t === 'offerTrade')) room.tradeSince = Date.now();
    game.actions.push(action);
    try {
      this.persist(room);
    } catch (e) {
      // A failed save (e.g. EPERM on the rename while Windows holds the file) must not swallow the
      // broadcast: the move is applied, so everyone must see it; the next action saves again.
      console.error(`[room] ${room.code} persist failed: ${String(e)}`);
    }
    console.log(`[room] ${room.code} action #${game.state.log.length} ${String(action.t)} by ${by}`);
    if (game.state.winner) {
      console.log(`[room] ${room.code} game over, winner ${String(game.state.winner)}`);
    }
    // Every connected seat receives events then state, redacted for that seat.
    for (const r of this.connsInRoom(room)) {
      r.conn.send({ type: 'events', events: getEventsView(events, r.seat), seq: game.state.log.length });
      this.sendState(r, room);
    }
    this.rescheduleBots(room);
  }

  // ------------------------------------------------------------------ bots

  /**
   * Drop a pending bot wake-up and plan afresh: after a move or an away switch the old wake-up time
   * (e.g. a bot holding back its answer until the humans had time) may no longer apply.
   */
  private rescheduleBots(room: Room): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = undefined;
    this.scheduleBots(room);
  }

  private scheduleBots(room: Room, delay = this.botDelayMs): void {
    if (room.botTimer || !room.game || room.game.state.winner || !room.players.some((p) => botLevelOf(p))) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = undefined;
      try {
        this.stepBots(room);
      } catch (e) {
        // A bot failure must never take the server down; the humans can still play on.
        console.error(`[room] ${room.code} bot step failed: ${String(e)}`);
      }
    }, delay);
    room.botTimer.unref?.();
  }

  /**
   * Run an expert bot's search in small slices so the server keeps serving other messages. If the game
   * moved on meanwhile (a human acted), the result is dropped and the bots are asked again.
   */
  private think(room: Room, id: PlayerId, plan: Extract<BotPlan, { kind: 'search' }>): void {
    const game = room.game!;
    const seq = game.state.log.length;
    const token = { cancelled: false };
    room.thinking = token;
    const tick = (): void => {
      if (token.cancelled) return;
      try {
        const stale = this.rooms.get(room.code) !== room || game.state.log.length !== seq || !!game.state.winner;
        if (!stale && !plan.run.step(THINK_SLICE_MS)) {
          setImmediate(tick);
          return;
        }
        room.thinking = undefined;
        if (stale) {
          this.scheduleBots(room, 0);
          return;
        }
        const a = plan.finish();
        if (a) this.commit(room, a, id);
      } catch (e) {
        room.thinking = undefined;
        console.error(`[room] ${room.code} bot search failed: ${String(e)}`);
      }
    };
    setImmediate(tick);
  }

  /** Let one bot act (each bot move is committed like a human one and reschedules the next). */
  private stepBots(room: Room): void {
    const game = room.game;
    if (!game || game.state.winner || this.rooms.get(room.code) !== room) return;
    // Bots wait while no human is connected; a reconnect starts them again.
    if (!this.connectedFlags(room).some(Boolean)) return;
    const s = game.state;
    const cur = s.turn.current;
    const bots = room.players
      .map((p, i) => ({ id: seatOf(i), level: botLevelOf(p) }))
      .filter((b): b is { id: PlayerId; level: BotLevelName } => !!b.level);
    // Responders first, so an open offer is answered before its owner moves on.
    bots.sort((a, b) => Number(a.id === cur) - Number(b.id === cur));
    // An offer restored after a server restart has no start time yet: its clock starts now.
    if (s.trade && room.tradeSince === undefined) room.tradeSince = Date.now();
    const waited = s.trade && room.tradeSince !== undefined ? Date.now() - room.tradeSince : 0;
    if (room.thinking) return; // a search is running; it reschedules when done
    const isBot = (id: PlayerId): boolean => bots.some((x) => x.id === id);
    const tradeWait = s.trade ? botTradeWaitMs(s, isBot, this.botTradeWaitMs) : 0;
    // Earliest moment a bot that is holding back its answer to an offer may answer (ms from now).
    let respondIn = Infinity;
    for (const b of bots) {
      // Answer someone else's offer only after the humans had time to answer first.
      const hold = botRespondWaitMs(s, b.id, isBot, waited, this.botRespondDelayMs);
      if (hold > 0) {
        respondIn = Math.min(respondIn, hold);
        continue;
      }
      // Settle a bot's own offer when the wait is over (shorter when no human could accept it).
      const tradeTimedOut = s.trade?.from === b.id && waited >= tradeWait;
      const plan = planBot(s, b.id, { level: b.level, tradeTimedOut, search: { timeMs: this.botThinkMs, clock: () => performance.now() } });
      if (plan.kind === 'search') {
        this.think(room, b.id, plan);
        return;
      }
      if (plan.action) {
        this.commit(room, plan.action, b.id);
        return;
      }
    }
    // A bot waits for answers to its own offer, or holds back its answer: look again when that runs out.
    let wake = respondIn;
    if (s.trade && isBot(s.trade.from)) wake = Math.min(wake, tradeWait - waited);
    if (wake !== Infinity) this.scheduleBots(room, Math.max(50, wake));
  }

  private onRequestState(rec: ConnRecord, msg: Extract<ClientMsg, { type: 'requestState' }>): void {
    const room = rec.roomCode ? this.rooms.get(rec.roomCode) : undefined;
    if (!room || !rec.seat) {
      this.error(rec.conn, msg.reqId, 'NOT_IN_ROOM', 'You are not in a room.');
      return;
    }
    rec.conn.send({ type: 'room', ...this.roomMsg(room, rec) });
    this.sendChatHistory(rec, room);
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
        connected: connected[i] || !!p.bot,
        ready: p.ready,
        ...(p.bot ? { bot: p.bot } : {}),
        ...(p.afk ? { afk: true } : {}),
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
      seats: room.players.map((s) => ({
        name: s.name,
        tokenHash: s.tokenHash,
        ...(s.bot ? { bot: s.bot } : {}),
        ...(s.afk ? { afk: true } : {}),
      })),
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
