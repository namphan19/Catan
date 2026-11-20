// Scenario rules that hook into the shared actions: discovering mist hexes, rewards on edges, trade with
// weavers' villages, cogs that may not move, where settlements may stand.
import type { EdgeId, PlayerId, VertexId } from '../../types';
import type { ApplyCtx, Ctx } from '../../ruleset/types';
import { bagAdd, bagSub } from '../../bag';
import { player } from '../base/helpers';
import { castawaysSettleBan, takeReward } from './castaways';
import { GOLD, MIST, SEA, VILLAGE } from './config';
import { oweGold } from './gold';
import { openTrade, silkLocked } from './silk';
import { worksSetupBan } from './works';
import { emitTl, hexIndex, isLand, scenario, tl } from './state';

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
export function afterRoutePlaced(ctx: ApplyCtx, id: PlayerId, e: EdgeId, kind: 'road' | 'ship'): void {
  discover(ctx, id, e);
  if (kind === 'ship') takeReward(ctx, id, e);
  openTrade(ctx, id, e);
}

/** Cogs that may never move in this scenario (beyond the general rules). */
export function shipLocked(ctx: Ctx, e: EdgeId): boolean {
  return silkLocked(ctx, e);
}

/** Scenario limits on where a settlement may stand (null = fine). */
export function settlementBan(ctx: Ctx, _id: PlayerId, v: VertexId): string | null {
  const sp = scenario(ctx.state).special;
  if (sp === 'castaways') return castawaysSettleBan(ctx, v);
  if (sp === 'works') return worksSetupBan(ctx, v);
  if (sp === 'silk') {
    const idx = hexIndex(ctx.state);
    const ok = ctx.graph.vertexHexes[v].some((h) => isLand(ctx.state, h) && idx[h].terrain !== VILLAGE);
    return ok ? null : 'No settlements on the weavers’ islets.';
  }
  return null;
}
