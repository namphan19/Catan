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

/** Castaways scenario: rewards lying on sea edges. */
export interface CastawaysState {
  /** Edge -> what lies there (taken by the first cog that ends on it). */
  rewards: Record<EdgeId, 'vp' | 'card' | 'harbor'>;
  /** Harbor kind of each harbor reward. */
  harborKinds: Record<EdgeId, string>;
  /** Face-down cards for the card rewards (hidden; drawn from the top of the deck at setup). */
  reserved: string[];
  /** VP tokens taken. */
  vpTokens: Record<PlayerId, number>;
  /** Harbors taken but not placed yet. */
  held: Record<PlayerId, string[]>;
  /** Phase to resume after a harbor placement window. */
  resume: Phase | null;
}

/** Silk scenario: weavers' villages, their silk and who trades with them. */
export interface SilkState {
  villages: Record<HexId, { silk: number; traders: PlayerId[] }>;
  /** General supply of silk. */
  supply: number;
  silk: Record<PlayerId, number>;
  /** Empty villages that end the game at the end of a turn. */
  endAt: number;
  /** The game ended by empty villages (the most VP wins). */
  final: boolean;
}

/** Great Works scenario: wonders, who claimed them and how far each player built. */
export interface WorksState {
  /** Wonders in this game. */
  wonders: string[];
  /** Wonder -> player who claimed it. */
  claims: Record<string, PlayerId>;
  /** Levels built per player (0-4). */
  levels: Record<PlayerId, number>;
  /** Marked intersections: wonder sites ('wall', 'bridge', 'beacon') and setup bans ('x'). */
  markers: Array<{ v: VertexId; kind: string }>;
}

/** Corsair coves scenario: the pirate fleet, the lines of cogs and the forts. */
export interface CovesState {
  /** Index of the fleet on its loop; -1 once every fort is taken (the fleet leaves). */
  fleet: number;
  loop: HexId[];
  calm: HexId[];
  /** Per player: starting settlement, landing and fort intersections. */
  seats: Record<PlayerId, { start: VertexId; landing: VertexId; fort: VertexId }>;
  /** Per player: the line of cogs from the starting settlement, in order. */
  lines: Record<PlayerId, EdgeId[]>;
  /** Per player: how many cogs of the line (counted from its start) are warships. */
  war: Record<PlayerId, number>;
  /** Lair tokens left under each player's fort (0 = taken). */
  lairs: Record<PlayerId, number>;
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
  /** Set while a steal phase was opened by the corsair (silk: silk may be taken instead). */
  corsairSteal: boolean;
  castaways?: CastawaysState;
  silk?: SilkState;
  works?: WorksState;
  coves?: CovesState;
  /** Corsair coves: resources of choice won against the fleet on this roll (merged into the gold window). */
  fleetBonus?: Record<PlayerId, number>;
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
