// Sea-aware helpers for the heuristic bot (tidelands expansion). Everything works on the bot's own
// PlayerView: terrain, pieces, the corsair and scenario data are public.
import type { Action, EdgeId, HexId, PlayerId, VertexId } from '../types';
import type { PlayerView } from '../view';
import type { Graph } from '../board/graph';
import { satisfiesDistanceRule } from '../board/graph';

/** The tidelands part of a view (public fields only). */
export interface SeaView {
  scenario: string;
  corsair: string | null;
  fresh: string[];
  moved: boolean;
  home: Record<PlayerId, string[]>;
  landfall: Record<PlayerId, string[]>;
  castaways?: { rewards: Record<EdgeId, string>; held: Record<PlayerId, string[]> };
  silk?: { villages: Record<HexId, { silk: number; traders: PlayerId[] }>; silk: Record<PlayerId, number> };
  works?: { wonders: string[]; claims: Record<string, PlayerId>; levels: Record<PlayerId, number> };
  coves?: { lines: Record<PlayerId, EdgeId[]>; war: Record<PlayerId, number>; lairs: Record<PlayerId, number> };
}

export const seaOf = (view: PlayerView): SeaView | null => (view.ext?.tidelands as SeaView | undefined) ?? null;

export interface SeaCtx {
  view: PlayerView;
  me: PlayerId;
  g: Graph;
  sea: SeaView;
  terrain: Record<HexId, string>;
  token: Record<HexId, number | undefined>;
  region: Record<HexId, string | undefined>;
  /** VP of a landfall bonus in this scenario. */
  landfallVP: number;
}

export const isLandT = (t: string | undefined): boolean => t !== undefined && t !== 'sea' && t !== 'mist';

export function seaCtx(view: PlayerView, me: PlayerId, g: Graph, landfallVP: number): SeaCtx | null {
  const sea = seaOf(view);
  if (!sea) return null;
  const terrain: SeaCtx['terrain'] = {};
  const token: SeaCtx['token'] = {};
  const region: SeaCtx['region'] = {};
  for (const h of view.board.hexes) {
    terrain[h.id] = h.terrain;
    token[h.id] = h.token;
    region[h.id] = h.region;
  }
  return { view, me, g, sea, terrain, token, region, landfallVP };
}

export const landVertex = (s: SeaCtx, v: VertexId): boolean => s.g.vertexHexes[v].some((h) => isLandT(s.terrain[h]));

export function seaEdge(s: SeaCtx, e: EdgeId): boolean {
  const hs = s.g.edgeHexes[e];
  return hs.length === 1 || hs.some((h) => s.terrain[h] === 'sea');
}

/** Regions of the land around v that would give me a landfall bonus. */
export function landfallRegions(s: SeaCtx, v: VertexId): string[] {
  if (!s.landfallVP) return [];
  const home = s.sea.home[s.me] ?? [];
  const got = s.sea.landfall[s.me] ?? [];
  const out: string[] = [];
  for (const h of s.g.vertexHexes[v]) {
    const r = s.region[h];
    if (r && isLandT(s.terrain[h]) && r !== 'w' && !home.includes(r) && !got.includes(r) && !out.includes(r)) out.push(r);
  }
  return out;
}

/** Edges a cog of mine could use as a path: sea side, free or mine, not at the corsair. */
function sailable(s: SeaCtx, e: EdgeId): boolean {
  if (!seaEdge(s, e)) return false;
  const p = s.view.pieces;
  if (p.roads[e]) return false;
  const o = p.ships?.[e];
  if (o && o !== s.me) return false;
  return !(s.sea.corsair && s.g.hexEdges[s.sea.corsair].includes(e));
}

/** Sea distance (in edges) from every vertex to `targets`, walking sailable edges; opponent buildings block. */
export function seaDistance(s: SeaCtx, targets: VertexId[]): Record<VertexId, number> {
  const dist: Record<VertexId, number> = {};
  const queue: VertexId[] = [];
  for (const t of targets) {
    dist[t] = 0;
    queue.push(t);
  }
  const blocked = (v: VertexId) => {
    const b = s.view.pieces.buildings[v];
    return !!b && b.owner !== s.me;
  };
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    if (dist[v] > 0 && blocked(v)) continue;
    for (const e of s.g.vertexEdges[v]) {
      if (!sailable(s, e)) continue;
      const [a, b] = s.g.edgeEnds[e];
      const u = a === v ? b : a;
      if (dist[u] !== undefined) continue;
      dist[u] = dist[v] + 1;
      queue.push(u);
    }
  }
  return dist;
}

