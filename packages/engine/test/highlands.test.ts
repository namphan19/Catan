// Highlands expansion (docs/RULES_HIGHLANDS.md). Tests build states by editing plain JSON.
import { describe, expect, it } from 'vitest';
import {
  GOODS, HL, RUIN, RUIN_CITY, applyAction, createGame, decide, getLegalActions, getPlayerView, satisfiesDistanceRule,
  validateAction, victoryPoints,
  type Action, type EdgeId, type GameState, type HlState, type VertexId,
} from '../src';
import { checkInvariants, runRandomGame } from '../fuzz/randomGame';
import { act, graphOf, hand, pl, setHand } from './helpers';

const RS = ['base', 'highlands', 'testdice'];
const LAND = ['forest', 'claypit', 'meadow', 'field', 'quarry'];
const x = (s: GameState) => s.ext.highlands as HlState;
const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};
const ext = (a: Record<string, unknown>) => a as unknown as Action;

/** Highlands game jumped to a phase with an empty board; p1 to move. Starter map unless told otherwise. */
function game(n = 4, phase: GameState['phase'] = { k: 'main' }, map = 'starter', seed = 'hl'): GameState {
  const s = createGame({ seed, playerCount: n, rulesets: RS, firstPlayer: 'p1', options: { map } });
  s.phase = phase;
  s.turn = { n: 1, current: 'p1', cardPlayed: false, roll: [3, 4] };
  return s;
}

const terrain = (s: GameState, h: string) => s.board.hexes.find((x) => x.id === h)?.terrain ?? '';
const isLand = (s: GameState, h: string) => LAND.includes(terrain(s, h));
const pathVertex = (s: GameState, v: VertexId) => graphOf(s).vertexHexes[v].some((h) => isLand(s, h));
const pathEdge = (s: GameState, e: EdgeId) => graphOf(s).edgeHexes[e].some((h) => isLand(s, h));

function put(s: GameState, id: string, v: VertexId, kind = 'settlement'): void {
  s.pieces.buildings[v] = { owner: id, kind };
  const piece = kind === 'city' || kind === RUIN_CITY ? 'city' : 'settlement';
  pl(s, id).supply[piece] -= 1;
}
function road(s: GameState, id: string, e: EdgeId): void {
  s.pieces.roads[e] = id;
  pl(s, id).supply.road -= 1;
}

/** n buildable vertices, pairwise at least 3 apart (so roads between them stay free). */
function spots(s: GameState, n: number, where: (v: VertexId) => boolean = () => true): VertexId[] {
  const g = graphOf(s);
  const out: VertexId[] = [];
  const near = (a: VertexId, b: VertexId) => a === b || g.vertexNeighbors[a].some((m) => m === b || g.vertexNeighbors[m].includes(b));
  for (const v of g.vertices) {
    if (!pathVertex(s, v) || !satisfiesDistanceRule(g, s.pieces, v) || !where(v)) continue;
    if (out.some((o) => near(o, v))) continue;
    out.push(v);
    if (out.length === n) break;
  }
  if (out.length < n) throw new Error('not enough spots');
  return out;
}

/** A path edge at v and the vertex at its other end. */
function pathFrom(s: GameState, v: VertexId, skip = 0): { e: EdgeId; to: VertexId } {
  const g = graphOf(s);
  const e = g.vertexEdges[v].filter((x) => pathEdge(s, x))[skip];
  const [a, b] = g.edgeEnds[e];
  return { e, to: a === v ? b : a };
}

const SETTLEMENT = { timber: 1, clay: 1, fiber: 1, grain: 1 };

