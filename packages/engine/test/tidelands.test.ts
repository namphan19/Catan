// Tidelands expansion (docs/RULES_TIDELANDS.md). Scenario tests build states by editing plain JSON.
import { describe, expect, it } from 'vitest';
import {
  MIST, SCENARIOS, SCENARIO_IDS, SEA, TL, applyAction, createGame, getLegalActions, getPlayerView, layoutHexes,
  longestRoute, randInt, replay, seedRng, validateAction, victoryPoints,
  type Action, type EdgeId, type GameState, type Graph, type TlState, type VertexId,
} from '../src';
import { checkInvariants } from '../fuzz/randomGame';
import { act, graphOf, hand, pl, setHand } from './helpers';

const RS = ['base', 'tidelands', 'testdice'];
const x = (s: GameState) => s.ext.tidelands as TlState;
const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};

/** Tidelands game jumped straight to a phase with an empty board; p1 to move. */
function game(scenario = 'firstLandfall', n = 4, phase: GameState['phase'] = { k: 'main' }, seed = 'tl'): GameState {
  const s = createGame({ seed, playerCount: n, rulesets: RS, firstPlayer: 'p1', options: { scenario } });
  s.phase = phase;
  s.turn = { n: 1, current: 'p1', cardPlayed: false, roll: [3, 4] };
  return s;
}

const terrain = (s: GameState, h: string) => s.board.hexes.find((x) => x.id === h)?.terrain;
const isLandHex = (s: GameState, h: string) => {
  const t = terrain(s, h);
  return t !== undefined && t !== SEA && t !== MIST;
};
const seaSide = (s: GameState, g: Graph, e: EdgeId) => g.edgeHexes[e].length === 1 || g.edgeHexes[e].some((h) => terrain(s, h) === SEA);
const landSide = (s: GameState, g: Graph, e: EdgeId) => g.edgeHexes[e].some((h) => isLandHex(s, h));

function put(s: GameState, id: string, v: VertexId, kind: 'settlement' | 'city' = 'settlement'): void {
  s.pieces.buildings[v] = { owner: id, kind };
  pl(s, id).supply[kind] -= 1;
}
function ship(s: GameState, id: string, e: EdgeId): void {
  s.pieces.ships![e] = id;
  pl(s, id).supply.ship -= 1;
}
function road(s: GameState, id: string, e: EdgeId): void {
  s.pieces.roads[e] = id;
  pl(s, id).supply.road -= 1;
}

/** A coastal tip: a land vertex of the region touching one land hex and two sea hexes, with its pure
 *  sea edge (cogs only) and a shore edge (land on one side: a road or a cog). */
function coast(s: GameState, region = 'a', skip = 0): { v: VertexId; sea: EdgeId; shore: EdgeId } {
  const g = graphOf(s);
  const found: Array<{ v: VertexId; sea: EdgeId; shore: EdgeId }> = [];
  for (const v of g.vertices) {
    const hs = g.vertexHexes[v];
    const land = hs.filter((h) => isLandHex(s, h));
    if (hs.length !== 3 || land.length !== 1 || s.board.hexes.find((x) => x.id === land[0])?.region !== region) continue;
    const sea = g.vertexEdges[v].find((e) => seaSide(s, g, e) && !landSide(s, g, e));
    const shore = g.vertexEdges[v].find((e) => seaSide(s, g, e) && landSide(s, g, e));
    if (sea && shore) found.push({ v, sea, shore });
  }
  return found[skip];
}

/** Any edge with land on both sides (roads only). */
const inlandEdge = (s: GameState, g: Graph) => g.edges.find((e) => g.edgeHexes[e].length === 2 && g.edgeHexes[e].every((h) => isLandHex(s, h)))!;

/** The other end of edge e. */
const other = (g: Graph, e: EdgeId, v: VertexId) => g.edgeEnds[e].find((u) => u !== v)!;

/** A pure sea edge continuing from vertex v (not `not`). */
const seaFrom = (s: GameState, g: Graph, v: VertexId, not: EdgeId[] = []) =>
  g.vertexEdges[v].find((e) => !not.includes(e) && seaSide(s, g, e) && !landSide(s, g, e) && !s.pieces.roads[e] && !s.pieces.ships?.[e]);

