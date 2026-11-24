// Official-rulebook alignment tests (decisions in docs/RULES_DECISIONS.md; comparison in
// docs/research/rules-check.md). Rulebook citations refer to the extracted plain text:
//   "base p.N"    = data/raw/rules/base.txt
//   "five-six p.N" = data/raw/rules/five-six.txt
// Topics: D1 first player (base p.5), paired players 5-6 (five-six p.3), counteroffers in
// player trades (base p.7).
import { describe, expect, it } from 'vitest';
import {
  applyAction, createGame, getLegalActions, satisfiesDistanceRule, validateAction,
  type Action, type GameState, type VertexId,
} from '../src';
import { act, blankGame, graphOf, newGame, pl, setHand } from './helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};

/** n vertices that pairwise satisfy the distance rule. */
function spreadVertices(s: GameState, n: number): VertexId[] {
  const g = graphOf(s);
  const pieces = { buildings: {} as GameState['pieces']['buildings'], roads: {} };
  const out: VertexId[] = [];
  for (const v of g.vertices) {
    if (out.length === n) break;
    if (satisfiesDistanceRule(g, pieces, v)) {
      pieces.buildings[v] = { owner: 'x', kind: 'settlement' };
      out.push(v);
    }
  }
  return out;
}

/** Give a player 4 cities + 1 settlement (9 VP), placed directly. Returns the settlement vertex. */
function nineVP(s: GameState, id: string): VertexId {
  const vs = spreadVertices(s, 5);
  vs.slice(0, 4).forEach((v) => (s.pieces.buildings[v] = { owner: id, kind: 'city' }));
  s.pieces.buildings[vs[4]] = { owner: id, kind: 'settlement' };
  return vs[4];
}

describe('D1: the first player (base p.5: highest roll starts; engine: RNG pick per seed)', () => {
  it('createGame picks the first player uniformly from the game RNG, deterministic per seed', () => {
    // base p.5: "Each player rolls the dice. The player with the highest roll is the first
    // player." Engine: one uniform pick from the seeded game RNG (no dice UI).
    const a = createGame({ seed: 'seed-a', playerCount: 4 });
    const b = createGame({ seed: 'seed-a', playerCount: 4 });
    expect(a.init.firstPlayer).toMatch(/^p[1-4]$/);
    expect(b.init.firstPlayer).toBe(a.init.firstPlayer); // same seed -> same seat
    expect(a.turn.current).toBe(a.init.firstPlayer);
    // The pick varies across seeds (uniform over 4 seats; 20 seeds must yield >1 seat).
    const seats = new Set(
      Array.from({ length: 20 }, (_, i) => createGame({ seed: `fp-${i}`, playerCount: 4 }).init.firstPlayer),
    );
    expect(seats.size).toBeGreaterThan(1);
  });

  it('firstPlayer option forces the seat; setup snake and turn 1 both start there', () => {
    // base p.12: setup runs from the first player forward, then backward; turn 1 starts with
    // the first player. Tests force 'p1' through createGame options.
    let s = act(newGame(4, 'test-seed', { firstPlayer: 'p1' }), { t: 'placeSettlement', player: 'p1', v: 'v:0,0,N' });
    expect(s.init.firstPlayer).toBe('p1');
    expect(s.phase).toEqual({ k: 'setup', idx: 0, step: 'road', at: 'v:0,0,N' });
    const snake = newGame(4, 'test-seed', { firstPlayer: 'p2' });
    expect(snake.turn.current).toBe('p2'); // setup snake starts at the forced seat
  });

  it('an unknown firstPlayer seat is rejected', () => {
    expect(() => createGame({ seed: 'x', playerCount: 4, firstPlayer: 'p9' })).toThrow(/firstPlayer/);
  });

  it('turn 1 starts with the first player after setup completes', () => {
    // Walk a full 3-player setup by hand (firstPlayer: 'p1'): settlement+road per seat, snake.
    let s = newGame(3, 'fp-setup', { firstPlayer: 'p1' });
    const order = ['p1', 'p2', 'p3', 'p3', 'p2', 'p1']; // snake from p1
    while (s.phase.k === 'setup') {
      const who = order[s.phase.idx];
      if (s.phase.step === 'settlement') {
        const g = graphOf(s);
        const v = g.vertices.find((x) => validateAction(s, { t: 'placeSettlement', player: who, v: x }).ok)!;
        s = act(s, { t: 'placeSettlement', player: who, v });
      } else {
        const e = getLegalActions(s, who).find((a) => a.t === 'placeRoad')!;
        s = act(s, e);
      }
    }
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn).toMatchObject({ n: 1, current: 'p1' });
  });

  it('2 players: standard board, snake setup p2 p1 p1 p2, turns alternate', () => {
    let s = newGame(2, 'duo-setup', { firstPlayer: 'p2' });
    expect(s.board.layout).toBe('standard');
    expect(s.init.extraBuild).toBe(false);
    const order = ['p2', 'p1', 'p1', 'p2'];
    while (s.phase.k === 'setup') {
      const who = order[s.phase.idx];
      if (s.phase.step === 'settlement') {
        const g = graphOf(s);
        const v = g.vertices.find((x) => validateAction(s, { t: 'placeSettlement', player: who, v: x }).ok)!;
        s = act(s, { t: 'placeSettlement', player: who, v });
      } else {
        s = act(s, getLegalActions(s, who).find((a) => a.t === 'placeRoad')!);
      }
    }
    expect(s.turn).toMatchObject({ n: 1, current: 'p2' });
    for (const p of s.players) expect(Object.values(s.pieces.buildings).filter((b) => b.owner === p.id)).toHaveLength(2);
    s = act(s, { t: 'roll', player: 'p2' });
    while (s.phase.k !== 'main') {
      const who = s.players.map((p) => p.id).find((id) => getLegalActions(s, id).length)!;
      s = act(s, getLegalActions(s, who)[0]);
    }
    s = act(s, { t: 'endTurn', player: 'p2' });
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn.current).toBe('p1');
  });
});

