// Wire types for the online client — an exact mirror of packages/server/src/protocol.ts
// (docs/PROTOCOL.md). Type-only copy: the client must never import server runtime code.
// reqId is added by net/connection.ts per request.

/** Room options accepted from the client; passed through to createGame. */
export interface RoomOptions {
  largeTableMode?: 'paired' | 'extraBuild';
  vpToWin?: number;
  expansion?: 'strongholds';
}

export type BotLevel = 'easy' | 'normal' | 'hard' | 'expert';
export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard', 'expert'];
/** Level of the stand-in bot for an away player (server: AFK_BOT_LEVEL). */
export const AFK_BOT_LEVEL: BotLevel = 'normal';

/** Client -> server. */
export type OutMsg =
  | { type: 'hello'; name: string; sessionToken?: string }
  | { type: 'createRoom'; playerCount: number; options?: RoomOptions }
  | { type: 'joinRoom'; code: string }
  | { type: 'leaveRoom' }
  | { type: 'setReady'; ready: boolean }
  | { type: 'startGame' }
  | { type: 'kick'; seat: string }
  | { type: 'addBot'; level: BotLevel }
  /** Running game only: a stand-in bot plays my seat while I am away (afk: true), or I take it back. */
  | { type: 'setAfk'; afk: boolean }
  | { type: 'action'; action: unknown }
  | { type: 'requestState' };

/** Server -> client. Only redacted data ever leaves the server. */
export type ServerMsg =
  | { type: 'welcome'; sessionToken: string; name: string }
  | {
      type: 'room';
      code: string;
      hostSeat: string;
      playerCount: number;
      options: RoomOptions;
      seats: { seat: string; name: string; connected: boolean; ready: boolean; bot?: BotLevel; afk?: boolean }[];
      you: string | null;
      started: boolean;
    }
  | { type: 'state'; view: unknown; legal: unknown[]; seq: number }
  | { type: 'events'; events: unknown[]; seq: number }
  /** A seat was handed to its stand-in bot (afk) or taken back - shown to everyone as a popup. */
  | { type: 'afk'; seat: string; name: string; afk: boolean }
  | { type: 'error'; reqId?: string; code: string; message: string };

export interface RoomSeat {
  seat: string;
  name: string;
  connected: boolean;
  ready: boolean;
  /** Server-side bot seat and its level. */
  bot?: BotLevel;
  /** A human seat currently played by its stand-in bot (the owner is away). */
  afk?: boolean;
}

/** The `room` message payload, in a friendlier shape. */
export interface RoomInfo {
  code: string;
  hostSeat: string;
  playerCount: number;
  options: RoomOptions;
  seats: RoomSeat[];
  /** My seat id ("p1"...) or null. */
  you: string | null;
  started: boolean;
}

/** 5 chars, A-Z0-9 without O/0/I/1 — same alphabet as the server (CODE_RE). */
export const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
