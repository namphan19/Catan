// Reconnect: same sessionToken restores the seat, and a full server restart restores the
// running game from disk via replay().
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type ServerHandle } from '../src/main';
import { connect, startRoom, type Player, type RoomMsg, type StateMsg } from './helpers';

let url: string;
let server: ServerHandle;
let players: Player[] = [];
let dataDir: string;

function lastMsg(p: Player, type: 'room' | 'state'): RoomMsg | StateMsg {
  const found = p.client.inbox.filter((x) => x.msg.type === type).pop();
  if (!found) throw new Error(`no ${type} message for ${p.name}`);
  return found.msg as RoomMsg | StateMsg;
}

/** Wait until the client's inbox holds a `state` with the given seq (scans the whole inbox). */
async function waitForSeq(p: Player, seq: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = p.client.inbox.some((x) => x.msg.type === 'state' && x.msg.seq === seq);
    if (found) return;
    if (Date.now() > deadline) throw new Error(`no state with seq ${seq} for ${p.name}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-reconnect-'));
  server = await startServer({
    port: 0,
    clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
    dataDir,
  });
  url = `ws://127.0.0.1:${server.port}/ws`;
});

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server.close();
});

describe('reconnect', () => {
  it('restores the seat and state with the session token after a drop', async () => {
    players = await startRoom(url, 3);
    const code = (lastMsg(players[1], 'room') as RoomMsg).code;
    const before = lastMsg(players[0], 'state') as StateMsg;
    const token = players[0].token;

    // Simulate a network drop: close the socket and reconnect with the same token.
    players[0].client.close();
    const reconnected = await connect(url, 'player-1', token);
    players[0] = reconnected;
    reconnected.client.send({ type: 'joinRoom', code });
    const room = (await reconnected.client.next((m) => m.type === 'room' && m.you === 'p1')) as RoomMsg;
    expect(room.you).toBe('p1');
    expect(room.started).toBe(true);
    expect(room.seats.find((s) => s.seat === 'p1')?.connected).toBe(true);
    // State restored: same log length, own hand visible.
    const state = await reconnected.client.state();
    expect(state.seq).toBe(before.seq);
    const view = state.view as { viewer: string; players: { id: string; hand?: unknown }[] };
    expect(view.viewer).toBe('p1');
    expect(view.players.find((pl) => pl.id === 'p1')?.hand).toBeDefined();
    reconnected.client.close();
  });

  it('a server restart restores the game from disk and reconnects players', async () => {
    players = await startRoom(url, 3);
    const code = (lastMsg(players[1], 'room') as RoomMsg).code;
    const tokens = players.map((p) => p.token);
    // One legal setup action (by the current player) so the persisted log is non-empty.
    const actor = players.find(
      (p) => (lastMsg(p, 'state') as StateMsg).legal.length > 0,
    );
    if (!actor) throw new Error('no player with legal actions after start');
    const legal = (lastMsg(actor, 'state') as StateMsg).legal[0] as { t: string; player: string };
    actor.client.send({ type: 'action', action: legal });
    await actor.client.state();
    const seqBefore = (lastMsg(actor, 'state') as StateMsg).seq;
    expect(seqBefore).toBeGreaterThan(0); // persisted after the action
    // Legal-action counts per seat right before the restart (wait until every client
    // has caught up to seqBefore so the comparison is race-free).
    for (const p of players) await waitForSeq(p, seqBefore);
    const countsBefore = players.map(
      (p) => (lastMsg(p, 'state') as StateMsg).legal.length,
    );

    for (const p of players) p.client.close();
    await server.close();

    // A fresh server instance on the same DATA_DIR restores the room via replay().
    server = await startServer({
      port: 0,
      clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
      dataDir,
    });
    url = `ws://127.0.0.1:${server.port}/ws`;
    // Every seat reconnects with its token and gets the same state back.
    const backs: Player[] = [];
    for (let i = 0; i < players.length; i++) {
      const back = await connect(url, players[i].name, tokens[i]);
      back.client.send({ type: 'joinRoom', code });
      const room = (await back.client.next((m) => m.type === 'room' && m.you === `p${i + 1}`)) as RoomMsg;
      expect(room.started).toBe(true);
      const state = await back.client.state();
      expect(state.seq).toBe(seqBefore);
      const view = state.view as { phase: { k: string } };
      expect(view.phase.k).toBe('setup');
      backs.push(back);
    }
    // Replay is faithful: the same seat(s) have legal actions as before the restart.
    const countsAfter = backs.map(
      (b) => (lastMsg(b, 'state') as StateMsg).legal.length,
    );
    expect(countsAfter).toEqual(countsBefore);
    expect(countsAfter.some((c) => c > 0)).toBe(true);
    for (const b of backs) b.client.close();
  });

  it("does not let a wrong token claim someone else's seat", async () => {
    players = await startRoom(url, 3);
    const code = (lastMsg(players[2], 'room') as RoomMsg).code;
    const impostor = await connect(url, 'impostor', 'definitely-not-a-real-token');
    impostor.client.send({ type: 'joinRoom', code });
    // Game already started and the token matches nobody -> GAME_STARTED.
    const err = await impostor.client.error('GAME_STARTED');
    expect(err.code).toBe('GAME_STARTED');
    impostor.client.close();
  });
});
