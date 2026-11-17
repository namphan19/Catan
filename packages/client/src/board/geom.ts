// Board geometry shared by the board components. All pixel maths uses the engine's own
// coordinates (hexToPixel / vertexToPixel); the UI never derives game geometry rules.
import { getGraph, hexToPixel, vertexToPixel, type EdgeId, type Graph, type HexId, type VertexId } from '@hexgame/engine';

const SQRT3 = Math.sqrt(3);

/** Pixels per hex circumradius. */
export const SIZE = 56;

/** Corner offsets clockwise from the N corner, × SIZE. Matches engine hexCorners order. */
export const CORNERS: Array<[number, number]> = [
  [0, -1],
  [SQRT3 / 2, -0.5],
  [SQRT3 / 2, 0.5],
  [0, 1],
  [-SQRT3 / 2, 0.5],
  [-SQRT3 / 2, -0.5],
];

export function hexPoints(q: number, r: number): string {
  const c = hexToPixel(q, r, SIZE);
  return CORNERS.map(([dx, dy]) => `${c.x + dx * SIZE},${c.y + dy * SIZE}`).join(' ');
}

export function hexCenter(hex: HexId): { x: number; y: number } {
  const [q, r] = hex.slice(2).split(',').map(Number);
  return hexToPixel(q, r, SIZE);
}

export function vertexPos(v: VertexId): { x: number; y: number } {
  return vertexToPixel(v, SIZE);
}

export function edgeGeom(graph: Graph, e: EdgeId): { a: { x: number; y: number }; b: { x: number; y: number }; mid: { x: number; y: number }; angle: number; len: number } {
  const ends = graph.edgeEnds[e] ?? ['', ''] as unknown as [VertexId, VertexId];
  const a = vertexPos(ends[0]);
  const b = vertexPos(ends[1]);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { a, b, mid, angle, len };
}

type Pt = { x: number; y: number };

/**
 * Harbor layout in board pixels, shared by the SVG and the 3D board. A harbor sits on a coast
 * edge; everything is drawn OUT IN THE SEA so the coast stays clear for roads and settlements:
 * two piers run from the edge's corners out to a small dock, and the badge (icon + ratio) floats
 * beyond the dock. `n` is the outward unit normal (land hex centre -> edge middle), `t` the unit
 * tangent along the edge.
 */
export interface HarborGeom {
  a: Pt;
  b: Pt;
  mid: Pt;
  n: Pt;
  t: Pt;
  /** Dock centre (piers end here). */
  dock: Pt;
  /** Where each pier leaves the coast (just outside the corner, so a settlement never hides it). */
  pierFromA: Pt;
  pierFromB: Pt;
  /** Where each pier meets the dock. */
  pierToA: Pt;
  pierToB: Pt;
}

/** Dock distance from the coast, as a fraction of the hex radius. */
export const HARBOR_DOCK = 0.62;

export function harborGeom(graph: Graph, e: EdgeId): HarborGeom {
  const g = edgeGeom(graph, e);
  const land = graph.edgeHexes[e]?.[0];
  const c = land ? hexCenter(land) : { x: 0, y: 0 };
  let nx = g.mid.x - c.x;
  let ny = g.mid.y - c.y;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  const tx = (g.b.x - g.a.x) / (g.len || 1);
  const ty = (g.b.y - g.a.y) / (g.len || 1);
  const at = (p: Pt, dn: number, dt = 0): Pt => ({ x: p.x + nx * dn * SIZE + tx * dt * SIZE, y: p.y + ny * dn * SIZE + ty * dt * SIZE });
  const dock = at(g.mid, HARBOR_DOCK);
  return {
    a: g.a,
    b: g.b,
    mid: g.mid,
    n: { x: nx, y: ny },
    t: { x: tx, y: ty },
    dock,
    pierFromA: at(g.a, 0.16),
    pierFromB: at(g.b, 0.16),
    pierToA: at(dock, -0.06, -0.2),
    pierToB: at(dock, -0.06, 0.2),
  };
}

/**
 * Centre of a badge of size w×h (pixels, screen-aligned) placed beyond the dock along the
 * normal, far enough that the badge never overlaps the dock whatever the edge direction.
 */
export function harborBadgeCentre(h: HarborGeom, w: number, h2: number, gap = 6): Pt {
  const half = Math.abs(h.n.x) * (w / 2) + Math.abs(h.n.y) * (h2 / 2);
  const d = HARBOR_DOCK * SIZE + 0.14 * SIZE + gap + half;
  return { x: h.mid.x + h.n.x * d, y: h.mid.y + h.n.y * d };
}

/** Overall drawing extent (with margin for sea + harbors) for a layout. */
export function boardExtent(graph: Graph): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const h of graph.hexes) {
    const c = hexCenter(h);
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  // Hex radius + harbor piers, dock and the badge out in the sea (harborBadgeCentre). Coast
  // normals of pointy-top hexes are horizontal or ±60°, so badges reach further sideways.
  const mx = SIZE * 2.8;
  const my = SIZE * 2.2;
  return { x: minX - mx, y: minY - my, w: maxX - minX + 2 * mx, h: maxY - minY + 2 * my };
}

export const getBoardGraph = getGraph;
