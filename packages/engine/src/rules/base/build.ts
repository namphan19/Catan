// placeSettlement / placeRoad / buildCity, including the free placements of setup and freeRoads.
import type { Action, Bag, Phase, PlayerId } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { edgeTaken, legalRoadSpots, legalSettlementSpots, roadConnects, satisfiesDistanceRule, touchesOwnRoute } from '../../board/graph';
import { bagAdd, bagHas, bagSub } from '../../bag';
import {
  cost, err, expect, freeRouteAvailable, lastSetupRound, player, resumePhase, setPhase, setupOrder, startTurn,
  updateLongestRoute,
} from './helpers';

type A<T extends string> = Extract<Action, { t: T }>;

export function pay(ctx: ApplyCtx, id: PlayerId, bag: Bag): void {
  bagSub(player(ctx.state, id).hand, bag);
  bagAdd(ctx.state.bank.hand, bag);
}

export function canAfford(ctx: Ctx, id: PlayerId, item: string) {
  return bagHas(player(ctx.state, id).hand, cost(ctx, item))
    ? null
    : err('CANNOT_AFFORD', `Not enough resources for: ${item}.`);
}

export const placeSettlement: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'placeSettlement'>;
    const { state, graph } = ctx;
    const e = expect(state, a, ['setup', 'main', 'extraBuild', 'paired']);
    if (e) return e;
    if (state.phase.k === 'setup' && state.phase.step !== 'settlement')
      return err('WRONG_STEP', 'Place a road next.');
    if (!graph.vertexHexes[a.v]) return err('BAD_VERTEX', `Unknown vertex ${String(a.v)}.`);
    if ((player(state, a.player).supply.settlement ?? 0) <= 0)
      return err('NO_PIECES', 'No settlements left in supply.');
    if (!satisfiesDistanceRule(graph, state.pieces, a.v))
      return err('DISTANCE_RULE', 'Vertex is occupied or adjacent to a building.');
    if (state.phase.k === 'setup') return null;
    if (!touchesOwnRoute(graph, state.pieces, a.player, a.v))
      return err('NOT_CONNECTED', 'A settlement must touch one of your roads.');
    return canAfford(ctx, a.player, 'settlement');
  },
  apply(ctx, action) {
    const a = action as A<'placeSettlement'>;
    const { state, graph, rules } = ctx;
    const p = player(state, a.player);
    const ph = state.phase;
    const free = ph.k === 'setup';
    if (!free) pay(ctx, a.player, cost(ctx, 'settlement'));
    state.pieces.buildings[a.v] = { owner: a.player, kind: 'settlement' };
    p.supply.settlement -= 1;
    ctx.emit({ e: 'placed', player: a.player, kind: 'settlement', at: a.v, free });
    if (ph.k === 'setup') {
      // Last setup round: one resource per adjacent producing hex (if the bank has it).
      if (lastSetupRound(state, ph.idx)) {
        const gains: Bag = {};
        for (const h of graph.vertexHexes[a.v]) {
          const hex = state.board.hexes.find((x) => x.id === h);
          const r = hex ? rules.config.terrainResource[hex.terrain] : null;
          if (r && (state.bank.hand[r] ?? 0) - (gains[r] ?? 0) > 0) gains[r] = (gains[r] ?? 0) + 1;
        }
        bagSub(state.bank.hand, gains);
        bagAdd(p.hand, gains);
        ctx.emit({ e: 'produced', gains: { [a.player]: gains } });
      }
      state.phase = { k: 'setup', idx: ph.idx, step: 'road', at: a.v };
    }
    updateLongestRoute(ctx); // a new settlement can cut an opponent route
  },
  legal(ctx, id) {
    const { state, graph } = ctx;
    if (expect(state, { t: 'placeSettlement', player: id, v: '' }, ['setup', 'main', 'extraBuild', 'paired']))
      return [];
    // validate() ends with the cost check: if it fails, no spot can pass, so skip the board scan.
    if (state.phase.k !== 'setup' && canAfford(ctx, id, 'settlement')) return [];
    const spots = legalSettlementSpots(graph, state.pieces, id, { setup: state.phase.k === 'setup' });
    return spots
      .map((v) => ({ t: 'placeSettlement', player: id, v }) as Action)
      .filter((x) => !placeSettlement.validate(ctx, x));
  },
};

/**
 * Phase step after a road-like piece (road, or an extension's ship) was placed in `ph`: the setup
 * snake moves on, a free-roads window counts down. Other phases are left as they are.
 */