describe('highlands: board', () => {
  it('builds the printed map: coast, land, jungle and the wilds; numbers on their spots', () => {
    const s = game();
    expect(s.board.layout).toBe('highlands');
    expect(s.board.hexes).toHaveLength(30);
    const count = (t: string) => s.board.hexes.filter((h) => h.terrain === t).length;
    expect([count('forest'), count('meadow'), count('field'), count('claypit'), count('quarry')]).toEqual([4, 4, 4, 3, 3]);
    expect([count('jungle'), count('grove'), count('fishery'), count('sea'), count('wilds')]).toEqual([3, 3, 3, 2, 1]);
    expect(s.board.hexes.filter((h) => h.token !== undefined)).toHaveLength(27);
    expect(s.board.blocker).toBe('h:-2,3');
    expect(terrain(s, 'h:-2,3')).toBe('wilds');
    expect(s.board.harbors).toEqual([]);
    expect(s.init.vpToWin).toBe(11);
  });

  it('variable setup shuffles only the land; tokens, coast and jungle stay', () => {
    const a = game(4, { k: 'main' }, 'starter');
    for (let i = 0; i < 4; i++) {
      const b = game(4, { k: 'main' }, 'variable', `v${i}`);
      for (const h of b.board.hexes) {
        const ref = a.board.hexes.find((y) => y.id === h.id)!;
        expect(h.token).toBe(ref.token);
        if (!LAND.includes(ref.terrain)) expect(h.terrain).toBe(ref.terrain);
        else expect(LAND).toContain(h.terrain);
      }
    }
    const differs = [0, 1, 2, 3].some((i) =>
      game(4, { k: 'main' }, 'variable', `v${i}`).board.hexes.some((h, k) => h.terrain !== a.board.hexes[k].terrain),
    );
    expect(differs).toBe(true);
  });

  it('bank, supply and the two development stacks', () => {
    const s = game();
    for (const r of ['timber', 'clay', 'fiber', 'grain', 'stone']) expect(s.bank.hand[r]).toBe(20);
    for (const g of GOODS) expect(s.bank.hand[g]).toBe(12);
    expect(s.bank.deck).toHaveLength(10);
    expect(x(s).stack2).toHaveLength(10);
    expect(s.bank.deck.filter((c) => c === 'guard')).toHaveLength(7);
    expect(pl(s, 'p1').supply).toEqual({ road: 7, settlement: 8, city: 2 });
    expect(() => createGame({ seed: 'x', playerCount: 5, rulesets: ['base', 'highlands'] })).toThrow();
    expect(() => createGame({ seed: 'x', playerCount: 4, rulesets: ['base', 'tidelands', 'highlands'] })).toThrow();
  });
});

describe('highlands: paths', () => {
  it('no settlements in the jungle or the sea, no roads between them', () => {
    const s = game(4, { k: 'setup', idx: 0, step: 'settlement' });
    const g = graphOf(s);
    const wet = g.vertices.find((v) => !pathVertex(s, v))!;
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: wet })).toBe('NOT_LAND');
    const legal = getLegalActions(s, 'p1').filter((a) => a.t === 'placeSettlement');
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((a) => pathVertex(s, (a as { v: string }).v))).toBe(true);
    // A coast vertex: settle, then the only roads offered are paths.
    const v = g.vertices.find((y) => pathVertex(s, y) && g.vertexEdges[y].some((e) => !pathEdge(s, e)))!;
    const s2 = act(s, { t: 'placeSettlement', player: 'p1', v });
    const roads = getLegalActions(s2, 'p1').filter((a) => a.t === 'placeRoad');
    expect(roads.length).toBeGreaterThan(0);
    expect(roads.every((a) => pathEdge(s2, (a as { e: string }).e))).toBe(true);
    const wetEdge = g.vertexEdges[v].find((e) => !pathEdge(s, e))!;
    expect(code(s2, { t: 'placeRoad', player: 'p1', e: wetEdge })).toBe('NO_PATH');
  });

  it('setup settlements count as culture of the first tribe', () => {
    const s0 = game(2, { k: 'setup', idx: 0, step: 'settlement' });
    let s = s0;
    while (s.phase.k === 'setup') {
      const id = s.players.map((p) => p.id).find((p) => getLegalActions(s, p).length)!;
      s = act(s, getLegalActions(s, id)[0]);
    }
    expect(x(s).players.p1.cp).toEqual([2, 0, 0]);
    expect(victoryPoints(s, 'p1')).toBe(2);
  });
});

