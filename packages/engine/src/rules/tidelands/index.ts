// The "tidelands" expansion ruleset: scenario maps with sea, cogs, the corsair, gold mines, landfall
// bonuses. It uses only the public extension points of the engine. Rules: docs/RULES_TIDELANDS.md.
// It can be played alone (['base', 'tidelands']) or with strongholds (['base', 'strongholds', 'tidelands']).
import type { Action, GameState, Phase, PlayerId, RuleError, VertexId } from '../../types';
import type { ActionDef, ApplyCtx, Ctx, Ruleset, RulesConfig } from '../../ruleset/types';
import { legalRoadSpots } from '../../board/graph';
import { err, lastSetupRound, player, setPhase } from '../base/helpers';
import { GOLD, MIST, SEA, TL, TL_ID, VILLAGE } from './config';
import { cw, initCastaways, placeHarbor } from './castaways';
import { corsairStart, generateMapBoard, mapById, mistStacks } from './maps';
import { moveCorsair } from './corsair';
import { emptyVillages, initSilk, produceSilk, silkFinalWinner, silkOf, stealSilk } from './silk';
import { buildWonder, claimWonder, initWorks, worksWinner } from './works';
import { armCard, attackFort, covesOf, covesWinner, initCoves, placeCovesStart, reachedFort, robAnyone, sailFleet } from './coves';
import { resolveRoll, withChosen } from '../base/turn';
import { chaseAction } from './chase';
import { randInt } from '../../rng';
import { goldAround, goldClaims, goldWindowAfter, oweGold, takeGold } from './gold';
import { SCENARIOS, scenarioOf, seatKey } from './scenarios';
import { buildShip, moveShip, shipSpots } from './ships';
import { afterRoutePlaced, settlementBan } from './special';
import { emitTl, hexIndex, isLand, isLandCorner, isLandEdge, isSea, regionsAt, scenario, tl, type TlState } from './state';

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

/** The steal phase of a 7 without a blocker (corsair coves), or the action phase if nobody has cards. */
function robPhase(state: GameState): Phase {
  const from = robAnyone(state, state.turn.current);
  return from.length ? { k: 'steal', from, resume: 'main' } : { k: 'main' };
}

/** Regions where starting settlements must go (null = anywhere). */
const homeRegions = (state: GameState): string | null => mapById(state.board.layout).def.home ?? null;

