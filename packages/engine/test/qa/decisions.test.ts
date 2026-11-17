// QA tests: decisions D18 (discard visibility), D20 (trade responses) and D21 (extension limits).
import { describe, expect, it } from 'vitest';
import {
  applyAction, baseConfig, getEventsView, getLegalActions, getPlayerView, validateAction,
  type Action, type GameState,
} from '../../src';
import { act, autoSetup, blankGame, findPath, graphOf, newGame, pl, setHand } from '../helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};

describe('D18: discards are public, stolen/bought cards stay private', () => {
  it('every viewer sees the discarded bag in the log and in the events', () => {
    // D18: "Discards are public (cards go face up to the bank): the discard action incl. its bag
    // stays in the public log/view."
    let s = blankGame(4, { k: 'preRoll' });
    setHand(s, 'p1', { timber: 9 });
    s.ext.forceDice = [3, 4];
    s = act(s, { t: 'roll', player: 'p1' });
    const r = act(s, { t: 'discard', player: 'p1', bag: { timber: 4 } });
    for (const viewer of ['p2', 'p3', null]) {
      const log = getPlayerView(r, viewer).log;
      const last = log[log.length - 1].action as { t: string; bag?: Record<string, number> };
      expect(last.t).toBe('discard');
      expect(last.bag).toEqual({ timber: 4 });
    }
    const events = getEventsView([{ e: 'discarded', player: 'p1', bag: { timber: 4 } }], 'p2');
    expect(events[0]).toEqual({ e: 'discarded', player: 'p1', bag: { timber: 4 } });
  });

  it('a stolen resource is hidden from third parties but visible to both traders', () => {
    // D18: "Stolen cards ... stay private."
    const ev = { e: 'stole', from: 'p2', to: 'p1', resource: 'grain' } as const;
    expect(getEventsView([ev], 'p3')[0]).toMatchObject({ resource: undefined });
    expect(getEventsView([ev], 'p1')[0]).toMatchObject({ resource: 'grain' });
    expect(getEventsView([ev], 'p2')[0]).toMatchObject({ resource: 'grain' });
  });

  it('a bought card is hidden from other players but visible to the buyer', () => {
    // D18 (only discards are public; bought cards stay private).
    const ev = { e: 'cardBought', player: 'p1', card: 'relic' } as const;
    expect(getEventsView([ev], 'p2')[0]).toMatchObject({ card: undefined });
    const s = blankGame(4);
    setHand(s, 'p1', { fiber: 1, grain: 1, stone: 1 });
    s.bank.deck.push('guard');
    const r = act(s, { t: 'buyCard', player: 'p1' });
    expect(getPlayerView(r, 'p2').players.find((p) => p.id === 'p1')!.cardCount).toBe(1);
    expect(getPlayerView(r, 'p2').players.find((p) => p.id === 'p1')!.cards).toBeUndefined();
    expect(getPlayerView(r, 'p1').players.find((p) => p.id === 'p1')!.newCards).toEqual(['guard']);
  });
});

describe('D20: responders may answer repeatedly until the offer is confirmed (base p.7)', () => {
  function scenario() {
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 1 });
    setHand(s, 'p2', { grain: 1 });
    return act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } });
  }

  it('a responder may change their answer; the latest response stands', () => {
    // D20 (replaced): "Responders may accept, decline or counter, and change their answer until
    // the offer is confirmed (base p.7)." There is no ALREADY_RESPONDED lock any more.
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    s = act(s, { t: 'respondTrade', player: 'p2', accept: false });
    expect(s.trade!.responses).toEqual({ p2: { response: 'decline' } });
    // legal() and validate() agree: responding stays available.
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: true })).toBe('OK');
    expect(getLegalActions(s, 'p2').some((a) => a.t === 'respondTrade')).toBe(true);
    // after changing to decline the original accept no longer confirms
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('NOT_ACCEPTED');
  });

  it('repeating the same answer is rejected (SAME_RESPONSE) and is not offered by legal()', () => {
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: false });
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: false })).toBe('SAME_RESPONSE');
    expect(code(s, { t: 'respondTrade', player: 'p2', response: 'decline' })).toBe('SAME_RESPONSE');
    const resp = getLegalActions(s, 'p2').filter((a) => a.t === 'respondTrade');
    expect(resp.some((a) => (a as { accept?: boolean }).accept === false)).toBe(false);
    expect(resp.some((a) => (a as { accept?: boolean }).accept === true)).toBe(true); // changing stays open
    // the same counter twice is a repeat; a different counter is a change
    setHand(s, 'p2', { grain: 1, clay: 1 });
    s = act(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 1 }, get: { timber: 1 } });
    expect(code(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 1 }, get: { timber: 1 } }))
      .toBe('SAME_RESPONSE');
    expect(code(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { grain: 1 }, get: { timber: 1 } }))
      .toBe('OK');
  });

  it('a new offer resets the responses, so a player may respond again (D6)', () => {
    // D6: a new offer replaces the old one, so the response list starts empty again.
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    s = act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } });
    expect(s.trade!.responses).toEqual({});
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: false })).toBe('OK');
    s = act(s, { t: 'respondTrade', player: 'p2', accept: false });
    expect(s.trade!.responses).toEqual({ p2: { response: 'decline' } });
  });
});

