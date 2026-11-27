// Protocol contract (docs/PROTOCOL.md): message shapes plus runtime validation of every
// incoming field. The server never trusts a client field without passing it through here.
import { SCENARIOS, type Action } from '@hexgame/engine';

/** Room options accepted from the client; bounded and passed to createGame. */
export interface RoomOptions {
  /** 5-6 players: 'normal' (default, turns as with 2-4 players), 'paired' or 'extraBuild'. */
  largeTableMode?: 'normal' | 'paired' | 'extraBuild';
  vpToWin?: number;
  /** Play with the Strongholds expansion ruleset (5-6 players: normal or paired turns, no extraBuild). */
  expansion?: 'strongholds';
  /** Play with the Tidelands (sea) expansion: the scenario id. Combines with strongholds where the
   *  scenario allows it (5-6 players: normal or paired turns, no extraBuild). */
  tidelands?: string;
  /** Play the Highlands expansion (tribes rise and decline, 2-4 players): the map mode. Plays alone. */
  highlands?: 'variable' | 'starter';
}

/** Engine ruleset list and options for room options (base first). */
export function gameSetup(o: RoomOptions): { rulesets: string[]; options?: Record<string, unknown> } {
  const rulesets = ['base'];
  if (o.expansion) rulesets.push(o.expansion);
  if (o.tidelands) rulesets.push('tidelands');
  if (o.highlands) return { rulesets: ['base', 'highlands'], options: { map: o.highlands } };
  return { rulesets, ...(o.tidelands ? { options: { scenario: o.tidelands } } : {}) };
}

/** Why these options cannot make a game (null = fine). Shared by the parser and the room store. */
export function optionsProblem(o: RoomOptions, playerCount?: number): string | null {
  if (o.highlands !== undefined) {
    if (o.highlands !== 'variable' && o.highlands !== 'starter') return "options.highlands must be 'variable' or 'starter'.";
    if (o.expansion || o.tidelands) return 'Highlands is played alone.';
    if (playerCount !== undefined && playerCount > 4) return 'Highlands is for 2-4 players.';
  }
  if (o.expansion !== undefined && o.expansion !== 'strongholds') return "options.expansion must be 'strongholds'.";
  if (o.tidelands !== undefined) {
    const sc = typeof o.tidelands === 'string' ? SCENARIOS[o.tidelands] : undefined;
    if (!sc) return 'options.tidelands must be a scenario id.';
    if (o.expansion && !sc.strongholds) return 'That scenario cannot be combined with strongholds.';
  }
  if ((o.expansion || o.tidelands) && o.largeTableMode === 'extraBuild')
    return 'The expansion plays 5-6 players with normal or paired turns, not the extra build phase.';
  return null;
}

export const BOT_LEVELS = ['easy', 'normal', 'hard', 'expert'] as const;
export type BotLevelName = (typeof BOT_LEVELS)[number];
/** The level of the stand-in bot that plays a seat whose owner is away (setAfk). */
export const AFK_BOT_LEVEL: BotLevelName = 'normal';
export const isBotLevel = (v: unknown): v is BotLevelName =>
  typeof v === 'string' && (BOT_LEVELS as readonly string[]).includes(v);

/** Player portraits (client: /assets/avatar/<id>.webp). One per seat in a room, first come first served. */
export const AVATARS = ['star', 'leaf', 'wave', 'sun', 'flame', 'shield'] as const;
export type AvatarId = (typeof AVATARS)[number];
export const isAvatar = (v: unknown): v is AvatarId =>
  typeof v === 'string' && (AVATARS as readonly string[]).includes(v);

