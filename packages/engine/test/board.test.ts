import { describe, expect, it } from 'vitest';
import {
  createGame, getGraph, hexCorners, legalRoadSpots, legalSettlementSpots, longestRoute, satisfiesDistanceRule,
  type LayoutId, type Pieces,
} from '../src';
import { findPath } from './helpers';

const empty = (): Pieces => ({ buildings: {}, roads: {} });

describe('board geometry', () => {
  it.each([
    ['standard', 19, 54, 72, 30],
    ['large', 30, 80, 109, 38],
  ] as Array<[LayoutId, number, number, number, number]>)(
    '%s layout: %i hexes, %i vertices, %i edges, %i coast edges',
    (layout, H, V, E, coast) => {
      const g = getGraph(layout);
      expect(g.hexes.length).toBe(H);
      expect(g.vertices.length).toBe(V);
      expect(g.edges.length).toBe(E);
      expect(g.coast.length).toBe(coast);
      // Independent checks: Euler for a planar disc (V - E + F = 1) and edge double counting.
      expect(V - E + H).toBe(1);
      expect(6 * H).toBe(2 * E - coast);
    },
  );

  it.each(['standard', 'large'] as LayoutId[])('%s: adjacency is consistent', (layout) => {
    const g = getGraph(layout);
    for (const v of g.vertices) {
      expect(g.vertexNeighbors[v].length).toBeGreaterThanOrEqual(2);
      expect(g.vertexNeighbors[v].length).toBeLessThanOrEqual(3);
      expect(g.vertexHexes[v].length).toBeGreaterThanOrEqual(1);
      expect(g.vertexHexes[v].length).toBeLessThanOrEqual(3);
      for (const n of g.vertexNeighbors[v]) expect(g.vertexNeighbors[n]).toContain(v);
    }
    for (const e of g.edges) {
      const [a, b] = g.edgeEnds[e];
      expect(g.vertexNeighbors[a]).toContain(b);
      expect(g.edgeHexes[e].length).toBeGreaterThanOrEqual(1);
      expect(g.edgeHexes[e].length).toBeLessThanOrEqual(2);
    }
    for (const h of g.hexes) {
      expect(g.hexVertices[h]).toHaveLength(6);
      expect(new Set(g.hexVertices[h]).size).toBe(6);
      expect(g.hexNeighbors[h].length).toBeGreaterThanOrEqual(2);
      expect(g.hexNeighbors[h].length).toBeLessThanOrEqual(6);
    }
  });

  it('shared corners get one canonical id from every hex', () => {
    const a = hexCorners(0, 0);
    const b = hexCorners(1, 0); // E neighbour
    expect(a[1]).toBe(b[5]); // NE of (0,0) == NW of (1,0)
    expect(a[2]).toBe(b[4]); // SE of (0,0) == SW of (1,0)
  });
});

describe('board generation', () => {
  it.each([
    [3, 'standard'],
    [4, 'standard'],
    [5, 'large'],
    [6, 'large'],
  ] as Array<[number, LayoutId]>)('%i players uses the %s layout with correct contents', (n, layout) => {
    const s = createGame({ seed: `gen-${n}`, playerCount: n });
    expect(s.board.layout).toBe(layout);
    const g = getGraph(layout);
    expect(s.board.hexes).toHaveLength(g.hexes.length);
    const waste = s.board.hexes.filter((h) => h.terrain === 'waste');
    expect(waste.every((h) => h.token === undefined)).toBe(true);
    expect(s.board.hexes.filter((h) => h.token !== undefined)).toHaveLength(g.hexes.length - waste.length);
    expect(waste.map((h) => h.id)).toContain(s.board.blocker);
    expect(s.board.harbors).toHaveLength(layout === 'standard' ? 9 : 11);
    const seen = new Set<string>();
    for (const h of s.board.harbors) {
      expect(g.coast).toContain(h.edge);
      for (const v of h.vertices) {
        expect(seen.has(v)).toBe(false); // harbors never share a vertex
        seen.add(v);
      }
    }
  });

  it('never puts hot numbers (6, 8) on adjacent hexes (200 seeds, both layouts)', () => {
    for (let i = 0; i < 200; i++) {
      const s = createGame({ seed: `hot-${i}`, playerCount: i % 2 ? 4 : 6 });
      const g = getGraph(s.board.layout);
      const tok = Object.fromEntries(s.board.hexes.map((h) => [h.id, h.token]));
      for (const h of s.board.hexes) {
        if (h.token !== 6 && h.token !== 8) continue;
        for (const n of g.hexNeighbors[h.id]) expect([6, 8]).not.toContain(tok[n]);
      }
    }
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = createGame({ seed: 'same', playerCount: 4 });
    const b = createGame({ seed: 'same', playerCount: 4 });
    const c = createGame({ seed: 'other', playerCount: 4 });
    expect(b.board).toEqual(a.board);
    expect(c.board).not.toEqual(a.board);
  });
});