describe('tidelands: scenarios and maps', () => {
  it('every scenario creates a board for 3 to 6 players with its own VP target', () => {
    for (const id of SCENARIO_IDS) {
      for (const n of [3, 4, 5, 6]) {
        const s = createGame({ seed: `m-${id}-${n}`, playerCount: n, rulesets: ['base', 'tidelands'], options: { scenario: id } });
        const sc = SCENARIOS[id];
        expect(s.init.layout).toBe(sc.maps[n >= 5 ? '56' : n === 4 ? '4' : '3']);
        expect(s.init.vpToWin).toBe(sc.vp);
        expect(s.board.hexes.length).toBe(layoutHexes(s.init.layout).length);
        expect(x(s).scenario).toBe(id);
        const first = getLegalActions(s, s.turn.current);
        expect(first.length).toBeGreaterThan(0);
        // Starting settlements only on land (and on the home island where the map has one).
        const g = graphOf(s);
        for (const a of first) {
          const v = (a as { v: VertexId }).v;
          expect(g.vertexHexes[v].some((h) => isLandHex(s, h))).toBe(true);
        }
        checkInvariants(s, { resources: Object.values(s.bank.hand).reduce((a, b) => a + b, 0), cards: s.bank.deck.length + (x(s).castaways?.reserved.length ?? 0) });
      }
    }
  });

  it('is deterministic per seed, and the same seed gives the same map', () => {
    const a = createGame({ seed: 'same', playerCount: 4, rulesets: ['base', 'tidelands'], options: { scenario: 'uncharted' } });
    const b = createGame({ seed: 'same', playerCount: 4, rulesets: ['base', 'tidelands'], options: { scenario: 'uncharted' } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = createGame({ seed: 'other', playerCount: 4, rulesets: ['base', 'tidelands'], options: { scenario: 'uncharted' } });
    expect(JSON.stringify(c.board)).not.toBe(JSON.stringify(a.board));
  });

  it('combines with strongholds (VP target +3) only for the basic scenarios', () => {
    const s = createGame({ seed: 'c', playerCount: 4, rulesets: ['base', 'strongholds', 'tidelands'], options: { scenario: 'firstLandfall' } });
    expect(s.init.vpToWin).toBe(17);
    expect(s.board.blocker).toBe(''); // the blocker waits for the first raid, as in strongholds
    expect(() =>
      createGame({ seed: 'c', playerCount: 4, rulesets: ['base', 'strongholds', 'tidelands'], options: { scenario: 'castaways' } }),
    ).toThrow(/cannot be played with strongholds/);
    expect(() => createGame({ seed: 'c', playerCount: 4, rulesets: ['base', 'tidelands'], options: { scenario: 'nope' } })).toThrow();
  });

  it('starting settlements go on the home island where the map has one', () => {
    const s = createGame({ seed: 'home', playerCount: 4, rulesets: ['base', 'tidelands'], options: { scenario: 'firstLandfall' } });
    const g = graphOf(s);
    const away = g.vertices.find(
      (v) => g.vertexHexes[v].some((h) => s.board.hexes.find((x) => x.id === h)?.region === 'b') &&
        !g.vertexHexes[v].some((h) => s.board.hexes.find((x) => x.id === h)?.region === 'a'),
    )!;
    expect(code(s, { t: 'placeSettlement', player: s.turn.current, v: away })).toBe('NOT_HOME');
    const sea = g.vertices.find((v) => g.vertexHexes[v].every((h) => terrain(s, h) === SEA))!;
    expect(code(s, { t: 'placeSettlement', player: s.turn.current, v: sea })).toBe('NOT_LAND');
  });
});

describe('tidelands: cogs', () => {
  it('roads stay on land, cogs at sea, and an edge never holds both', () => {
    const s = game();
    const g = graphOf(s);
    const c = coast(s);
    put(s, 'p1', c.v);
    setHand(s, 'p1', { timber: 4, clay: 2, fiber: 2 });
    expect(code(s, { t: 'placeRoad', player: 'p1', e: c.sea })).toBe('NOT_LAND');
    expect(code(s, { t: 'tl:buildShip', player: 'p1', e: inlandEdge(s, g) })).toBe('NOT_SEA');
    expect(code(s, { t: 'tl:buildShip', player: 'p1', e: c.sea })).toBe('OK');
    // A shore edge (land on one side, sea on the other) takes a road or a cog, never both.
    expect(code(s, { t: 'tl:buildShip', player: 'p1', e: c.shore })).toBe('OK');
    const r = act(s, { t: 'placeRoad', player: 'p1', e: c.shore });
    expect(code(r, { t: 'tl:buildShip', player: 'p1', e: c.shore })).toBe('OCCUPIED');
    const t = act(s, { t: 'tl:buildShip', player: 'p1', e: c.sea });
    expect(t.pieces.ships![c.sea]).toBe('p1');
    expect(hand(t, 'p1')).toMatchObject({ timber: 3, fiber: 1 });
    expect(pl(t, 'p1').supply.ship).toBe(TL.supply.ship - 1);
  });

  it('a cog connects to a cog or building, never to a road alone', () => {
    const s = game();
    const g = graphOf(s);
    const c = coast(s);
    put(s, 'p1', c.v);
    road(s, 'p1', c.shore);
    setHand(s, 'p1', { timber: 3, fiber: 3 });
    const far = other(g, c.shore, c.v);
    const fromRoadEnd = g.vertexEdges[far].find((e) => e !== c.shore && seaSide(s, g, e));
    expect(fromRoadEnd).toBeDefined();
    expect(code(s, { t: 'tl:buildShip', player: 'p1', e: fromRoadEnd! })).toBe('NOT_CONNECTED');
    const s1 = act(s, { t: 'tl:buildShip', player: 'p1', e: c.sea });
    const next = seaFrom(s1, g, other(g, c.sea, c.v))!;
    expect(code(s1, { t: 'tl:buildShip', player: 'p1', e: next })).toBe('OK');
    // An opponent building blocks the way through its intersection.
    const s2 = JSON.parse(JSON.stringify(s1)) as GameState;
    put(s2, 'p2', other(g, c.sea, c.v));
    expect(code(s2, { t: 'tl:buildShip', player: 'p1', e: next })).toBe('NOT_CONNECTED');
  });

  it('setup: a coastal starting settlement may take a cog instead of a road', () => {
    let s = createGame({ seed: 'setup', playerCount: 3, rulesets: RS, firstPlayer: 'p1', options: { scenario: 'firstLandfall' } });
    const c = coast(s);
    s = act(s, { t: 'placeSettlement', player: 'p1', v: c.v });
    const legal = getLegalActions(s, 'p1');
    expect(legal.some((a) => a.t === 'tl:buildShip')).toBe(true);
    expect(legal.some((a) => a.t === 'placeRoad')).toBe(true);
    expect(legal.filter((a) => a.t === 'placeRoad').every((a) => landSide(s, graphOf(s), (a as { e: EdgeId }).e))).toBe(true);
    s = act(s, { t: 'tl:buildShip', player: 'p1', e: c.sea });
    expect(s.phase).toMatchObject({ k: 'setup', idx: 1, step: 'settlement' });
    expect(s.pieces.ships![c.sea]).toBe('p1');
  });

  it('moves one cog per turn: an open end, not built this turn, never at the corsair', () => {
    const s = game();
    const g = graphOf(s);
    const c = coast(s);
    put(s, 'p1', c.v);
    const v1 = other(g, c.sea, c.v);
    const e2 = seaFrom(s, g, v1, [c.sea])!;
    ship(s, 'p1', c.sea);
    ship(s, 'p1', e2);
    // The ship touching the settlement has both ends closed; the outer one is open.
    expect(code(s, { t: 'tl:moveShip', player: 'p1', from: c.sea, to: e2 })).not.toBe('OK');
    const moves = getLegalActions(s, 'p1').filter((a) => a.t === 'tl:moveShip') as Array<{ from: EdgeId; to: EdgeId } & Action>;
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.from === e2)).toBe(true);
    const t = act(s, moves[0]);
    expect(t.pieces.ships![moves[0].to]).toBe('p1');
    expect(t.pieces.ships![e2]).toBeUndefined();
    expect(getLegalActions(t, 'p1').some((a) => a.t === 'tl:moveShip')).toBe(false); // one per turn
    // A cog built this turn may not move.
    const u = JSON.parse(JSON.stringify(s)) as GameState;
    x(u).fresh = [e2];
    expect(code(u, { t: 'tl:moveShip', player: 'p1', from: e2, to: moves[0].to })).toBe('JUST_BUILT');
    // Nor may a cog on the corsair's hex.
    const w = JSON.parse(JSON.stringify(s)) as GameState;
    x(w).corsair = g.edgeHexes[e2].find((h) => terrain(w, h) === SEA)!;
    expect(code(w, { t: 'tl:moveShip', player: 'p1', from: e2, to: moves[0].to })).toBe('CORSAIR');
  });

  it('longest route: roads and cogs join only at an own building', () => {
    const s = game();
    const g = graphOf(s);
    const c = coast(s);
    // two roads along the shore and two cogs at sea from the same coastal tip
    const v2 = other(g, c.shore, c.v);
    const r2 = g.vertexEdges[v2].find((e) => e !== c.shore && landSide(s, g, e))!;
    road(s, 'p1', c.shore);
    road(s, 'p1', r2);
    ship(s, 'p1', c.sea);
    ship(s, 'p1', seaFrom(s, g, other(g, c.sea, c.v), [c.sea]) ?? g.vertexEdges[other(g, c.sea, c.v)].find((e) => e !== c.sea && seaSide(s, g, e) && !s.pieces.roads[e])!);
    expect(longestRoute(g, s.pieces, 'p1')).toBe(2);
    put(s, 'p1', c.v);
    expect(longestRoute(g, s.pieces, 'p1')).toBe(4);
  });

  it('a free-roads card can place cogs', () => {
    const s = game();
    const c = coast(s);
    put(s, 'p1', c.v);
    pl(s, 'p1').cards.push('freeRoads');
    s.bank.deck.splice(s.bank.deck.indexOf('freeRoads'), 1);
    pl(s, 'p1').supply.road = 0;
    const t = act(s, { t: 'playCard', player: 'p1', card: 'freeRoads' });
    expect(t.phase.k).toBe('freeRoads');
    const legal = getLegalActions(t, 'p1');
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((a) => a.t === 'tl:buildShip')).toBe(true);
    const u = act(t, legal[0]);
    expect(u.phase.k).toBe('freeRoads');
    expect(hand(u, 'p1')).toEqual(hand(t, 'p1')); // free
  });
});

