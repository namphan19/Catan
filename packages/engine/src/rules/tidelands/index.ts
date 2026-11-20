// The "tidelands" expansion ruleset: scenario maps with sea, cogs, the corsair, gold mines, landfall
// bonuses. It uses only the public extension points of the engine. Rules: docs/RULES_TIDELANDS.md.
// It can be played alone (['base', 'tidelands']) or with strongholds (['base', 'strongholds', 'tidelands']).
import type { Action, GameState, Phase, PlayerId, RuleError, VertexId } from '../../types';
import type { ActionDef, ApplyCtx, Ctx, Ruleset, RulesConfig } from '../../ruleset/types';
import { legalRoadSpots } from '../../board/graph';
import { err, player } from '../base/helpers';
import { GOLD, MIST, SEA, TL, TL_ID } from './config';
import { corsairStart, generateMapBoard, mapById, mistStacks } from './maps';
import { moveCorsair } from './corsair';
import { goldAround, goldClaims, goldWindowAfter, oweGold, takeGold } from './gold';
import { SCENARIOS, scenarioOf, seatKey } from './scenarios';
import { buildShip, moveShip, shipSpots } from './ships';
import { afterRoutePlaced, settlementBan } from './special';
import { isLand, isLandCorner, isLandEdge, regionsAt, scenario, tl, type TlState } from './state';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function need(prev: ActionDef | undefined, t: string): ActionDef {
  if (!prev) throw new Error(`tidelands needs the ${t} action`);
  return prev;
}

type Check = (ctx: Ctx, a: Action) => RuleError | null;

/** Wrap an action with an extra validation step (legal() keeps only actions that pass it) and an
 *  optional step after it was applied (`before` is the phase the action was taken in). */
function guarded(prevDef: ActionDef | undefined, t: string, check: Check, after?: (ctx: ApplyCtx, a: Action, before: Phase) => void): ActionDef {
  const prev = need(prevDef, t);
  return {
    validate: (ctx, a) => prev.validate(ctx, a) ?? check(ctx, a),
    apply(ctx, a) {
      const before = ctx.state.phase;
      prev.apply(ctx, a);
      after?.(ctx, a, before);
    },
    legal: (ctx, id) => prev.legal(ctx, id).filter((a) => !check(ctx, a)),
  };
}

/** Regions where starting settlements must go (null = anywhere). */
const homeRegions = (state: GameState): string | null => mapById(state.board.layout).def.home ?? null;

function viewOf(state: GameState) {
  const { mist, ...pub } = tl(state);
  return { ...pub, mistLeft: mist.reduce((n, m) => n + m.hexes.length, 0) };
}

export type TidelandsView = ReturnType<typeof viewOf>;

