// Persistence (docs/PROTOCOL.md): each started room is stored as
// { code, hostSeat, playerCount, options, seats(name + SHA-256 token hash), init, actions }
// and reloaded with engine replay() on server start. Writes are atomic (temp file + rename).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Action, GameInit } from '@hexgame/engine';
import { CODE_RE, isAvatar, isBotLevel, optionsProblem, type AvatarId, type BotLevelName, type RoomOptions } from './protocol';

export interface PersistedSeat {
  name: string;
  tokenHash: string;
  /** Present for server-side bot seats. */
  bot?: BotLevelName;
  /** A human seat currently played by its stand-in bot. */
  afk?: boolean;
  /** The seat's portrait (rooms saved before avatars existed have none; restore assigns one). */
  avatar?: AvatarId;
}

export interface PersistedRoom {
  code: string;
  hostSeat: string;
  playerCount: number;
  options: RoomOptions;
  seats: PersistedSeat[];
  /** Full init incl. the seed (needed for replay) - never sent to a client. */
  init: GameInit;
  actions: Action[];
}

export class RoomStore {
  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private fileFor(code: string): string {
    return path.join(this.dir, `${code}.json`);
  }

  /** Atomic write: temp file in the same directory, then rename over the target. */
  save(room: PersistedRoom): void {
    if (!CODE_RE.test(room.code)) throw new Error(`refusing to persist room code ${JSON.stringify(room.code)}`);
    const file = this.fileFor(room.code);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(room));
    fs.renameSync(tmp, file);
  }

  delete(code: string): void {
    fs.rmSync(this.fileFor(code), { force: true });
  }

  /** Load every persisted room; corrupt or malformed files are skipped with a log line. */
  loadAll(): PersistedRoom[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const rooms: PersistedRoom[] = [];
    for (const name of names) {
      if (!name.endsWith('.json') || name.endsWith('.tmp')) continue;
      const file = path.join(this.dir, name);
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedRoom;
        if (!isPersistedRoom(raw)) {
          console.error(`[store] skipping malformed room file ${name}`);
          continue;
        }
        rooms.push(raw);
      } catch (e) {
        console.error(`[store] skipping unreadable room file ${name}: ${String(e)}`);
      }
    }
    return rooms;
  }
}

function isPersistedRoom(v: unknown): v is PersistedRoom {
  const r = v as PersistedRoom;
  if (typeof v !== 'object' || v === null) return false;
  // The code reaches fileFor() on save/delete: only the strict room-code alphabet may
  // pass, so a tampered file can never cause path traversal (security review #6).
  if (typeof r.code !== 'string' || !CODE_RE.test(r.code)) return false;
  if (typeof r.hostSeat !== 'string' || !/^p[1-6]$/.test(r.hostSeat)) return false;
  if (typeof r.playerCount !== 'number' || !Number.isInteger(r.playerCount)) return false;
  if (r.playerCount < 3 || r.playerCount > 6) return false;
  if (!Array.isArray(r.seats) || r.seats.length !== r.playerCount) return false;
  if (!r.seats.every((s) => s && isPersistedSeat(s))) return false;
  if (Number(r.hostSeat.slice(1)) - 1 >= r.playerCount) return false;
  if (!isPersistedOptions(r.options)) return false;
  if (r.init === null || typeof r.init !== 'object' || typeof r.init.seed !== 'string') return false;
  return Array.isArray(r.actions);
}

function isPersistedSeat(s: PersistedSeat): boolean {
  // Names are bounded like hello names; token hashes are always SHA-256 hex.
  return (
    typeof s.name === 'string' &&
    s.name.length >= 1 &&
    s.name.length <= 24 &&
    typeof s.tokenHash === 'string' &&
    /^[0-9a-f]{64}$/.test(s.tokenHash) &&
    (s.bot === undefined || isBotLevel(s.bot)) &&
    (s.afk === undefined || typeof s.afk === 'boolean') &&
    (s.avatar === undefined || isAvatar(s.avatar))
  );
}

function isPersistedOptions(o: RoomOptions): boolean {
  if (o === null || typeof o !== 'object') return false;
  const mode = (o as RoomOptions).largeTableMode;
  if (mode !== undefined && mode !== 'paired' && mode !== 'extraBuild') return false;
  if (optionsProblem(o as RoomOptions)) return false;
  const vp = (o as RoomOptions).vpToWin;
  return vp === undefined || (typeof vp === 'number' && Number.isInteger(vp) && vp >= 1 && vp <= 100);
}
