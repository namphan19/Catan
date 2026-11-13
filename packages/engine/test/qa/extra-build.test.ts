// QA tests: RULES.md 8 (extra build phase, 5-6 players) and decisions D8 (allowed actions),
// D9 (cards bought in the window), D11 (win timing in a window).
import { describe, expect, it } from 'vitest';
import { getLegalActions, validateAction, type Action, type GameState } from '../../src';
import { act, blankGame, findPath, graphOf, pl, setHand } from '../helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};
const seats = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function queueOf(s: GameState): string[] {
  if (s.phase.k !== 'extraBuild') throw new Error(`not in extraBuild: ${s.phase.k}`);
  return s.phase.queue;
}

/** End the active player's turn and walk through the whole extra build phase. */
function walkWindow(start: GameState): { active: string; visited: string[]; end: GameState } {
  const active = start.turn.current;
  let s = act(start, { t: 'endTurn', player: active });
  expect(s.phase.k).toBe('extraBuild');
  const visited: string[] = [];
  while (s.phase.k === 'extraBuild') {
    const q = queueOf(s);
    visited.push(q[0]);
    s = act(s, { t: 'endTurn', player: q[0] });
  }
  return { active, visited, end: s };
}

describe('extra build phase (RULES.md 8, D8, D9)', () => {
  it('6 players: every player passes through every extra build window in seat order', () => {
    // RULES.md 8: after each turn the other players get one build window "in seat order (starting
    // left of the active player)" and then the next player starts their turn.
    let s = blankGame(6);
    expect(s.init.extraBuild).toBe(true);
    const seen: string[] = [];
    for (let turn = 0; turn < 6; turn++) {
      // Turns start in preRoll; skip the roll (it is tested elsewhere) to reach the main phase.
      if (s.phase.k === 'preRoll') s.phase = { k: 'main' };
      const active = s.turn.current;
      const i = seats.indexOf(active);
      const expectedQueue = [...seats.slice(i + 1), ...seats.slice(0, i)];
      const beforeN = s.turn.n;
      const { visited, end } = walkWindow(s);
      expect(visited).toEqual(expectedQueue);
      seen.push(...visited);
      expect(end.phase.k).toBe('preRoll');
      expect(end.turn.current).toBe(seats[(i + 1) % 6]);
      expect(end.turn.n).toBe(beforeN + 1);
      s = end;
    }
    // 6 turns x 5 windows: every player got a window in every other player's turn.
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(6);
  });

  it('in a build window only build/buy actions are legal; others are rejected (D8)', () => {
    // D8: allowed road/settlement/city/buyCard; no trades, no card plays.
    let s = blankGame(5);
    s = act(s, { t: 'endTurn', player: 'p1' });
    const [first, second] = queueOf(s);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.buildings[path.vertices[0]] = { owner: first, kind: 'settlement' };
    s.pieces.roads[path.edges[0]] = first;
    s.pieces.roads[path.edges[1]] = first;
    setHand(s, first, { timber: 3, clay: 3, fiber: 2, grain: 3, stone: 4 });
    s.bank.deck.push('guard');
    const types = new Set<string>(getLegalActions(s, first).map((a) => a.t));
    for (const t of ['placeRoad', 'placeSettlement', 'buildCity', 'buyCard', 'endTurn']) {
      expect(types.has(t)).toBe(true);
    }
    for (const t of ['bankTrade', 'offerTrade', 'respondTrade', 'playCard', 'roll']) {
      expect(types.has(t)).toBe(false);
    }
    pl(s, first).cards = ['harvest'];
    expect(code(s, { t: 'bankTrade', player: first, give: { timber: 4 }, get: { grain: 1 } })).toBe('WRONG_PHASE');
    expect(code(s, { t: 'offerTrade', player: first, give: { timber: 1 }, get: { grain: 1 } })).toBe('WRONG_PHASE');
    expect(code(s, { t: 'playCard', player: first, card: 'harvest', resources: ['grain', 'stone'] })).toBe('WRONG_PHASE');
    expect(code(s, { t: 'roll', player: first })).toBe('WRONG_PHASE');
    // only the head of the queue may act
    expect(code(s, { t: 'placeRoad', player: second, e: graphOf(s).edges[0] })).toBe('NOT_YOUR_TURN');
  });

  it('a card bought in a build window is playable on the owner next turn, not in the window (D9)', () => {
    // D9: bought cards "become playable when that player's window ends".
    let s = blankGame(5);
    s = act(s, { t: 'endTurn', player: 'p1' });
    const queue = queueOf(s); // [p2, p3, p4, p5]
    const first = queue[0];
    setHand(s, first, { fiber: 1, grain: 1, stone: 1 });
    s.bank.deck.push('guard');
    s = act(s, { t: 'buyCard', player: first });
    expect(pl(s, first).newCards).toEqual(['guard']);
    expect(code(s, { t: 'playCard', player: first, card: 'guard' })).toBe('WRONG_PHASE');
    for (const p of queue) s = act(s, { t: 'endTurn', player: p });
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn.current).toBe(first);
    expect(pl(s, first).cards).toEqual(['guard']);
    expect(pl(s, first).newCards).toEqual([]);
    expect(code(s, { t: 'playCard', player: first, card: 'guard' })).toBe('OK');
  });

  it('extra build is off for 3-4 players and can be disabled for 5-6 (RULES.md 8)', () => {
    // RULES.md 8: the extra build phase only exists with 5-6 players (createGame extraBuild option).
    const four = act(blankGame(4), { t: 'endTurn', player: 'p1' });
    expect(four.phase.k).toBe('preRoll');
    expect(four.turn.current).toBe('p2');

    const five = blankGame(5);
    five.init.extraBuild = false;
    const started = act(five, { t: 'endTurn', player: 'p1' });
    expect(started.phase.k).toBe('preRoll');
    expect(started.turn.current).toBe('p2');
  });
});
