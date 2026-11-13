// 3D world mapping for the board.
//
// The engine owns all geometry (docs/BOARD.md): `vertexToPixel` / `hexToPixel` give the
// board layout in SVG pixels. The 3D scene uses the same plane with x = px / SIZE and
// z = py / SIZE, y up. One hex circumradius is exactly 1 unit, so a hex is 2 units tall
// and sqrt(3) units wide — identical topology to the 2D board, so highlights and pieces
// land on the same vertices/edges without any extra layout maths here.
import * as THREE from 'three';
import type { EdgeId, HexId, LayoutId, VertexId } from '@hexgame/engine';
import { edgeGeom, getBoardGraph, hexCenter, SIZE, vertexPos } from '../board/geom';
import type { Graph } from '@hexgame/engine';

/** Top face of a terrain prism (also the y of tokens/rings). */
export const HEX_TOP = 0.18;
export const HEX_BOTTOM = -0.18;
/** Thickness of the sea slab under the terrain. */
export const SEA_Y = HEX_BOTTOM - 0.05;

const SQRT3 = Math.sqrt(3);

export interface WorldXZ {
  x: number;
  z: number;
}

/** SVG pixel point -> world XZ. */
export function worldOf(p: { x: number; y: number }): WorldXZ {
  return { x: p.x / SIZE, z: p.y / SIZE };
}

export function vertexWorld(v: VertexId): WorldXZ {
  return worldOf(vertexPos(v));
}

export function hexWorld(id: HexId): WorldXZ {
  return worldOf(hexCenter(id));
}

export interface WorldEdge {
  a: WorldXZ;
  b: WorldXZ;
  mid: WorldXZ;
  len: number;
  /** Rotation about +Y that aligns a +X-aligned box with the edge. */
  rotY: number;
}

export function edgeWorld(graph: Graph, e: EdgeId): WorldEdge {
  const g = edgeGeom(graph, e);
  const a = worldOf(g.a);
  const b = worldOf(g.b);
  const mid = worldOf(g.mid);
  return {
    a,
    b,
    mid,
    len: Math.hypot(b.x - a.x, b.z - a.z),
    rotY: -Math.atan2(b.z - a.z, b.x - a.x),
  };
}

export interface BoardFit {
  cx: number;
  cz: number;
  /** Bounding radius of the whole playable board (hexes + a sea margin). */
  radius: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Bounding radius for the camera fit (both layouts: 19 and 30 hexes). */
export function boardFit(layout: LayoutId): BoardFit {
  const graph = getBoardGraph(layout);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let centreR = 0;
  for (const h of graph.hexes) {
    const p = hexWorld(h);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  // Distance from the TRUE board centre (the large layout is not centred on the origin).
  for (const h of graph.hexes) {
    const p = hexWorld(h);
    centreR = Math.max(centreR, Math.hypot(p.x - cx, p.z - cz));
  }
  // Hex circumradius (1) + harbor piers/labels + sea breathing room.
  const radius = Math.max(centreR + 1.9, Math.hypot(maxX - minX, maxZ - minZ) / 2 + 1.2);
  return { cx, cz, radius, minX, maxX, minZ, maxZ };
}

/** Six corner points of a pointy-top hex (same order as the engine's hexCorners). */
export function hexCornersXZ(cx = 0, cz = 0, radius = 1): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    out.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
  }
  return out;
}

/**
 * A beveled hex prism: textured top face (material 0), darker sides/bevel/bottom
 * (material 1). Built once per board and shared by every instanced hex.
 */
export function buildHexGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const topR = 0.94;
  const outerR = 1;
  const bevelY = HEX_TOP - 0.055;

  const push = (x: number, y: number, z: number, u = 0, v = 0): number => {
    positions.push(x, y, z);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };

  // Top face: centre + ring, UVs map the terrain SVG over the hex box.
  const centre = push(0, HEX_TOP, 0, 0.5, 0.5);
  const topRing: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const x = Math.cos(a) * topR;
    const z = Math.sin(a) * topR;
    topRing.push(push(x, HEX_TOP, z, x / (SQRT3 * topR) + 0.5, z / (2 * topR) + 0.5));
  }
  for (let i = 0; i < 6; i += 1) {
    indices.push(centre, topRing[(i + 1) % 6], topRing[i]);
  }
  const topCount = indices.length;

  // Bevel band + walls, then a bottom cap. Material 1 is DoubleSide, so winding only
  // needs to be consistent, not outward-perfect.
  const bevelRing: number[] = [];
  const bottomRing: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    bevelRing.push(push(Math.cos(a) * outerR, bevelY, Math.sin(a) * outerR));
    bottomRing.push(push(Math.cos(a) * outerR, HEX_BOTTOM, Math.sin(a) * outerR));
  }
  for (let i = 0; i < 6; i += 1) {
    const n = (i + 1) % 6;
    // bevel from the outer rim up to the inset top face
    indices.push(bevelRing[i], bevelRing[n], topRing[n]);
    indices.push(bevelRing[i], topRing[n], topRing[i]);
    // side wall down to the bottom
    indices.push(bottomRing[i], bottomRing[n], bevelRing[n]);
    indices.push(bottomRing[i], bevelRing[n], bevelRing[i]);
  }
  for (let i = 0; i < 6; i += 1) {
    indices.push(bevelRing[0], bottomRing[(i + 1) % 6], bottomRing[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.addGroup(0, topCount, 0);
  geo.addGroup(topCount, indices.length - topCount, 1);
  geo.computeVertexNormals();
  return geo;
}

/** Darker shade of a #rrggbb colour for prism sides (2D ink/parchment palette). */
export function shade(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = Number.parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

export const INK = '#3b2f2f';
export const GOLD = '#c9a227';
export const PARCHMENT = '#f3e9d2';
export const PARCHMENT_DARK = '#e4d3ae';
export const DANGER = '#a23b2a';
