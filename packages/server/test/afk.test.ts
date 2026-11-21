// Away mode (setAfk): a stand-in 'normal' bot plays a human seat until its owner takes it back.
// Everyone in the room is told (afk notice + seat flag), the owner's own actions are refused
// meanwhile, and the flag survives in the persisted room.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decide, type Action, type PlayerView } from '@hexgame/engine';
import { startServer, type ServerHandle } from '../src/main';
import type { ServerMsg } from '../src/protocol';
import { connect, lastOf, startRoom, type Player, type RoomMsg, type StateMsg } from './helpers';

type AfkMsg = Extract<ServerMsg, { type: 'afk' }>;

let server: ServerHandle | undefined;
let players: Player[] = [];
let dataDir = '';

async function boot(hub: Record<string, number> = {}): Promise<string> {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-rooms-'));
  server = await startServer({
    port: 0,
    clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
    dataDir,
    hub: { botDelayMs: 0, ...hub },
  });
  return `ws://127.0.0.1:${server.port}/ws`;
}

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server?.close();
  server = undefined;
});

const afkFor = (p: Player, afk: boolean) =>
  p.client.next((m) => m.type === 'afk' && m.afk === afk) as Promise<AfkMsg>;

describe('away mode (setAfk)', () => {
  it('is refused outside a running game', async () => {
    const url = await boot();
    const host = await connect(url, 'host');
    players = [host];
    host.client.send({ type: 'setAfk', afk: true });
    await host.client.error('NOT_IN_ROOM');
    host.client.send({ type: 'createRoom', playerCount: 3 });
    await host.client.next((m) => m.type === 'room');
    host.client.send({ type: 'setAfk', afk: true });
    await host.client.error('NOT_IN_GAME');
    host.client.send({ type: 'setAfk', afk: 'yes' });
    await host.client.error('BAD_MESSAGE');
  });

  it('a stand-in bot plays the seat, everyone is told, and the owner takes it back', async () => {
    const url = await boot();
    players = await startRoom(url, 3);
    // The seat that opens the setup round (random) goes away.
    const states = players.map((p) => lastOf(p.client.inbox.filter((x) => x.msg.type === 'state')).msg as StateMsg);
    const i = states.findIndex((st) => st.legal.length > 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const me = players[i];
    const seat = `p${i + 1}`;
    const next = players[(i + 1) % 3];
    const nextSeat = `p${((i + 1) % 3) + 1}`;
    const myMove = states[i].legal[0];

    me.client.send({ type: 'setAfk', afk: true });
    // Every player (the owner too) gets the notice, and the seat carries the flag.
    for (const p of players) {
      expect(await afkFor(p, true)).toMatchObject({ seat, name: `player-${i + 1}`, afk: true });
      const room = (await p.client.next((m) => m.type === 'room' && m.seats[i].afk === true)) as RoomMsg;
      expect(room.seats[i]).toMatchObject({ seat, connected: true });
      expect(room.seats[i].bot).toBeUndefined();
    }
    // The owner cannot move while the bot plays.
    me.client.send({ type: 'action', action: myMove });
    await me.client.error('AFK_ACTIVE');

    // The stand-in bot plays the setup (settlement + road), then it is the next seat's turn.
    const nextTurn = (await next.client.next(
      (m) => m.type === 'state' && (m.legal as { player?: string }[]).some((a) => a.player === nextSeat),
      10_000,
    )) as StateMsg;
    expect(nextTurn.seq).toBeGreaterThanOrEqual(2);
    // Persisted for a server restart.
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, fs.readdirSync(dataDir)[0]), 'utf8'));
    expect(saved.seats[i].afk).toBe(true);

    me.client.send({ type: 'setAfk', afk: false });
    for (const p of players) {
      expect(await afkFor(p, false)).toMatchObject({ seat, afk: false });
      await p.client.next((m) => m.type === 'room' && !m.seats[i].afk);
    }
    // Repeating the same switch is a no-op resync, not a second notice.
    me.client.send({ type: 'setAfk', afk: false });
    await me.client.next((m) => m.type === 'room' && !m.seats[i].afk);
    expect(next.client.inbox.filter((x) => x.msg.type === 'afk')).toHaveLength(2);
  }, 20_000);

  it("a bot holds back its answer to an offer until the other human answered or the delay ran out", async () => {
    const DELAY = 1500;
    const url = await boot({ botRespondDelayMs: DELAY, botTradeWaitMs: 300 });
    players = await startRoom(url, 3);
    const [p1, p2, p3] = players;
    // p2 and p3 are away during the setup, so only p1 has to be driven here.
    p2.client.send({ type: 'setAfk', afk: true });
    p3.client.send({ type: 'setAfk', afk: true });
    await p1.client.next((m) => m.type === 'room' && !!m.seats[1].afk && !!m.seats[2].afk);
    const lastState = (p: Player) => lastOf(p.client.inbox.filter((x) => x.msg.type === 'state')).msg as StateMsg;

    // Drive p1 until it may offer a trade that p2 could accept.
    let offer: Action | undefined;
    let pendingFrom = -1;
    const deadline = Date.now() + 30_000;
    let seen = -1;
    while (!offer && Date.now() < deadline) {
      // Act on the latest state; wait for a newer one only once this one was handled.
      if (lastState(p1).seq === seen) await p1.client.state(10_000);
      const last = lastState(p1);
      seen = last.seq;
      const view = last.view as PlayerView;
      const legal = last.legal as Action[];
      if (pendingFrom >= 0) {
        if (!view.log.some((l) => l.seq >= pendingFrom && l.action.player === 'p1')) continue;
        pendingFrom = -1;
      }
      if (!view.trade && legal.some((a) => a.t === 'offerTrade')) {
        const mine = view.players.find((p) => p.id === 'p1')!.hand ?? {};
        const theirs = (lastState(p2).view as PlayerView).players.find((p) => p.id === 'p2')!.hand ?? {};
        const give = Object.keys(mine).find((r) => (mine[r] ?? 0) > 0);
        const get = Object.keys(theirs).find((r) => (theirs[r] ?? 0) > 0 && r !== give);
        if (give && get) {
          offer = { t: 'offerTrade', player: 'p1', give: { [give]: 1 }, get: { [get]: 1 } } as Action;
          break;
        }
      }
      if (!legal.length) continue;
      const a = decide(view, legal, { level: 'normal' });
      if (!a) continue;
      pendingFrom = last.seq;
      await new Promise((r) => setTimeout(r, 60)); // rate limit
      p1.client.send({ type: 'action', action: a });
    }
    expect(offer).toBeDefined();
    // p2 is back at the controls (a human who could accept); p3's stand-in bot stays.
    p2.client.send({ type: 'setAfk', afk: false });
    await p1.client.next((m) => m.type === 'room' && !m.seats[1].afk);

    const p3Answer = () =>
      p1.client.next(
        (m) => m.type === 'events' && m.events.some((e) => (e as { e: string; player?: string }).e === 'tradeResponse' && (e as { player?: string }).player === 'p3'),
        10_000,
      );
    // 1) p2 does not answer: the bot answers only after the delay.
    let t0 = Date.now();
    p1.client.send({ type: 'action', action: offer });
    await p3Answer();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(DELAY - 100);

    // 2) A fresh offer that p2 answers at once: the bot no longer has anyone to wait for.
    p1.client.send({ type: 'action', action: { t: 'cancelTrade', player: 'p1' } });
    await p1.client.next((m) => m.type === 'events' && m.events.some((e) => (e as { e: string }).e === 'tradeCancelled'));
    t0 = Date.now();
    p1.client.send({ type: 'action', action: offer });
    await p2.client.next((m) => m.type === 'events' && m.events.some((e) => (e as { e: string }).e === 'tradeOffered'));
    p2.client.send({ type: 'action', action: { t: 'respondTrade', player: 'p2', accept: false } });
    await p3Answer();
    expect(Date.now() - t0).toBeLessThan(DELAY - 300);
  }, 60_000);
});
