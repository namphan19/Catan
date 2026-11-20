// Cogs: build (also as a setup piece and with free road placements) and move one per action phase.
import type { Action, EdgeId, ExtAction, PlayerId, RuleError } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { edgeTaken, shipConnects } from '../../board/graph';
import { advanceAfterRoute, canAfford, pay } from '../base/build';
import { cost, err, expect, player, updateLongestRoute } from '../base/helpers';
import { afterRoutePlaced, shipLocked } from './special';
import { covesOf, covesShipError } from './coves';
import { corsairEdges, emitTl, isSeaEdge, tl } from './state';

const BUILD_PHASES = ['setup', 'main', 'extraBuild', 'paired', 'freeRoads'] as const;
export const MOVE_PHASES = ['main', 'paired'] as const;

interface SpotOpts {
  /** Setup: the cog must touch this vertex (the settlement just placed). */
  setupAt?: string;
  /** The cog being moved: it is left out of the connection check. */
  moving?: EdgeId;
}

/** Why a cog may not be placed on edge e (ignoring cost and phase), or null. */
export function shipSpotError(ctx: Ctx, id: PlayerId, e: EdgeId, opts: SpotOpts = {}): RuleError | null {
  const { state, graph } = ctx;
  if (!graph.edgeEnds[e]) return err('BAD_EDGE', `Unknown edge ${String(e)}.`);
  if (edgeTaken(state.pieces, e)) return err('OCCUPIED', 'This edge is taken.');
  if (!isSeaEdge(ctx, e)) return err('NOT_SEA', 'Cogs sail on edges next to the sea.');
  if (corsairEdges(ctx).includes(e)) return err('CORSAIR', 'The corsair guards that hex.');
  if (opts.setupAt !== undefined) {
    if (covesOf(state)) return err('NOT_HERE', 'Starting pieces are roads in this scenario.');
    return graph.edgeEnds[e].includes(opts.setupAt)
      ? null
      : err('NOT_CONNECTED', 'The setup cog must touch the settlement just placed.');
  }
  const line = covesShipError(ctx, id, e);
  if (line) return err('LINE', line);
  if (!shipConnects(graph, state.pieces, id, e, opts.moving))
    return err('NOT_CONNECTED', 'A cog must connect to one of your cogs or buildings.');
  return null;
}

/** Free edges where the player could put a cog now (connection, sea, corsair), in board order. */
export function shipSpots(ctx: Ctx, id: PlayerId, opts: SpotOpts = {}): EdgeId[] {
  const { state, graph } = ctx;
  const near = new Set<EdgeId>();
  const touch = (v: string) => {
    for (const x of graph.vertexEdges[v]) near.add(x);
  };
  if (opts.setupAt !== undefined) touch(opts.setupAt);
  else {
    const ships = state.pieces.ships ?? {};
    for (const e in ships) if (ships[e] === id && e !== opts.moving) graph.edgeEnds[e].forEach(touch);
    for (const v in state.pieces.buildings) if (state.pieces.buildings[v].owner === id) touch(v);
  }
  return graph.edges.filter((e) => near.has(e) && !shipSpotError(ctx, id, e, opts));
}