describe('highlands: goods and trade', () => {
  it('goods hexes produce goods; the blocker never stands on them', () => {
    const s = game();
    const g = graphOf(s);
    const v = g.hexVertices['h:-1,-2'].find((y) => pathVertex(s, y))!; // fishing ground 6
    put(s, 'p1', v);
    s.phase = { k: 'preRoll' };
    s.ext.forceDice = [3, 3];
    const after = act(s, { t: 'roll', player: 'p1' });
    expect(hand(after, 'p1').fish).toBe(1);
    const m = game(4, { k: 'moveBlocker', resume: 'main' });
    expect(code(m, { t: 'moveBlocker', player: 'p1', hex: 'h:-1,-2' })).toBe('BAD_HEX'); // fishery
    expect(code(m, { t: 'moveBlocker', player: 'p1', hex: 'h:-3,2' })).toBe('BAD_HEX'); // jungle
    expect(code(m, { t: 'moveBlocker', player: 'p1', hex: 'h:0,-2' })).toBe('BAD_HEX'); // empty sea
    expect(code(m, { t: 'moveBlocker', player: 'p1', hex: 'h:0,0' })).toBe('OK');
    expect(code(m, { t: 'moveBlocker', player: 'p1', hex: 'h:-2,3' })).toBe('SAME_HEX');
    m.board.blocker = 'h:0,0';
    expect(code(m, { t: 'moveBlocker', player: 'p1', hex: 'h:-2,3' })).toBe('OK');
  });

  it('bank: 3 resources or 2 goods for 1 card of choice; a set of 3 goods for 2 resources', () => {
    const s = game();
    setHand(s, 'p1', { timber: 4, plume: 2, herb: 1, fish: 1 });
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 3 }, get: { fish: 1 } })).toBe('OK');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { grain: 1 } })).toBe('BAD_RATE');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { plume: 2 }, get: { grain: 1 } })).toBe('OK');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { plume: 2 }, get: { herb: 1 } })).toBe('OK');
    expect(code(s, ext({ t: 'hl:goodsSet', player: 'p1', get: { grain: 1, stone: 1 } }))).toBe('OK');
    expect(code(s, ext({ t: 'hl:goodsSet', player: 'p1', get: { grain: 1, fish: 1 } }))).toBe('BAD_BAG');
    const after = act(s, ext({ t: 'hl:goodsSet', player: 'p1', get: { grain: 2 } }));
    expect(hand(after, 'p1')).toMatchObject({ plume: 1, herb: 0, fish: 0, grain: 2 });
    expect(code(after, ext({ t: 'hl:goodsSet', player: 'p1', get: { grain: 2 } }))).toBe('NOT_ENOUGH');
  });

  it('goods are never building material', () => {
    const s = game();
    const [v] = spots(s, 1);
    const { e, to } = pathFrom(s, v);
    put(s, 'p1', v);
    road(s, 'p1', e);
    void to;
    setHand(s, 'p1', { plume: 5, herb: 5, fish: 5 });
    const next = graphOf(s).vertexEdges[to].find((y) => y !== e && pathEdge(s, y))!;
    expect(code(s, { t: 'placeRoad', player: 'p1', e: next })).toBe('CANNOT_AFFORD');
  });
});

