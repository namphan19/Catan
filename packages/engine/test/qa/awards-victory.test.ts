// QA tests: RULES.md 9 (awards and victory) and decisions D10 (longest route after cuts) and
// D11 (when a win is checked).
import { describe, expect, it } from 'vitest';
import {
  applyAction, getLegalActions, validateAction, victoryPoints,
  type Action, type GameState, type VertexId,
} from '../../src';
import { act, blankGame, findPath, graphOf, hand, newGame, pl, setHand } from '../helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};

/** n vertices that pairwise satisfy the distance rule (own helper, no engine internals). */
function spreadVertices(s: GameState, n: number): VertexId[] {
  const g = graphOf(s);
  const buildings: GameState['pieces']['buildings'] = {};
  const out: VertexId[] = [];
  for (const v of g.vertices) {
    if (out.length === n) break;
    if (buildings[v]) continue;
    if (!g.vertexNeighbors[v].some((x) => buildings[x])) {
      buildings[v] = { owner: 'x', kind: 'settlement' };
      out.push(v);
    }
  }
  return out;
}

/** A simple path of n edges whose vertices avoid the given set. */
function disjointPath(g: ReturnType<typeof graphOf>, used: Set<VertexId>, n: number) {
  for (const v of g.vertices) {
    if (used.has(v)) continue;
    try {
      const p = findPath(g, v, n);
      if (p.vertices.every((x) => !used.has(x))) return p;
    } catch {
      // no path of length n from this start
    }
  }
  throw new Error(`no disjoint path of ${n}`);
}

/** Give a player 4 cities + 1 settlement = 9 VP, placed directly. Returns the settlement vertex. */
function nineVP(s: GameState, id: string): VertexId {
  const vs = spreadVertices(s, 5);
  vs.slice(0, 4).forEach((v) => (s.pieces.buildings[v] = { owner: id, kind: 'city' }));
  s.pieces.buildings[vs[4]] = { owner: id, kind: 'settlement' };
  return vs[4];
}

describe('longest route (RULES.md 9, D10)', () => {
  /** p1 has 4 roads along a straight footprint, then builds the 5th as the tested action. */
  function fourRoads() {
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 5);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    path.edges.slice(0, 4).forEach((e) => (s.pieces.roads[e] = 'p1'));
    setHand(s, 'p1', { timber: 1, clay: 1 });
    return { s, g, path };
  }

  it('an own city in the middle does not cut the route (D10)', () => {
    // RULES.md 9: a route is only broken at a vertex with an *opponent* building.
    const { s, path } = fourRoads();
    s.pieces.buildings[path.vertices[2]] = { owner: 'p1', kind: 'city' };
    const r = applyAction(s, { t: 'placeRoad', player: 'p1', e: path.edges[4] });
    expect(r.state.awards.longestRoute).toBe('p1');
    expect(victoryPoints(r.state, 'p1')).toBe(1 + 2 + 2); // settlement + city + longest route
  });

  it('a road through an opponent city is cut, so no award is granted (D10)', () => {
    // RULES.md 9: "it is broken at a vertex with an opponent building" - the 5-road line becomes two
    // short stubs and must not score 5.
    const { s, path } = fourRoads();
    s.pieces.buildings[path.vertices[2]] = { owner: 'p2', kind: 'city' };
    const r = applyAction(s, { t: 'placeRoad', player: 'p1', e: path.edges[4] });
    expect(r.state.awards.longestRoute).toBeNull();
    expect(victoryPoints(r.state, 'p1')).toBe(1); // only the settlement; the p2 city is not p1's
  });

  it('the first player with 5 roads takes it and keeps it on a tie (RULES.md 9, D10)', () => {
    // RULES.md 9: first player with >= 5; another player needs a strictly longer route.
    const { s, path } = fourRoads();
    let cur = applyAction(s, { t: 'placeRoad', player: 'p1', e: path.edges[4] }).state;
    expect(cur.awards.longestRoute).toBe('p1');
    expect(victoryPoints(cur, 'p1')).toBe(3); // settlement 1 + route 2

    const g = graphOf(cur);
    const used = new Set(path.vertices);
    const p2 = disjointPath(g, used, 6);
    p2.edges.slice(0, 4).forEach((e) => (cur.pieces.roads[e] = 'p2'));
    cur.turn = { n: 2, current: 'p2', cardPlayed: false };
    setHand(cur, 'p2', { timber: 2, clay: 2 });
    cur = act(cur, { t: 'placeRoad', player: 'p2', e: p2.edges[4] });
    expect(cur.awards.longestRoute).toBe('p1'); // tie at 5: holder keeps
    cur = act(cur, { t: 'placeRoad', player: 'p2', e: p2.edges[5] });
    expect(cur.awards.longestRoute).toBe('p2'); // strictly longer: transfer
  });

  it('when the holder is cut and the longest tie is >= 5, nobody holds the award (RULES.md 9, D10)', () => {
    // RULES.md 9: "If the holder's route is cut and several players tie for the longest (>= 5),
    // nobody holds it"; D10 recomputes after every road and settlement placement.
    const { s, g, path } = fourRoads();
    let cur = applyAction(s, { t: 'placeRoad', player: 'p1', e: path.edges[4] }).state;
    expect(cur.awards.longestRoute).toBe('p1');

    const used1 = new Set(path.vertices);
    const p2 = disjointPath(g, used1, 5);
    p2.edges.forEach((e) => (cur.pieces.roads[e] = 'p2'));
    const used2 = new Set([...used1, ...p2.vertices]);
    const p3 = disjointPath(g, used2, 5);
    cur.pieces.buildings[p2.vertices[0]] = { owner: 'p2', kind: 'settlement' };
    cur.pieces.buildings[p3.vertices[0]] = { owner: 'p3', kind: 'settlement' };
    p3.edges.slice(0, 4).forEach((e) => (cur.pieces.roads[e] = 'p3'));

    // p2's settlement cuts p1's route in the middle (direct setup, like a real placement would).
    cur.pieces.buildings[path.vertices[2]] = { owner: 'p2', kind: 'settlement' };
    cur.turn = { n: 3, current: 'p3', cardPlayed: false };
    setHand(cur, 'p3', { timber: 1, clay: 1 });
    // Triggers updateLongestRoute: p1 is cut to 2+2, p2 and p3 both have 5 -> tie -> nobody.
    cur = act(cur, { t: 'placeRoad', player: 'p3', e: p3.edges[4] });
    expect(cur.awards.longestRoute).toBeNull();
  });
});

