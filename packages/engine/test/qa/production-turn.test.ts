// QA tests: RULES.md 5 (turn: roll/production, 7 flow) and decisions D3, D4, D13.
import { describe, expect, it } from 'vitest';
import { baseConfig, getLegalActions, validateAction, type Action, type GameState } from '../../src';
import { act, blankGame, graphOf, hand, pl, setHand, totalResources } from '../helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};
const bagSum = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);

describe('production (RULES.md 5.2, D3)', () => {
  /** Blank board with one 5-hex, p1 settlement + p2 city on it, forced roll 5. */
  function scenario() {
    const s = blankGame(4, { k: 'preRoll' });
    const g = graphOf(s);
    for (const h of s.board.hexes) if (h.token !== undefined) h.token = 12;
    const H = s.board.hexes.find((h) => h.token !== undefined)!;
    H.token = 5;
    const res = baseConfig.terrainResource[H.terrain]!;
    s.pieces.buildings[g.hexVertices[H.id][0]] = { owner: 'p1', kind: 'settlement' };
    s.pieces.buildings[g.hexVertices[H.id][3]] = { owner: 'p2', kind: 'city' };
    s.ext.forceDice = [2, 3];
    return { s, H, res };
  }

  it('a settlement takes 1 and a city takes 2 from the bank (RULES.md 5.2)', () => {
    // RULES.md 5.2 (settlement 1 / city 2) and resource conservation.
    const { s, res } = scenario();
    const before = totalResources(s);
    const r = act(s, { t: 'roll', player: 'p1' });
    expect(hand(r, 'p1')[res]).toBe(1);
    expect(hand(r, 'p2')[res]).toBe(2);
    expect(totalResources(r)).toBe(before);
    expect(r.phase.k).toBe('main');
  });

  it('bank shortage: several owed players get nothing; a sole owed player gets the remainder (D3)', () => {
    // D3 + RULES.md 5.2 "if the bank cannot pay all players owed a resource, nobody gets that
    // resource; if only one player is owed it, they get what is left".
    const { s, res } = scenario();
    s.bank.hand[res] = 2; // owed 1 + 2 = 3
    const short = act(s, { t: 'roll', player: 'p1' });
    expect(hand(short, 'p1')[res]).toBe(0);
    expect(hand(short, 'p2')[res]).toBe(0);

    const { s: s2, res: res2 } = scenario();
    const vs = graphOf(s2).hexVertices[s2.board.hexes.find((h) => h.token === 5)!.id];
    delete s2.pieces.buildings[vs[0]]; // only p2's city owed 2
    s2.bank.hand[res2] = 1;
    const partial = act(s2, { t: 'roll', player: 'p1' });
    expect(hand(partial, 'p2')[res2]).toBe(1);
  });

  it('a producing hex with the blocker on it pays nobody (RULES.md 5.2)', () => {
    // RULES.md 5.2 "except the hex with the blocker".
    const { s, H, res } = scenario();
    s.board.blocker = H.id;
    const r = act(s, { t: 'roll', player: 'p1' });
    expect(hand(r, 'p1')[res]).toBe(0);
    expect(hand(r, 'p2')[res]).toBe(0);
  });
});

