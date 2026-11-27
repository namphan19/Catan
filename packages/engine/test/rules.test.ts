import { describe, expect, it } from 'vitest';
import {
  applyAction, baseConfig, getLegalActions, satisfiesDistanceRule, validateAction, victoryPoints,
  type Action, type GameState, type VertexId,
} from '../src';
import { act, autoSetup, blankGame, findPath, graphOf, hand, newGame, pl, setHand, totalResources, withMode } from './helpers';

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

describe('setup (snake order)', () => {
  it('places in order p1..p4 then p4..p1 and starts turn 1 with p1', () => {
    // firstPlayer: 'p1' pins the D1 start seat for this scenario (default: random per seed).
    const s = autoSetup(newGame(4, 'test-seed', { firstPlayer: 'p1' }));
    const order = s.log.filter((l) => l.action.t === 'placeSettlement').map((l) => l.action.player);
    expect(order).toEqual(['p1', 'p2', 'p3', 'p4', 'p4', 'p3', 'p2', 'p1']);
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn).toMatchObject({ n: 1, current: 'p1' });
    for (const p of s.players) {
      expect(p.supply.settlement).toBe(3);
      expect(p.supply.road).toBe(13);
    }
  });

  it('second settlement yields one resource per adjacent producing hex', () => {
    const s = autoSetup(newGame(4, 'yield', { firstPlayer: 'p1' }));
    const g = graphOf(s);
    const second = s.log.filter((l) => l.action.t === 'placeSettlement').slice(4);
    for (const l of second) {
      const v = (l.action as { v: string }).v;
      const expected = g.vertexHexes[v]
        .map((h) => s.board.hexes.find((x) => x.id === h)!)
        .filter((h) => baseConfig.terrainResource[h.terrain]).length;
      const total = Object.values(hand(s, l.action.player)).reduce((a, b) => a + b, 0);
      expect(total).toBe(expected);
    }
  });

  it('rejects out-of-turn moves and setup roads not touching the new settlement', () => {
    let s = newGame(4, 'test-seed', { firstPlayer: 'p1' });
    expect(code(s, { t: 'placeSettlement', player: 'p2', v: 'v:0,0,N' })).toBe('NOT_YOUR_TURN');
    expect(code(s, { t: 'roll', player: 'p1' })).toBe('WRONG_PHASE');
    s = act(s, { t: 'placeSettlement', player: 'p1', v: 'v:0,0,N' });
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: 'v:1,1,S' })).toBe('WRONG_STEP');
    const g = graphOf(s);
    const far = g.edges.find((e) => !g.edgeEnds[e].includes('v:0,0,N'))!;
    expect(code(s, { t: 'placeRoad', player: 'p1', e: far })).toBe('NOT_CONNECTED');
    const near = g.vertexEdges['v:0,0,N'][0];
    expect(code(s, { t: 'placeRoad', player: 'p1', e: near })).toBe('OK');
  });
});

describe('dice and production', () => {
  function scenario() {
    const s = blankGame(4, { k: 'preRoll' });
    const g = graphOf(s);
    const H = s.board.hexes.find((h) => h.token !== undefined)!;
    for (const h of s.board.hexes) if (h.token !== undefined) h.token = 12;
    H.token = 5;
    const res = baseConfig.terrainResource[H.terrain]!;
    const vs = g.hexVertices[H.id];
    s.pieces.buildings[vs[0]] = { owner: 'p1', kind: 'settlement' };
    s.pieces.buildings[vs[3]] = { owner: 'p2', kind: 'city' };
    s.ext.forceDice = [2, 3];
    return { s, H, res, vs };
  }

  it('settlements get 1, cities get 2', () => {
    const { s, res } = scenario();
    const r = applyAction(s, { t: 'roll', player: 'p1' });
    expect(hand(r.state, 'p1')[res]).toBe(1);
    expect(hand(r.state, 'p2')[res]).toBe(2);
    expect(r.state.phase.k).toBe('main');
    expect(r.events.some((e) => e.e === 'produced')).toBe(true);
    expect(totalResources(r.state)).toBe(totalResources(s));
  });

  it('the blocker stops production on its hex', () => {
    const { s, H, res } = scenario();
    s.board.blocker = H.id;
    const r = act(s, { t: 'roll', player: 'p1' });
    expect(hand(r, 'p1')[res]).toBe(0);
    expect(hand(r, 'p2')[res]).toBe(0);
  });

  it('bank shortage: nobody is paid when several players are owed more than the bank has', () => {
    const { s, res } = scenario();
    s.bank.hand[res] = 2; // owed 1 + 2 = 3
    const r = act(s, { t: 'roll', player: 'p1' });
    expect(hand(r, 'p1')[res]).toBe(0);
    expect(hand(r, 'p2')[res]).toBe(0);
  });

  it('bank shortage: a single owed player gets what is left', () => {
    const { s, res, vs } = scenario();
    delete s.pieces.buildings[vs[0]];
    s.bank.hand[res] = 1;
    const r = act(s, { t: 'roll', player: 'p1' });
    expect(hand(r, 'p2')[res]).toBe(1);
  });
});

