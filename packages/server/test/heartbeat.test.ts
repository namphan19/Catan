// Heartbeat (docs/PROTOCOL.md, review "missing tests"): the server pings every 20 s and
// closes connections that have not ponged for 60 s. Uses vitest fake timers so the test
// stays instant; sockets run on real IO (only timers/Date are faked).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type ServerHandle } from '../src/main';
import { connect, TestClient, type Player } from './helpers';

let server: ServerHandle;
let players: Player[] = [];

beforeEach(async () => {
  // Fake only timers and Date: socket IO keeps working through real setImmediate/IO.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  server = await startServer({
    port: 0,
    clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-beat-')),
  });
});

afterEach(async () => {
  vi.useRealTimers();
  for (const p of players) p.client.close();
  players = [];
  await server.close();
});

/**
 * Advance the faked clock in ping-interval steps, letting real socket IO drain between
 * steps so pings/pongs are actually delivered (Date is frozen while faked, so pongs
 * recorded during the interludes use the current fake time).
 */
async function elapse(totalMs: number): Promise<void> {
  for (let done = 0; done < totalMs; done += 20_000) {
    vi.advanceTimersByTime(Math.min(20_000, totalMs - done));
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('heartbeat', () => {
  it('closes a connection that never pongs after the pong timeout', async () => {
    // A client that does not answer pings (autoPong: false).
    const client = new TestClient(`ws://127.0.0.1:${server.port}/ws`, { autoPong: false });
    await client.open();
    client.send({ type: 'hello', name: 'sleeper' });
    const p: Player = { client, name: 'sleeper', token: undefined };
    players = [p];
    const closed = client.closeEvent();
    // Several ping intervals elapse; the client never answers a ping.
    await elapse(90_000);
    const ev = await closed;
    expect(ev.code).toBe(1000);
    expect(ev.reason).toBe('ping timeout');
  });

  it('keeps a ponging connection alive', async () => {
    // A regular client: the ws layer answers every ping with a pong automatically.
    const p = await connect(`ws://127.0.0.1:${server.port}/ws`, 'aliver');
    players = [p];
    let closedEvent: { code: number; reason: string } | null = null;
    p.client.closeEvent().then((ev) => {
      closedEvent = ev;
    });
    await elapse(90_000);
    await new Promise((r) => setTimeout(r, 100));
    expect(closedEvent).toBeNull();
    // Still usable afterwards.
    p.client.send({ type: 'requestState' });
    await p.client.error('NOT_IN_ROOM');
  });
});
