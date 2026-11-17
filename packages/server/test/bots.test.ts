// Server-side bot seats: lobby rules for addBot, and a full game of one human (driven by the
// engine's decide() over its own redacted view) against two bots through a real ws server.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decide, type Action, type PlayerView } from '@hexgame/engine';
import { startServer, type ServerHandle } from '../src/main';
import { connect, type Player, type RoomMsg, type StateMsg } from './helpers';

let server: ServerHandle | undefined;
let players: Player[] = [];

async function boot(): Promise<string> {
  server = await startServer({
    port: 0,
    clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-rooms-')),
    hub: { botDelayMs: 0, botTradeWaitMs: 1000, botThinkMs: 40 },
  });
  return `ws://127.0.0.1:${server.port}/ws`;
}

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server?.close();
  server = undefined;
});

const roomWith = (p: Player, test: (m: RoomMsg) => boolean) =>
  p.client.next((m) => m.type === 'room' && test(m)) as Promise<RoomMsg>;

describe('bot seats', () => {
  it('only the host adds bots, in the lobby, into free seats', async () => {
    const url = await boot();
    const host = await connect(url, 'host');
    const guest = await connect(url, 'guest');
    players = [host, guest];
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const room = await roomWith(host, () => true);
    guest.client.send({ type: 'joinRoom', code: room.code });
    await roomWith(guest, (m) => m.seats.length === 2);

    guest.client.send({ type: 'addBot', level: 'hard' });
    await guest.client.error('NOT_HOST');
    host.client.send({ type: 'addBot', level: 'nightmare' });
    await host.client.error('BAD_MESSAGE');

    host.client.send({ type: 'addBot', level: 'hard' });
    const full = await roomWith(host, (m) => m.seats.length === 3);
    expect(full.seats[2]).toMatchObject({ seat: 'p3', bot: 'hard', ready: true, connected: true });
    host.client.send({ type: 'addBot', level: 'easy' });
    await host.client.error('ROOM_FULL');

    // Kicking a bot frees the seat again.
    host.client.send({ type: 'kick', seat: 'p3' });
    await roomWith(host, (m) => m.seats.length === 2);
  });

  it.each([
    ['hard', 'normal'],
    ['expert', 'hard'],
  ])('one human plays a full game against a %s and a %s bot', async (b1, b2) => {
    const url = await boot();
    const human = await connect(url, 'human');
    players = [human];
    human.client.send({ type: 'createRoom', playerCount: 3, options: { vpToWin: 6 } });
    await roomWith(human, () => true);
    human.client.send({ type: 'addBot', level: b1 });
    human.client.send({ type: 'addBot', level: b2 });
    await roomWith(human, (m) => m.seats.length === 3);
    human.client.send({ type: 'setReady', ready: true });
    await roomWith(human, (m) => m.seats.every((s) => s.ready));
    human.client.send({ type: 'startGame' });

    const deadline = Date.now() + 50_000;
    // Like a real client: after sending a move, wait until it shows up in the log (bots may move
    // in between, so a newer state alone does not mean the move was applied).
    let pendingFrom = -1;
    let humanMoves = 0;
    let winner: string | undefined;
    while (Date.now() < deadline) {
      const got = await human.client.state(10_000).catch(() => undefined);
      if (!got) break;
      const states = human.client.inbox.filter((x) => x.msg.type === 'state');
      const last = states[states.length - 1].msg as StateMsg;
      const view = last.view as PlayerView;
      if (view.winner) {
        winner = view.winner;
        break;
      }
      if (pendingFrom >= 0) {
        if (!view.log.some((l) => l.seq >= pendingFrom && l.action.player === view.viewer)) continue;
        pendingFrom = -1;
      }
      if (!last.legal.length) continue;
      const a = decide(view, last.legal as Action[], { level: 'normal' });
      if (!a) continue;
      pendingFrom = last.seq;
      humanMoves++;
      await new Promise((r) => setTimeout(r, 60)); // stay under the 20 messages/s rate limit
      human.client.send({ type: 'action', action: a });
    }
    expect(human.client.inbox.filter((x) => x.msg.type === 'error').map((x) => x.raw)).toEqual([]);
    expect(winner).toBeDefined();
    expect(humanMoves).toBeGreaterThan(10);
  }, 60_000);
});
