// Pins for the reviewer findings (item numbers in comments). See docs/RULES_DECISIONS.md D18-D21.
import { describe, expect, it } from 'vitest';
import {
  applyAction, createGame, getLegalActions, getPlayerView, getEventsView, registerRuleset,
  validateAction, type GameEvent, type GameState, type PlayerId, type Ruleset,
} from '../src';
import { act, blankGame, hand, pl, setHand } from './helpers';
import { actors } from '../src/rules/base/helpers';

const code = (s: GameState, a: Parameters<typeof validateAction>[1]) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};

describe('review fixes', () => {
  it('item 1 (D20, replaced): responders may change their answer until confirmation', () => {
    let s = blankGame(4);
    setHand(s, 'p1', { timber: 2 });
    setHand(s, 'p2', { clay: 1 }); // so both accept and decline are legal for p2
    s = act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { clay: 1 } });
    // legal() keeps listing responses for p2 (no lock): accept, decline and counter samples.
    const resp = getLegalActions(s, 'p2').filter((a) => a.t === 'respondTrade');
    expect(resp.length).toBeGreaterThanOrEqual(2);
    expect(resp.some((a) => (a as { accept?: boolean }).accept === true)).toBe(true);
    expect(resp.some((a) => (a as { accept?: boolean }).accept === false)).toBe(true);
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    // No ALREADY_RESPONDED lock any more (base p.7): the answer may be changed, and legal()
    // keeps listing the response space (accept / decline + counter samples).
    expect(getLegalActions(s, 'p2').filter((a) => a.t === 'respondTrade').length).toBeGreaterThanOrEqual(2);
    s = act(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 1 }, get: { timber: 2 } });
    expect(s.trade!.responses.p2).toEqual({ response: 'counter', give: { clay: 1 }, get: { timber: 2 } });
    // confirmTrade executes the counter terms.
    const r = applyAction(s, { t: 'confirmTrade', player: 'p1', with: 'p2' });
    expect(hand(r.state, 'p1')).toMatchObject({ clay: 1, timber: 0 });
    expect(hand(r.state, 'p2')).toMatchObject({ clay: 0, timber: 2 });
    // Another player may still respond while the offer is open.
    const s2 = act(s, { t: 'respondTrade', player: 'p3', accept: false });
    expect(s2.trade!.responses.p3).toEqual({ response: 'decline' });
  });

  it('item 2 (D18): discards are public — p3 sees p1 discard bag in the view log and events', () => {
    let s = blankGame(4, { k: 'preRoll' });
    (s.ext as Record<string, unknown>).forceDice = [3, 4]; // testdice: roll 7
    setHand(s, 'p1', { timber: 8 }); // owes floor(8/2) = 4
    s = act(s, { t: 'roll', player: 'p1' });
    expect(s.phase.k).toBe('discard');
    const { state, events } = applyAction(s, { t: 'discard', player: 'p1', bag: { timber: 4 } });
    const view = getPlayerView(state, 'p3');
    const logged = view.log.map((l) => l.action).find((a) => a.t === 'discard');
    expect(logged).toMatchObject({ player: 'p1', bag: { timber: 4 } });
    expect(events.find((e) => e.e === 'discarded')).toEqual({ e: 'discarded', player: 'p1', bag: { timber: 4 } });
    expect(getEventsView(events, 'p3').find((e) => e.e === 'discarded')).toEqual({
      e: 'discarded', player: 'p1', bag: { timber: 4 },
    });
  });

  it('item 3: extra build handoff emits a phase event for every new window', () => {
    const s = blankGame(4, { k: 'extraBuild', queue: ['p2', 'p3'] });
    s.init.extraBuild = true;
    const r1 = applyAction(s, { t: 'endTurn', player: 'p2' });
    expect(r1.state.phase).toMatchObject({ k: 'extraBuild', queue: ['p3'] });
    expect(r1.events).toContainEqual({ e: 'phase', phase: 'extraBuild' });
    const r2 = applyAction(r1.state, { t: 'endTurn', player: 'p3' });
    expect(r2.state.phase).toMatchObject({ k: 'preRoll' });
    expect(r2.events).toContainEqual({ e: 'phase', phase: 'preRoll' });
  });

  it('item 4: discard enumeration is complete for a 20-card hand and every bag validates', () => {
    const s = blankGame(4, { k: 'discard', owed: { p1: 10 } });
    setHand(s, 'p1', { timber: 4, clay: 4, fiber: 4, grain: 4, stone: 4 });
    const listed = getLegalActions(s, 'p1').filter((a) => a.t === 'discard');
    // Independent count: sub-bags of 10 from 5 kinds x 4 = solutions of k1+..+k5=10, 0<=ki<=4.
    let expected = 0;
    for (let a = 0; a <= 4; a++)
      for (let b = 0; b <= 4; b++)
        for (let c = 0; c <= 4; c++)
          for (let d = 0; d <= 4; d++)
            for (let e = 0; e <= 4; e++) if (a + b + c + d + e === 10) expected++;
    expect(expected).toBe(381); // 1001 - 5*126 + 10 (inclusion-exclusion); below the 5000 cap
    expect(listed).toHaveLength(expected);
    for (const a of listed) expect(validateAction(s, a).ok).toBe(true);
  });

  it('item 5 (D19): harvest is BANK_EMPTY and not listed when the bank has 0 cards', () => {
    const s = blankGame(4);
    s.bank.hand = { timber: 0, clay: 0, fiber: 0, grain: 0, stone: 0 };
    pl(s, 'p1').cards = ['harvest'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: [] })).toBe('BANK_EMPTY');
    expect(getLegalActions(s, 'p1').some((x) => x.t === 'playCard' && x.card === 'harvest')).toBe(false);
  });

  it('item 6 (D21): a second force card id counts for largest force via config', () => {
    const spear: Ruleset = {
      id: 'testspear',
      requires: ['base'],
      config: (prev) => {
        const p = prev!;
        return {
          ...p,
          playableCards: [...p.playableCards, 'spear'],
          awards: { ...p.awards, largestForce: { ...p.awards.largestForce, cards: ['guard', 'spear'] } },
        };
      },
    };
    registerRuleset(spear);
    const s = createGame({ seed: 'spear', playerCount: 4, rulesets: ['base', 'testspear'] });
    s.phase = { k: 'main' };
    s.turn = { n: 1, current: 'p1', cardPlayed: false };
    pl(s, 'p1').played = { spear: 3 };
    pl(s, 'p1').cards = ['guard'];
    // Playing a guard: the count must include the configured spear cards (not hardcoded 'guard').
    const { state, events } = applyAction(s, { t: 'playCard', player: 'p1', card: 'guard' });
    expect(state.awards.largestForce).toBe('p1');
    expect(events).toContainEqual({ e: 'awardChanged', award: 'largestForce', from: null, to: 'p1' });
  });

  it('item 7: all hands are revealed once there is a winner', () => {
    const s = blankGame(4);
    setHand(s, 'p2', { clay: 3 });
    s.winner = 'p1';
    const view = getPlayerView(s, 'p3');
    for (const p of view.players) {
      expect(p.hand).toBeDefined();
      expect(p.cards).toBeDefined();
      expect(p.vp).toBeDefined();
    }
    const p2 = view.players.find((x) => x.id === 'p2')!;
    expect(p2.hand!.clay).toBe(3);
    expect(p2.handCount).toBe(3);
  });

  it('item 8: an ext phase may name its actors; otherwise it falls back to turn.current', () => {
    const withActors = blankGame(4, { k: 'ext', id: 'demo', data: null, actors: ['p3'] });
    expect(actors(withActors)).toEqual(['p3']);
    const without = blankGame(4, { k: 'ext', id: 'demo', data: null });
    expect(actors(without)).toEqual(['p1']); // turn.current
  });

  it('item 9: getEventsView returns cloned events (no shared references)', () => {
    const events: GameEvent[] = [
      { e: 'stole', from: 'p1', to: 'p2', resource: 'timber' },
      { e: 'discarded', player: 'p1', bag: { timber: 2 } },
    ];
    const view = getEventsView(events, 'p3');
    expect(view[0]).toEqual({ e: 'stole', from: 'p1', to: 'p2', resource: undefined }); // redacted for p3
    (view[1] as { bag: unknown }).bag = { clay: 9 };
    (view[0] as { e: string }).e = 'mutated';
    view.push({ e: 'phase', phase: 'main' });
    // The input array is untouched.
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ e: 'discarded', player: 'p1', bag: { timber: 2 } });
    expect(events[0].e).toBe('stole');
  });
});