describe('rolling the blocker number (7): discard, move, steal', () => {
  it('players over the limit discard half (rounded down), then the blocker moves and steals', () => {
    let s = blankGame(4, { k: 'preRoll' });
    const g = graphOf(s);
    setHand(s, 'p1', { timber: 9 });
    setHand(s, 'p2', { fiber: 7 });
    setHand(s, 'p3', { grain: 4, stone: 4 });
    const target = s.board.hexes.find((h) => h.id !== s.board.blocker)!.id;
    s.pieces.buildings[g.hexVertices[target][0]] = { owner: 'p2', kind: 'settlement' };
    const before = totalResources(s);
    s.ext.forceDice = [3, 4];
    s = act(s, { t: 'roll', player: 'p1' });
    expect(s.phase).toEqual({ k: 'discard', owed: { p1: 4, p3: 4 } });
    expect(code(s, { t: 'discard', player: 'p1', bag: { timber: 3 } })).toBe('WRONG_AMOUNT');
    expect(code(s, { t: 'discard', player: 'p2', bag: { fiber: 1 } })).toBe('NOT_YOUR_TURN');
    expect(code(s, { t: 'discard', player: 'p3', bag: { grain: 2, timber: 2 } })).toBe('NOT_ENOUGH');
    s = act(s, { t: 'discard', player: 'p1', bag: { timber: 4 } });
    expect(s.phase.k).toBe('discard');
    expect(code(s, { t: 'moveBlocker', player: 'p1', hex: target })).toBe('WRONG_PHASE');
    s = act(s, { t: 'discard', player: 'p3', bag: { grain: 2, stone: 2 } });
    expect(s.phase).toEqual({ k: 'moveBlocker', resume: 'main' });
    expect(code(s, { t: 'moveBlocker', player: 'p1', hex: s.board.blocker })).toBe('SAME_HEX');
    s = act(s, { t: 'moveBlocker', player: 'p1', hex: target });
    expect(s.phase).toEqual({ k: 'steal', from: ['p2'], resume: 'main' });
    expect(code(s, { t: 'steal', player: 'p1', target: 'p3' })).toBe('BAD_TARGET');
    s = act(s, { t: 'steal', player: 'p1', target: 'p2' });
    expect(hand(s, 'p2').fiber).toBe(6);
    expect(hand(s, 'p1').fiber).toBe(1);
    expect(s.phase.k).toBe('main');
    expect(totalResources(s)).toBe(before);
  });

  it('with nobody over the limit the blocker moves straight away', () => {
    let s = blankGame(4, { k: 'preRoll' });
    s.ext.forceDice = [1, 6];
    s = act(s, { t: 'roll', player: 'p1' });
    expect(s.phase).toEqual({ k: 'moveBlocker', resume: 'main' });
  });
});

describe('building', () => {
  it('roads, settlements and cities cost resources and follow placement rules', () => {
    let s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    expect(code(s, { t: 'placeRoad', player: 'p1', e: path.edges[0] })).toBe('CANNOT_AFFORD');
    setHand(s, 'p1', { timber: 3, clay: 3, fiber: 1, grain: 3, stone: 3 });
    s = act(s, { t: 'placeRoad', player: 'p1', e: path.edges[0] });
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: path.vertices[1] })).toBe('DISTANCE_RULE');
    s = act(s, { t: 'placeRoad', player: 'p1', e: path.edges[1] });
    const lonely = g.vertices.find(
      (v) => satisfiesDistanceRule(g, s.pieces, v) && !g.vertexEdges[v].some((e) => s.pieces.roads[e]),
    )!;
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: lonely })).toBe('NOT_CONNECTED');
    s = act(s, { t: 'placeSettlement', player: 'p1', v: path.vertices[2] });
    expect(hand(s, 'p1')).toMatchObject({ timber: 0, clay: 0, fiber: 0, grain: 2, stone: 3 });
    expect(code(s, { t: 'buildCity', player: 'p1', v: path.vertices[1] })).toBe('NOT_YOUR_SETTLEMENT');
    s = act(s, { t: 'buildCity', player: 'p1', v: path.vertices[2] });
    expect(s.pieces.buildings[path.vertices[2]].kind).toBe('city');
    expect(pl(s, 'p1').supply).toMatchObject({ city: 3, settlement: 5, road: 13 });
    expect(victoryPoints(s, 'p1')).toBe(3);
    expect(code(s, { t: 'placeRoad', player: 'p2', e: path.edges[0] })).toBe('NOT_YOUR_TURN');
  });
});

