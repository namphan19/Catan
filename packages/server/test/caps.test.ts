// Connection caps (security review #3/#5): the upgrade handler rejects excess
// connections with HTTP 503 - 200 total and 10 per IP per docs/PROTOCOL.md.
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type ServerHandle } from '../src/main';
import { connect, type Player } from './helpers';

let server: ServerHandle;
let url: string;
let players: Player[] = [];

beforeEach(async () => {
  server = await startServer({
    port: 0,
    clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-caps-')),
  });
  url = `ws://127.0.0.1:${server.port}/ws`;
});

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server.close();
});

/** Raw HTTP upgrade request; resolves with the HTTP status the server answered with. */
function upgradeStatus(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/ws',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('response', (res) => {
      resolve(res.statusCode ?? 0);
      res.destroy();
      req.destroy();
    });
    req.on('upgrade', () => {
      req.destroy();
      reject(new Error('unexpected successful upgrade'));
    });
    req.on('error', (e) => reject(e));
    req.end();
  });
}

describe('connection caps', () => {
  it('answers excess upgrades with HTTP 503 (global cap)', async () => {
    // Shrink the cap for the test; the handler logic is identical.
    const capped = await startServer({ port: 0, maxConnections: 2 });
    try {
      const a = await connect(`ws://127.0.0.1:${capped.port}/ws`, 'one');
      const b = await connect(`ws://127.0.0.1:${capped.port}/ws`, 'two');
      expect(await upgradeStatus(capped.port)).toBe(503);
      // After one disconnects, a new connection is accepted again.
      a.client.close();
      await new Promise((r) => setTimeout(r, 100));
      const c = await connect(`ws://127.0.0.1:${capped.port}/ws`, 'three');
      // b and c now hold the two slots: over the cap again.
      expect(await upgradeStatus(capped.port)).toBe(503);
      for (const p of [b, c]) p.client.close();
    } finally {
      await capped.close();
    }
  });

  it('answers excess upgrades with HTTP 503 (per-IP cap)', async () => {
    // All test clients come from 127.0.0.1, so a per-IP cap of 2 is hit by the third.
    const capped = await startServer({ port: 0, maxConnectionsPerIp: 2 });
    try {
      const a = await connect(`ws://127.0.0.1:${capped.port}/ws`, 'one');
      const b = await connect(`ws://127.0.0.1:${capped.port}/ws`, 'two');
      expect(await upgradeStatus(capped.port)).toBe(503);
      // The earlier connections are unaffected.
      a.client.send({ type: 'requestState' });
      await a.client.error('NOT_IN_ROOM');
      for (const p of [a, b]) p.client.close();
    } finally {
      await capped.close();
    }
  });
});