describe('victory (RULES.md 9, D11)', () => {
  it('9 VP + a relic bought during the own turn wins immediately (hidden VP counts)', () => {
    // RULES.md 9 (relic = 1 VP, hidden) + D11 (checked after every action during the own turn).
    const s = blankGame(4);
    nineVP(s, 'p1'); // 9 VP public
    expect(victoryPoints(s, 'p1')).toBe(9);
    setHand(s, 'p1', { fiber: 1, grain: 1, stone: 1 });
    s.bank.deck = ['relic'];
    expect(code(s, { t: 'buyCard', player: 'p1' })).toBe('OK');
    const r = applyAction(s, { t: 'buyCard', player: 'p1' });
    expect(r.state.winner).toBe('p1');
    expect(r.state.phase.k).toBe('over');
    expect(victoryPoints(r.state, 'p1')).toBe(10);
    expect(victoryPoints(r.state, 'p1', { public: true })).toBe(9); // opponents cannot see the relic
    expect(r.events).toContainEqual({ e: 'won', player: 'p1', vp: 10 });
    expect(getLegalActions(r.state, 'p1')).toEqual([]);
  });

  it('a player at 10 VP wins as soon as their own turn starts, not before (D11)', () => {
    // D11: wins are only checked for the active player; reaching 10 outside the own turn wins when
    // the own turn starts (before rolling).
    let s = blankGame(4);
    s.turn = { n: 1, current: 'p4', cardPlayed: false };
    nineVP(s, 'p1');
    pl(s, 'p1').cards = ['relic'];
    expect(victoryPoints(s, 'p1')).toBe(10);
    pl(s, 'p4').cards = ['harvest'];
    s = act(s, { t: 'playCard', player: 'p4', card: 'harvest', resources: ['grain', 'stone'] });
    expect(s.winner).toBeUndefined(); // still p4's turn
    s = act(s, { t: 'endTurn', player: 'p4' });
    expect(s.turn.current).toBe('p1');
    expect(s.winner).toBe('p1');
    expect(s.phase.k).toBe('over');
  });

  it('awards count 2 VP each towards the 10 (RULES.md 9)', () => {
    // RULES.md 9: settlement 1, city 2, relic 1, each award 2.
    const s = blankGame(4);
    nineVP(s, 'p1'); // 4 cities + 1 settlement = 9
    s.awards.longestRoute = 'p2';
    expect(victoryPoints(s, 'p1')).toBe(9);
    expect(victoryPoints(s, 'p2')).toBe(2);
  });

  it('the game rejects further actions after a win (RULES.md 9)', () => {
    // RULES.md 9 + API.md: winner set -> GAME_OVER for every action.
    const s = blankGame(4);
    const v = nineVP(s, 'p1');
    setHand(s, 'p1', { grain: 2, stone: 3 });
    const r = applyAction(s, { t: 'buildCity', player: 'p1', v });
    expect(r.state.winner).toBe('p1');
    expect(code(r.state, { t: 'endTurn', player: 'p1' })).toBe('GAME_OVER');
    expect(code(r.state, { t: 'roll', player: 'p1' })).toBe('GAME_OVER');
  });

  it('3 players also win at 10; target is configurable via vpToWin', () => {
    // RULES.md 9 + API.md createGame({vpToWin}).
    const s = blankGame(3);
    s.init.vpToWin = 8;
    nineVP(s, 'p1');
    setHand(s, 'p1', { grain: 2, stone: 3 });
    const v = Object.keys(s.pieces.buildings).find((x) => s.pieces.buildings[x].kind === 'settlement')!;
    const r = applyAction(s, { t: 'buildCity', player: 'p1', v });
    expect(victoryPoints(r.state, 'p1')).toBe(10); // 8 (4 cities) + 2 (replaced city instead of settlement)
    expect(r.state.winner).toBe('p1');
    expect(newGame(3).init.vpToWin).toBe(10);
  });
});