describe('trading', () => {
  it('bank trades at 4:1, generic harbor 3:1, specific harbor 2:1', () => {
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 4, clay: 4 });
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { grain: 1 } })).toBe('OK');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 3 }, get: { grain: 1 } })).toBe('BAD_RATE');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { timber: 1 } })).toBe('SAME_RESOURCE');
    const any = s.board.harbors.find((h) => h.kind === 'any')!;
    s.pieces.buildings[any.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 3 }, get: { grain: 1 } })).toBe('OK');
    const timberHarbor = s.board.harbors.find((h) => h.kind === 'timber')!;
    s.pieces.buildings[timberHarbor.vertices[1]] = { owner: 'p1', kind: 'settlement' };
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 2 }, get: { grain: 1 } })).toBe('OK');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { clay: 2 }, get: { grain: 1 } })).toBe('BAD_RATE');
    const r = act(s, { t: 'bankTrade', player: 'p1', give: { timber: 4 }, get: { grain: 1, stone: 1 } });
    expect(hand(r, 'p1')).toMatchObject({ timber: 0, grain: 1, stone: 1 });
  });

  it('player trade: offer, responses, confirm with one acceptor', () => {
    let s = blankGame(4);
    setHand(s, 'p1', { timber: 1 });
    setHand(s, 'p2', { grain: 1 });
    expect(code(s, { t: 'offerTrade', player: 'p1', give: {}, get: { grain: 1 } })).toBe('EMPTY_TRADE');
    s = act(s, { t: 'offerTrade', player: 'p1', give: { timber: 1 }, get: { grain: 1 } });
    expect(code(s, { t: 'respondTrade', player: 'p3', accept: true })).toBe('NOT_ENOUGH');
    s = act(s, { t: 'respondTrade', player: 'p3', accept: false });
    s = act(s, { t: 'respondTrade', player: 'p2', accept: true });
    expect(code(s, { t: 'confirmTrade', player: 'p1', with: 'p3' })).toBe('NOT_ACCEPTED');
    s = act(s, { t: 'confirmTrade', player: 'p1', with: 'p2' });
    expect(hand(s, 'p1')).toMatchObject({ timber: 0, grain: 1 });
    expect(hand(s, 'p2')).toMatchObject({ timber: 1, grain: 0 });
    expect(s.trade).toBeUndefined();
  });
});

