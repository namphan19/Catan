// QA tests: RULES.md 2 (costs), 3 (placement), 7 (freeRoads) and decision D17 (supply exhaustion).
import { describe, expect, it } from 'vitest';
import { getLegalActions, validateAction, type Action, type GameState } from '../../src';
import { act, blankGame, findPath, graphOf, hand, pl, setHand, totalResources } from '../helpers';

const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};

describe('supply exhaustion (RULES.md 1, D17)', () => {
  it('settlement is refused with NO_PIECES when 5 settlements are on the board', () => {
    // RULES.md 1 (5 settlements per player) + D17 (no settlement left -> cannot place one).
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    s.pieces.roads[path.edges[0]] = 'p1';
    pl(s, 'p1').supply.settlement = 0; // all five are on the board
    setHand(s, 'p1', { timber: 2, clay: 2, fiber: 2, grain: 2 });
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: path.vertices[2] })).toBe('NO_PIECES');
    expect(getLegalActions(s, 'p1').some((a) => a.t === 'placeSettlement')).toBe(false);
  });

  it('city is refused with NO_PIECES when all 4 cities are built', () => {
    // RULES.md 1 (4 cities per player) + D17.
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 1);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    s.pieces.buildings[path.vertices[1]] = { owner: 'p1', kind: 'city' };
    pl(s, 'p1').supply.city = 0; // 4 cities already built
    pl(s, 'p1').supply.settlement = 1;
    setHand(s, 'p1', { grain: 2, stone: 3 });
    expect(code(s, { t: 'buildCity', player: 'p1', v: path.vertices[0] })).toBe('NO_PIECES');
    expect(getLegalActions(s, 'p1').some((a) => a.t === 'buildCity')).toBe(false);
  });

  it('building a city returns the replaced settlement to the supply (D17)', () => {
    // D17: "building a city returns the settlement to the supply".
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 1);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    setHand(s, 'p1', { grain: 2, stone: 3 });
    const before = pl(s, 'p1').supply.settlement;
    const r = act(s, { t: 'buildCity', player: 'p1', v: path.vertices[0] });
    expect(pl(r, 'p1').supply).toMatchObject({ settlement: before + 1, city: 3 });
  });
});

describe('freeRoads card (RULES.md 7, RULES.md 3)', () => {
  it('places 2 roads for free', () => {
    // RULES.md 7: freeRoads = place 2 roads for free.
    let s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    pl(s, 'p1').cards = ['freeRoads'];
    s = act(s, { t: 'playCard', player: 'p1', card: 'freeRoads' });
    expect(s.phase).toEqual({ k: 'freeRoads', left: 2 });
    s = act(s, { t: 'placeRoad', player: 'p1', e: path.edges[0] });
    expect(s.phase).toEqual({ k: 'freeRoads', left: 1 });
    s = act(s, { t: 'placeRoad', player: 'p1', e: path.edges[1] });
    expect(s.phase).toEqual({ k: 'main' });
    expect(pl(s, 'p1').supply.road).toBe(13);
    // no resources were paid
    expect(hand(s, 'p1')).toMatchObject({ timber: 0, clay: 0 });
  });

  it('places only 1 road when the supply has just 1 road left', () => {
    // RULES.md 7: "place 2 roads for free (fewer if out of pieces or spots)".
    let s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    pl(s, 'p1').supply.road = 1;
    pl(s, 'p1').cards = ['freeRoads'];
    s = act(s, { t: 'playCard', player: 'p1', card: 'freeRoads' });
    expect(s.phase).toEqual({ k: 'freeRoads', left: 1 });
    s = act(s, { t: 'placeRoad', player: 'p1', e: path.edges[0] });
    expect(s.phase).toEqual({ k: 'main' });
    expect(pl(s, 'p1').supply.road).toBe(0);
    expect(Object.values(s.pieces.roads).filter((o) => o === 'p1')).toHaveLength(1);
  });

  it('places only 1 road when the second spot is blocked by opponent roads', () => {
    // RULES.md 7: "place 2 roads for free (fewer if out of pieces or spots)" - the second spot is out.
    let s = blankGame(4);
    const g = graphOf(s);
    s.pieces.buildings['v:0,0,N'] = { owner: 'p1', kind: 'settlement' };
    const v = 'v:0,0,N';
    const e0 = g.vertexEdges[v][0];
    const w = g.edgeEnds[e0].find((x) => x !== v)!;
    for (const e of g.vertexEdges[v]) if (e !== e0) s.pieces.roads[e] = 'p2';
    for (const e of g.vertexEdges[w]) if (e !== e0) s.pieces.roads[e] = 'p2';
    // only e0 is a legal p1 spot, and after building it nothing remains
    pl(s, 'p1').cards = ['freeRoads'];
    s = act(s, { t: 'playCard', player: 'p1', card: 'freeRoads' });
    expect(s.phase).toEqual({ k: 'freeRoads', left: 2 });
    s = act(s, { t: 'placeRoad', player: 'p1', e: e0 });
    expect(s.phase).toEqual({ k: 'main' });
    expect(pl(s, 'p1').supply.road).toBe(14);
    expect(Object.values(s.pieces.roads).filter((o) => o === 'p1')).toHaveLength(1);
  });

  it('is rejected with NO_ROAD_SPOT when there is no legal spot', () => {
    // RULES.md 7: "Not playable with no legal spot" + RULES.md 3 (road must connect).
    const s = blankGame(4);
    pl(s, 'p1').cards = ['freeRoads'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'freeRoads' })).toBe('NO_ROAD_SPOT');
    expect(getLegalActions(s, 'p1').some((a) => a.t === 'playCard')).toBe(false);

    // Roads exist but none is connected to p1's network: still no legal spot.
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.roads[path.edges[0]] = 'p2';
    expect(code(s, { t: 'playCard', player: 'p1', card: 'freeRoads' })).toBe('NO_ROAD_SPOT');
  });

  it('is rejected with NO_ROAD_SPOT when the road supply is empty', () => {
    // RULES.md 7 ("fewer if out of pieces") + RULES.md 1 (15 roads).
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 1);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    pl(s, 'p1').supply.road = 0;
    pl(s, 'p1').cards = ['freeRoads'];
    expect(code(s, { t: 'playCard', player: 'p1', card: 'freeRoads' })).toBe('NO_ROAD_SPOT');
  });
});

