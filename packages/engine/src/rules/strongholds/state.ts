// Expansion state (lives in state.ext.strongholds) and read-only helpers.
import type {
  CardId, GameEvent, GameState, HexId, Hex, Occupant, Phase, PlayerId, ResourceId, VertexId,
} from '../../types';
import type { ApplyCtx, Ctx } from '../../ruleset/types';
import { SH_ID, type EventFace, type Track } from './config';

/** A choice a player still has to make. The queue is resolved head first. */
export type Pending =
  | { kind: 'pillage'; player: PlayerId }
  | { kind: 'pickDeck'; player: PlayerId }
  | { kind: 'trimHand'; player: PlayerId }
  | { kind: 'provision'; player: PlayerId }
  | { kind: 'relocate'; player: PlayerId; from: VertexId; level: number; active: boolean; tags: string[] }
  | { kind: 'bazaarGive'; player: PlayerId; to: PlayerId; resource: ResourceId }
  | { kind: 'titheTake'; player: PlayerId; target: PlayerId; count: number }
  | { kind: 'informantTake'; player: PlayerId; target: PlayerId }
  | { kind: 'turncoatRemove'; player: PlayerId; by: PlayerId }
  | { kind: 'turncoatPlace'; player: PlayerId; maxLevel: number; active: boolean }
  | { kind: 'dowryGive'; player: PlayerId; to: PlayerId; count: number }
  | { kind: 'sabotageDiscard'; player: PlayerId; count: number };

export type PendingKind = Pending['kind'];

export interface ShState {
  raid: { pos: number; attacks: number };
  /** The blocker enters play after the first raid. */
  blockerActive: boolean;
  blockerHome: HexId;
  eventDie: EventFace | null;
  /** Production dice fixed by the omen card for the next roll. */
  fixedDice: number[] | null;
  /** The event die is resolved but production is not (pending choices come first). */
  productionDue: boolean;
  /** Phase to return to when the pending queue is empty. */
  resume: Phase | null;
  levels: Record<PlayerId, Record<Track, number>>;
  capitals: Record<Track, { owner: PlayerId; v: VertexId } | null>;
  ramparts: VertexId[];
  /** Pillaged cities whose owner had no settlement piece left (city piece lying on its side). */
  toppled: VertexId[];
  caravan: { owner: PlayerId; hex: HexId } | null;
  /** Defender tokens (1 VP each). */
  shields: Record<PlayerId, number>;
  /** Face-up VP cards. */
  vpCards: Record<PlayerId, CardId[]>;
  /** Draw from the end; played and discarded cards go to the front (bottom). */
  decks: Record<Track, CardId[]>;
  fleet: { player: PlayerId; resource: ResourceId } | null;
  bazaar: { player: PlayerId; offered: PlayerId[] } | null;
  pending: Pending[];
  /** While set, `viewer` may see `target`'s resource hand or advance cards. */
  peek: { viewer: PlayerId; target: PlayerId; what: 'hand' | 'cards' } | null;
}

export const sh = (state: GameState): ShState => state.ext[SH_ID] as ShState;

export const occupants = (state: GameState): Record<VertexId, Occupant> => state.pieces.occupants ?? {};

export const hasTag = (o: Occupant, t: string): boolean => (o.tags ?? []).includes(t);

export function wardensOf(state: GameState, id: PlayerId): Array<[VertexId, Occupant]> {
  return Object.entries(occupants(state)).filter(([, o]) => o.owner === id && o.kind === 'warden');
}

export const levelOf = (state: GameState, id: PlayerId, track: Track): number =>
  sh(state).levels[id]?.[track] ?? 0;

export function citiesOf(state: GameState, id: PlayerId): VertexId[] {
  return Object.entries(state.pieces.buildings)
    .filter(([, b]) => b.owner === id && b.kind === 'city')
    .map(([v]) => v);
}

export function capitalAt(state: GameState, v: VertexId): Track | null {
  const caps = sh(state).capitals;
  for (const t of Object.keys(caps) as Track[]) if (caps[t]?.v === v) return t;
  return null;
}

/** Cities that raiders may pillage (capitals are safe). */
export const pillageable = (state: GameState, id: PlayerId): VertexId[] =>
  citiesOf(state, id).filter((v) => !capitalAt(state, v));

/** Seat order starting at `start`. */
export function turnOrderFrom(state: GameState, start: PlayerId): PlayerId[] {
  const ids = state.players.map((p) => p.id);
  const k = Math.max(0, ids.indexOf(start));
  return [...ids.slice(k), ...ids.slice(0, k)];
}

/** The player whose action phase is running (player 2 in a paired phase). */
export function actingPlayer(state: GameState): PlayerId {
  const ph = state.phase.k === 'ext' ? sh(state).resume ?? state.phase : state.phase;
  if (ph.k === 'paired') return ph.player;
  if ((ph.k === 'moveBlocker' || ph.k === 'steal' || ph.k === 'freeRoads') && ph.actor) return ph.actor;
  return state.turn.current;
}

export const hexById = (state: GameState, id: HexId): Hex | undefined =>
  state.board.hexes.find((h) => h.id === id);

/** Empty intersections (no building, no occupant) touching one of the player's roads. */
export function wardenSpots(ctx: Ctx, id: PlayerId): VertexId[] {
  const { state, graph } = ctx;
  const occ = occupants(state);
  return graph.vertices.filter(
    (v) =>
      !state.pieces.buildings[v] && !occ[v] && graph.vertexEdges[v].some((e) => state.pieces.roads[e] === id),
  );
}

/**
 * Intersections reachable from `from` along the owner's roads. The walk may pass the owner's own
 * pieces but stops at (and includes) an intersection holding another player's building or occupant.
 */
export function reach(ctx: Ctx, owner: PlayerId, from: VertexId): VertexId[] {
  const { state, graph } = ctx;
  const occ = occupants(state);
  const foreign = (v: VertexId) => {
    const b = state.pieces.buildings[v];
    if (b && b.owner !== owner) return true;
    const o = occ[v];
    return !!o && o.owner !== owner;
  };
  const seen = new Set<VertexId>([from]);
  const out: VertexId[] = [];
  const queue: VertexId[] = [from];
  while (queue.length) {
    const v = queue.shift() as VertexId;
    for (const e of graph.vertexEdges[v]) {
      if (state.pieces.roads[e] !== owner) continue;
      const [a, b] = graph.edgeEnds[e];
      const u = a === v ? b : a;
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
      if (!foreign(u)) queue.push(u);
    }
  }
  return out;
}

/** Empty intersections a warden standing on `from` can move to. */
export function moveTargets(ctx: Ctx, owner: PlayerId, from: VertexId): VertexId[] {
  const occ = occupants(ctx.state);
  return reach(ctx, owner, from).filter((v) => !ctx.state.pieces.buildings[v] && !occ[v]);
}

/** Emit an expansion event; `secret` is only delivered to `visibleTo`. */
export function emitSh(ctx: ApplyCtx, data: Record<string, unknown>, secret?: unknown, visibleTo?: PlayerId[]): void {
  const ev: GameEvent =
    secret === undefined ? { e: 'ext', id: SH_ID, data } : { e: 'ext', id: SH_ID, data, secret, visibleTo };
  ctx.emit(ev);
}