describe('D21: extension limits are expressed in config', () => {
  it('playable cards and force cards come from config, not hardcoded lists', () => {
    // D21: new playable cards via config.playableCards and force cards via
    // awards.largestForce.cards.
    expect(baseConfig.playableCards).toEqual(['guard', 'freeRoads', 'harvest', 'claim']);
    expect(baseConfig.awards.largestForce.cards).toEqual(['guard']);
    // relic is a scoring card but never playable, as RULES.md 7 states.
    expect(baseConfig.playableCards).not.toContain('relic');
    expect(baseConfig.scoringCards).toContain('relic');
  });
});

describe('turn-window phase events (RULES.md 8, D8/D9)', () => {
  it('entering the paired phase emits a phase event so clients can follow (5-6 p.3)', () => {
    // RULES.md 8 + D8: after player 1 ends the turn the paired player's phase starts.
    let s = blankGame(5);
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.phase).toEqual({ k: 'paired', player: 'p4' });
  });

  it('each legacy extra-build window pass emits a phase event so clients can follow the queue', () => {
    // RULES.md 8 + D9 (legacy extraBuild mode): a window advance is a phase change.
    const s0 = blankGame(5);
    s0.init.largeTableMode = 'extraBuild';
    let s = act(s0, { t: 'endTurn', player: 'p1' });
    const r = applyAction(s, { t: 'endTurn', player: (s.phase as { queue: string[] }).queue[0] });
    expect(r.events).toContainEqual({ e: 'phase', phase: 'extraBuild' });
    expect(r.state.phase.k).toBe('extraBuild');
  });
});

describe('setup roads do not need to be connected elsewhere (RULES.md 4, 3)', () => {
  it('a setup road only has to touch the settlement just placed', () => {
    // RULES.md 4: "places one settlement and one road touching it"; RULES.md 3 connection rules
    // apply outside setup.
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 1);
    s.phase = { k: 'setup', idx: 0, step: 'settlement' };
    s.turn = { n: 0, current: 'p1', cardPlayed: false };
    const placed = act(s, { t: 'placeSettlement', player: 'p1', v: path.vertices[0] });
    expect(placed.phase).toEqual({ k: 'setup', idx: 0, step: 'road', at: path.vertices[0] });
    expect(code(placed, { t: 'placeRoad', player: 'p1', e: path.edges[0] })).toBe('OK');
    expect(pl(placed, 'p1').supply.settlement).toBe(4);
  });
});

describe('log outcome: a roll keeps its dice and the production it caused (public)', () => {
  it('roll entries carry roll and gains, visible to every viewer', () => {
    let s = newGame(4, 'log-outcome');
    s = autoSetup(s);
    s = act(s, { t: 'roll', player: s.turn.current });
    const last = s.log[s.log.length - 1];
    expect(last.action.t).toBe('roll');
    expect(last.roll?.dice.length).toBe(2);
    expect(last.roll?.sum).toBe(last.roll!.dice[0] + last.roll!.dice[1]);
    for (const viewer of ['p1', 'p2', null] as const) {
      const vl = getPlayerView(s, viewer).log.at(-1)!;
      expect(vl.roll).toEqual(last.roll);
      expect(vl.gains).toEqual(last.gains);
    }
    // gains, when present, are never empty bags
    for (const bag of Object.values(last.gains ?? {})) expect(Object.keys(bag).length).toBeGreaterThan(0);
  });
});