describe('five-six p.3: paired players (D8/D9/D11)', () => {
  it('the default large-table mode is paired for 5 and 6 players; extraBuild is opt-in', () => {
    expect(createGame({ seed: 'a', playerCount: 5 }).init.largeTableMode).toBe('paired');
    expect(createGame({ seed: 'a', playerCount: 6 }).init.largeTableMode).toBe('paired');
    expect(createGame({ seed: 'a', playerCount: 5, largeTableMode: 'extraBuild' }).init.largeTableMode).toBe('extraBuild');
    expect(createGame({ seed: 'a', playerCount: 4 }).init.largeTableMode).toBe('extraBuild'); // dummy for 3-4
  });

  it('player 2 is the third seat to the left of player 1 (seat index +3 mod n)', () => {
    // five-six p.2/p.3 diagram: "The third player to the left of the first player is player 2."
    let s5 = blankGame(5);
    s5 = act(s5, { t: 'endTurn', player: 'p1' });
    expect(s5.phase).toEqual({ k: 'paired', player: 'p4' });
    // With 6 players the pair sits opposite each other (+3 of 6).
    let s6 = blankGame(6);
    s6 = act(s6, { t: 'endTurn', player: 'p1' });
    expect(s6.phase).toEqual({ k: 'paired', player: 'p4' });
    // The rule follows the active seat: from p3 (5 players) the third seat left is p1.
    let s3 = blankGame(5);
    s3.turn.current = 'p3';
    s3 = act(s3, { t: 'endTurn', player: 'p3' });
    expect(s3.phase).toEqual({ k: 'paired', player: 'p1' });
  });

  it('player 2 may build, buy, bank-trade and play a card; never trade with players', () => {
    // five-six p.3: "Player 2 may not trade with other players. All other actions remain the same."
    let s = blankGame(5, { k: 'paired', player: 'p4' });
    setHand(s, 'p4', { timber: 5, clay: 2, fiber: 2, grain: 2, stone: 2 });
    // an own settlement gives player 2 road spots on the empty board
    const v = spreadVertices(s, 1)[0];
    s.pieces.buildings[v] = { owner: 'p4', kind: 'settlement' };
    const road = getLegalActions(s, 'p4').find((a) => a.t === 'placeRoad')!;
    expect(code(s, road)).toBe('OK');
    s = act(s, road);
    // bank trade and card buy are allowed
    expect(code(s, { t: 'bankTrade', player: 'p4', give: { timber: 4 }, get: { grain: 1 } })).toBe('OK');
    expect(code(s, { t: 'buyCard', player: 'p4' })).toBe('OK');
    // player trades are not allowed (and only the paired player may act at all)
    expect(code(s, { t: 'offerTrade', player: 'p4', give: { timber: 1 }, get: { grain: 1 } })).toBe('WRONG_PHASE');
    expect(code(s, { t: 'respondTrade', player: 'p4', accept: true })).toBe('NO_TRADE');
    expect(code(s, { t: 'roll', player: 'p4' })).toBe('WRONG_PHASE'); // player 2 never rolls
    expect(code(s, { t: 'buyCard', player: 'p2' })).toBe('NOT_YOUR_TURN');
    expect(code(s, { t: 'buyCard', player: 'p1' })).toBe('NOT_YOUR_TURN');
  });

  it('after player 2 ends, the next seat becomes player 1 (five-six p.3: pass left)', () => {
    let s = blankGame(5);
    s = act(s, { t: 'endTurn', player: 'p1' }); // p1 ends -> paired
    expect(s.phase.k).toBe('paired');
    s = act(s, { t: 'endTurn', player: 'p4' }); // player 2 ends -> next seat
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn).toMatchObject({ current: 'p2', n: 2 });
  });

  it('one card per phase: player 1 and player 2 each get one play per paired turn', () => {
    // five-six p.3: both phases allow "Play 1 development card". The lock is per phase.
    let s = blankGame(5, { k: 'main' });
    pl(s, 'p1').cards = ['harvest', 'guard'];
    s = act(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['timber', 'clay'] });
    expect(s.turn.cardPlayed).toBe(true);
    s = act(s, { t: 'endTurn', player: 'p1' }); // paired phase resets the one-card lock
    expect(s.phase).toEqual({ k: 'paired', player: 'p4' });
    expect(s.turn.cardPlayed).toBe(false);
    pl(s, 'p4').cards = ['harvest', 'guard'];
    s = act(s, { t: 'playCard', player: 'p4', card: 'harvest', resources: ['timber', 'clay'] });
    // a second play in the same phase is rejected
    expect(code(s, { t: 'playCard', player: 'p4', card: 'guard' })).toBe('ONE_CARD');
  });

  it('a card bought in the paired phase is JUST_BOUGHT there, playable once the phase ends', () => {
    // five-six p.3 note: "Development cards built when you are player 2 may be played as normal
    // when you are player 1 and vice versa" (the bought-lock is per turn, not per phase).
    let s = blankGame(5, { k: 'paired', player: 'p4' });
    setHand(s, 'p4', { fiber: 1, grain: 1, stone: 1 });
    s.bank.deck.push('guard'); // pin the bought card (the deck top would otherwise be random)
    s = act(s, { t: 'buyCard', player: 'p4' });
    expect(pl(s, 'p4').newCards.length).toBe(1);
    expect(code(s, { t: 'playCard', player: 'p4', card: pl(s, 'p4').newCards[0] })).toBe('JUST_BOUGHT');
    // ...and vice versa: player 1's purchase in the main phase is also locked for the paired phase.
    s = act(s, { t: 'endTurn', player: 'p4' }); // whole paired turn ends: everything is released
    expect(pl(s, 'p4').newCards).toEqual([]);
    expect(pl(s, 'p4').cards.length).toBe(1);
    // player 4 as an ordinary player 1 on a later turn may play it as normal
    const later = blankGame(5, { k: 'main' });
    later.turn = { ...later.turn, current: 'p4' };
    pl(later, 'p4').cards = ['guard'];
    expect(code(later, { t: 'playCard', player: 'p4', card: 'guard' })).toBe('OK');
  });

  it('a guard played by player 2 moves the blocker and returns to the paired phase', () => {
    // five-six p.3: "All other actions remain the same" (blocker move + steal work as usual).
    let s = blankGame(5, { k: 'paired', player: 'p4' });
    pl(s, 'p4').cards = ['guard'];
    s = act(s, { t: 'playCard', player: 'p4', card: 'guard' });
    expect(s.phase).toMatchObject({ k: 'moveBlocker', resume: 'paired', actor: 'p4' });
    const hex = getLegalActions(s, 'p4').find((a) => a.t === 'moveBlocker')!;
    s = act(s, hex); // empty board: no steal candidates, straight back to the paired phase
    expect(s.phase).toEqual({ k: 'paired', player: 'p4' });
    expect(s.turn.cardPlayed).toBe(true);
  });

  it('freeRoads played by player 2 builds roads and returns to the paired phase', () => {
    let s = blankGame(5, { k: 'paired', player: 'p4' });
    // an own settlement gives player 2 road spots on the empty board
    const v = spreadVertices(s, 1)[0];
    s.pieces.buildings[v] = { owner: 'p4', kind: 'settlement' };
    pl(s, 'p4').cards = ['freeRoads'];
    s = act(s, { t: 'playCard', player: 'p4', card: 'freeRoads' });
    expect(s.phase).toMatchObject({ k: 'freeRoads', left: 2, actor: 'p4' });
    s = act(s, getLegalActions(s, 'p4').find((a) => a.t === 'placeRoad')!);
    s = act(s, getLegalActions(s, 'p4').find((a) => a.t === 'placeRoad')!);
    expect(s.phase).toEqual({ k: 'paired', player: 'p4' });
    expect(pl(s, 'p4').supply.road).toBe(13);
  });

  it('player 2 wins immediately on reaching the VP target in their phase (five-six p.3)', () => {
    // "If player 2 reaches 10 VPs during their part of the paired player turn, the game ends
    // immediately, and they win."
    let s = blankGame(5, { k: 'paired', player: 'p4' });
    const v = nineVP(s, 'p4');
    setHand(s, 'p4', { grain: 2, stone: 3 });
    const r = applyAction(s, { t: 'buildCity', player: 'p4', v });
    expect(r.state.winner).toBe('p4');
    expect(r.state.phase.k).toBe('over');
    expect(r.events).toContainEqual({ e: 'won', player: 'p4', vp: 10 });
  });

  it('player 1 still wins before player 2 acts (five-six p.3)', () => {
    // "the game ends immediately - even before player 2 takes their Action phase."
    let s = blankGame(5, { k: 'main' });
    const v = nineVP(s, 'p1');
    setHand(s, 'p1', { grain: 2, stone: 3 });
    s = act(s, { t: 'buildCity', player: 'p1', v });
    expect(s.winner).toBe('p1');
    expect(code(s, { t: 'endTurn', player: 'p1' })).toBe('GAME_OVER');
  });

  it('legacy extraBuild mode is unchanged: windows for every other seat in order', () => {
    let s = blankGame(5);
    s.init.largeTableMode = 'extraBuild';
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.phase).toEqual({ k: 'extraBuild', queue: ['p2', 'p3', 'p4', 'p5'] });
    expect(code(s, { t: 'buyCard', player: 'p3' })).toBe('NOT_YOUR_TURN');
  });
});

