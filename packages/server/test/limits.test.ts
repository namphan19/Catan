// Transport limits: rate limiting and oversized frames (docs/PROTOCOL.md).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shutdown, start, connect, TestClient, type Player } from './helpers';

let url: string;
let server: import('../src/main').ServerHandle;
let players: Player[] = [];

beforeEach(async () => {
  const s = await start();
  server = s.server;
  url = s.url;
});

afterEach(async () => {
  await shutdown(server, players);
  players = [];
});

describe('limits', () => {
  it('rate limits to 20 messages per second with RATE_LIMIT errors', async () => {
    const p = await connect(url, 'flooder');
    players = [p];
    // 25 messages in one second: the first 20 are fine, the rest get RATE_LIMIT.
    for (let i = 0; i < 25; i++) p.client.send({ type: 'hello', name: 'flooder', reqId: `r${i}` });
    const limited = await p.client.error('RATE_LIMIT');
    // The frame was dropped before parsing, so the reply cannot echo its reqId (optional per protocol).
    expect(limited.code).toBe('RATE_LIMIT');
    // The connection is still open and usable afterwards.
    await new Promise((r) => setTimeout(r, 1100));
    p.client.send({ type: 'requestState', reqId: 'after' });
    const err = await p.client.error('NOT_IN_ROOM');
    expect(err.reqId).toBe('after');
  });

  it('closes the connection after 100 excess messages in a row', async () => {
    const p = await connect(url, 'flooder2');
    players = [p];
    const closed = p.client.closeEvent();
    // 20 allowed + 100 excess -> the 121st message in the window triggers the close.
    for (let i = 0; i < 121; i++) p.client.send({ type: 'hello', name: 'f' });
    const { code } = await closed;
    expect(code).toBe(1008);
  });

  it('closes with 1009 on an oversized frame', async () => {
    const p = await connect(url, 'bigframe');
    players = [p];
    const closed = p.client.closeEvent();
    p.client.send({ type: 'hello', name: 'x'.repeat(70 * 1024) });
    const { code } = await closed;
    expect(code).toBe(1009);
  });
});