describe('costs (RULES.md 2)', () => {
  it('road/settlement/city/card cost exactly the RULES.md 2 amounts', () => {
    // RULES.md 2 cost table.
    const road = blankGame(4);
    const g = graphOf(road);
    const p1 = findPath(g, 'v:0,0,N', 1);
    road.pieces.buildings[p1.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    setHand(road, 'p1', { timber: 2, clay: 2 });
    const roadDone = act(road, { t: 'placeRoad', player: 'p1', e: p1.edges[0] });
    expect(hand(roadDone, 'p1')).toMatchObject({ timber: 1, clay: 1 });

    const set = blankGame(4);
    const p2 = findPath(graphOf(set), 'v:0,0,N', 2);
    set.pieces.buildings[p2.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    set.pieces.roads[p2.edges[0]] = 'p1';
    set.pieces.roads[p2.edges[1]] = 'p1'; // the new settlement must touch a road at p2.vertices[2]
    setHand(set, 'p1', { timber: 1, clay: 1, fiber: 1, grain: 1 });
    const setDone = act(set, { t: 'placeSettlement', player: 'p1', v: p2.vertices[2] });
    expect(hand(setDone, 'p1')).toMatchObject({ timber: 0, clay: 0, fiber: 0, grain: 0 });

    const city = blankGame(4);
    const p3 = findPath(graphOf(city), 'v:0,0,N', 1);
    city.pieces.buildings[p3.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    setHand(city, 'p1', { grain: 2, stone: 3 });
    const cityDone = act(city, { t: 'buildCity', player: 'p1', v: p3.vertices[0] });
    expect(hand(cityDone, 'p1')).toMatchObject({ grain: 0, stone: 0 });

    const card = blankGame(4);
    setHand(card, 'p1', { fiber: 1, grain: 1, stone: 1 });
    card.bank.deck.push('guard');
    const cardDone = act(card, { t: 'buyCard', player: 'p1' });
    expect(hand(cardDone, 'p1')).toMatchObject({ fiber: 0, grain: 0, stone: 0 });
  });
});

describe('placement rules (RULES.md 3)', () => {
  it('a road cannot extend through an opponent building', () => {
    // RULES.md 3: a road must touch own building, or own road at a vertex without an opponent
    // building (roadConnects stops at opponent buildings).
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 2);
    s.pieces.roads[path.edges[0]] = 'p1';
    s.pieces.buildings[path.vertices[1]] = { owner: 'p2', kind: 'settlement' };
    setHand(s, 'p1', { timber: 2, clay: 2 });
    expect(code(s, { t: 'placeRoad', player: 'p1', e: path.edges[1] })).toBe('NOT_CONNECTED');
    expect(pl(s, 'p1').supply.road).toBe(15);
  });

  it('outside setup a settlement must touch one of the owner roads; distance rule applies', () => {
    // RULES.md 3 (distance rule + road connection) - gap test beyond rules.test.ts.
    const s = blankGame(4);
    const g = graphOf(s);
    const path = findPath(g, 'v:0,0,N', 3);
    s.pieces.buildings[path.vertices[0]] = { owner: 'p1', kind: 'settlement' };
    s.pieces.roads[path.edges[0]] = 'p1';
    s.pieces.roads[path.edges[1]] = 'p1';
    setHand(s, 'p1', { timber: 2, clay: 2, fiber: 2, grain: 2 });
    const far = g.vertices.find(
      (v) => !g.vertexEdges[v].some((e) => s.pieces.roads[e]) && !g.vertexNeighbors[v].includes(path.vertices[0]),
    )!;
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: far })).toBe('NOT_CONNECTED');
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: path.vertices[1] })).toBe('DISTANCE_RULE');
    const before = totalResources(s);
    const r = act(s, { t: 'placeSettlement', player: 'p1', v: path.vertices[2] });
    expect(totalResources(r)).toBe(before); // costs move cards to the bank, nothing is created
    expect(hand(r, 'p1')).toMatchObject({ timber: 1, clay: 1, fiber: 1, grain: 1 });
  });
});