describe('highlands: tribes', () => {
  /** p1 with a first tribe of 3 culture (3 settlements) and a road from the first one. */
  function nearDecline(): { s: GameState; vs: VertexId[]; target: VertexId; e2: EdgeId } {
    const s = game();
    const vs = spots(s, 3);
    for (const v of vs) put(s, 'p1', v);
    x(s).players.p1.cp = [3, 0, 0];
    const a = pathFrom(s, vs[0]);
    road(s, 'p1', a.e);
    const b = graphOf(s).vertexEdges[a.to].filter((e) => e !== a.e && pathEdge(s, e)).find((e) => {
      const [p, q] = graphOf(s).edgeEnds[e];
      const far = p === a.to ? q : p;
      return satisfiesDistanceRule(graphOf(s), s.pieces, far) && pathVertex(s, far);
    })!;
    road(s, 'p1', b);
    const [p, q] = graphOf(s).edgeEnds[b];
    return { s, vs, target: p === a.to ? q : p, e2: b };
  }

  it('the 4th culture point ends the tribe: roads back, buildings overgrown, then a free founding ends the turn', () => {
    const { s, vs, target } = nearDecline();
    setHand(s, 'p1', SETTLEMENT);
    const d = act(s, { t: 'placeSettlement', player: 'p1', v: target });
    expect(x(d).players.p1).toEqual({ tribe: 2, cp: [4, 0, 0] });
    expect(Object.values(d.pieces.roads)).not.toContain('p1');
    expect(pl(d, 'p1').supply.road).toBe(7);
    for (const v of [...vs, target]) expect(d.pieces.buildings[v]).toEqual({ owner: 'p1', kind: RUIN });
    expect(d.phase).toMatchObject({ k: 'ext', id: 'hl:found', actors: ['p1'] });
    expect(victoryPoints(d, 'p1')).toBe(4);
    // Nothing else is possible while founding.
    expect(getLegalActions(d, 'p1').every((a) => a.t === 'hl:found')).toBe(true);
    expect(code(d, { t: 'endTurn', player: 'p1' })).toBe('WRONG_PHASE');
    const found = getLegalActions(d, 'p1') as unknown as Array<{ v: string }>;
    expect(found.length).toBeGreaterThan(0);
    const f = act(d, found[0] as unknown as Action);
    expect(f.pieces.buildings[found[0].v]).toEqual({ owner: 'p1', kind: 'settlement' });
    expect(x(f).players.p1).toEqual({ tribe: 2, cp: [4, 1, 0] });
    expect(f.turn.current).toBe('p2');
    expect(f.phase.k).toBe('preRoll');
    expect(hand(f, 'p1')).toEqual(hand(d, 'p1')); // no starting resources
  });

  it('founding: distance rule (ruins count), a path, and no road of anyone leading there', () => {
    const { s, target } = nearDecline();
    // p2 has a road whose open end is a fine intersection: not a founding spot.
    const [w] = spots(s, 1, (v) => graphOf(s).vertexNeighbors[v].every((n) => !s.pieces.buildings[n]) && v !== target &&
      graphOf(s).vertexEdges[v].every((e) => !s.pieces.roads[e]));
    const { e, to } = pathFrom(s, w);
    put(s, 'p2', w);
    road(s, 'p2', e);
    setHand(s, 'p1', SETTLEMENT);
    const d = act(s, { t: 'placeSettlement', player: 'p1', v: target });
    const legal = (getLegalActions(d, 'p1') as unknown as Array<{ v: string }>).map((a) => a.v);
    const g = graphOf(d);
    expect(legal).not.toContain(to);
    for (const v of legal) {
      expect(satisfiesDistanceRule(g, d.pieces, v)).toBe(true);
      expect(pathVertex(d, v)).toBe(true);
      expect(g.vertexEdges[v].some((y) => d.pieces.roads[y])).toBe(false);
    }
    expect(code(d, ext({ t: 'hl:found', player: 'p1', v: to }))).toBe('BAD_SPOT');
  });

  it('the second decline first returns the old ruins, then overgrows the second tribe', () => {
    const s = game();
    const vs = spots(s, 6);
    put(s, 'p1', vs[0], RUIN);
    put(s, 'p1', vs[1], RUIN_CITY);
    put(s, 'p1', vs[2]);
    put(s, 'p1', vs[3], 'city');
    x(s).players.p1 = { tribe: 2, cp: [4, 3, 0] };
    const { e, to } = pathFrom(s, vs[2]);
    road(s, 'p1', e);
    const target = graphOf(s).vertexEdges[to].filter((y) => y !== e && pathEdge(s, y)).map((y) => {
      const [a, b] = graphOf(s).edgeEnds[y];
      return { y, far: a === to ? b : a };
    }).find(({ far }) => satisfiesDistanceRule(graphOf(s), s.pieces, far) && pathVertex(s, far))!;
    road(s, 'p1', target.y);
    setHand(s, 'p1', SETTLEMENT);
    const d = act(s, { t: 'placeSettlement', player: 'p1', v: target.far });
    expect(d.pieces.buildings[vs[0]]).toBeUndefined();
    expect(d.pieces.buildings[vs[1]]).toBeUndefined();
    expect(d.pieces.buildings[vs[2]]).toEqual({ owner: 'p1', kind: RUIN });
    expect(d.pieces.buildings[vs[3]]).toEqual({ owner: 'p1', kind: RUIN_CITY });
    expect(d.pieces.buildings[target.far]).toEqual({ owner: 'p1', kind: RUIN });
    expect(pl(d, 'p1').supply).toEqual({ road: 7, settlement: 6, city: 1 });
    expect(x(d).players.p1).toEqual({ tribe: 3, cp: [4, 4, 0] });
    checkInvariants(d, { resources: Object.values(s.bank.hand).reduce((a, b) => a + b, 0) +
      s.players.reduce((n, p) => n + Object.values(p.hand).reduce((a, b) => a + b, 0), 0), cards: 20 });
  });

  it('anyone may build over a ruin; its owner keeps the culture point', () => {
    const s = game();
    const [v] = spots(s, 1);
    put(s, 'p2', v, RUIN_CITY);
    x(s).players.p2 = { tribe: 2, cp: [4, 1, 0] };
    road(s, 'p1', pathFrom(s, v).e);
    setHand(s, 'p1', SETTLEMENT);
    expect(code(s, { t: 'placeSettlement', player: 'p1', v })).toBe('OK');
    expect(getLegalActions(s, 'p1')).toContainEqual({ t: 'placeSettlement', player: 'p1', v });
    const d = act(s, { t: 'placeSettlement', player: 'p1', v });
    expect(d.pieces.buildings[v]).toEqual({ owner: 'p1', kind: 'settlement' });
    expect(pl(d, 'p2').supply.city).toBe(2);
    expect(x(d).players.p2.cp).toEqual([4, 1, 0]);
    expect(x(d).players.p1.cp).toEqual([1, 0, 0]);
    // Without a road there it is not allowed.
    const s2 = game();
    put(s2, 'p2', v, RUIN);
    setHand(s2, 'p1', SETTLEMENT);
    expect(code(s2, { t: 'placeSettlement', player: 'p1', v })).toBe('NOT_CONNECTED');
  });

  it('roads lead up to a ruin, never from or past it (the owner too)', () => {
    const s = game();
    const [v, home] = spots(s, 2);
    put(s, 'p1', v, RUIN);
    // p1's active road reaches the ruin from one side.
    const { e } = pathFrom(s, v);
    road(s, 'p1', e);
    put(s, 'p1', home);
    setHand(s, 'p1', { timber: 3, clay: 3 });
    const other = graphOf(s).vertexEdges[v].find((y) => y !== e && pathEdge(s, y))!;
    expect(code(s, { t: 'placeRoad', player: 'p1', e: other })).toBe('NOT_CONNECTED');
    expect(getLegalActions(s, 'p1').filter((a) => a.t === 'placeRoad').map((a) => (a as { e: string }).e)).not.toContain(other);
    // A road from an active settlement is fine.
    expect(code(s, { t: 'placeRoad', player: 'p1', e: pathFrom(s, home).e })).toBe('OK');
  });

  it('one city per tribe; a ruined city does not count', () => {
    const s = game();
    const [a, b, c] = spots(s, 3);
    put(s, 'p1', a, 'city');
    put(s, 'p1', b);
    setHand(s, 'p1', { grain: 2, stone: 3 });
    expect(code(s, { t: 'buildCity', player: 'p1', v: b })).toBe('CITY_LIMIT');
    s.pieces.buildings[a].kind = RUIN_CITY;
    put(s, 'p1', c, RUIN);
    expect(code(s, { t: 'buildCity', player: 'p1', v: b })).toBe('OK');
    expect(code(s, { t: 'buildCity', player: 'p1', v: c })).toBe('NOT_YOUR_SETTLEMENT');
    const d = act(s, { t: 'buildCity', player: 'p1', v: b });
    expect(x(d).players.p1.cp).toEqual([1, 0, 0]);
  });

  it('ruins still produce for their owner', () => {
    const s = game();
    const v = graphOf(s).hexVertices['h:0,0'].find((y) => pathVertex(s, y))!; // meadow 12
    put(s, 'p2', v, RUIN_CITY);
    s.phase = { k: 'preRoll' };
    s.ext.forceDice = [6, 6];
    expect(hand(act(s, { t: 'roll', player: 'p1' }), 'p2').fiber).toBe(2);
  });

  it('the third tribe wins with 3 culture points; the second stack joins once every tribe 2 is founded', () => {
    const s = game(2);
    const [a, b] = spots(s, 2);
    put(s, 'p1', a);
    x(s).players.p1 = { tribe: 3, cp: [4, 4, 1] };
    setHand(s, 'p1', { grain: 2, stone: 3 });
    expect(getLegalActions(s, 'p1').some((y) => y.t === 'buildCity')).toBe(true);
    const r = applyAction(s, { t: 'buildCity', player: 'p1', v: a });
    expect(r.state.winner).toBeUndefined(); // 10 points: not yet
    const s2 = r.state;
    s2.phase = { k: 'main' };
    const { e } = pathFrom(s2, a);
    road(s2, 'p1', e);
    const far = graphOf(s2).edgeEnds[e].find((y) => y !== a)!;
    const next = graphOf(s2).vertexEdges[far].filter((y) => y !== e && pathEdge(s2, y)).map((y) => {
      const [p, q] = graphOf(s2).edgeEnds[y];
      return { y, to: p === far ? q : p };
    }).find(({ to }) => satisfiesDistanceRule(graphOf(s2), s2.pieces, to) && pathVertex(s2, to))!;
    road(s2, 'p1', next.y);
    setHand(s2, 'p1', SETTLEMENT);
    const w = applyAction(s2, { t: 'placeSettlement', player: 'p1', v: next.to });
    expect(w.state.winner).toBe('p1');
    expect(victoryPoints(w.state, 'p1')).toBe(11);
    void b;

    // Second stack.
    const t = game(2, { k: 'ext', id: 'hl:found', data: { tribe: 2 }, actors: ['p1'] });
    x(t).players.p1 = { tribe: 2, cp: [4, 0, 0] };
    x(t).players.p2 = { tribe: 2, cp: [4, 2, 0] };
    const spot = (getLegalActions(t, 'p1') as unknown as Array<{ v: string }>)[0].v;
    const joined = act(t, ext({ t: 'hl:found', player: 'p1', v: spot }));
    expect(joined.bank.deck).toHaveLength(20);
    expect(x(joined).stack2Joined).toBe(true);
    expect(joined.bank.deck.slice(10)).toEqual(t.bank.deck); // the first stack stays on top
  });
});

