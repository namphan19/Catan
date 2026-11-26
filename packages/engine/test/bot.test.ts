// Heuristic bot: every decision is legal, games finish for 2-6 players and with the expansion, and
// the bot clearly beats random play. Uses the arena from fuzz/botArena.ts.
import { describe, expect, it } from 'vitest';
import {
  BOT_RESPOND_DELAY_MS, applyAction, botAct, botRespondWaitMs, createGame, decide, getLegalActions, getPlayerView, type GameState,
} from '../src';
import { playArenaGame, type Policy } from '../fuzz/botArena';

describe('heuristic bot', () => {
  it.each([2, 3, 4, 5, 6])('finishes all-bot games with %i players without illegal moves', (n) => {
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

  it('finishes 2-player games with each expansion', () => {
    const setups: Array<[string[], Record<string, unknown>?]> = [
      [['base', 'strongholds']],
      [['base', 'tidelands'], { scenario: 'firstLandfall' }],
      [['base', 'strongholds', 'tidelands'], { scenario: 'firstLandfall' }],
    ];
    for (const [rulesets, options] of setups) {
      const r = playArenaGame(`duo-${rulesets.join('+')}`, ['hard', 'normal'], rulesets, 20000, options);
      expect(r.winner).toBeDefined();
      expect(r.invalid).toBe(0);
    }
  }, 120_000);

  it('finishes highlands games at every level (2-4 players)', () => {
    const lineups: Policy[][] = [['hard', 'normal'], ['expert', 'easy', 'random'], ['hard', 'normal', 'easy', 'expert']];
    lineups.forEach((seats, i) => {
      const r = playArenaGame(`hl-${i}`, seats, ['base', 'highlands'], 20000, { map: i % 2 ? 'starter' : 'variable' });
      expect(r.winner).toBeDefined();
      expect(r.invalid).toBe(0);
    });
  }, 120_000);

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

describe('botRespondWaitMs (bot answers to an offer wait for the humans)', () => {
  // p1 offers 1 ore for 1 wool; everyone holds wool, so every responder could accept.
  const withOffer = (): GameState => {
    const s = createGame({ seed: 'respond', playerCount: 4 });
    for (const p of s.players) p.hand = { ...p.hand, wool: 2, ore: 1 };
    s.trade = { from: 'p1', give: { ore: 1 }, get: { wool: 1 }, responses: {} };
    return s;
  };
  const bots = (...ids: string[]) => (id: string) => ids.includes(id);

  it('holds back while another human could still accept', () => {
    const s = withOffer();
    expect(botRespondWaitMs(s, 'p4', bots('p4'), 0)).toBe(BOT_RESPOND_DELAY_MS);
    expect(botRespondWaitMs(s, 'p4', bots('p4'), 3_000)).toBe(BOT_RESPOND_DELAY_MS - 3_000);
    expect(botRespondWaitMs(s, 'p4', bots('p4'), BOT_RESPOND_DELAY_MS)).toBe(0);
  });

  it('answers at once when no other human could race it', () => {
    const s = withOffer();
    // Everyone else is a bot (the human offerer does not count).
    expect(botRespondWaitMs(s, 'p4', bots('p2', 'p3', 'p4'), 0)).toBe(0);
    // The other humans already answered.
    s.trade!.responses = { p2: { response: 'decline' }, p3: { response: 'accept' } };
    expect(botRespondWaitMs(s, 'p4', bots('p4'), 0)).toBe(0);
    // A human without the requested cards cannot accept, so it is no race either.
    const t = withOffer();
    for (const id of ['p2', 'p3']) t.players.find((p) => p.id === id)!.hand.wool = 0;
    expect(botRespondWaitMs(t, 'p4', bots('p4'), 0)).toBe(0);
  });

  it('never applies to the offerer, a bot that answered, or without an offer', () => {
    const s = withOffer();
    expect(botRespondWaitMs(s, 'p1', bots('p1'), 0)).toBe(0);
    s.trade!.responses = { p4: { response: 'decline' } };
    expect(botRespondWaitMs(s, 'p4', bots('p4'), 0)).toBe(0);
    delete s.trade;
    expect(botRespondWaitMs(s, 'p4', bots('p4'), 0)).toBe(0);
  });
});