export function advanceAfterRoute(ctx: ApplyCtx, ph: Phase, id: PlayerId): void {
  const { state } = ctx;
  if (ph.k === 'setup') {
    const idx = ph.idx + 1;
    // D1: while setup runs, `turn.current` is the first player; turn 1 starts with them too.
    if (idx >= setupOrder(state).length) startTurn(ctx, state.turn.current);
    else state.phase = { k: 'setup', idx, step: 'settlement' };
  } else if (ph.k === 'freeRoads') {
    const left = ph.left - 1;
    const more = left > 0 && freeRouteAvailable(ctx, id);
    // An `actor` marks a freeRoads window opened by the paired player: resume to that phase.
    if (more) state.phase = ph.actor ? { k: 'freeRoads', left, actor: ph.actor } : { k: 'freeRoads', left };
    else setPhase(ctx, ph.actor ? resumePhase(state, 'paired') : { k: 'main' });
  }
}

export const placeRoad: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'placeRoad'>;
    const { state, graph } = ctx;
    const ph = state.phase;
    const e = expect(state, a, ['setup', 'main', 'extraBuild', 'paired', 'freeRoads']);
    if (e) return e;
    if (ph.k === 'setup' && ph.step !== 'road') return err('WRONG_STEP', 'Place a settlement first.');
    if (!graph.edgeEnds[a.e]) return err('BAD_EDGE', `Unknown edge ${String(a.e)}.`);
    if (edgeTaken(state.pieces, a.e)) return err('OCCUPIED', 'There is already a road on this edge.');
    if ((player(state, a.player).supply.road ?? 0) <= 0) return err('NO_PIECES', 'No roads left in supply.');
    if (ph.k === 'setup') {
      return ph.at && graph.edgeEnds[a.e].includes(ph.at)
        ? null
        : err('NOT_CONNECTED', 'The setup road must touch the settlement just placed.');
    }
    // Same as legalRoadSpots(...).includes(a.e) for a free edge, without scanning every edge (M4 speed).
    if (!roadConnects(graph, state.pieces, a.player, a.e))
      return err('NOT_CONNECTED', 'A road must connect to your road network.');
    if (ph.k === 'freeRoads') return null;
    return canAfford(ctx, a.player, 'road');
  },
  apply(ctx, action) {
    const a = action as A<'placeRoad'>;
    const { state, graph } = ctx;
    const ph = state.phase;
    const p = player(state, a.player);
    const free = ph.k === 'setup' || ph.k === 'freeRoads';
    if (!free) pay(ctx, a.player, cost(ctx, 'road'));
    state.pieces.roads[a.e] = a.player;
    p.supply.road -= 1;
    ctx.emit({ e: 'placed', player: a.player, kind: 'road', at: a.e, free });
    updateLongestRoute(ctx);
    advanceAfterRoute(ctx, ph, a.player);
  },
  legal(ctx, id) {
    const { state, graph } = ctx;
    if (expect(state, { t: 'placeRoad', player: id, e: '' }, ['setup', 'main', 'extraBuild', 'paired', 'freeRoads']))
      return [];
    const ph = state.phase;
    // Paid roads: if the cost check fails, every candidate fails validate(), so skip the scan.
    if (ph.k !== 'setup' && ph.k !== 'freeRoads' && canAfford(ctx, id, 'road')) return [];
    const spots =
      ph.k === 'setup'
        ? legalRoadSpots(graph, state.pieces, id, { fromVertex: ph.at })
        : legalRoadSpots(graph, state.pieces, id);
    return spots
      .map((e) => ({ t: 'placeRoad', player: id, e }) as Action)
      .filter((x) => !placeRoad.validate(ctx, x));
  },
};

export const buildCity: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'buildCity'>;
    const { state } = ctx;
    const e = expect(state, a, ['main', 'extraBuild', 'paired']);
    if (e) return e;
    const b = state.pieces.buildings[a.v];
    if (!b || b.owner !== a.player || b.kind !== 'settlement')
      return err('NOT_YOUR_SETTLEMENT', 'A city replaces one of your settlements.');
    if ((player(state, a.player).supply.city ?? 0) <= 0) return err('NO_PIECES', 'No cities left in supply.');
    return canAfford(ctx, a.player, 'city');
  },
  apply(ctx, action) {
    const a = action as A<'buildCity'>;
    const p = player(ctx.state, a.player);
    pay(ctx, a.player, cost(ctx, 'city'));
    ctx.state.pieces.buildings[a.v] = { owner: a.player, kind: 'city' };
    p.supply.city -= 1;
    p.supply.settlement += 1;
    ctx.emit({ e: 'placed', player: a.player, kind: 'city', at: a.v, free: false });
  },
  legal(ctx, id) {
    const { state } = ctx;
    if (expect(state, { t: 'buildCity', player: id, v: '' }, ['main', 'extraBuild', 'paired'])) return [];
    if (canAfford(ctx, id, 'city')) return [];
    return Object.entries(state.pieces.buildings)
      .filter(([, b]) => b.owner === id && b.kind === 'settlement')
      .map(([v]) => ({ t: 'buildCity', player: id, v }) as Action)
      .filter((x) => !buildCity.validate(ctx, x));
  },
};