describe('rolling 7: discard then move then steal (RULES.md 5.3, D4, D13)', () => {
  it('all legal discards for each debtor have exactly the owed size; debtors may act in any order (D13)', () => {
    // RULES.md 5.3 (return half, rounded down) + D13 (any discard order).
    const s = blankGame(4, { k: 'preRoll' });
    setHand(s, 'p1', { timber: 5, clay: 4 }); // 9 -> owe 4
    setHand(s, 'p3', { fiber: 3, grain: 3, stone: 3, timber: 3, clay: 3 }); // 15 -> owe 7
    s.ext.forceDice = [3, 4];
    const r = act(s, { t: 'roll', player: 'p1' });
    expect(r.phase).toEqual({ k: 'discard', owed: { p1: 4, p3: 7 } });
    for (const [id, owed] of [['p1', 4], ['p3', 7]] as const) {
      const moves = getLegalActions(r, id).filter((a) => a.t === 'discard');
      expect(moves.length).toBeGreaterThan(0);
      for (const m of moves) expect(bagSum((m as { bag: Record<string, number> }).bag)).toBe(owed);
    }
    // p3 (the later seat) may discard first.
    const s2 = act(r, { t: 'discard', player: 'p3', bag: { fiber: 3, grain: 3, stone: 1 } });
    expect(s2.phase).toEqual({ k: 'discard', owed: { p1: 4, p3: 0 } });
    expect(code(s2, { t: 'discard', player: 'p1', bag: { timber: 3 } })).toBe('WRONG_AMOUNT');
    const s3 = act(s2, { t: 'discard', player: 'p1', bag: { timber: 4 } });
    expect(s3.phase).toEqual({ k: 'moveBlocker', resume: 'main' });
  });

  it('discarding from a 20-card hand works; legal actions stay exact', () => {
    // RULES.md 5.3 (20 -> discard 10) with the 200-combination sampling limit in API.md.
    const s = blankGame(4, { k: 'preRoll' });
    const twenty = { timber: 4, clay: 4, fiber: 4, grain: 4, stone: 4 };
    setHand(s, 'p1', twenty);
    const before = totalResources(s);
    s.ext.forceDice = [3, 4];
    const rolled = act(s, { t: 'roll', player: 'p1' });
    expect(rolled.phase).toEqual({ k: 'discard', owed: { p1: 10 } });
    const moves = getLegalActions(rolled, 'p1').filter((a) => a.t === 'discard');
    expect(moves.length).toBeGreaterThan(0);
    // NB: docs/API.md says discards are sampled "up to 200"; the implementation currently caps at
    // 5000 (subBags default), so >200 combinations are returned for a 20-card hand (see BUGS.md).
    for (const m of moves) expect(bagSum((m as { bag: Record<string, number> }).bag)).toBe(10);
    const discarded = act(rolled, moves[0]);
    expect(bagSum(hand(discarded, 'p1'))).toBe(10);
    expect(discarded.phase).toEqual({ k: 'moveBlocker', resume: 'main' });
    expect(totalResources(discarded)).toBe(before);
  });

  it('the steal phase is skipped when the only adjacent opponent has no cards (D4)', () => {
    // D4: candidates are players with a building on the hex AND at least one card; no candidate
    // means no steal step at all (RULES.md 5.3).
    let s = blankGame(4, { k: 'preRoll' });
    const g = graphOf(s);
    const target = s.board.hexes.find((h) => h.id !== s.board.blocker)!.id;
    s.pieces.buildings[g.hexVertices[target][0]] = { owner: 'p2', kind: 'settlement' };
    const p1start = totalResources(s);
    s.ext.forceDice = [1, 6];
    s = act(s, { t: 'roll', player: 'p1' });
    expect(s.phase).toEqual({ k: 'moveBlocker', resume: 'main' });
    s = act(s, { t: 'moveBlocker', player: 'p1', hex: target });
    expect(s.phase).toEqual({ k: 'main' });
    expect(getLegalActions(s, 'p1').some((a) => a.t === 'steal')).toBe(false);
    expect(totalResources(s)).toBe(p1start);
  });

  it('a sole candidate with a card is a steal choice; the stolen card is random but conserved (D4)', () => {
    // D4: the steal is an explicit choice even with one candidate (RULES.md 5.3).
    let s = blankGame(4, { k: 'preRoll' });
    const g = graphOf(s);
    const target = s.board.hexes.find((h) => h.id !== s.board.blocker)!.id;
    s.pieces.buildings[g.hexVertices[target][1]] = { owner: 'p3', kind: 'city' };
    setHand(s, 'p3', { grain: 2 });
    const before = totalResources(s);
    s.ext.forceDice = [1, 6];
    s = act(s, { t: 'roll', player: 'p1' });
    s = act(s, { t: 'moveBlocker', player: 'p1', hex: target });
    expect(s.phase).toEqual({ k: 'steal', from: ['p3'], resume: 'main' });
    expect(code(s, { t: 'steal', player: 'p1', target: 'p2' })).toBe('BAD_TARGET');
    s = act(s, { t: 'steal', player: 'p1', target: 'p3' });
    expect(hand(s, 'p3').grain).toBe(1);
    expect(hand(s, 'p1').grain).toBe(1);
    expect(s.phase.k).toBe('main');
    expect(totalResources(s)).toBe(before);
  });

  it('a 7 with nobody over the limit moves the blocker straight away (RULES.md 5.3)', () => {
    // RULES.md 5.3: only players with more than 7 cards discard.
    let s = blankGame(4, { k: 'preRoll' });
    setHand(s, 'p2', { grain: 7 }); // exactly the limit: no discard
    s.ext.forceDice = [3, 4];
    s = act(s, { t: 'roll', player: 'p1' });
    expect(s.phase).toEqual({ k: 'moveBlocker', resume: 'main' });
    expect(pl(s, 'p2').hand.grain).toBe(7);
  });
});