export const buildShip: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const ph = state.phase;
    const e = expect(state, a, [...BUILD_PHASES]);
    if (e) return e;
    if (ph.k === 'setup' && ph.step !== 'road') return err('WRONG_STEP', 'Place a settlement first.');
    if ((player(state, a.player).supply.ship ?? 0) <= 0) return err('NO_PIECES', 'No cogs left in supply.');
    if (typeof a.e !== 'string') return err('BAD_EDGE', 'Choose an edge.');
    const spot = shipSpotError(ctx, a.player, a.e, ph.k === 'setup' ? { setupAt: ph.at ?? '' } : {});
    if (spot) return spot;
    if (ph.k === 'setup' || ph.k === 'freeRoads') return null;
    return canAfford(ctx, a.player, 'ship');
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const ph = state.phase;
    const e = a.e as EdgeId;
    const free = ph.k === 'setup' || ph.k === 'freeRoads';
    if (!free) pay(ctx, a.player, cost(ctx, 'ship'));
    (state.pieces.ships ??= {})[e] = a.player;
    player(state, a.player).supply.ship -= 1;
    tl(state).fresh.push(e);
    ctx.emit({ e: 'placed', player: a.player, kind: 'ship', at: e, free });
    updateLongestRoute(ctx);
    advanceAfterRoute(ctx, ph, a.player);
    afterRoutePlaced(ctx, a.player, e, 'ship');
  },
  legal(ctx, id) {
    const { state } = ctx;
    const ph = state.phase;
    if (expect(state, { t: 'tl:buildShip', player: id }, [...BUILD_PHASES])) return [];
    if (ph.k === 'setup' && ph.step !== 'road') return [];
    if ((player(state, id).supply.ship ?? 0) <= 0) return [];
    if (ph.k !== 'setup' && ph.k !== 'freeRoads' && canAfford(ctx, id, 'ship')) return [];
    return shipSpots(ctx, id, ph.k === 'setup' ? { setupAt: ph.at ?? '' } : {}).map(
      (e) => ({ t: 'tl:buildShip', player: id, e }) as Action,
    );
  },
};

/** A cog end is open when none of its owner's other cogs or buildings touch it there. */
export function isMovable(ctx: Ctx, e: EdgeId): boolean {
  const { state, graph } = ctx;
  const owner = state.pieces.ships?.[e];
  if (!owner) return false;
  const s = tl(state);
  if (s.fresh.includes(e)) return false;
  if (corsairEdges(ctx).includes(e)) return false;
  if (shipLocked(ctx, e)) return false;
  return graph.edgeEnds[e].some(
    (v) =>
      state.pieces.buildings[v]?.owner !== owner &&
      !graph.vertexEdges[v].some((x) => x !== e && state.pieces.ships?.[x] === owner),
  );
}

function moveError(ctx: Ctx, id: PlayerId, from: unknown, to: unknown): RuleError | null {
  const { state } = ctx;
  if (tl(state).moved) return err('ALREADY_MOVED', 'Only one cog may move per turn.');
  if (typeof from !== 'string' || state.pieces.ships?.[from] !== id) return err('NOT_YOUR_SHIP', 'Choose one of your cogs.');
  if (tl(state).fresh.includes(from)) return err('JUST_BUILT', 'A cog cannot move in the turn it was built.');
  if (corsairEdges(ctx).includes(from)) return err('CORSAIR', 'The corsair blocks this cog.');
  if (!isMovable(ctx, from)) return err('CLOSED', 'Only a cog with an open end may move.');
  if (typeof to !== 'string' || to === from) return err('BAD_EDGE', 'Choose another edge.');
  return shipSpotError(ctx, id, to, { moving: from });
}

export const moveShip: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    return expect(ctx.state, a, [...MOVE_PHASES]) ?? moveError(ctx, a.player, a.from, a.to);
  },
  apply(ctx: ApplyCtx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const ships = state.pieces.ships!;
    delete ships[a.from as EdgeId];
    ships[a.to as EdgeId] = a.player;
    tl(state).moved = true;
    emitTl(ctx, { type: 'shipMoved', player: a.player, from: a.from, to: a.to });
    updateLongestRoute(ctx);
    afterRoutePlaced(ctx, a.player, a.to as EdgeId, 'ship');
  },
  legal(ctx, id) {
    const { state } = ctx;
    if (expect(state, { t: 'tl:moveShip', player: id }, [...MOVE_PHASES]) || tl(state).moved) return [];
    const out: Action[] = [];
    const ships = state.pieces.ships ?? {};
    for (const from of Object.keys(ships)) {
      if (ships[from] !== id || !isMovable(ctx, from)) continue;
      for (const to of shipSpots(ctx, id, { moving: from })) out.push({ t: 'tl:moveShip', player: id, from, to });
    }
    return out;
  },
};
