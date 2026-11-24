// Persistence validation (security review #6): corrupt or malformed room files are skipped
// on load; a tampered `code` can never become a path-traversal write.
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createGame } from '@hexgame/engine';
import { describe, expect, it } from 'vitest';
import { Hub } from '../src/rooms';
import { RoomStore, type PersistedRoom } from '../src/store';
import type { RoomOptions } from '../src/protocol';
import type { ServerMsg } from '../src/protocol';

const HASH = 'a'.repeat(64); // shape of a SHA-256 hex digest

function validRoom(overrides: Partial<PersistedRoom> = {}): PersistedRoom {
  const state = createGame({ seed: 'seed-1', playerCount: 3 });
  return {
    code: 'ABCDE',
    hostSeat: 'p1',
    playerCount: 3,
    options: {},
    seats: [
      { name: 'alice', tokenHash: HASH },
      { name: 'bob', tokenHash: 'b'.repeat(64) },
      { name: 'carol', tokenHash: 'c'.repeat(64) },
    ],
    init: state.init,
    actions: [],
    ...overrides,
  };
}

function write(dir: string, name: string, content: unknown): void {
  fs.writeFileSync(
    path.join(dir, name),
    typeof content === 'string' ? content : JSON.stringify(content),
  );
}

function fakeConn(hub: Hub): { conn: import('../src/rooms').Conn; sent: ServerMsg[] } {
  const sent: ServerMsg[] = [];
  const conn = {
    id: hub.newConnId(),
    send: (m: ServerMsg) => sent.push(m),
    close: () => undefined,
  };
  hub.attach(conn);
  return { conn, sent };
}

describe('RoomStore.loadAll validation', () => {
  it('loads a valid room file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-store-'));
    try {
      write(dir, 'ABCDE.json', validRoom());
      const duo = createGame({ seed: 'seed-2', playerCount: 2 });
      write(dir, 'DUWAB.json', validRoom({ code: 'DUWAB', playerCount: 2, seats: validRoom().seats.slice(0, 2), init: duo.init }));
      const store = new RoomStore(dir);
      expect(store.loadAll()).toHaveLength(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips corrupt JSON and every malformed shape', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-store2-'));
    try {
      write(dir, 'notjson.json', 'this is { not json');
      write(dir, 'traversal.json', validRoom({ code: '../evil' }));
      write(dir, 'fewplayers.json', validRoom({ playerCount: 1, seats: validRoom().seats.slice(0, 1) }));
      write(dir, 'toomany.json', validRoom({ playerCount: 7, seats: [...validRoom().seats] }));
      write(dir, 'seatmismatch.json', validRoom({ seats: validRoom().seats.slice(0, 2) }));
      write(dir, 'badhash.json', validRoom({ seats: validRoom().seats.map((s) => ({ ...s, tokenHash: 'zz' })) }));
      write(dir, 'badhost.json', validRoom({ hostSeat: 'p9' }));
      write(dir, 'badseatid.json', validRoom({ hostSeat: 'pX' }));
      write(dir, 'emptyname.json', validRoom({ seats: validRoom().seats.map((s) => ({ ...s, name: '' })) }));
      write(dir, 'badmode.json', validRoom({ options: { largeTableMode: 'chaos' } as unknown as RoomOptions }));
      write(dir, 'badvp.json', validRoom({ options: { vpToWin: 1000 } }));
      write(dir, 'noinit.json', '{ "code": "ABCDE", "playerCount": 3 }');
      // One valid file must still load among all the skipped ones.
      write(dir, 'ZZZZZ.json', validRoom({ code: 'ZZZZZ' }));
      const store = new RoomStore(dir);
      const rooms = store.loadAll();
      expect(rooms).toHaveLength(1);
      expect(rooms[0].code).toBe('ZZZZZ');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to save a room whose code is not a valid room code', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-store3-'));
    try {
      const store = new RoomStore(dir);
      expect(() => store.save(validRoom({ code: '../evil' }))).toThrow();
      // Nothing was written outside the directory.
      expect(fs.readdirSync(dir)).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Hub.restore validation', () => {
  it('restores a valid room and honours its session tokens', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-restore-'));
    try {
      const token = 'A'.repeat(22); // valid token shape; hash must match the persisted one
      const room = validRoom({
        seats: validRoom().seats.map((s, i) =>
          i === 0 ? { ...s, tokenHash: crypto.createHash('sha256').update(token, 'utf8').digest('hex') } : s,
        ),
      });
      write(dir, 'ABCDE.json', room);
      const hub = new Hub({ store: new RoomStore(dir) });
      expect(hub.restore()).toBe(1);
      const { conn, sent } = fakeConn(hub);
      hub.handleMessage(conn, JSON.stringify({ type: 'hello', name: 'alice', sessionToken: token }));
      hub.handleMessage(conn, JSON.stringify({ type: 'joinRoom', code: 'ABCDE' }));
      const roomMsg = sent.find((m) => m.type === 'room') as Extract<ServerMsg, { type: 'room' }>;
      expect(roomMsg.you).toBe('p1');
      expect(roomMsg.started).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips invalid room files without creating rooms', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-restore2-'));
    try {
      write(dir, 'traversal.json', validRoom({ code: '../evil' }));
      write(dir, 'badcount.json', validRoom({ playerCount: 1, seats: validRoom().seats.slice(0, 1) }));
      const hub = new Hub({ store: new RoomStore(dir) });
      expect(hub.restore()).toBe(0);
      const { conn, sent } = fakeConn(hub);
      hub.handleMessage(conn, JSON.stringify({ type: 'hello', name: 'probe' }));
      hub.handleMessage(conn, JSON.stringify({ type: 'joinRoom', code: 'ABCDE' }));
      expect((sent.at(-1) as Extract<ServerMsg, { type: 'error' }>).code).toBe('NO_SUCH_ROOM');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