describe('cards', () => {
  it('a bought card cannot be played the same turn; playable after the turn ends', () => {
    let s = blankGame(4);
    setHand(s, 'p1', { fiber: 1, grain: 1, stone: 1 });
    s.bank.deck.push('guard');
    s = act(s, { t: 'buyCard', player: 'p1' });
    expect(pl(s, 'p1').newCards).toEqual(['guard']);
    expect(code(s, { t: 'playCard', player: 'p1', card: 'guard' })).toBe('JUST_BOUGHT');
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(pl(s, 'p1').cards).toEqual(['guard']);
    expect(s.turn.current).toBe('p2');
  });

  it('a guard may be played before rolling; only one card per turn', () => {
    let s = blankGame(4, { k: 'preRoll' });
    pl(s, 'p1').cards = ['guard', 'harvest'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain', 'grain'] })).toBe('WRONG_PHASE');
    s = act(s, { t: 'playCard', player: 'p1', card: 'guard' });
    expect(s.phase).toEqual({ k: 'moveBlocker', resume: 'preRoll' });
    const empty = s.board.hexes.find((h) => h.id !== s.board.blocker)!.id;
    s = act(s, { t: 'moveBlocker', player: 'p1', hex: empty });
    expect(s.phase.k).toBe('preRoll');
    s.ext.forceDice = [6, 6];
    s = act(s, { t: 'roll', player: 'p1' });
    expect(code(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain', 'grain'] })).toBe('ONE_CARD');
  });

  it('largest force: first to 3 guards, transfers only on a strictly larger count', () => {
    let s = blankGame(4);
    const freeHex = () => s.board.hexes.find((h) => h.id !== s.board.blocker)!.id;
    pl(s, 'p1').played.guard = 2;
    pl(s, 'p1').cards = ['guard'];
    s = act(s, { t: 'playCard', player: 'p1', card: 'guard' });
    expect(s.awards.largestForce).toBe('p1');
    s = act(s, { t: 'moveBlocker', player: 'p1', hex: freeHex() });
    // p2 ties at 3: p1 keeps
    s.turn = { n: 2, current: 'p2', cardPlayed: false };
    s.phase = { k: 'main' };
    pl(s, 'p2').played.guard = 2;
    pl(s, 'p2').cards = ['guard', 'guard'];
    s = act(s, { t: 'playCard', player: 'p2', card: 'guard' });
    expect(s.awards.largestForce).toBe('p1');
    s = act(s, { t: 'moveBlocker', player: 'p2', hex: freeHex() });
    // p2 goes to 4: takes it
    s.turn = { n: 3, current: 'p2', cardPlayed: false };
    s.phase = { k: 'main' };
    const r = applyAction(s, { t: 'playCard', player: 'p2', card: 'guard' });
    expect(r.state.awards.largestForce).toBe('p2');
    expect(r.events).toContainEqual({ e: 'awardChanged', award: 'largestForce', from: 'p1', to: 'p2' });
    expect(victoryPoints(r.state, 'p2')).toBe(2);
    expect(victoryPoints(r.state, 'p1')).toBe(0);
  });

  it('freeRoads builds two roads for free', () => {
    let s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    pl(s, 'p1').cards = ['freeRoads'];
    s = act(s, { t: 'playCard', player: 'p1', card: 'freeRoads' });
    expect(s.phase).toEqual({ k: 'freeRoads', left: 2 });
    expect(code(s, { t: 'endTurn', player: 'p1' })).toBe('WRONG_PHASE');
    s = act(s, { t: 'placeRoad', player: 'p1', e: path.edges[0] });
    s = act(s, { t: 'placeRoad', player: 'p1', e: path.edges[1] });
    expect(s.phase.k).toBe('main');
    expect(pl(s, 'p1').supply.road).toBe(13);
  });

  it('harvest takes resources from the bank; claim takes one resource from everyone', () => {
    let s = blankGame(4);
    pl(s, 'p1').cards = ['harvest'];
    s = act(s, { t: 'playCard', player: 'p1', card: 'harvest', resources: ['grain', 'stone'] });
    expect(hand(s, 'p1')).toMatchObject({ grain: 1, stone: 1 });
    s.turn.cardPlayed = false;
    pl(s, 'p1').cards = ['claim'];
    setHand(s, 'p2', { stone: 3, grain: 1 });
    setHand(s, 'p3', { stone: 2 });
    s = act(s, { t: 'playCard', player: 'p1', card: 'claim', resource: 'stone' });
    expect(hand(s, 'p1').stone).toBe(6);
    expect(hand(s, 'p2')).toMatchObject({ stone: 0, grain: 1 });
    expect(hand(s, 'p3').stone).toBe(0);
  });

  it('relics score privately and cannot be played', () => {
    const s = blankGame(4);
    pl(s, 'p1').cards = ['relic'];
    expect(victoryPoints(s, 'p1')).toBe(1);
    expect(victoryPoints(s, 'p1', { public: true })).toBe(0);
    expect(code(s, { t: 'playCard', player: 'p1', card: 'relic' })).toBe('NOT_PLAYABLE');
  });
});

describe('longest route award', () => {
  function withRoute() {
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 5);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    path.edges.slice(0, 4).forEach((e) => (s.pieces.roads[e] = 'p1'));
    setHand(s, 'p1', { timber: 1, clay: 1 });
    const r = applyAction(s, { t: 'placeRoad', player: 'p1', e: path.edges[4] });
    return { r, path, g };
  }

  it('goes to the first player with a route of 5', () => {
    const { r } = withRoute();
    expect(r.state.awards.longestRoute).toBe('p1');
    expect(r.events).toContainEqual({ e: 'awardChanged', award: 'longestRoute', from: null, to: 'p1' });
    expect(victoryPoints(r.state, 'p1')).toBe(3);
  });

  it('is lost when an opponent settlement cuts the route below 5', () => {
    const { r, path, g } = withRoute();
    const s = r.state;
    const mid = path.vertices[2];
    const side = g.vertexEdges[mid].find((e) => !path.edges.includes(e))!;
    s.pieces.roads[side] = 'p2';
    s.turn = { n: 2, current: 'p2', cardPlayed: false };
    setHand(s, 'p2', { timber: 1, clay: 1, fiber: 1, grain: 1 });
    const r2 = applyAction(s, { t: 'placeSettlement', player: 'p2', v: mid });
    expect(r2.state.awards.longestRoute).toBeNull();
  });

  it('a tie keeps the holder; a longer route takes it', () => {
    const { r, path, g } = withRoute();
    let s = r.state;
    const used = new Set(path.vertices);
    const start = g.vertices.find(
      (v) => !used.has(v) && g.vertexNeighbors[v].every((n) => !used.has(n)) && v.endsWith('S'),
    )!;
    const p2 = findPath(g, start, 6);
    expect(p2.edges.some((e) => path.edges.includes(e))).toBe(false);
    p2.edges.slice(0, 4).forEach((e) => (s.pieces.roads[e] = 'p2'));
    s.turn = { n: 2, current: 'p2', cardPlayed: false };
    setHand(s, 'p2', { timber: 2, clay: 2 });
    s = act(s, { t: 'placeRoad', player: 'p2', e: p2.edges[4] });
    expect(s.awards.longestRoute).toBe('p1');
    s = act(s, { t: 'placeRoad', player: 'p2', e: p2.edges[5] });
    expect(s.awards.longestRoute).toBe('p2');
  });
});

describe('victory', () => {
  it('a player reaching the target on their own turn wins; the game then rejects actions', () => {
    const s = blankGame(4);
    const v = nineVP(s, 'p1');
    setHand(s, 'p1', { grain: 2, stone: 3 });
    const r = applyAction(s, { t: 'buildCity', player: 'p1', v });
    expect(r.state.winner).toBe('p1');
    expect(r.state.phase.k).toBe('over');
    expect(r.events).toContainEqual({ e: 'won', player: 'p1', vp: 10 });
    expect(code(r.state, { t: 'endTurn', player: 'p1' })).toBe('GAME_OVER');
    expect(getLegalActions(r.state, 'p1')).toEqual([]);
  });

  it("reaching the target in another player's build window wins only when the own turn starts", () => {
    let s = withMode(blankGame(5), 'extraBuild'); // this scenario pins the legacy extra-build windows
    const v = nineVP(s, 'p2');
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.phase).toEqual({ k: 'extraBuild', queue: ['p2', 'p3', 'p4', 'p5'] });
    setHand(s, 'p2', { grain: 2, stone: 3 });
    s = act(s, { t: 'buildCity', player: 'p2', v });
    expect(s.winner).toBeUndefined();
    for (const p of ['p2', 'p3', 'p4']) s = act(s, { t: 'endTurn', player: p });
    expect(s.winner).toBeUndefined();
    s = act(s, { t: 'endTurn', player: 'p5' });
    expect(s.turn.current).toBe('p2');
    expect(s.winner).toBe('p2');
  });
});

describe('extra build phase (5-6 players)', () => {
  /** Legacy extra-build behaviour (opt-in; the 5-6 default is normal turns as with 2-4 players). */
  const legacy = (s: GameState): GameState => withMode(s, 'extraBuild');

  it('after each turn every other player gets a build window in seat order', () => {
    let s = legacy(blankGame(5));
    s.turn.current = 'p3';
    s = act(s, { t: 'endTurn', player: 'p3' });
    expect(s.phase).toEqual({ k: 'extraBuild', queue: ['p4', 'p5', 'p1', 'p2'] });
    setHand(s, 'p4', { fiber: 2, grain: 2, stone: 2 });
    expect(code(s, { t: 'bankTrade', player: 'p4', give: { fiber: 4 }, get: { clay: 1 } })).toBe('WRONG_PHASE');
    expect(code(s, { t: 'roll', player: 'p4' })).toBe('WRONG_PHASE');
    expect(code(s, { t: 'buyCard', player: 'p5' })).toBe('NOT_YOUR_TURN');
    s.bank.deck.push('guard');
    s = act(s, { t: 'buyCard', player: 'p4' });
    const visited: string[] = [];
    for (const p of ['p4', 'p5', 'p1', 'p2']) {
      visited.push((s.phase as { queue: string[] }).queue[0]);
      s = act(s, { t: 'endTurn', player: p });
    }
    expect(visited).toEqual(['p4', 'p5', 'p1', 'p2']);
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn).toMatchObject({ current: 'p4', n: 2 });
    // a card bought in the build window is playable on the owner's next turn
    expect(code(s, { t: 'playCard', player: 'p4', card: 'guard' })).toBe('OK');
  });

  it('is off for 3-4 players: the next player starts immediately', () => {
    let s = blankGame(4);
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn.current).toBe('p2');
  });
});