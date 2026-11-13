// Protocol contract (docs/PROTOCOL.md): message shapes plus runtime validation of every
// incoming field. The server never trusts a client field without passing it through here.
import type { Action } from '@hexgame/engine';

/** Room options accepted from the client; bounded and passed to createGame. */
export interface RoomOptions {
  largeTableMode?: 'paired' | 'extraBuild';
  vpToWin?: number;
}

/** Client -> server. `reqId` is echoed back on error replies. */
export type ClientMsg =
  | { type: 'hello'; name: string; sessionToken?: string; reqId?: string }
  | { type: 'createRoom'; playerCount: number; options?: RoomOptions; reqId?: string }
  | { type: 'joinRoom'; code: string; reqId?: string }
  | { type: 'leaveRoom'; reqId?: string }
  | { type: 'setReady'; ready: boolean; reqId?: string }
  | { type: 'startGame'; reqId?: string }
  | { type: 'kick'; seat: string; reqId?: string }
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
      seats: { seat: string; name: string; connected: boolean; ready: boolean }[];
      you: string | null;
      started: boolean;
    }
  | { type: 'state'; view: unknown; legal: unknown[]; seq: number }
  | { type: 'events'; events: unknown[]; seq: number }
  | { type: 'error'; reqId?: string; code: string; message: string };

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
  if (typeof playerCount !== 'number' || !Number.isInteger(playerCount) || playerCount < 3 || playerCount > 6)
    throwErr('BAD_MESSAGE', 'playerCount must be an integer between 3 and 6.');
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
      if (mode !== 'paired' && mode !== 'extraBuild')
        throwErr('BAD_MESSAGE', "options.largeTableMode must be 'paired' or 'extraBuild'.");
      clean.largeTableMode = mode;
    }
    const vp = options.vpToWin;
    if (vp !== undefined) {
      if (typeof vp !== 'number' || !Number.isInteger(vp) || vp < 1 || vp > 100)
        throwErr('BAD_MESSAGE', 'options.vpToWin must be an integer between 1 and 100.');
      clean.vpToWin = vp;
    }
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