describe('tidelands: corsair, gold, landfall, mist', () => {
  it('on a 7 the roller may move the corsair and rob a cog owner on its new hex', () => {
    const s = game('firstLandfall', 4, { k: 'moveBlocker', resume: 'main' });
    const g = graphOf(s);
    const c = coast(s);
    put(s, 'p2', c.v);
    ship(s, 'p2', c.sea);
    setHand(s, 'p2', { grain: 2 });
    const hex = g.edgeHexes[c.sea].find((h) => terrain(s, h) === SEA && h !== x(s).corsair)!;
    expect(code(s, { t: 'moveBlocker', player: 'p1', hex })).toBe('BAD_HEX'); // the blocker stays on land
    const t = act(s, { t: 'tl:moveCorsair', player: 'p1', hex });
    expect(x(t).corsair).toBe(hex);
    expect(t.phase).toMatchObject({ k: 'steal', from: ['p2'] });
    const u = act(t, { t: 'steal', player: 'p1', target: 'p2' });
    expect(hand(u, 'p1').grain).toBe(1);
    // No cog may be built next to the corsair.
    const w = JSON.parse(JSON.stringify(u)) as GameState;
    setHand(w, 'p2', { timber: 1, fiber: 1 });
    w.turn.current = 'p2';
    const next = g.hexEdges[hex].find((e) => e !== c.sea && g.edgeEnds[e].includes(other(g, c.sea, c.v)));
    if (next) expect(code(w, { t: 'tl:buildShip', player: 'p2', e: next })).toBe('CORSAIR');
  });

  it('a gold mine pays a resource of choice per settlement and two per city', () => {
    const s = game('firstLandfall', 4, { k: 'preRoll' });
    const g = graphOf(s);
    const gold = s.board.hexes.find((h) => h.terrain === 'goldmine')!;
    const [v1, , v3] = g.hexVertices[gold.id];
    put(s, 'p1', v1);
    put(s, 'p2', v3, 'city');
    const [d1, d2] = gold.token! <= 7 ? [1, gold.token! - 1] : [6, gold.token! - 6];
    s.ext.forceDice = [d1, d2];
    const t = act(s, { t: 'roll', player: 'p1' });
    expect(t.phase).toMatchObject({ k: 'ext', id: 'tidelands', actors: ['p1', 'p2'] });
    expect(getLegalActions(t, 'p1').every((a) => a.t === 'tl:gold')).toBe(true);
    expect(code(t, { t: 'tl:gold', player: 'p2', bag: { stone: 1 } })).toBe('WRONG_AMOUNT');
    const u = act(t, { t: 'tl:gold', player: 'p2', bag: { stone: 1, grain: 1 } });
    expect(u.phase.k).toBe('ext');
    const w = act(u, { t: 'tl:gold', player: 'p1', bag: { clay: 1 } });
    expect(w.phase.k).toBe('main');
    expect(hand(w, 'p2')).toMatchObject({ stone: 1, grain: 1 });
    expect(hand(w, 'p1').clay).toBe(1);
    expect(x(w).gold).toBeNull();
  });

  it('landfall: the first settlement on each foreign island scores once', () => {
    const s = game('firstLandfall', 4);
    const g = graphOf(s);
    x(s).home.p1 = ['a'];
    const spots = g.vertices.filter((v) => {
      const hs = g.vertexHexes[v].filter((h) => isLandHex(s, h));
      return hs.length && hs.every((h) => s.board.hexes.find((x) => x.id === h)?.region === 'b');
    });
    const v = spots.find((u) => g.vertexEdges[u].some((e) => seaSide(s, g, e)))!;
    const e = g.vertexEdges[v].find((ed) => seaSide(s, g, ed))!;
    ship(s, 'p1', e);
    setHand(s, 'p1', { timber: 2, clay: 2, fiber: 2, grain: 2 });
    const before = victoryPoints(s, 'p1');
    const t = act(s, { t: 'placeSettlement', player: 'p1', v });
    expect(victoryPoints(t, 'p1')).toBe(before + 1 + 2);
    expect(x(t).landfall.p1).toEqual(['b']);
    // A second settlement there does not score the bonus again.
    const v2 = spots.find((u) => u !== v && !g.vertexNeighbors[v].includes(u) && g.vertexEdges[u].some((e2) => seaSide(t, g, e2)));
    if (v2) {
      const t2 = JSON.parse(JSON.stringify(t)) as GameState;
      ship(t2, 'p1', g.vertexEdges[v2].find((ed) => seaSide(t2, g, ed) && !t2.pieces.ships![ed])!);
      const b2 = victoryPoints(t2, 'p1');
      const t3 = act(t2, { t: 'placeSettlement', player: 'p1', v: v2 });
      expect(victoryPoints(t3, 'p1')).toBe(b2 + 1);
    }
  });

  it('mist: a road or cog reaching an undiscovered hex reveals it and pays its resource', () => {
    const s = game('islesOfMist', 4);
    const g = graphOf(s);
    const mist = s.board.hexes.find((h) => h.terrain === MIST)!;
    // a vertex of a home island next to the mist
    const v = g.hexVertices[mist.id].find((u) => g.vertexHexes[u].some((h) => isLandHex(s, h)));
    const left = x(s).mist[0].hexes.length;
    expect(getPlayerView(s, 'p1').ext!.tidelands).not.toHaveProperty('mist');
    if (!v) return;
    put(s, 'p1', v);
    setHand(s, 'p1', { timber: 2, clay: 1, fiber: 1 });
    const e = g.vertexEdges[v].find((ed) => g.edgeHexes[ed].includes(mist.id) && (landSide(s, g, ed) || seaSide(s, g, ed)))!;
    const a: Action = landSide(s, g, e) ? { t: 'placeRoad', player: 'p1', e } : { t: 'tl:buildShip', player: 'p1', e };
    const t = act(s, a);
    const revealed = t.board.hexes.find((h) => h.id === mist.id)!;
    expect(revealed.terrain).not.toBe(MIST);
    expect(x(t).mist[0].hexes.length).toBeLessThan(left);
    if (revealed.terrain !== SEA && revealed.terrain !== 'waste' && revealed.terrain !== 'goldmine') expect(revealed.token).toBeDefined();
  });
});

