// End-to-end: three ws clients play a scripted full game by choosing legal actions until a
// winner. vpToWin is lowered so the game finishes well within the time budget.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shutdown, start, startRoom, type Player } from './helpers';

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

type AnyAction = { t: string; player: string; [k: string]: unknown };
type StateMsg = Extract<(typeof players)[number]['client']['inbox'][number]['msg'], { type: 'state' }>;

// Same weighting idea as the engine fuzzer: prefer building, allow dice/cards, rare trades.
const WEIGHTS: Record<string, number> = {
  buildCity: 60, placeSettlement: 60, placeRoad: 8, buyCard: 12, playCard: 10, bankTrade: 4,
  offerTrade: 0.3, respondTrade: 3, confirmTrade: 5, cancelTrade: 1, endTurn: 3, roll: 2,
  discard: 2, moveBlocker: 2, steal: 2,
};

function pick(legal: AnyAction[], rng: () => number): AnyAction {
  let total = 0;
  const w = legal.map((a) => (total += WEIGHTS[a.t] ?? 1));
  let target = rng() * total;
  for (let i = 0; i < legal.length; i++) {
    target -= w[i];
    if (target <= 0) return legal[i];
  }
  return legal[legal.length - 1];
}

// Deterministic-ish prng per client name.
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('full game', () => {
  it('three clients play a complete game to a winner through the server', async () => {
    players = await startRoom(url, 3, { vpToWin: 3 });
    const deadline = Date.now() + 50_000;
    const actedSeq = new Map(players.map((p) => [p.name, -1]));
    const rngs = players.map((_, i) => prng(1000 + i));
    let actions = 0;
    let winner: string | undefined;

    const latestState = (p: Player): StateMsg | undefined => {
      for (let i = p.client.inbox.length - 1; i >= 0; i--) {
        if (p.client.inbox[i].msg.type === 'state') return p.client.inbox[i].msg as StateMsg;
      }
      return undefined;
    };

    // One driver that mirrors the engine fuzzer's proven policy: each step pools the legal
    // actions of every seat at the current seq, picks one weighted, and sends it through the
    // connection that owns the seat. Per-connection pacing stays under the 20 msg/s limit.
    const lastSent = new Map(players.map((p) => [p.name, 0]));
    let lastActedSeq = -1;
    const maxSeq = (): number => Math.max(...players.map((p) => latestState(p)?.seq ?? -1));

    while (Date.now() < deadline && !winner && actions < 3000) {
      const target = maxSeq();
      const fresh = players.filter((p) => latestState(p)?.seq === target);
      if (fresh.length < players.length || target === lastActedSeq) {
        await sleep(10);
        continue;
      }
      lastActedSeq = target;
      const winView = latestState(fresh[0])?.view as { winner?: string } | undefined;
      if (winView?.winner) {
        winner = winView.winner;
        break;
      }
      const options: AnyAction[] = fresh.flatMap((p) => {
        const st = latestState(p)!;
        return st.legal as AnyAction[];
      });
      if (!options.length) continue;
      let total = 0;
      const w = options.map((a) => (total += WEIGHTS[a.t] ?? 1));
      const target2 = (rngs[0]() * total);
      let idx = w.findIndex((x) => x > target2);
      if (idx === -1) idx = options.length - 1;
      const action = options[idx];
      // Every server-sent legal action must target its own seat.
      for (const p of fresh) {
        const st = latestState(p)!;
        expect(
          st.legal.every((a) => (a as AnyAction).player === (st.view as { viewer: string }).viewer),
        ).toBe(true);
      }
      const sender = players.find((p) => action.player === (latestState(p)!.view as { viewer: string }).viewer);
      if (!sender) continue;
      const seatLast = lastSent.get(sender.name) ?? 0;
      const waitMs = 55 - (Date.now() - seatLast);
      if (waitMs > 0) await sleep(waitMs);
      lastSent.set(sender.name, Date.now());
      sender.client.send({ type: 'action', action });
      actions++;
    }

    expect(winner, `game finished (actions=${actions})`).toBeDefined();
    // Every client saw the win in its redacted view and the log is consistent.
    for (const p of players) {
      const state = latestState(p)!;
      const view = state.view as { winner?: string; phase: { k: string }; players: { id: string; hand?: unknown; publicVP: number; vp?: number }[] };
      expect(view.phase.k).toBe('over');
      expect(view.winner).toBe(winner);
      // All hands revealed after the game ends, and the winner met the lowered VP target.
      const win = view.players.find((pl) => pl.id === winner)!;
      expect(win.hand).toBeDefined();
      // Hidden relics count towards the win target, so use the full (non-public) VP
      // that the view reveals for everyone once the game is over.
      expect(win.vp).toBeGreaterThanOrEqual(3);
    }
    console.log(`full game: ${actions} client actions, winner ${winner}`);
  }, 60_000);
});
