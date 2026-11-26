// Namespaced state of the highlands expansion (state.ext.highlands) and small board helpers.
import type { CardId, GameState, HexId, PlayerId, VertexId } from '../../types';
import type { Ctx } from '../../ruleset/types';
import { HL, HL_ID, LAND_TERRAINS, isRuin } from './config';

export interface TribeState {
  /** Active tribe: 1, 2 or 3. */
  tribe: number;
  /** Culture points per tribe (index 0 = tribe 1). Never lost, even when a ruin is built over. */
  cp: number[];
}

export interface HlState {
  players: Record<PlayerId, TribeState>;
  /** The second development stack (hidden order); joins under the deck once every player founded tribe 2. */
  stack2: CardId[];
  stack2Joined: boolean;
  /** Turn number in which the longest-route power (caravan) / largest-force power (recall) was used. */
  caravanTurn: number;
  recallTurn: number;
}

export const hl = (state: GameState): HlState => state.ext[HL_ID] as HlState;

export const tribeOf = (state: GameState, id: PlayerId): TribeState => hl(state).players[id];

export const culture = (state: GameState, id: PlayerId): number =>
  tribeOf(state, id).cp.reduce((s, n) => s + n, 0);

/** Culture goal of the player's active tribe. */
export const goalOf = (t: TribeState): number => (t.tribe >= HL.tribes ? HL.finalGoal : HL.tribeGoal);

const terrainCache = new WeakMap<GameState['board'], Record<HexId, string>>();

export function terrainOf(state: GameState, hex: HexId): string | undefined {
  let m = terrainCache.get(state.board);
  if (!m) {
    m = Object.fromEntries(state.board.hexes.map((h) => [h.id, h.terrain]));
    terrainCache.set(state.board, m);
  }
  return m[hex];
}

export const isLandHexHL = (state: GameState, hex: HexId): boolean =>
  LAND_TERRAINS.includes(terrainOf(state, hex) ?? '');

/** An intersection is buildable when a path leads to it, i.e. it touches a land hex. */
export const isPathVertex = (ctx: Ctx, v: VertexId): boolean =>
  (ctx.graph.vertexHexes[v] ?? []).some((h) => isLandHexHL(ctx.state, h));

/** A path: an edge with a land hex on at least one side (none between jungle, sea and the frame). */
export const isPath = (ctx: Ctx, e: string): boolean =>
  (ctx.graph.edgeHexes[e] ?? []).some((h) => isLandHexHL(ctx.state, h));

/** A building of a tribe in decline stands here. */
export const ruinAt = (state: GameState, v: VertexId): boolean => isRuin(state.pieces.buildings[v]?.kind);

/**
 * Like roadConnects, but a building in decline blocks every road, its owner's too: roads may be built
 * up to it, never from it or past it (only after it was built over).
 */
export function roadConnectsHL(ctx: Ctx, id: PlayerId, e: string): boolean {
  const { state, graph } = ctx;
  return graph.edgeEnds[e].some((v) => {
    const b = state.pieces.buildings[v];
    if (b) return b.owner === id && !isRuin(b.kind);
    return graph.vertexEdges[v].some((x) => x !== e && state.pieces.roads[x] === id);
  });
}
