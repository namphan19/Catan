// Board topology derived from the layout (never stored in GameState) plus placement helpers.
import type { EdgeId, HexId, LayoutId, Pieces, PlayerId, VertexId } from '../types';
import { HEX_DIRS, hexCorners, hexEdges, hexId, hexToPixel } from './coords';
import { layoutHexes } from './layouts';

export interface Graph {
  layout: LayoutId;
  hexes: HexId[];
  vertices: VertexId[];
  edges: EdgeId[];
  hexVertices: Record<HexId, VertexId[]>;
  hexEdges: Record<HexId, EdgeId[]>;
  hexNeighbors: Record<HexId, HexId[]>;
  vertexHexes: Record<VertexId, HexId[]>;
  vertexEdges: Record<VertexId, EdgeId[]>;
  vertexNeighbors: Record<VertexId, VertexId[]>;
  edgeEnds: Record<EdgeId, [VertexId, VertexId]>;
  edgeHexes: Record<EdgeId, HexId[]>;
  edgeNeighbors: Record<EdgeId, EdgeId[]>;
  /** Edges on the coast (touching exactly one board hex), in clockwise order. */
  coast: EdgeId[];
}

const cache: Partial<Record<LayoutId, Graph>> = {};

export function getGraph(layout: LayoutId): Graph {
  return (cache[layout] ??= buildGraph(layout));
}

function push<K extends string, V>(m: Record<K, V[]>, k: K, v: V): void {
  const list = (m[k] ??= []);
  if (!list.includes(v)) list.push(v);
}

function buildGraph(layout: LayoutId): Graph {
  const axials = layoutHexes(layout);
  const g: Graph = {
    layout, hexes: [], vertices: [], edges: [], hexVertices: {}, hexEdges: {}, hexNeighbors: {},
    vertexHexes: {}, vertexEdges: {}, vertexNeighbors: {}, edgeEnds: {}, edgeHexes: {},
    edgeNeighbors: {}, coast: [],
  };
  const onBoard = new Set(axials.map((a) => hexId(a.q, a.r)));
  for (const { q, r } of axials) {
    const h = hexId(q, r);
    g.hexes.push(h);
    const cs = hexCorners(q, r);
    const es = hexEdges(q, r);
    g.hexVertices[h] = cs;
    g.hexEdges[h] = es;
    g.hexNeighbors[h] = HEX_DIRS.map((d) => hexId(q + d.q, r + d.r)).filter((n) => onBoard.has(n));
    cs.forEach((v) => push(g.vertexHexes, v, h));
    es.forEach((e, i) => {
      push(g.edgeHexes, e, h);
      const a = cs[i];
      const b = cs[(i + 1) % 6];
      const prev = g.edgeEnds[e];
      if (prev && !(prev.includes(a) && prev.includes(b))) throw new Error(`edge ${e} inconsistent`);
      g.edgeEnds[e] = [a, b];
      push(g.vertexEdges, a, e);
      push(g.vertexEdges, b, e);
      push(g.vertexNeighbors, a, b);
      push(g.vertexNeighbors, b, a);
    });
  }
  g.vertices = Object.keys(g.vertexHexes).sort();
  g.edges = Object.keys(g.edgeEnds).sort();
  for (const e of g.edges) {
    const [a, b] = g.edgeEnds[e];
    g.edgeNeighbors[e] = [...g.vertexEdges[a], ...g.vertexEdges[b]].filter((x) => x !== e);
  }
  // Coast edges sorted clockwise by the angle of their midpoint around the board centre.
  const centre = axials.reduce(
    (acc, a) => {
      const p = hexToPixel(a.q, a.r, 1);
      return { x: acc.x + p.x / axials.length, y: acc.y + p.y / axials.length };
    },
    { x: 0, y: 0 },
  );
  const mid = (e: EdgeId) => {
    const h = g.edgeHexes[e][0];
    const i = g.hexEdges[h].indexOf(e);
    const { q, r } = axials[g.hexes.indexOf(h)];
    const p = hexToPixel(q, r, 1);
    const ang = (-90 + 60 * i + 30) * (Math.PI / 180); // edge i sits between corners i and i+1
    return { x: p.x + Math.cos(ang) - centre.x, y: p.y + Math.sin(ang) - centre.y };
  };
  g.coast = g.edges
    .filter((e) => g.edgeHexes[e].length === 1)
    .map((e) => ({ e, m: mid(e) }))
    .sort((A, B) => Math.atan2(A.m.y, A.m.x) - Math.atan2(B.m.y, B.m.x))
    .map((x) => x.e);
  return g;
}