/** Client -> server. `reqId` is echoed back on error replies. */
export type ClientMsg =
  | { type: 'hello'; name: string; sessionToken?: string; reqId?: string }
  | { type: 'createRoom'; playerCount: number; options?: RoomOptions; reqId?: string }
  | { type: 'joinRoom'; code: string; reqId?: string }
  | { type: 'leaveRoom'; reqId?: string }
  | { type: 'setReady'; ready: boolean; reqId?: string }
  | { type: 'startGame'; reqId?: string }
  | { type: 'kick'; seat: string; reqId?: string }
  /** Host-only, lobby-only: fill the next free seat with a server-side bot. */
  | { type: 'addBot'; level: BotLevelName; reqId?: string }
  /** Lobby-only: pick my portrait (null clears it). Refused with AVATAR_TAKEN if another seat has it. */
  | { type: 'setAvatar'; avatar: AvatarId | null; reqId?: string }
  /** Lobby or game: a chat line to everyone in my room (CHAT_MAX_LEN chars, rate-limited). */
  | { type: 'chat'; text: string; reqId?: string }
  /** Running game only: hand my seat to a stand-in bot (AFK_BOT_LEVEL) while I am away, or take it back. */
  | { type: 'setAfk'; afk: boolean; reqId?: string }
  | { type: 'action'; action: unknown; reqId?: string }
  | { type: 'requestState'; reqId?: string };

/** Server -> client. Only redacted data ever leaves here (see rooms.ts). */
export type ServerMsg =
  | { type: 'welcome'; sessionToken: string; name: string }
  | {
      type: 'room';
      code: string;
      hostSeat: string;
      playerCount: number;
      options: RoomOptions;
      /** `bot` is set for server-side bot seats (always connected and ready). */
      /** `afk` is set while a stand-in bot plays a human seat (its owner handed it over with setAfk). */
      /** `avatar`: the seat's portrait; every seat has one once the game has started. */
      seats: {
        seat: string;
        name: string;
        connected: boolean;
        ready: boolean;
        bot?: BotLevelName;
        afk?: boolean;
        avatar?: AvatarId;
      }[];
      you: string | null;
      started: boolean;
      /** Only in my own copy: I sent the dice cheat code, so my rolls may carry chosen `dice`. */
      diceCheat?: true;
    }
  | { type: 'state'; view: unknown; legal: unknown[]; seq: number }
  | { type: 'events'; events: unknown[]; seq: number }
  /** A chat line, to everyone in the room (the sender too). `id` grows per room. */
  | { type: 'chat'; message: ChatMessage }
  /** The room's recent chat lines (oldest first), sent when a connection enters a room. */
  | { type: 'chatHistory'; messages: ChatMessage[] }
  /** To everyone in the room when a seat is handed to its stand-in bot (afk) or taken back. */
  | { type: 'afk'; seat: string; name: string; afk: boolean }
  | { type: 'error'; reqId?: string; code: string; message: string };

export interface ChatMessage {
  id: number;
  seat: string;
  /** The sender's display name when the line was sent. */
  name: string;
  /** The sender's portrait when the line was sent (none while they had not picked one). */
  avatar?: AvatarId;
  text: string;
  /** Server time (epoch ms). */
  at: number;
}

/** Longest chat line (after trimming). */
export const CHAT_MAX_LEN = 300;

export interface ParseOk {
  ok: true;
  msg: ClientMsg;
}
export interface ParseFail {
  ok: false;
  code: string;
  message: string;
}
export type ParseResult = ParseOk | ParseFail;

const CONTROL = /[\u0000-\u001F\u007F]/;
/** 5 chars, A-Z0-9 without O/0/I/1 (docs/PROTOCOL.md). */
export const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
/**
 * Only the exact shape the server issues is honoured (docs/PROTOCOL.md): 128-bit tokens,
 * exactly 22 base64url chars. Any other shape (weak, hand-made, corrupt localStorage) is
 * treated as a new session and replaced with a fresh server-issued token.
 */
export const SERVER_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
/** Max JSON nesting depth accepted in one message (bigger -> BAD_MESSAGE). */
export const MAX_JSON_DEPTH = 20;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkReqId(msg: Record<string, unknown>): string | undefined {
  const reqId = msg.reqId;
  if (reqId === undefined) return undefined;
  if (!isStr(reqId) || reqId.length > 64) throw badReqId();
  return reqId;
}
function badReqId(): { code: string; message: string } {
  return { code: 'BAD_MESSAGE', message: 'reqId must be a string of at most 64 characters.' };
}