describe('tidelands: special scenarios', () => {
  it('castaways: settlements need a numbered hex; rewards go to the first cog; harbors are placed', () => {
    const s = game('castaways', 4);
    const g = graphOf(s);
    const c = x(s).castaways!;
    expect(Object.keys(c.rewards)).toHaveLength(18);
    expect(c.reserved).toHaveLength(4);
    expect(getPlayerView(s, 'p2').ext!.tidelands).toMatchObject({ castaways: { reservedLeft: 4 } });
    // The blocker never goes to an unnumbered hex.
    const islet = s.board.hexes.find((h) => h.region === 't' && h.terrain !== 'waste')!;
    const m = JSON.parse(JSON.stringify(s)) as GameState;
    m.phase = { k: 'moveBlocker', resume: 'main' };
    expect(code(m, { t: 'moveBlocker', player: 'p1', hex: islet.id })).toBe('BAD_HEX');
    // Take a VP reward: put a cog next to a reward edge.
    const [edge] = Object.entries(c.rewards).find(([, k]) => k === 'vp')!;
    const v = g.edgeEnds[edge][0];
    put(s, 'p1', v); // test shortcut: a building at the reward edge's end
    setHand(s, 'p1', { timber: 1, fiber: 1 });
    const before = victoryPoints(s, 'p1');
    const t = act(s, { t: 'tl:buildShip', player: 'p1', e: edge });
    expect(x(t).castaways!.rewards[edge]).toBeUndefined();
    expect(victoryPoints(t, 'p1')).toBe(before + 1);
    // A harbor reward: placed at once next to the taker's building when possible.
    const [hEdge] = Object.entries(c.rewards).find(([, k]) => k === 'harbor')!;
    const u = JSON.parse(JSON.stringify(s)) as GameState;
    const hv = g.edgeEnds[hEdge][0];
    put(u, 'p1', hv);
    const w = act(u, { t: 'tl:buildShip', player: 'p1', e: hEdge });
    if (w.phase.k === 'ext') {
      const place = getLegalActions(w, 'p1');
      expect(place.length).toBeGreaterThan(0);
      expect(place.every((a) => a.t === 'tl:placeHarbor')).toBe(true);
      const z = act(w, place[0]);
      expect(z.phase.k).toBe('main');
      expect(z.board.harbors).toHaveLength(1);
    } else expect(x(w).castaways!.held.p1).toHaveLength(1);
  });

  it('silk: three starting rounds, trade with villages, docked cogs stay, silk scores, empty villages end the game', () => {
    const s0 = createGame({ seed: 'silk', playerCount: 3, rulesets: RS, firstPlayer: 'p1', options: { scenario: 'silk' } });
    expect(s0.init.setupRounds).toBe(3);
    const s = game('silk', 3);
    const g = graphOf(s);
    const sk = x(s).silk!;
    const [vh, village] = Object.entries(sk.villages).find(([h]) => g.hexNeighbors[h].length === 6)!;
    // No settlement on an islet.
    const corner = g.hexVertices[vh][0];
    expect(code({ ...s, phase: { k: 'setup', idx: 0, step: 'settlement' } }, { t: 'placeSettlement', player: 'p1', v: corner })).toBe('NOT_HERE');
    // A cog on a side of the village opens trade and takes 1 silk.
    const e = g.hexEdges[vh].find((ed) => seaSide(s, g, ed))!;
    const [a] = g.edgeEnds[e];
    // test shortcut: a cog of p1 reaching the village side
    const prior = g.vertexEdges[a].find((ed) => ed !== e && seaSide(s, g, ed) && !g.edgeHexes[ed].includes(vh))!;
    ship(s, 'p1', prior);
    put(s, 'p1', other(g, prior, a));
    setHand(s, 'p1', { timber: 1, fiber: 1 });
    const t = act(s, { t: 'tl:buildShip', player: 'p1', e });
    expect(x(t).silk!.villages[vh]).toMatchObject({ silk: village.silk - 1, traders: ['p1'] });
    expect(x(t).silk!.silk.p1).toBe(1);
    // The docked cog never moves.
    x(t).fresh = [];
    expect(getLegalActions(t, 'p1').some((m) => m.t === 'tl:moveShip' && (m as unknown as { from: string }).from === e)).toBe(false);
    // Production on the village number.
    const token = t.board.hexes.find((h) => h.id === vh)!.token!;
    const r = JSON.parse(JSON.stringify(t)) as GameState;
    r.phase = { k: 'preRoll' };
    r.ext.forceDice = token <= 7 ? [1, token - 1] : [6, token - 6];
    const after = act(r, { t: 'roll', player: 'p1' });
    expect(x(after).silk!.silk.p1).toBe(2);
    expect(victoryPoints(after, 'p1')).toBeGreaterThanOrEqual(victoryPoints(t, 'p1') + 1);
    // Enough empty villages end the game at the end of the turn: most VP wins.
    const end = JSON.parse(JSON.stringify(after)) as GameState;
    end.phase = { k: 'main' };
    const vs = Object.values(x(end).silk!.villages);
    let moved = 0;
    for (const v of vs.slice(0, x(end).silk!.endAt)) {
      x(end).silk!.supply += v.silk;
      moved += v.silk;
      v.silk = 0;
    }
    expect(moved).toBeGreaterThan(0);
    const done = act(end, { t: 'endTurn', player: 'p1' });
    expect(done.winner).toBeDefined();
    expect(done.awards.longestRoute).toBeNull();
  });

  it('great works: claim a wonder you qualify for, build its levels, finish it to win', () => {
    const s = game('greatWorks', 4);
    const w = x(s).works!;
    expect(w.wonders).toHaveLength(5);
    expect(code(s, { t: 'tl:claimWonder', player: 'p1', wonder: 'cathedral' })).toBe('REQUIREMENT');
    const g = graphOf(s);
    const land = g.vertices.filter((v) => g.vertexHexes[v].some((h) => isLandHex(s, h) && s.board.hexes.find((x) => x.id === h)?.region === 'a'));
    put(s, 'p1', land[0], 'city');
    put(s, 'p1', land.find((v) => !g.vertexNeighbors[land[0]].includes(v) && v !== land[0])!, 'city');
    const t = act(s, { t: 'tl:claimWonder', player: 'p1', wonder: 'cathedral' });
    expect(x(t).works!.claims.cathedral).toBe('p1');
    expect(code(t, { t: 'tl:claimWonder', player: 'p2', wonder: 'cathedral' })).not.toBe('OK');
    setHand(t, 'p1', { clay: 4, timber: 4, fiber: 12 });
    let u = t;
    for (let i = 0; i < 3; i++) u = act(u, { t: 'tl:buildWonder', player: 'p1' });
    expect(x(u).works!.levels.p1).toBe(3);
    expect(u.winner).toBeUndefined();
    u = act(u, { t: 'tl:buildWonder', player: 'p1' });
    expect(u.winner).toBe('p1');
    // The base VP race does not apply: 10 VP alone is no win.
    const v = JSON.parse(JSON.stringify(s)) as GameState;
    for (const vv of land.slice(2, 40).filter((a, i, arr) => arr.every((b, j) => j >= i || !g.vertexNeighbors[a].includes(b))).slice(0, 4))
      if (!v.pieces.buildings[vv]) put(v, 'p1', vv, 'city');
    expect(victoryPoints(v, 'p1')).toBeGreaterThanOrEqual(10);
    const v2 = act(v, { t: 'endTurn', player: 'p1' });
    expect(v2.winner).toBeUndefined();
  });
});