export interface SeaTarget {
  /** Vertices that complete the goal when a cog reaches them. */
  at: VertexId[];
  value: number;
}

/** Corners of my cogs and my buildings: where a new cog can start. */
export function shipFrontier(s: SeaCtx): VertexId[] {
  const out = new Set<VertexId>();
  for (const [e, o] of Object.entries(s.view.pieces.ships ?? {})) if (o === s.me) s.g.edgeEnds[e].forEach((v) => out.add(v));
  for (const [v, b] of Object.entries(s.view.pieces.buildings)) if (b.owner === s.me) out.add(v);
  return [...out];
}

/**
 * Where my cogs should head: good open settlement spots on coasts my roads do not reach (worth more
 * with a landfall bonus), rewards on edges (castaways), weaver villages (silk). `spotValue` rates a
 * settlement spot; `reachable` are spots my roads/cogs already touch (no cog needed).
 */
export function seaTargets(s: SeaCtx, spotValue: (v: VertexId) => number, reachable: Set<VertexId>): SeaTarget[] {
  const out: SeaTarget[] = [];
  const p = s.view.pieces;
  for (const v of s.g.vertices) {
    if (reachable.has(v) || !landVertex(s, v) || !satisfiesDistanceRule(s.g, p, v)) continue;
    if (!s.g.vertexEdges[v].some((e) => seaEdge(s, e))) continue;
    const val = spotValue(v);
    if (val <= 0) continue;
    out.push({ at: [v], value: val + landfallRegions(s, v).length * s.landfallVP * 6 });
  }
  out.sort((a, b) => b.value - a.value);
  const top = out.slice(0, 6);
  const c = s.sea.castaways;
  if (c)
    for (const [e, kind] of Object.entries(c.rewards))
      top.push({ at: [...s.g.edgeEnds[e]], value: kind === 'vp' ? 14 : kind === 'card' ? 10 : 9 });
  const silk = s.sea.silk;
  if (silk)
    for (const [h, v] of Object.entries(silk.villages)) {
      if (v.traders.includes(s.me)) continue;
      const pip = 6 - Math.abs(7 - (s.token[h] ?? 7));
      top.push({ at: [...s.g.hexVertices[h]], value: (v.silk > 0 ? 10 : 2) + pip * 2 });
    }
  return top;
}

/**
 * How much a cog on edge e (a new one, or a moved one from `from`) brings me closer to a target:
 * the best value / (1 + remaining distance) among targets it gets strictly closer to, else 0.
 */
export function shipProgress(s: SeaCtx, targets: SeaTarget[], dists: Array<Record<VertexId, number>>, e: EdgeId): number {
  const [a, b] = s.g.edgeEnds[e];
  const frontier = new Set(shipFrontier(s));
  let best = 0;
  targets.forEach((t, i) => {
    const d = dists[i];
    const da = d[a] ?? Infinity;
    const db = d[b] ?? Infinity;
    // the end already in my network and the new end
    const [inside, outside] = frontier.has(a) ? [da, db] : [db, da];
    if (!(outside < inside)) return;
    best = Math.max(best, t.value / (1 + outside));
  });
  return best;
}

/** Docking a cog on a reward edge or a village side right now. */
export function shipPayoff(s: SeaCtx, e: EdgeId): number {
  let v = 0;
  const kind = s.sea.castaways?.rewards[e];
  if (kind) v += kind === 'vp' ? 60 : kind === 'card' ? 35 : 30;
  const silk = s.sea.silk;
  if (silk)
    for (const h of s.g.edgeHexes[e]) {
      const vil = silk.villages[h];
      if (vil && !vil.traders.includes(s.me)) v += vil.silk > 0 ? 45 : 10;
    }
  return v;
}

/** Corsair placement: rob and block opponents' cogs, keep away from mine. */
export function corsairScore(s: SeaCtx, a: Action): number {
  const hex = (a as { hex: HexId }).hex;
  let sc = 0;
  for (const e of s.g.hexEdges[hex]) {
    const o = s.view.pieces.ships?.[e];
    if (!o) continue;
    if (o === s.me) sc -= 6;
    else {
      const p = s.view.players.find((x) => x.id === o);
      sc += 2 + (p ? p.publicVP / 3 + Math.min(p.handCount, 6) * 0.3 : 0);
    }
  }
  return sc;
}