function parseHello(msg: Record<string, unknown>, reqId?: string): ClientMsg {
  const name = msg.name;
  if (!isStr(name)) throwErr('BAD_MESSAGE', 'hello needs a name string.');
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 24)
    throwErr('BAD_NAME', 'The display name must be 1 to 24 characters long.');
  if (CONTROL.test(trimmed)) throwErr('BAD_NAME', 'The display name must not contain control characters.');
  const out: { type: 'hello'; name: string; sessionToken?: string; reqId?: string } = {
    type: 'hello',
    name: trimmed,
    reqId,
  };
  const token = msg.sessionToken;
  // Only a server-issued token shape is honoured; anything else becomes a new session
  // (docs/PROTOCOL.md), so no BAD_TOKEN reply - the token is simply not passed on.
  if (isStr(token) && SERVER_TOKEN_RE.test(token)) out.sessionToken = token;
  return out;
}

function parseCreateRoom(msg: Record<string, unknown>, reqId?: string): ClientMsg {
  const playerCount = msg.playerCount;
  if (typeof playerCount !== 'number' || !Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6)
    throwErr('BAD_MESSAGE', 'playerCount must be an integer between 2 and 6.');
  const out: { type: 'createRoom'; playerCount: number; options?: RoomOptions; reqId?: string } = {
    type: 'createRoom',
    playerCount,
    reqId,
  };
  const options = msg.options;
  if (options !== undefined) {
    if (!isPlainObj(options)) throwErr('BAD_MESSAGE', 'options must be an object.');
    const clean: RoomOptions = {};
    const mode = options.largeTableMode;
    if (mode !== undefined) {
      if (mode !== 'normal' && mode !== 'paired' && mode !== 'extraBuild')
        throwErr('BAD_MESSAGE', "options.largeTableMode must be 'normal', 'paired' or 'extraBuild'.");
      clean.largeTableMode = mode;
    }
    const vp = options.vpToWin;
    if (vp !== undefined) {
      if (typeof vp !== 'number' || !Number.isInteger(vp) || vp < 1 || vp > 100)
        throwErr('BAD_MESSAGE', 'options.vpToWin must be an integer between 1 and 100.');
      clean.vpToWin = vp;
    }
    const expansion = options.expansion;
    if (expansion !== undefined) clean.expansion = expansion as 'strongholds';
    const tide = options.tidelands;
    if (tide !== undefined) clean.tidelands = tide as string;
    const high = options.highlands;
    if (high !== undefined) clean.highlands = high as 'variable' | 'starter';
    const problem = optionsProblem(clean, playerCount);
    if (problem) throwErr('BAD_MESSAGE', problem);
    out.options = clean;
  }
  return out;
}

function parseJoinRoom(msg: Record<string, unknown>, reqId?: string): ClientMsg {
  const code = msg.code;
  if (!isStr(code) || !CODE_RE.test(code))
    throwErr('BAD_CODE', 'The room code must be 5 characters (A-Z0-9 without O, 0, I, 1).');
  return { type: 'joinRoom', code, reqId };
}

/**
 * Max nesting depth check on the raw text (docs/PROTOCOL.md / security review #8): a
 * deeply nested 64 KB payload can make downstream JSON work throw. Scans the text once,
 * tracking string state, so no recursion is involved.
 */
export function jsonDepthWithinLimit(text: string, maxDepth = MAX_JSON_DEPTH): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') {
      depth++;
      if (depth > maxDepth) return false;
    } else if (ch === '}' || ch === ']') {
      depth--;
    }
  }
  return true;
}

/**
 * Runtime validation of one raw text frame. Rejects anything that is not a well-formed
 * message of a known type with bounded fields; unknown extra fields are ignored and every
 * action payload is re-validated by the engine anyway.
 */