/** Distance rule: the vertex and all adjacent vertices are empty. An occupant (extension piece)
 *  blocks its own vertex but does not impose the distance rule on its neighbours. */
export function satisfiesDistanceRule(g: Graph, pieces: Pieces, v: VertexId): boolean {
  if (pieces.buildings[v] || pieces.occupants?.[v]) return false;
  return g.vertexNeighbors[v].every((n) => !pieces.buildings[n]);
}

/** Legal settlement vertices. In setup no road connection is needed. */
export function legalSettlementSpots(
  g: Graph, pieces: Pieces, player: PlayerId, opts: { setup: boolean },
): VertexId[] {
  if (opts.setup) return g.vertices.filter((v) => satisfiesDistanceRule(g, pieces, v));
  // Only vertices at the end of one of the player's roads can qualify (kept in board order).
  const near = new Set<VertexId>();
  for (const e in pieces.roads) if (pieces.roads[e] === player) for (const v of g.edgeEnds[e]) near.add(v);
  if (!near.size) return [];
  return g.vertices.filter((v) => near.has(v) && satisfiesDistanceRule(g, pieces, v));
}

/** A road on edge e would connect to the player's network. */
export function roadConnects(g: Graph, pieces: Pieces, player: PlayerId, e: EdgeId): boolean {
  return g.edgeEnds[e].some((v) => {
    const b = pieces.buildings[v];
    if (b && b.owner === player) return true;
    if (b && b.owner !== player) return false; // cannot extend through an opponent building
    const o = pieces.occupants?.[v];
    if (o && o.owner !== player) return false; // ... nor past an opponent occupant
    return g.vertexEdges[v].some((x) => x !== e && pieces.roads[x] === player);
  });
}

/** Legal road edges. With fromVertex (setup) the road must touch that vertex. */
export function legalRoadSpots(
  g: Graph, pieces: Pieces, player: PlayerId, opts: { fromVertex?: VertexId } = {},
): EdgeId[] {
  if (opts.fromVertex) return g.vertexEdges[opts.fromVertex].filter((e) => !pieces.roads[e]);
  // Only edges touching a vertex of the player's network can connect (kept in board order).
  const near = new Set<EdgeId>();
  const touch = (v: VertexId) => {
    for (const x of g.vertexEdges[v]) near.add(x);
  };
  for (const e in pieces.roads) if (pieces.roads[e] === player) g.edgeEnds[e].forEach(touch);
  for (const v in pieces.buildings) if (pieces.buildings[v].owner === player) touch(v);
  if (!near.size) return [];
  return g.edges.filter((e) => near.has(e) && !pieces.roads[e] && roadConnects(g, pieces, player, e));
}

/**
 * Length of the player's longest continuous route: the longest trail (no edge used twice) of the
 * player's roads. A trail may end at, but not pass through, a vertex with an opponent building.
 */
export function longestRoute(g: Graph, pieces: Pieces, player: PlayerId): number {
  const mine = Object.keys(pieces.roads).filter((e) => pieces.roads[e] === player);
  if (mine.length === 0) return 0;
  const used = new Set<EdgeId>();
  const blocked = (v: VertexId) => {
    const b = pieces.buildings[v];
    if (b && b.owner !== player) return true;
    const o = pieces.occupants?.[v];
    return !!o && o.owner !== player;
  };
  let best = 0;
  const dfs = (v: VertexId, len: number) => {
    if (len > best) best = len;
    if (len > 0 && blocked(v)) return;
    for (const e of g.vertexEdges[v]) {
      if (used.has(e) || pieces.roads[e] !== player) continue;
      used.add(e);
      const [a, b] = g.edgeEnds[e];
      dfs(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };
  const starts = new Set<VertexId>();
  for (const e of mine) g.edgeEnds[e].forEach((v) => starts.add(v));
  for (const v of starts) dfs(v, 0);
  return best;
}