export const tidelandsRuleset: Ruleset = {
  id: TL_ID,
  requires: ['base'],

  config(prev) {
    if (!prev) throw new Error('tidelands extends the base ruleset');
    const c: RulesConfig = clone(prev);
    c.terrainResource[SEA] = null;
    c.terrainResource[GOLD] = null;
    c.terrainResource[MIST] = null;
    Object.assign(c.costs, clone(TL.costs));
    Object.assign(c.supply, TL.supply);
    for (const sc of Object.values(SCENARIOS))
      for (const [k, id] of Object.entries(sc.maps)) {
        const big = k === '56';
        const from = prev.layouts[big ? 'large' : 'standard'];
        c.layouts[id] = { terrains: {}, tokens: [], harbors: [], bankPerResource: from.bankPerResource, deck: clone(from.deck) };
      }
    return c;
  },

  prepare(init, _config, given) {
    const sc = scenarioOf(init.options?.scenario ?? 'firstLandfall');
    init.options = { ...(init.options ?? {}), scenario: sc.id };
    const withSh = init.rulesetIds.includes('strongholds');
    if (withSh && !sc.strongholds) throw new Error(`scenario ${sc.id} cannot be played with strongholds`);
    init.layout = sc.maps[seatKey(init.playerCount)];
    if (!given.vpToWin) init.vpToWin = sc.vp + (withSh ? TL.strongholdsExtraVP : 0);
  },

  makeBoard(rng, init, config) {
    return generateMapBoard(rng, init.layout, {
      hot: config.hotNumbers,
      genericRate: config.genericHarborRate,
      specificRate: config.specificHarborRate,
    });
  },

  hooks: {
    landHex: (ctx, prev, hex) => prev && isLand(ctx.state, hex),
    landVertex: (ctx, prev, v) => prev && isLandCorner(ctx, v),
    blockerAllowed: (ctx, prev, hex) => prev && isLand(ctx.state, hex),

    freeRouteAvailable(ctx, _prev, id) {
      const { state, graph } = ctx;
      const sup = player(state, id).supply;
      if ((sup.road ?? 0) > 0 && legalRoadSpots(graph, state.pieces, id).some((e) => isLandEdge(ctx, e))) return true;
      return (sup.ship ?? 0) > 0 && shipSpots(ctx, id).length > 0;
    },

    pendingGains(ctx, prev) {
      const g = tl(ctx.state).gold;
      if (!g) return prev;
      const out = { ...prev };
      for (const [id, n] of Object.entries(g.owed)) out[id] = (out[id] ?? 0) + n;
      return out;
    },

    // Gold mines: a resource of choice per settlement, two per city, chosen before the turn goes on.
    phaseAfterRoll(ctx, prev, sum) {
      if (sum === ctx.rules.config.blockerNumber) return prev;
      return goldWindowAfter(ctx, goldClaims(ctx, sum), prev);
    },

    victoryPoints(ctx, prev, id) {
      const sc = scenario(ctx.state);
      return prev + (tl(ctx.state).landfall[id]?.length ?? 0) * sc.landfall;
    },
  },

  actions: {
    placeSettlement: (prev) =>
      guarded(
        prev,
        'placeSettlement',
        (ctx, action) => {
          const a = action as Extract<Action, { t: 'placeSettlement' }>;
          if (!ctx.graph.vertexHexes[a.v]) return null;
          if (!isLandCorner(ctx, a.v)) return err('NOT_LAND', 'Settlements are built on land.');
          if (ctx.state.phase.k === 'setup') {
            const home = homeRegions(ctx.state);
            if (home && !regionsAt(ctx, a.v).some((r) => home.includes(r)))
              return err('NOT_HOME', 'Starting settlements go on the home island.');
          }
          const ban = settlementBan(ctx, a.player, a.v);
          return ban ? err('NOT_HERE', ban) : null;
        },
        (ctx, action, before) => {
          const a = action as Extract<Action, { t: 'placeSettlement' }>;
          const s = tl(ctx.state);
          if (before.k !== 'setup') {
            landfall(ctx, a.player, a.v);
            return;
          }
          // Starting settlements make their regions home; the second one also yields gold-mine picks.
          const home = (s.home[a.player] ??= []);
          for (const r of regionsAt(ctx, a.v)) if (!home.includes(r)) home.push(r);
          if (before.idx >= ctx.state.players.length) oweGold(ctx, a.player, goldAround(ctx, a.v));
        },
      ),

    placeRoad: (prev) =>
      guarded(
        prev,
        'placeRoad',
        (ctx, action) => {
          const a = action as Extract<Action, { t: 'placeRoad' }>;
          if (!ctx.graph.edgeEnds[a.e]) return null;
          return isLandEdge(ctx, a.e) ? null : err('NOT_LAND', 'Roads are built on land; use a cog at sea.');
        },
        (ctx, action) => {
          const a = action as Extract<Action, { t: 'placeRoad' }>;
          afterRoutePlaced(ctx, a.player, a.e, 'road');
        },
      ),

    // A new action phase: cogs built before may move again, one move allowed.
    endTurn(prevDef) {
      const prev = need(prevDef, 'endTurn');
      return {
        validate: (ctx, a) => prev.validate(ctx, a),
        legal: (ctx, id) => prev.legal(ctx, id),
        apply(ctx, a) {
          const s = tl(ctx.state);
          s.fresh = [];
          s.moved = false;
          prev.apply(ctx, a);
        },
      };
    },

    'tl:buildShip': () => buildShip,
    'tl:moveShip': () => moveShip,
    'tl:moveCorsair': () => moveCorsair,
    'tl:gold': () => takeGold,
  },

  init(ctx) {
    const { state } = ctx;
    const sc = scenarioOf(state.init.options?.scenario);
    const ids = state.players.map((p) => p.id);
    const s: TlState = {
      scenario: sc.id,
      corsair: corsairStart(state.board.layout),
      fresh: [],
      moved: false,
      home: Object.fromEntries(ids.map((id) => [id, [] as string[]])),
      landfall: Object.fromEntries(ids.map((id) => [id, [] as string[]])),
      gold: null,
      mist: mistStacks(state.rng, state.board.layout),
    };
    state.ext[TL_ID] = s;
    state.pieces.ships = {};
  },

  view: (ctx) => viewOf(ctx.state),
};

/** First settlement on a region that is not one of the player's home regions: landfall bonus. */
function landfall(ctx: ApplyCtx, id: PlayerId, v: VertexId): void {
  const sc = scenario(ctx.state);
  if (!sc.landfall) return;
  const s = tl(ctx.state);
  const home = s.home[id] ?? [];
  const got = (s.landfall[id] ??= []);
  for (const r of regionsAt(ctx, v)) {
    if (home.includes(r) || got.includes(r)) continue;
    got.push(r);
    ctx.emit({ e: 'ext', id: TL_ID, data: { type: 'landfall', player: id, region: r, vp: sc.landfall } });
  }
}