describe('tidelands: corsair coves', () => {
  it('starts with a settlement and a cog each; starting pieces are roads; no blocker', () => {
    const s = createGame({ seed: 'cv', playerCount: 4, rulesets: RS, firstPlayer: 'p1', options: { scenario: 'corsairCoves' } });
    expect(s.board.blocker).toBe('');
    for (const p of s.players) {
      expect(Object.values(s.pieces.buildings).filter((b) => b.owner === p.id)).toHaveLength(1);
      expect(Object.values(s.pieces.ships!).filter((o) => o === p.id)).toHaveLength(1);
      expect(p.supply.settlement).toBe(3); // one on the board, one held in the fort
    }
    expect(s.bank.deck).not.toContain('relic'); // relics play as guards with 4 players
    const three = createGame({ seed: 'cv', playerCount: 3, rulesets: RS, options: { scenario: 'corsairCoves' } });
    expect(three.bank.deck).not.toContain('relic');
    let t = act(s, getLegalActions(s, 'p1').find((a) => a.t === 'placeSettlement')!);
    expect(getLegalActions(t, 'p1').some((a) => a.t === 'tl:buildShip')).toBe(false);
    t = act(t, getLegalActions(t, 'p1')[0]);
    expect(t.phase).toMatchObject({ k: 'setup', idx: 1 });
  });

  it('the line of cogs grows only at its end, by the shortest way; guards arm it', () => {
    const s = game('corsairCoves', 4);
    const cv = x(s).coves!;
    // The fleet starts next to p1's line; sail it away so the line may grow.
    cv.fleet = 5;
    x(s).corsair = cv.loop[5];
    setHand(s, 'p1', { timber: 3, fiber: 3 });
    const legal = getLegalActions(s, 'p1').filter((a) => a.t === 'tl:buildShip');
    expect(legal.length).toBeGreaterThan(0);
    const g = graphOf(s);
    const line = cv.lines.p1;
    let end = cv.seats.p1.start;
    for (const e of line) end = other(g, e, end);
    for (const a of legal) expect(g.edgeEnds[(a as unknown as { e: EdgeId }).e]).toContain(end);
    const t = act(s, legal[0]);
    expect(x(t).coves!.lines.p1).toHaveLength(2);
    // Guards arm the first plain cog; they cannot move a blocker here.
    pl(t, 'p1').cards.push('guard');
    t.bank.deck.splice(t.bank.deck.indexOf('guard'), 1);
    expect(code(t, { t: 'playCard', player: 'p1', card: 'guard' })).toBe('USE_ARM');
    const u = act(t, { t: 'tl:arm', player: 'p1' });
    expect(x(u).coves!.war.p1).toBe(1);
    expect(u.awards.largestForce).toBeNull();
  });

  it('a line at its fort attacks it when the action phase ends; the fort counts only once taken', () => {
    const s = game('corsairCoves', 4);
    const cv = x(s).coves!;
    const g = graphOf(s);
    // Test shortcut: lay p1's line straight to the fort along the shortest sea path.
    const seat = cv.seats.p1;
    const prev: Record<string, string> = {};
    const queue = [seat.start];
    const seen = new Set(queue);
    while (queue.length) {
      const v = queue.shift()!;
      for (const e of g.vertexEdges[v]) {
        if (!seaSide(s, g, e)) continue;
        const u = other(g, e, v);
        if (seen.has(u)) continue;
        seen.add(u);
        prev[u] = e;
        queue.push(u);
      }
    }
    const path: EdgeId[] = [];
    for (let v = seat.fort; v !== seat.start; v = other(g, prev[v], v)) path.unshift(prev[v]);
    for (const e of cv.lines.p1) {
      delete s.pieces.ships![e];
      pl(s, 'p1').supply.ship += 1;
    }
    cv.lines.p1 = [];
    for (const e of path) {
      if (s.pieces.ships![e]) continue;
      ship(s, 'p1', e);
      cv.lines.p1.push(e);
    }
    cv.war.p1 = cv.lines.p1.length; // every cog a warship: stronger than any die roll of 6 or less
    expect(cv.lines.p1.length).toBeGreaterThan(6);
    let t = s;
    for (let i = 0; i < 3; i++) {
      t = act(t, { t: 'endTurn', player: t.turn.current });
      // skip the other players' turns
      while (t.turn.current !== 'p1') {
        t.phase = { k: 'main' };
        t = act(t, { t: 'endTurn', player: t.turn.current });
      }
      t.phase = { k: 'main' };
    }
    expect(x(t).coves!.lairs.p1).toBe(0);
    expect(t.pieces.buildings[seat.fort]).toMatchObject({ owner: 'p1', kind: 'settlement' });
  });

  it('after a roll the fleet sails the lower die; a 7 lets the roller rob anyone', () => {
    const s = game('corsairCoves', 4, { k: 'preRoll' });
    setHand(s, 'p3', { grain: 1 });
    s.ext.forceDice = [5, 2];
    const t = act(s, { t: 'roll', player: 'p1' });
    expect(x(t).coves!.fleet).toBe(2);
    expect(x(t).corsair).toBe(x(t).coves!.loop[2]);
    expect(t.phase.k === 'steal' || t.phase.k === 'discard' || t.phase.k === 'ext').toBe(true);
    if (t.phase.k === 'steal') expect(t.phase.from).toContain('p3');
  });
});

