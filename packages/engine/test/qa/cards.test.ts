// QA tests: RULES.md 7 (cards) and decisions D7 (harvest with a low bank), D9 (cards bought in the
// build window), D11 relic timing is covered in victory.test.ts.
import { describe, expect, it } from 'vitest';
import { baseConfig, getLegalActions, validateAction, type Action, type GameState } from '../../src';
import { act, blankGame, hand, pl, setHand, totalResources } from '../helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};
const bagSum = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);

describe('harvest with a low bank (RULES.md 7, D7)', () => {
  it('takes 1 resource when the bank has only 1 card in total', () => {
    // D7: "Take min(2, cards in bank)"; with 1 card the player must choose exactly 1.
    let s = blankGame(4);
    for (const r of baseConfig.resources) s.bank.hand[r] = 0;
    s.bank.hand.grain = 1;
    pl(s, 'p1').cards = ['harvest'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain', 'grain'] })).toBe('BAD_ARGS');
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain'] })).toBe('OK');
    expect(
      getLegalActions(s, 'p1').filter((a) => a.t === 'playCard').map((a) => (a as { resources: string[] }).resources),
    ).toEqual([['grain']]); // only the resource the bank actually holds
    s = act(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain'] });
    expect(hand(s, 'p1').grain).toBe(1);
    expect(s.bank.hand.grain).toBe(0);
    expect(pl(s, 'p1').played.harvest).toBe(1);
  });

  it('is not playable when the bank is completely empty (D19, supersedes the D7 lower bound)', () => {
    // D19: with 0 cards in the bank harvest cannot be played - the card is not wasted.
    let s = blankGame(4);
    for (const r of baseConfig.resources) s.bank.hand[r] = 0;
    pl(s, 'p1').cards = ['harvest'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: [] })).toBe('BANK_EMPTY');
    expect(getLegalActions(s, 'p1').some((a) => a.t === 'playCard')).toBe(false);
    // and applying it is impossible, so the card stays in hand
    expect(pl(s, 'p1').cards).toEqual(['harvest']);
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.turn.current).toBe('p2');
  });

  it('rejects a harvest naming a resource the bank lacks (BANK_EMPTY)', () => {
    // RULES.md 7 + D7: "each chosen one must be in the bank" (bank has 2 cards, but no stone).
    const s = blankGame(4);
    s.bank.hand.timber = 1;
    s.bank.hand.grain = 1;
    s.bank.hand.stone = 0;
    pl(s, 'p1').cards = ['harvest'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain', 'stone'] })).toBe('BANK_EMPTY');
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['timber', 'grain'] })).toBe('OK');
  });

  it('rejects a wrong number of resources or an unknown resource (BAD_ARGS)', () => {
    // RULES.md 7 (take 2) + D7.
    const s = blankGame(4);
    pl(s, 'p1').cards = ['harvest'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain'] })).toBe('BAD_ARGS');
    expect(
      code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain', 'diamonds' as string] }),
    ).toBe('BAD_ARGS');
  });
});

describe('claim (RULES.md 7)', () => {
  it('is legal when nobody else has the resource and simply takes nothing', () => {
    // RULES.md 7: "name a resource; every other player gives you all of it" - zero is a legal take.
    let s = blankGame(4);
    pl(s, 'p1').cards = ['claim'];
    setHand(s, 'p2', { grain: 2 });
    const before = totalResources(s);
    s = act(s, { t: 'playCard', player: 'p1', card: 'claim', resource: 'stone' });
    expect(hand(s, 'p1').stone).toBe(0);
    expect(hand(s, 'p2')).toMatchObject({ grain: 2, stone: 0 });
    expect(bagSum(hand(s, 'p1'))).toBe(0);
    expect(totalResources(s)).toBe(before);
    expect(pl(s, 'p1').played.claim).toBe(1);
  });

  it('takes the named resource from every other player, never from the own hand', () => {
    // RULES.md 7: all of that resource from every other player (own cards stay).
    let s = blankGame(4);
    pl(s, 'p1').cards = ['claim'];
    setHand(s, 'p1', { stone: 1 });
    setHand(s, 'p2', { stone: 3, grain: 1 });
    setHand(s, 'p3', { stone: 2 });
    setHand(s, 'p4', { timber: 1 });
    const before = totalResources(s);
    s = act(s, { t: 'playCard', player: 'p1', card: 'claim', resource: 'stone' });
    expect(hand(s, 'p1')).toMatchObject({ stone: 6, grain: 0 });
    expect(hand(s, 'p2')).toMatchObject({ stone: 0, grain: 1 });
    expect(hand(s, 'p3').stone).toBe(0);
    expect(hand(s, 'p4').timber).toBe(1);
    expect(totalResources(s)).toBe(before);
  });

  it('rejects a claim with no resource or an unknown resource (BAD_ARGS)', () => {
    // RULES.md 7 + API.md playCard{resource}.
    const s = blankGame(4);
    pl(s, 'p1').cards = ['claim'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'claim' })).toBe('BAD_ARGS');
    expect(code(s, { t: 'playCard', player: 'p1', card: 'claim', resource: 'gold' })).toBe('BAD_ARGS');
  });
});

describe('buying cards (RULES.md 2, 7)', () => {
  it('costs 1 fiber + 1 grain + 1 stone and DECK_EMPTY is reported', () => {
    // RULES.md 2 (card cost) + API.md error code DECK_EMPTY.
    let s = blankGame(4);
    expect(code(s, { t: 'buyCard', player: 'p1' })).toBe('CANNOT_AFFORD');
    setHand(s, 'p1', { fiber: 1, grain: 1, stone: 1 });
    const before = totalResources(s);
    s = act(s, { t: 'buyCard', player: 'p1' });
    expect(hand(s, 'p1')).toMatchObject({ fiber: 0, grain: 0, stone: 0 });
    expect(pl(s, 'p1').newCards).toHaveLength(1);
    expect(totalResources(s)).toBe(before);

    const empty = blankGame(4);
    setHand(empty, 'p1', { fiber: 1, grain: 1, stone: 1 });
    empty.bank.deck = [];
    expect(code(empty, { t: 'buyCard', player: 'p1' })).toBe('DECK_EMPTY');
  });

  it('a relic is kept hidden and cannot be played (RULES.md 7)', () => {
    // RULES.md 7: relic = 1 VP, kept hidden, never played.
    let s = blankGame(4);
    setHand(s, 'p1', { fiber: 1, grain: 1, stone: 1 });
    s.bank.deck = ['relic'];
    s = act(s, { t: 'buyCard', player: 'p1' });
    expect(code(s, { t: 'playCard', player: 'p1', card: 'relic' })).toBe('NOT_PLAYABLE');
  });
});