describe('highlands: cards and award powers', () => {
  it('awards give powers, not points; culture is the score', () => {
    const s = game();
    s.awards.longestRoute = 'p1';
    s.awards.largestForce = 'p1';
    x(s).players.p1.cp = [3, 0, 0];
    expect(victoryPoints(s, 'p1')).toBe(3);
  });

  it('longest route: once per turn, any 2 cards for 1 card of another kind', () => {
    const s = game();
    setHand(s, 'p1', { timber: 1, fish: 1, grain: 0 });
    const a = ext({ t: 'hl:caravan', player: 'p1', give: { timber: 1, fish: 1 }, get: { grain: 1 } });
    expect(code(s, a)).toBe('NO_AWARD');
    s.awards.longestRoute = 'p1';
    expect(code(s, a)).toBe('OK');
    expect(code(s, ext({ t: 'hl:caravan', player: 'p1', give: { timber: 1, fish: 1 }, get: { fish: 1 } }))).toBe('SAME_RESOURCE');
    expect(getLegalActions(s, 'p1')).toContainEqual(a);
    const d = act(s, a);
    expect(hand(d, 'p1')).toMatchObject({ timber: 0, fish: 0, grain: 1 });
    setHand(d, 'p1', { timber: 2 });
    expect(code(d, ext({ t: 'hl:caravan', player: 'p1', give: { timber: 2 }, get: { grain: 1 } }))).toBe('USED');
  });

  it('largest force (2 guards): send the blocker back to the wilds once per turn, even before the roll, and take its resource', () => {
    const s = game(4, { k: 'preRoll' });
    const v = graphOf(s).hexVertices['h:0,0'].find((y) => pathVertex(s, y))!; // meadow
    put(s, 'p1', v, RUIN);
    s.board.blocker = 'h:0,0';
    const a = ext({ t: 'hl:recall', player: 'p1' });
    expect(code(s, a)).toBe('NO_AWARD');
    s.awards.largestForce = 'p1';
    expect(code(s, a)).toBe('OK');
    const d = act(s, a);
    expect(d.board.blocker).toBe('h:-2,3');
    expect(hand(d, 'p1').fiber).toBe(1);
    d.board.blocker = 'h:0,0';
    expect(code(d, a)).toBe('USED');
    const far = game(4, { k: 'main' });
    far.awards.largestForce = 'p1';
    far.board.blocker = 'h:0,0';
    expect(code(far, a)).toBe('NOT_ADJACENT');
  });

  it('the award goes at 3 roads (longest route) and 2 guards (largest force)', () => {
    const s = game();
    const [v] = spots(s, 1);
    put(s, 'p1', v);
    let cur = v;
    const used: EdgeId[] = [];
    for (let i = 0; i < 2; i++) {
      const e = graphOf(s).vertexEdges[cur].find((y) => !used.includes(y) && pathEdge(s, y) && !s.pieces.roads[y])!;
      road(s, 'p1', e);
      used.push(e);
      cur = graphOf(s).edgeEnds[e].find((y) => y !== cur)!;
    }
    setHand(s, 'p1', { timber: 1, clay: 1 });
    const e3 = getLegalActions(s, 'p1').find((a) => a.t === 'placeRoad' && graphOf(s).edgeEnds[(a as { e: string }).e].includes(cur))!;
    expect(act(s, e3).awards.longestRoute).toBe('p1');

    const g = game(4, { k: 'main' });
    pl(g, 'p1').cards = ['guard', 'guard'];
    pl(g, 'p1').played = { guard: 1 };
    g.bank.deck.splice(g.bank.deck.indexOf('guard'), 1);
    g.bank.deck.splice(g.bank.deck.indexOf('guard'), 1);
    g.bank.deck.splice(g.bank.deck.indexOf('guard'), 1);
    const p = act(g, { t: 'playCard', player: 'p1', card: 'guard' });
    expect(p.awards.largestForce).toBe('p1');
  });

  it('each played guard raises the hand limit on a 7 by one', () => {
    const s = game(4, { k: 'preRoll' });
    setHand(s, 'p1', { timber: 9 });
    setHand(s, 'p2', { timber: 8 });
    pl(s, 'p1').played = { guard: 2 };
    s.ext.forceDice = [3, 4];
    const d = act(s, { t: 'roll', player: 'p1' });
    expect(d.phase).toEqual({ k: 'discard', owed: { p2: 4 } });
  });

  it('claim takes at most two cards of the named kind from each opponent', () => {
    const s = game();
    pl(s, 'p1').cards = ['claim'];
    s.bank.deck.splice(s.bank.deck.indexOf('claim'), 1);
    setHand(s, 'p2', { fish: 5 });
    setHand(s, 'p3', { fish: 1 });
    const d = act(s, { t: 'playCard', player: 'p1', card: 'claim', resource: 'fish' });
    expect(hand(d, 'p1').fish).toBe(3);
    expect(hand(d, 'p2').fish).toBe(3);
    expect(hand(d, 'p3').fish).toBe(0);
  });

  it('harvest may take goods', () => {
    const s = game();
    pl(s, 'p1').cards = ['harvest'];
    s.bank.deck.splice(s.bank.deck.indexOf('harvest'), 1);
    const d = act(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['fish', 'herb'] });
    expect(hand(d, 'p1')).toMatchObject({ fish: 1, herb: 1 });
  });
});

