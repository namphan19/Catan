// Scenario rules that hook into the shared actions: discovering mist hexes, cogs that may not move,
// where settlements may stand.
import type { EdgeId, PlayerId, VertexId } from '../../types';
import type { ApplyCtx, Ctx } from '../../ruleset/types';
import { bagAdd, bagSub } from '../../bag';
import { player } from '../base/helpers';
import { GOLD, MIST, SEA } from './config';
import { oweGold } from './gold';
import { emitTl, hexIndex, tl } from './state';

/** Reveal the mist hexes around both ends of a new or moved road / cog. */
function discover(ctx: ApplyCtx, id: PlayerId, e: EdgeId): void {
  const { state, graph, rules } = ctx;
  const s = tl(state);
  if (!s.mist.length) return;
  const idx = hexIndex(state);
  for (const v of graph.edgeEnds[e]) {
    for (const h of graph.vertexHexes[v]) {
      const hex = idx[h];
      if (!hex || hex.terrain !== MIST) continue;
      const stack = s.mist.find((m) => hex.region && m.regions.includes(hex.region)) ?? s.mist[0];
      const terrain = stack.hexes.pop();
      if (!terrain) continue;
      hex.terrain = terrain;
      let token: number | undefined;
      if (terrain !== SEA && terrain !== 'waste') {
        token = stack.numbers.pop();
        if (token !== undefined) hex.token = token;
      }
      let gain: string | null = null;
      const r = rules.config.terrainResource[terrain];
      if (r && (state.bank.hand[r] ?? 0) > 0) {
        bagSub(state.bank.hand, { [r]: 1 });
        bagAdd(player(state, id).hand, { [r]: 1 });
        gain = r;
      }
      emitTl(ctx, { type: 'discovered', player: id, hex: h, terrain, token: token ?? null, gain });
      if (terrain === GOLD) oweGold(ctx, id, 1);
    }
  }
}

/** Run after a road or cog was placed or moved onto edge e by player id. */
export function afterRoutePlaced(ctx: ApplyCtx, id: PlayerId, e: EdgeId, _kind: 'road' | 'ship'): void {
  discover(ctx, id, e);
}

/** Cogs that may never move in this scenario (beyond the general rules). */
export function shipLocked(_ctx: Ctx, _e: EdgeId): boolean {
  return false;
}

/** Scenario limits on where a settlement may stand (null = fine). */
export function settlementBan(_ctx: Ctx, _id: PlayerId, _v: VertexId): string | null {
  return null;
}
