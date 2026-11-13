// Pointy-top hexes in axial coordinates (q, r). See docs/BOARD.md.
// Neighbour directions: E(+1,0) W(-1,0) NE(+1,-1) NW(0,-1) SE(0,+1) SW(-1,+1).
// Canonical ownership: every hex owns its N and S corners and its NE, NW and W edges, so each
// vertex and edge on the plane has exactly one id.
import type { EdgeId, HexId, VertexId } from '../types';

export interface Axial {
  q: number;
  r: number;
}

export const hexId = (q: number, r: number): HexId => `h:${q},${r}`;
export const vertexId = (q: number, r: number, c: 'N' | 'S'): VertexId => `v:${q},${r},${c}`;
export const edgeId = (q: number, r: number, d: 'NE' | 'NW' | 'W'): EdgeId => `e:${q},${r},${d}`;

export function parseHex(id: HexId): Axial {
  const [q, r] = id.slice(2).split(',').map(Number);
  return { q, r };
}

export const HEX_DIRS: Axial[] = [
  { q: 1, r: -1 }, // NE
  { q: 1, r: 0 }, // E
  { q: 0, r: 1 }, // SE
  { q: -1, r: 1 }, // SW
  { q: -1, r: 0 }, // W
  { q: 0, r: -1 }, // NW
];

/** The six corners clockwise from the top: N, NE, SE, S, SW, NW. */
export function hexCorners(q: number, r: number): VertexId[] {
  return [
    vertexId(q, r, 'N'),
    vertexId(q + 1, r - 1, 'S'), // NE corner = S of the NE neighbour
    vertexId(q, r + 1, 'N'), // SE corner = N of the SE neighbour
    vertexId(q, r, 'S'),
    vertexId(q - 1, r + 1, 'N'), // SW corner = N of the SW neighbour
    vertexId(q, r - 1, 'S'), // NW corner = S of the NW neighbour
  ];
}

/** The six edges clockwise; edge i joins corner i and corner i+1. */
export function hexEdges(q: number, r: number): EdgeId[] {
  return [
    edgeId(q, r, 'NE'), // N-NE
    edgeId(q + 1, r, 'W'), // NE-SE = W edge of the E neighbour
    edgeId(q, r + 1, 'NW'), // SE-S  = NW edge of the SE neighbour
    edgeId(q - 1, r + 1, 'NE'), // S-SW = NE edge of the SW neighbour
    edgeId(q, r, 'W'), // SW-NW
    edgeId(q, r, 'NW'), // NW-N
  ];
}

const SQRT3 = Math.sqrt(3);

/** Pixel centre of a hex for a given circumradius (y grows downwards). */
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

/** Pixel position of a canonical vertex id. */
export function vertexToPixel(v: VertexId, size: number): { x: number; y: number } {
  const [q, r, c] = v.slice(2).split(',');
  const centre = hexToPixel(Number(q), Number(r), size);
  return { x: centre.x, y: centre.y + (c === 'N' ? -size : size) };
}