function viewOf(state: GameState) {
  const { mist, castaways, ...pub } = tl(state);
  const out: Record<string, unknown> = { ...pub, mistLeft: mist.reduce((n, m) => n + m.hexes.length, 0) };
  if (castaways) {
    const { reserved, ...rest } = castaways;
    out.castaways = { ...rest, reservedLeft: reserved.length };
  }
  return out as Omit<TlState, 'mist'> & { mistLeft: number };
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
    if (sc.setupRounds) init.setupRounds = sc.setupRounds;
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
    blockerAllowed(ctx, prev, hex) {
      if (!prev || !isLand(ctx.state, hex)) return false;
      const sp = scenario(ctx.state).special;
      const h = hexIndex(ctx.state)[hex];
      if (sp === 'castaways') return h.token !== undefined;
      if (sp === 'silk') return h.terrain !== VILLAGE;
      return true;
    },
    awardActive(ctx, prev, award) {
      if (!prev) return false;
      if (award === 'longestRoute' && scenario(ctx.state).noLongestRoute) return false;
      return !(award === 'largestForce' && tl(ctx.state).coves);
    },

    checkWinner(ctx, prev) {
      // Great Works replaces the VP race: only a finished (or the highest, with 10+ VP) wonder wins.
      if (tl(ctx.state).works) return worksWinner(ctx);
      // Corsair coves: the VP target counts only with your fort taken.
      if (tl(ctx.state).coves) return covesWinner(ctx);
      if (prev) return prev;
      return silkOf(ctx.state)?.final ? silkFinalWinner(ctx) : undefined;
    },

    freeRouteAvailable(ctx, _prev, id, only) {
      const { state, graph } = ctx;
      const sup = player(state, id).supply;
      if (only !== 'ship' && (sup.road ?? 0) > 0 && legalRoadSpots(graph, state.pieces, id).some((e) => isLandEdge(ctx, e)))
        return true;
      return only !== 'road' && (sup.ship ?? 0) > 0 && shipSpots(ctx, id).length > 0;
    },
    // C&K + seafaring rulebook: the merchant (our caravan) never stands on a gold mine.
    hexAllowsPiece: (ctx, prev, piece, hex) => prev && !(piece === 'caravan' && hexIndex(ctx.state)[hex]?.terrain === GOLD),

    pendingGains(ctx, prev) {
      const g = tl(ctx.state).gold;
      if (!g) return prev;
      const out = { ...prev };
      for (const [id, n] of Object.entries(g.owed)) out[id] = (out[id] ?? 0) + n;
      return out;
    },

    // Gold mines: a resource of choice per settlement, two per city, chosen before the turn goes on.
    phaseAfterRoll(ctx, prev, sum) {
      const s = tl(ctx.state);
      const owed: Record<PlayerId, number> = { ...(s.fleetBonus ?? {}) };
      delete s.fleetBonus;
      let next = prev;
      // Corsair coves: no blocker; after the discards the roller robs any player.
      if (s.coves && prev.k === 'moveBlocker') next = robPhase(ctx.state);
      if (sum !== ctx.rules.config.blockerNumber) {
        produceSilk(ctx, sum);
        for (const [id, n] of Object.entries(goldClaims(ctx, sum))) owed[id] = (owed[id] ?? 0) + n;
      }
      return goldWindowAfter(ctx, owed, next);
    },

    victoryPoints(ctx, prev, id) {
      const sc = scenario(ctx.state);
      const s = tl(ctx.state);
      let total = prev + (s.landfall[id]?.length ?? 0) * sc.landfall;
      if (s.castaways) total += s.castaways.vpTokens[id] ?? 0;
      if (s.silk) total += Math.floor((s.silk.silk[id] ?? 0) / 2);
      return total;
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
          if (lastSetupRound(ctx.state, before.idx)) oweGold(ctx, a.player, goldAround(ctx, a.v));
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
          const { state } = ctx;
          const s = tl(state);
          // Corsair coves: a line at its fort attacks it at the end of the action phase.
          if (s.coves && reachedFort(ctx, a.player)) attackFort(ctx, a.player);
          s.fresh = [];
          s.moved = false;
          const turn = state.turn.n;
          prev.apply(ctx, a);
          // Silk: the game ends at the end of a turn on which enough villages are empty.
          const silk = s.silk;
          if (silk && state.turn.n !== turn && emptyVillages(silk) >= silk.endAt) silk.final = true;
        },
      };
    },

    // Corsair coves: the fleet sails after the roll, before production and the 7.
    roll(prevDef) {
      const prev = need(prevDef, 'roll');
      const def: ActionDef = {
        validate: (ctx, a) => prev.validate(ctx, a),
        legal: (ctx, id) => prev.legal(ctx, id),
        apply(ctx, a) {
          const { state, rules } = ctx;
          const s = tl(state);
          if (!s.coves) {
            prev.apply(ctx, a);
            // With strongholds the corsair enters play (at its scenario hex) after the first raid.
            if (s.corsairHome && !s.corsair && (state.ext.strongholds as { blockerActive?: boolean } | undefined)?.blockerActive) {
              s.corsair = s.corsairHome;
              s.corsairHome = null;
              emitTl(ctx, { type: 'corsairArrived', hex: s.corsair });
            }
            return;
          }
          const dice = withChosen(rules.call('rollDice', ctx, []), a);
          state.turn.roll = dice;
          ctx.emit({ e: 'rolled', player: a.player, dice, sum: dice.reduce((x, y) => x + y, 0) });
          s.fleetBonus = sailFleet(ctx, dice);
          resolveRoll(ctx);
        },
      };
      return def;
    },

    // Corsair coves: after the last discard of a 7 the roller robs any player (no blocker).
    discard(prevDef) {
      const prev = need(prevDef, 'discard');
      return {
        validate: (ctx, a) => prev.validate(ctx, a),
        legal: (ctx, id) => prev.legal(ctx, id),
        apply(ctx, a) {
          prev.apply(ctx, a);
          if (tl(ctx.state).coves && ctx.state.phase.k === 'moveBlocker') setPhase(ctx, robPhase(ctx.state));
        },
      };
    },

    // Corsair coves: guard cards only arm cogs (tl:arm).
    playCard: (prev) =>
      guarded(prev, 'playCard', (ctx, a) =>
        tl(ctx.state).coves && (a as { card?: string }).card === 'guard' ? err('USE_ARM', 'Guards arm a cog here.') : null,
      ),

    // Strongholds + seafaring: a warden on a corner of the corsair's hex may chase the corsair away (then only
    // the corsair moves); chasing the blocker moves only the blocker.
    'sh:chase': (prev) => (prev ? chaseAction(prev) : undefined),
    moveBlocker: (prev) =>
      guarded(
        prev,
        'moveBlocker',
        (ctx) => (tl(ctx.state).chase === 'corsair' ? err('CHASED_CORSAIR', 'Move the corsair you chased away.') : null),
        (ctx) => {
          tl(ctx.state).chase = null;
        },
      ),

    // A steal ends the corsair's silk option.
    steal(prevDef) {
      const prev = need(prevDef, 'steal');
      return {
        validate: (ctx, a) => prev.validate(ctx, a),
        legal: (ctx, id) => prev.legal(ctx, id),
        apply(ctx, a) {
          tl(ctx.state).corsairSteal = false;
          prev.apply(ctx, a);
        },
      };
    },

    'tl:buildShip': () => buildShip,
    'tl:moveShip': () => moveShip,
    'tl:moveCorsair': () => moveCorsair,
    'tl:gold': () => takeGold,
    'tl:placeHarbor': () => placeHarbor,
    'tl:stealSilk': () => stealSilk,
    'tl:claimWonder': () => claimWonder,
    'tl:buildWonder': () => buildWonder,
    'tl:arm': () => armCard,
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
      corsairSteal: false,
    };
    // Random maps draw the corsair's starting sea hex.
    if (!s.corsair && mapById(state.board.layout).def.scatter) {
      const seas = state.board.hexes.filter((h) => isSea(state, h.id));
      s.corsair = seas[randInt(state.rng, seas.length)].id;
    }
    // C&K rulebook (combining with seafaring): the pirate waits on the barbarian track until the first raid.
    if (state.init.rulesetIds.includes('strongholds') && s.corsair) {
      s.corsairHome = s.corsair;
      s.corsair = null;
    }
    if (sc.special === 'castaways') s.castaways = initCastaways(state, state.rng);
    if (sc.special === 'silk') s.silk = initSilk(state);
    if (sc.special === 'works') s.works = initWorks(state);
    if (sc.special === 'coves') s.coves = initCoves(state);
    state.ext[TL_ID] = s;
    state.pieces.ships = {};
    if (s.coves) placeCovesStart(ctx);
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