describe('tidelands: engine guarantees', () => {
  for (const scenario of ['firstLandfall', 'islesOfMist', 'castaways', 'silk', 'greatWorks', 'corsairCoves', 'uncharted']) {
    it(`random play keeps every invariant and replays exactly (${scenario})`, () => {
      let s = createGame({ seed: `rp-${scenario}`, playerCount: 4, rulesets: ['base', 'tidelands'], options: { scenario } });
      const sum = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);
      const initial = { resources: sum(s.bank.hand), cards: s.bank.deck.length + (x(s).castaways?.reserved.length ?? 0) };
      const rng = seedRng(`pol-${scenario}`);
      for (let i = 0; i < 700 && !s.winner; i++) {
        const opts: Action[] = [];
        for (const p of s.players) opts.push(...getLegalActions(s, p.id).filter((a) => a.t !== 'offerTrade'));
        const build = opts.filter((a) => a.t !== 'endTurn' && a.t !== 'bankTrade' && a.t !== 'respondTrade');
        const pool = build.length && randInt(rng, 4) > 0 ? build : opts;
        s = applyAction(s, pool[randInt(rng, pool.length)]).state;
        checkInvariants(s, initial);
      }
      const r = replay(s.init, s.log.map((l) => l.action));
      expect(JSON.stringify(r)).toBe(JSON.stringify(s));
      // Views never carry the mist stacks or the reserved cards.
      const view = JSON.stringify(getPlayerView(s, 'p1'));
      expect(view).not.toContain('"mist":[');
      expect(view).not.toContain('"reserved"');
    });
  }
});