export function parseClientMessage(text: string): ParseResult {
  if (!jsonDepthWithinLimit(text)) {
    return { ok: false, code: 'BAD_MESSAGE', message: 'The message is nested too deeply.' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: 'BAD_MESSAGE', message: 'The message is not valid JSON.' };
  }
  if (!isPlainObj(raw)) return { ok: false, code: 'BAD_MESSAGE', message: 'The message must be a JSON object.' };
  let reqId: string | undefined;
  try {
    reqId = checkReqId(raw);
  } catch {
    return { ok: false, ...badReqId() };
  }
  try {
    switch (raw.type) {
      case 'hello':
        return { ok: true, msg: parseHello(raw, reqId) };
      case 'createRoom':
        return { ok: true, msg: parseCreateRoom(raw, reqId) };
      case 'joinRoom':
        return { ok: true, msg: parseJoinRoom(raw, reqId) };
      case 'leaveRoom':
        return { ok: true, msg: { type: 'leaveRoom', reqId } };
      case 'setReady': {
        const ready = raw.ready;
        if (typeof ready !== 'boolean')
          return { ok: false, code: 'BAD_MESSAGE', message: 'setReady needs a boolean ready field.' };
        return { ok: true, msg: { type: 'setReady', ready, reqId } };
      }
      case 'startGame':
        return { ok: true, msg: { type: 'startGame', reqId } };
      case 'kick': {
        const seat = raw.seat;
        if (!isStr(seat) || !/^p[1-6]$/.test(seat))
          return { ok: false, code: 'BAD_MESSAGE', message: 'kick needs a seat like "p3".' };
        return { ok: true, msg: { type: 'kick', seat, reqId } };
      }
      case 'addBot': {
        const level = raw.level;
        if (!isBotLevel(level))
          return { ok: false, code: 'BAD_MESSAGE', message: 'addBot needs a level: easy, normal or hard.' };
        return { ok: true, msg: { type: 'addBot', level, reqId } };
      }
      case 'setAvatar': {
        const avatar = raw.avatar;
        if (avatar !== null && !isAvatar(avatar))
          return { ok: false, code: 'BAD_MESSAGE', message: `setAvatar needs an avatar: ${AVATARS.join(', ')} or null.` };
        return { ok: true, msg: { type: 'setAvatar', avatar, reqId } };
      }
      case 'chat': {
        const text = raw.text;
        if (!isStr(text)) return { ok: false, code: 'BAD_MESSAGE', message: 'chat needs a text string.' };
        const trimmed = text.trim();
        if (trimmed.length < 1 || trimmed.length > CHAT_MAX_LEN)
          return { ok: false, code: 'BAD_CHAT', message: `A chat line must be 1 to ${CHAT_MAX_LEN} characters long.` };
        if (CONTROL.test(trimmed))
          return { ok: false, code: 'BAD_CHAT', message: 'A chat line must not contain control characters.' };
        return { ok: true, msg: { type: 'chat', text: trimmed, reqId } };
      }
      case 'setAfk': {
        const afk = raw.afk;
        if (typeof afk !== 'boolean')
          return { ok: false, code: 'BAD_MESSAGE', message: 'setAfk needs a boolean afk field.' };
        return { ok: true, msg: { type: 'setAfk', afk, reqId } };
      }
      case 'action': {
        const action = raw.action;
        if (!isPlainObj(action) || !isStr(action.t) || action.t.length === 0 || action.t.length > 64)
          return { ok: false, code: 'BAD_MESSAGE', message: 'action must be an object with a t field.' };
        return { ok: true, msg: { type: 'action', action: action as Action, reqId } };
      }
      case 'requestState':
        return { ok: true, msg: { type: 'requestState', reqId } };
      default:
        return { ok: false, code: 'UNKNOWN_TYPE', message: `Unknown message type ${String(raw.type)}.` };
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code ?? 'BAD_MESSAGE', message: err.message ?? 'Invalid message.' };
  }
}

function throwErr(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}
