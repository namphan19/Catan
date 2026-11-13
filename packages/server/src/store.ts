// Persistence (docs/PROTOCOL.md): each started room is stored as
// { code, hostSeat, playerCount, options, seats(name + SHA-256 token hash), init, actions }
// and reloaded with engine replay() on server start. Writes are atomic (temp file + rename).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Action, GameInit } from '@hexgame/engine';
import type { RoomOptions } from './protocol';

export interface PersistedSeat {
  name: string;
  tokenHash: string;
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
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof r.code === 'string' &&
    typeof r.hostSeat === 'string' &&
    typeof r.playerCount === 'number' &&
    Array.isArray(r.seats) &&
    r.seats.every((s) => s && typeof s.name === 'string' && typeof s.tokenHash === 'string') &&
    r.init !== null &&
    typeof r.init === 'object' &&
    typeof r.init.seed === 'string' &&
    Array.isArray(r.actions)
  );
}
