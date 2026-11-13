// QA tests: RULES.md 6 (trading) and decision D5 (multiples), D6 (player trades), D8 (no trades in
// the extra build phase).
import { describe, expect, it } from 'vitest';
import { validateAction, type Action, type GameState } from '../../src';
import { act, blankGame, hand, pl, setHand, totalResources } from '../helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};

describe('bank trade (RULES.md 6, D5)', () => {
  it('8 timber -> 2 cards in one action; 8 timber -> 1 card is BAD_RATE', () => {
    // RULES.md 6 + D5: "8 -> 2" multiples are allowed; the received cards may be different kinds.
    let s = blankGame(4);
    setHand(s, 'p1', { timber: 8 });
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 8 }, get: { grain: 1 } })).toBe('BAD_RATE');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 8 }, get: { grain: 1, stone: 1 } })).toBe('OK');
    const before = totalResources(s);
    s = act(s, { t: 'bankTrade', player: 'p1', give: { timber: 8 }, get: { grain: 1, stone: 1 } });
    expect(hand(s, 'p1')).toMatchObject({ timber: 0, grain: 1, stone: 1 });
    expect(totalResources(s)).toBe(before);
  });

  it('a specific 2:1 harbor also allows multiples (4 -> 2)', () => {
    // RULES.md 6 (2:1 harbor) + D5 (multiples).
    const s = blankGame(4);
    const harbor = s.board.harbors.find((h) => h.kind === 'timber')!;
    s.pieces.buildings[harbor.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    setHand(s, 'p1', { timber: 4, clay: 4 });
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { grain: 1, stone: 1 } })).toBe('OK');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 3 }, get: { grain: 1 } })).toBe('BAD_RATE');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { clay: 2 }, get: { grain: 1 } })).toBe('BAD_RATE');
  });

  it('BANK_EMPTY when the bank lacks the requested resource', () => {
    // RULES.md 6 + API.md error codes.
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 4 });
    s.bank.hand.grain = 0;
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { grain: 1 } })).toBe('BANK_EMPTY');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { stone: 1 } })).toBe('OK');
  });

  it('cannot give two kinds to the bank at once (ONE_KIND)', () => {
    // RULES.md 6: "4 identical resources for 1 of another kind".
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 4, clay: 4 });
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 2, clay: 2 }, get: { grain: 1 } })).toBe('ONE_KIND');
  });
});

describe('player trade (RULES.md 6, D6)', () => {
  function offerScenario() {
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 2 });
    setHand(s, 'p2', { grain: 2 });
    return act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } });
  }

  it('confirm fails when the acceptor no longer has the requested cards', () => {
    // D6: "responders must hold the requested cards to accept"; confirm re-checks both hands.
    let s = offerScenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    setHand(s, 'p2', {}); // p2 spends/gives the grain away before confirmation
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('NOT_ENOUGH');
  });

  it('confirm fails when the offerer no longer has the offered cards', () => {
    // D6: the offerer must still hold the bundle at confirmation time.
    let s = offerScenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    setHand(s, 'p1', {});
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('NOT_ENOUGH');
  });

  it('a new offer replaces the old one (D6)', () => {
    // D6: "A new offer replaces the old one".
    let s = offerScenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    s = act(s, { t: 'offerTrade', player: 'p1', give: { timber: 2 }, get: { grain: 2 } });
    expect(s.trade).toMatchObject({ give: { timber: 2 }, get: { grain: 2 }, responses: {} });
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('NOT_ACCEPTED');
  });

  it('offers are cleared at the end of the turn (D6)', () => {
    // D6: "offers expire at end of turn"; after endTurn the trade is gone and cannot be answered.
    let s = offerScenario();
    s = act(s, { t: 'respondTrade', player: 'p4', accept: false });
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.trade).toBeUndefined();
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: true })).toBe('NO_TRADE');
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('WRONG_PHASE');
  });

  it('the offering player cannot respond to the own offer (D6)', () => {
    // D6 (only other players accept/decline).
    const s = offerScenario();
    expect(code(s, { t: 'respondTrade', player: 'p1', accept: true })).toBe('OWN_OFFER');
    expect(code(s, { t: 'respondTrade', player: 'p1', accept: false })).toBe('OWN_OFFER');
  });

  it('gifts and same-resource bundles are rejected (RULES.md 6, D6)', () => {
    // RULES.md 6: "Both sides must be non-empty and use different resources; gifts are not possible."
    let s = blankGame(4);
    setHand(s, 'p1', { timber: 2, grain: 1 });
    expect(code(s, { t: 'offerTrade', player: 'p1', give: {}, get: { grain: 1 } })).toBe('EMPTY_TRADE');
    expect(code(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: {} })).toBe('EMPTY_TRADE');
    expect(code(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { timber: 1 } })).toBe('SAME_RESOURCE');
    expect(code(s, { t: 'offerTrade', player: 'p1', give: { timber: 3 }, get: { grain: 1 } })).toBe('NOT_ENOUGH');
    s = act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } });
    expect(s.trade!.from).toBe('p1');
  });

  it('bank and player trades are only allowed in the main phase of the active player (D6, D8)', () => {
    // RULES.md 6: "main phase of the active player only"; D8: no trades in the extra build phase.
    const pre = blankGame(4, { k: 'preRoll' });
    pl(pre, 'p1').hand = { timber: 4, clay: 0, fiber: 0, grain: 0, stone: 0 };
    expect(code(pre, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { grain: 1 } })).toBe('WRONG_PHASE');
    expect(code(pre, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } })).toBe('WRONG_PHASE');

    let s = blankGame(5);
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.phase.k).toBe('extraBuild');
    setHand(s, 'p2', { timber: 4, grain: 4 });
    expect(code(s, { t: 'bankTrade', player: 'p2', give: { timber: 1 }, get: { grain: 1 } })).toBe('WRONG_PHASE');
    expect(code(s, { t: 'offerTrade', player: 'p2', give: { timber: 1 }, get: { grain: 1 } })).toBe('WRONG_PHASE');
  });
});
