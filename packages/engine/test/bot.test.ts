// Heuristic bot: every decision is legal, games finish for 3-6 players and with the expansion, and
// the bot clearly beats random play. Uses the arena from fuzz/botArena.ts.
import { describe, expect, it } from 'vitest';
import { applyAction, botAct, createGame, decide, getLegalActions, getPlayerView, type GameState } from '../src';
import { playArenaGame, type Policy } from '../fuzz/botArena';

describe('heuristic bot', () => {
  it.each([3, 4, 5, 6])('finishes all-bot games with %i players without illegal moves', (n) => {
    const seats: Policy[] = ['hard', 'normal', 'easy', 'hard', 'normal', 'easy'].slice(0, n) as Policy[];
    for (const seed of ['b1', 'b2']) {
      const r = playArenaGame(`${seed}-${n}`, seats);
      expect(r.winner).toBeDefined();
      expect(r.invalid).toBe(0);
    }
  }, 60_000);

  it('finishes games with the strongholds expansion', () => {
    for (const seed of ['s1', 's2']) {
      const r = playArenaGame(seed, ['hard', 'normal', 'easy', 'random'], ['base', 'strongholds']);
      expect(r.winner).toBeDefined();
      expect(r.invalid).toBe(0);
    }
  }, 60_000);

  it('beats random players', () => {
    let wins = 0;
    for (let i = 0; i < 8; i++) {
      const seats: Policy[] = ['random', 'random', 'random', 'random'];
      seats[i % 4] = 'hard';
      if (playArenaGame(`vr-${i}`, seats).winnerPolicy === 'hard') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
  }, 60_000);

  it('decides from its own view only: hidden opponent hands do not change the choice', () => {
    let s: GameState = createGame({ seed: 'view-only', playerCount: 4 });
    for (let i = 0; i < 600 && !(s.phase.k === 'main' && s.turn.n > 6); i++) {
      const id = s.players.map((p) => p.id).find((p) => botAct(s, p));
      if (!id) break;
      s = applyAction(s, botAct(s, id)!).state;
    }
    expect(s.phase.k).toBe('main');
    const me = s.turn.current;
    const swapped: GameState = JSON.parse(JSON.stringify(s));
    const o = swapped.players.find((p) => p.id !== me)!;
    const total = Object.values(o.hand).reduce((a, b) => a + b, 0);
    o.hand = { timber: total, clay: 0, fiber: 0, grain: 0, stone: 0 };
    const legal = getLegalActions(s, me);
    expect(decide(getPlayerView(swapped, me), legal)).toEqual(decide(getPlayerView(s, me), legal));
  });

  it("returns null when it is not the bot's move", () => {
    const s = createGame({ seed: 'idle', playerCount: 4 });
    const idle = s.players.find((p) => getLegalActions(s, p.id).length === 0)!;
    expect(botAct(s, idle.id)).toBeNull();
  });
});