describe('distance rule and legal spots', () => {
  const g = getGraph('standard');
  const v = 'v:0,0,N';

  it('blocks the vertex itself and all adjacent vertices', () => {
    const p = empty();
    p.buildings[v] = { owner: 'p1', kind: 'settlement' };
    expect(satisfiesDistanceRule(g, p, v)).toBe(false);
    for (const n of g.vertexNeighbors[v]) expect(satisfiesDistanceRule(g, p, n)).toBe(false);
    const two = g.vertexNeighbors[g.vertexNeighbors[v][0]].find((x) => x !== v)!;
    expect(satisfiesDistanceRule(g, p, two)).toBe(true);
  });

  it('setup spots ignore roads; normal spots need an own road', () => {
    const p = empty();
    expect(legalSettlementSpots(g, p, 'p1', { setup: true })).toHaveLength(54);
    expect(legalSettlementSpots(g, p, 'p1', { setup: false })).toHaveLength(0);
    const path = findPath(g, v, 2);
    p.buildings[v] = { owner: 'p1', kind: 'settlement' };
    path.edges.forEach((e) => (p.roads[e] = 'p1'));
    expect(legalSettlementSpots(g, p, 'p1', { setup: false })).toEqual([path.vertices[2]]);
  });

  it('roads connect to own buildings/roads but not through an opponent building', () => {
    const p = empty();
    const path = findPath(g, v, 2);
    p.roads[path.edges[0]] = 'p1';
    expect(legalRoadSpots(g, p, 'p1')).toContain(path.edges[1]);
    p.buildings[path.vertices[1]] = { owner: 'p2', kind: 'settlement' };
    expect(legalRoadSpots(g, p, 'p1')).not.toContain(path.edges[1]);
  });
});

describe('longest route', () => {
  const g = getGraph('standard');
  const start = 'v:0,0,N';

  it('counts a simple path', () => {
    const p = empty();
    findPath(g, start, 5).edges.forEach((e) => (p.roads[e] = 'p1'));
    expect(longestRoute(g, p, 'p1')).toBe(5);
    expect(longestRoute(g, p, 'p2')).toBe(0);
  });

  it('counts a cycle (ring of 6 around a hex) and a cycle with a tail', () => {
    const p = empty();
    g.hexEdges['h:0,0'].forEach((e) => (p.roads[e] = 'p1'));
    expect(longestRoute(g, p, 'p1')).toBe(6);
    const corner = g.hexVertices['h:0,0'][0];
    const tail = g.vertexEdges[corner].find((e) => !g.hexEdges['h:0,0'].includes(e))!;
    p.roads[tail] = 'p1';
    expect(longestRoute(g, p, 'p1')).toBe(7);
  });

  it('takes the longest branch through a fork (Y of three arms of 2 = 4)', () => {
    const p = empty();
    const centre = 'v:0,0,N';
    for (const e of g.vertexEdges[centre]) {
      p.roads[e] = 'p1';
      const [a, b] = g.edgeEnds[e];
      const far = a === centre ? b : a;
      p.roads[g.vertexEdges[far].find((x) => x !== e)!] = 'p1';
    }
    expect(Object.keys(p.roads)).toHaveLength(6);
    expect(longestRoute(g, p, 'p1')).toBe(4);
  });

  it('is cut by an opponent settlement but not by an own one', () => {
    const p = empty();
    const path = findPath(g, start, 5);
    path.edges.forEach((e) => (p.roads[e] = 'p1'));
    p.buildings[path.vertices[2]] = { owner: 'p1', kind: 'settlement' };
    expect(longestRoute(g, p, 'p1')).toBe(5);
    p.buildings[path.vertices[2]] = { owner: 'p2', kind: 'settlement' };
    expect(longestRoute(g, p, 'p1')).toBe(3);
  });
});
