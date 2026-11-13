// Hub unit tests (no sockets): room cap and the 30-minute idle sweep.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hub, type Conn } from '../src/rooms';
import { RoomStore } from '../src/store';
import type { ServerMsg } from '../src/protocol';

function fakeConn(hub: Hub, name: string): { conn: Conn; sent: ServerMsg[] } {
  const sent: ServerMsg[] = [];
  const conn: Conn = {
    id: hub.newConnId(),
    send: (m) => sent.push(m),
    close: () => undefined,
  };
  hub.attach(conn);
  hub.handleMessage(conn, JSON.stringify({ type: 'hello', name }));
  return { conn, sent };
}

describe('hub', () => {
  it('caps concurrent rooms at 50', () => {
    const hub = new Hub();
    for (let i = 0; i < 50; i++) {
      const { conn, sent } = fakeConn(hub, `p${i}`);
      hub.handleMessage(conn, JSON.stringify({ type: 'createRoom', playerCount: 3 }));
      expect(sent.at(-1)?.type).toBe('room');
    }
    const { conn, sent } = fakeConn(hub, 'extra');
    hub.handleMessage(conn, JSON.stringify({ type: 'createRoom', playerCount: 3 }));
    const last = sent.at(-1) as Extract<ServerMsg, { type: 'error' }>;
    expect(last.type).toBe('error');
    expect(last.code).toBe('ROOM_LIMIT');
  });

  it('deletes a room that has no connected player for the idle time', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-hub-'));
    const store = new RoomStore(dir);
    const hub = new Hub({ store, idleMs: 100 });
    const a = fakeConn(hub, 'a');
    const b = fakeConn(hub, 'b');
    hub.handleMessage(a.conn, JSON.stringify({ type: 'createRoom', playerCount: 3 }));
    const room = a.sent.at(-1) as Extract<ServerMsg, { type: 'room' }>;
    hub.handleMessage(b.conn, JSON.stringify({ type: 'joinRoom', code: room.code }));
    // Nobody connected for longer than idleMs -> gone (files are only written after start).
    a.conn.close(1000, 'test');
    hub.detach(a.conn.id);
    b.conn.close(1000, 'test');
    hub.detach(b.conn.id);
    hub.sweep(Date.now() + 1000);
    const probe = fakeConn(hub, 'probe');
    hub.handleMessage(probe.conn, JSON.stringify({ type: 'joinRoom', code: room.code }));
    const err = probe.sent.at(-1) as Extract<ServerMsg, { type: 'error' }>;
    expect(err.code).toBe('NO_SUCH_ROOM');
  });

  it('deletes persisted started rooms (file removed) after the idle time', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-hub2-'));
    const store = new RoomStore(dir);
    const hub = new Hub({ store, idleMs: 100 });
    const a = fakeConn(hub, 'a');
    const b = fakeConn(hub, 'b');
    const c = fakeConn(hub, 'c');
    hub.handleMessage(a.conn, JSON.stringify({ type: 'createRoom', playerCount: 3 }));
    const room = a.sent.at(-1) as Extract<ServerMsg, { type: 'room' }>;
    hub.handleMessage(b.conn, JSON.stringify({ type: 'joinRoom', code: room.code }));
    hub.handleMessage(c.conn, JSON.stringify({ type: 'joinRoom', code: room.code }));
    hub.handleMessage(a.conn, JSON.stringify({ type: 'setReady', ready: true }));
    hub.handleMessage(b.conn, JSON.stringify({ type: 'setReady', ready: true }));
    hub.handleMessage(c.conn, JSON.stringify({ type: 'setReady', ready: true }));
    hub.handleMessage(a.conn, JSON.stringify({ type: 'startGame' }));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(1); // persisted at start
    a.conn.close(1000, 'test');
    hub.detach(a.conn.id);
    b.conn.close(1000, 'test');
    hub.detach(b.conn.id);
    c.conn.close(1000, 'test');
    hub.detach(c.conn.id);
    hub.sweep(Date.now() + 1000);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(0);
  });
});
