// QA tests: decisions D18 (discard visibility), D20 (trade responses) and D21 (extension limits).
import { describe, expect, it } from 'vitest';
import {
  applyAction, baseConfig, getEventsView, getLegalActions, getPlayerView, validateAction,
  type Action, type GameState,
} from '../../src';
import { act, blankGame, findPath, graphOf, pl, setHand } from '../helpers';

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

describe('D20: one response per offer', () => {
  function scenario() {
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 1 });
    setHand(s, 'p2', { grain: 1 });
    return act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } });
  }

  it('a second response (accept then decline) is rejected with ALREADY_RESPONDED', () => {
    // D20: "Each player responds once per offer; the answer cannot be changed."
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: false })).toBe('ALREADY_RESPONDED');
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: true })).toBe('ALREADY_RESPONDED');
    expect(getLegalActions(s, 'p2').some((a) => a.t === 'respondTrade')).toBe(false);
    // the first answer stands and can still be confirmed
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('OK');
  });

  it('a new offer resets the responses, so a player may respond again (D20, D6)', () => {
    // D20: "a new offer resets responses" + D6 offers are replaced.
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    s = act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } });
    expect(s.trade!.responses).toEqual({});
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: false })).toBe('OK');
    s = act(s, { t: 'respondTrade', player: 'p2', accept: false });
    expect(s.trade!.responses).toEqual({ p2: 'decline' });
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

describe('build window phase events (RULES.md 8, D9)', () => {
  it('each build-window pass emits a phase event so clients can follow the queue', () => {
    // RULES.md 8 + D9: a window advance is a phase change (event `phase` with extraBuild).
    let s = blankGame(5);
    s = act(s, { t: 'endTurn', player: 'p1' });
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
