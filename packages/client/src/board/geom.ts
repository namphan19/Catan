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
  // Hex radius (1.0) + the harbor badge and its ratio chip just outside the coast (~0.6).
  const m = SIZE * 1.6;
  return { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
}

export const getBoardGraph = getGraph;