describe('highlands: cards before the roll (rulebook)', () => {
  /** p1 holds `card` (bought earlier), before the roll, with one settlement to build roads from. */
  function preRoll(card: string): GameState {
    const s = game(4, { k: 'preRoll' });
    pl(s, 'p1').cards = [card];
    s.bank.deck.splice(s.bank.deck.indexOf(card), 1);
    const [v] = spots(s, 1);
    put(s, 'p1', v);
    return s;
  }

  it('free roads before the roll: two roads, then back to the roll; no second card this turn', () => {
    const s = preRoll('freeRoads');
    pl(s, 'p1').cards.push('harvest');
    s.bank.deck.splice(s.bank.deck.indexOf('harvest'), 1);
    let d = act(s, { t: 'playCard', player: 'p1', card: 'freeRoads' });
    expect(d.phase).toMatchObject({ k: 'freeRoads', left: 2, resume: 'preRoll' });
    for (let i = 0; i < 2; i++) d = act(d, getLegalActions(d, 'p1').find((a) => a.t === 'placeRoad')!);
    expect(d.phase).toEqual({ k: 'preRoll' });
    expect(Object.values(d.pieces.roads).filter((o) => o === 'p1')).toHaveLength(2);
    expect(code(d, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['fish', 'herb'] })).toBe('ONE_CARD');
    d.ext.forceDice = [2, 3];
    expect(act(d, { t: 'roll', player: 'p1' }).phase.k).toBe('main');
  });

  it('harvest and claim may be played before the roll too', () => {
    const h = preRoll('harvest');
    expect(getLegalActions(h, 'p1').some((a) => a.t === 'playCard')).toBe(true);
    const after = act(h, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['fish', 'timber'] });
    expect(after.phase).toEqual({ k: 'preRoll' });
    expect(hand(after, 'p1')).toMatchObject({ fish: 1, timber: 1 });
    const c = preRoll('claim');
    setHand(c, 'p2', { grain: 3 });
    expect(hand(act(c, { t: 'playCard', player: 'p1', card: 'claim', resource: 'grain' }), 'p1').grain).toBe(2);
  });

  it('the base game keeps its rule: only a guard before the roll', () => {
    const s = createGame({ seed: 'b', playerCount: 3, rulesets: ['base'], firstPlayer: 'p1' });
    s.phase = { k: 'preRoll' };
    s.turn = { n: 1, current: 'p1', cardPlayed: false };
    pl(s, 'p1').cards = ['harvest'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['timber', 'clay'] })).toBe('WRONG_PHASE');
  });
});

