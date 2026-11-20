// Expansion state (lives in state.ext.tidelands) and read-only board helpers.
import type { EdgeId, GameEvent, GameState, Hex, HexId, Phase, PlayerId, VertexId } from '../../types';
import type { ApplyCtx, Ctx } from '../../ruleset/types';
import { MIST, SEA, TL_ID } from './config';
import { scenarioOf, type Scenario } from './scenarios';

export interface MistStack {
  regions: string;
  hexes: string[];
  numbers: number[];
}

export interface TlState {
  scenario: string;
  /** Hex of the corsair (a sea hex), or null when the scenario has none. */
  corsair: HexId | null;
  /** Cogs built during the current action phase (they may not move yet). */
  fresh: EdgeId[];
  /** A cog was moved during the current action phase (one move per phase). */
  moved: boolean;
  /** Regions of each player's starting settlements (home islands). */
  home: Record<PlayerId, string[]>;
  /** Regions where each player already got the landfall bonus. */
  landfall: Record<PlayerId, string[]>;
  /** Resources of choice still owed (gold mines, discoveries) and the phase to resume afterwards. */
  gold: { owed: Record<PlayerId, number>; resume: Phase } | null;
  /** Face-down stacks of undiscovered hexes (hidden). */
  mist: MistStack[];
}

export const tl = (state: GameState): TlState => state.ext[TL_ID] as TlState;

export const scenario = (state: GameState): Scenario => scenarioOf(tl(state).scenario);

const indexCache = new WeakMap<Hex[], Record<HexId, Hex>>();

/** Hex lookup by id (cached per hexes array; terrain changes in place are seen). */
export function hexIndex(state: GameState): Record<HexId, Hex> {
  const list = state.board.hexes;
  let idx = indexCache.get(list);
  if (!idx) {
    idx = Object.fromEntries(list.map((h) => [h.id, h]));
    indexCache.set(list, idx);
  }
  return idx;
}

export const terrainOf = (state: GameState, hex: HexId): string | undefined => hexIndex(state)[hex]?.terrain;

/** Land: a board hex that is neither sea nor still undiscovered. */
export function isLand(state: GameState, hex: HexId): boolean {
  const t = terrainOf(state, hex);
  return t !== undefined && t !== SEA && t !== MIST;
}

export const isSea = (state: GameState, hex: HexId): boolean => terrainOf(state, hex) === SEA;

/** A road may lie on an edge that touches land. */
export function isLandEdge(ctx: Ctx, e: EdgeId): boolean {
  return ctx.graph.edgeHexes[e].some((h) => isLand(ctx.state, h));
}

/** A cog may lie on an edge that touches sea; the frame around the map counts as sea. */
export function isSeaEdge(ctx: Ctx, e: EdgeId): boolean {
  const hs = ctx.graph.edgeHexes[e];
  return hs.length === 1 || hs.some((h) => isSea(ctx.state, h));
}

/** A settlement (or any piece standing on an intersection) needs land next to it. */
export function isLandCorner(ctx: Ctx, v: VertexId): boolean {
  return ctx.graph.vertexHexes[v].some((h) => isLand(ctx.state, h));
}

/** Regions of the land hexes around an intersection. */
export function regionsAt(ctx: Ctx, v: VertexId): string[] {
  const idx = hexIndex(ctx.state);
  const out: string[] = [];
  for (const h of ctx.graph.vertexHexes[v]) {
    const hex = idx[h];
    if (hex && hex.region && isLand(ctx.state, h) && !out.includes(hex.region)) out.push(hex.region);
  }
  return out;
}

/** Edges of the corsair's hex (no cog may be built on, moved to or moved from them). */
export function corsairEdges(ctx: Ctx): EdgeId[] {
  const c = tl(ctx.state).corsair;
  return c ? ctx.graph.hexEdges[c] : [];
}

/** Emit an expansion event; `secret` is only delivered to `visibleTo`. */
export function emitTl(ctx: ApplyCtx, data: Record<string, unknown>, secret?: unknown, visibleTo?: PlayerId[]): void {
  const ev: GameEvent =
    secret === undefined ? { e: 'ext', id: TL_ID, data } : { e: 'ext', id: TL_ID, data, secret, visibleTo };
  ctx.emit(ev);
}