describe('base p.7: player trade negotiation (accept / counteroffer; replaces D20)', () => {
  function scenario() {
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 2 });
    setHand(s, 'p2', { clay: 3 });
    return act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { clay: 1 } });
  }

  it('respondTrade accepts the accept shorthand and the full response form', () => {
    let s = scenario();
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: true })).toBe('OK');
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    expect(s.trade!.responses.p2).toEqual({ response: 'accept' });
    expect(code(s, { t: 'respondTrade', player: 'p3', response: 'decline' })).toBe('OK');
    expect(code(s, { t: 'respondTrade', player: 'p2', response: 'decline' })).toBe('OK'); // change of mind
  });

  it('there is no one-response lock any more: answers may change until confirmation', () => {
    // base p.7: players "may accept, make counteroffers or make own proposals", so a responder
    // can keep negotiating until the offer is confirmed or cancelled (ALREADY_RESPONDED removed).
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: false });
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: true })).toBe('OK');
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    s = act(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 2 }, get: { timber: 2 } });
    expect(s.trade!.responses.p2).toEqual({ response: 'counter', give: { clay: 2 }, get: { timber: 2 } });
    // confirm after the final accept executes the original offer
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    s = act(s, { t: 'confirmTrade', player: 'p1', with: 'p2' });
    expect(pl(s, 'p1').hand).toMatchObject({ timber: 1, clay: 1 });
    expect(s.trade).toBeUndefined();
  });

  it('answers per offer are capped, so a responder cannot toggle forever (ANSWER_LIMIT)', () => {
    let s = scenario();
    for (let i = 0; i < 5; i++) s = act(s, { t: 'respondTrade', player: 'p2', accept: i % 2 === 0 });
    expect(code(s, { t: 'respondTrade', player: 'p2', accept: false })).toBe('ANSWER_LIMIT');
    expect(getLegalActions(s, 'p2').some((a) => a.t === 'respondTrade')).toBe(false);
    expect(code(s, { t: 'respondTrade', player: 'p3', accept: false })).toBe('OK'); // per responder
  });

  it('a counteroffer stores the responder terms and confirmTrade executes those terms', () => {
    // base p.7: the counteroffer replaces the terms the offerer may confirm.
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 2 }, get: { timber: 2 } });
    const r = applyAction(s, { t: 'confirmTrade', player: 'p1', with: 'p2' });
    // counter semantics: responder gives {clay:2} and gets {timber:2}
    expect(pl(r.state, 'p1').hand).toMatchObject({ timber: 0, clay: 2 });
    expect(pl(r.state, 'p2').hand).toMatchObject({ clay: 1, timber: 2 });
    expect(r.events).toContainEqual({ e: 'traded', a: 'p1', b: 'p2', aGave: { timber: 2 }, bGave: { clay: 2 } });
  });

  it('confirmTrade re-validates both hands against the executed terms', () => {
    let s = scenario();
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    setHand(s, 'p2', { clay: 0 }); // p2 spent the requested cards in the meantime
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('NOT_ENOUGH');
    setHand(s, 'p2', { clay: 3 });
    setHand(s, 'p1', { timber: 0 }); // offerer no longer holds their side either
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p2' })).toBe('NOT_ENOUGH');
  });

  it('a counter must be a valid non-empty trade and affordable by the responder', () => {
    let s = scenario();
    expect(code(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 0 }, get: { timber: 1 } }))
      .toBe('EMPTY_TRADE');
    expect(code(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 4 }, get: { timber: 1 } }))
      .toBe('NOT_ENOUGH');
    expect(code(s, { t: 'respondTrade', player: 'p2', response: 'counter', give: { clay: 1 }, get: { timber: 1 } }))
      .toBe('OK');
  });

  it('legal() still lists accept/decline plus 1-for-1 counter samples for responders', () => {
    const s = scenario();
    const resp = getLegalActions(s, 'p2').filter((a) => a.t === 'respondTrade');
    expect(resp.some((a) => (a as { accept?: boolean }).accept === true)).toBe(true);
    expect(resp.some((a) => (a as { accept?: boolean }).accept === false)).toBe(true);
    expect(resp.some((a) => (a as { response?: string }).response === 'counter')).toBe(true);
    // the offerer does not respond to their own offer
    expect(getLegalActions(s, 'p1').some((a) => a.t === 'respondTrade')).toBe(false);
  });
});
