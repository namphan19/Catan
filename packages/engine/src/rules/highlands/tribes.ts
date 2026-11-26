// Tribes: culture points, decline (overgrown buildings, roads back to the supply) and founding a new tribe.
import type { PlayerId, VertexId } from '../../types';
import type { ApplyCtx, Ctx } from '../../ruleset/types';
import { satisfiesDistanceRule } from '../../board/graph';
import { player, setPhase, updateLongestRoute } from '../base/helpers';
import { HL, HL_ID, RUIN, RUIN_CITY, isRuin } from './config';
import { goalOf, hl, isPathVertex, tribeOf } from './state';

export const FOUND = 'hl:found';

export const emitHl = (ctx: ApplyCtx, data: Record<string, unknown>): void =>
  ctx.emit({ e: 'ext', id: HL_ID, data });

/** One culture point for the active tribe; a tribe at its goal (tribes 1 and 2) declines at once. */
export function addCulture(ctx: ApplyCtx, id: PlayerId): void {
  const t = tribeOf(ctx.state, id);
  t.cp[t.tribe - 1] += 1;
  if (t.tribe < HL.tribes && t.cp[t.tribe - 1] >= goalOf(t)) decline(ctx, id);
}

/**
 * The active tribe reached its goal: (tribe 2 only) the old ruins go back to the supply, all roads go
 * back, every building is overgrown, the longest route is recounted, then the player founds the next
 * tribe (a free settlement that ends the turn).
 */
export function decline(ctx: ApplyCtx, id: PlayerId): void {
  const { state } = ctx;
  const t = tribeOf(state, id);
  const p = player(state, id);
  const b = state.pieces.buildings;
  const removed: VertexId[] = [];
  if (t.tribe >= 2)
    for (const v of Object.keys(b))
      if (b[v].owner === id && isRuin(b[v].kind)) {
        p.supply[b[v].kind === RUIN_CITY ? 'city' : 'settlement'] += 1;
        delete b[v];
        removed.push(v);
      }
  let roads = 0;
  for (const e of Object.keys(state.pieces.roads))
    if (state.pieces.roads[e] === id) {
      delete state.pieces.roads[e];
      roads++;
    }
  p.supply.road += roads;
  const overgrown: VertexId[] = [];
  for (const v of Object.keys(b))
    if (b[v].owner === id && !isRuin(b[v].kind)) {
      b[v] = { owner: id, kind: b[v].kind === 'city' ? RUIN_CITY : RUIN };
      overgrown.push(v);
    }
  emitHl(ctx, { kind: 'declined', player: id, tribe: t.tribe, roads, overgrown, removed });
  t.tribe += 1;
  state.trade = undefined;
  updateLongestRoute(ctx);
  setPhase(ctx, { k: 'ext', id: FOUND, data: { tribe: t.tribe }, actors: [id] });
}

/**
 * Where a founding settlement may go: a free intersection with a path, the distance rule (ruins count),
 * and no road of any player leading to it. If there is none, one of the player's own ruins.
 */
export function foundingSpots(ctx: Ctx, id: PlayerId): { spots: VertexId[]; onRuin: boolean } {
  const { state, graph } = ctx;
  const spots = graph.vertices.filter(
    (v) =>
      isPathVertex(ctx, v) &&
      satisfiesDistanceRule(graph, state.pieces, v) &&
      !graph.vertexEdges[v].some((e) => state.pieces.roads[e]),
  );
  if (spots.length) return { spots, onRuin: false };
  const own = Object.keys(state.pieces.buildings).filter((v) => {
    const b = state.pieces.buildings[v];
    return b.owner === id && isRuin(b.kind);
  });
  return { spots: own, onRuin: true };
}

/** The second development stack joins (under the remaining cards) once every player founded tribe 2. */
export function maybeJoinStack2(ctx: ApplyCtx): void {
  const s = hl(ctx.state);
  if (s.stack2Joined || !ctx.state.players.every((p) => tribeOf(ctx.state, p.id).tribe >= 2)) return;
  s.stack2Joined = true;
  // buyCard draws from the end of bank.deck: the second stack goes underneath (the front).
  ctx.state.bank.deck = [...s.stack2, ...ctx.state.bank.deck];
  s.stack2 = [];
  emitHl(ctx, { kind: 'stack2' });
}