describe('highlands: bot strategy', () => {
  const botMove = (s: GameState, id = 'p1') => decide(getPlayerView(s, id), getLegalActions(s, id), { level: 'hard' })!;

  it('recalls the blocker before rolling when it holds the largest force', () => {
    const s = game(4, { k: 'preRoll' });
    const v = graphOf(s).hexVertices['h:0,0'].find((y) => pathVertex(s, y))!;
    put(s, 'p1', v);
    s.board.blocker = 'h:0,0';
    s.awards.largestForce = 'p1';
    expect(botMove(s).t).toBe('hl:recall');
  });

  it('before the build that ends its tribe it buys a card first, and builds no roads that would vanish', () => {
    const s = game();
    const vs = spots(s, 3);
    for (const v of vs) put(s, 'p1', v);
    x(s).players.p1.cp = [3, 0, 0];
    const a = pathFrom(s, vs[0]);
    road(s, 'p1', a.e);
    const nxt = graphOf(s).vertexEdges[a.to].filter((e) => e !== a.e && pathEdge(s, e)).find((e) => {
      const far = graphOf(s).edgeEnds[e].find((w) => w !== a.to)!;
      return satisfiesDistanceRule(graphOf(s), s.pieces, far) && pathVertex(s, far);
    })!;
    road(s, 'p1', nxt);
    setHand(s, 'p1', { timber: 2, clay: 2, fiber: 2, grain: 2, stone: 1 });
    const first = botMove(s);
    expect(first.t).toBe('buyCard');
    const s2 = act(s, first);
    const second = botMove(s2);
    expect(second.t).toBe('placeSettlement'); // the culture point now, not a road
  });

  it('builds over an opponent ruin its road reaches', () => {
    const s = game();
    const [v] = spots(s, 1);
    put(s, 'p2', v, RUIN_CITY);
    road(s, 'p1', pathFrom(s, v).e);
    setHand(s, 'p1', SETTLEMENT);
    expect(botMove(s)).toEqual({ t: 'placeSettlement', player: 'p1', v });
  });

  it('founds a new tribe on a productive spot', () => {
    const s = game(3, { k: 'ext', id: 'hl:found', data: { tribe: 3 }, actors: ['p1'] });
    x(s).players.p1 = { tribe: 3, cp: [4, 4, 0] };
    const legal = getLegalActions(s, 'p1') as unknown as Array<{ v: string }>;
    const pick = botMove(s) as unknown as { v: string };
    const pipsAt = (w: string) => graphOf(s).vertexHexes[w].reduce((n, h) => {
      const hex = s.board.hexes.find((y) => y.id === h)!;
      return n + (hex.token ? 6 - Math.abs(7 - hex.token) : 0);
    }, 0);
    const best = Math.max(...legal.map((a) => pipsAt(a.v)));
    expect(pipsAt(pick.v)).toBeGreaterThanOrEqual(best - 4);
  });
});

describe('highlands: views and full games', () => {
  it('the view shows tribes but hides the order of the second stack', () => {
    const s = game();
    const v = getPlayerView(s, 'p1');
    const h = v.ext?.highlands as Record<string, unknown>;
    expect(h.players).toEqual(x(s).players);
    expect(h.stack2Left).toBe(10);
    expect(JSON.stringify(v)).not.toContain('stack2"');
  });

  it('a random game ends with a winner and keeps every invariant (more: pnpm fuzz 50 0 highlands)', () => {
    const r = runRandomGame('hl-test-0', 2, 30000, ['base', 'highlands'], { map: 'variable' });
    expect(r.winner).toBeDefined();
  }, 120_000);
});
