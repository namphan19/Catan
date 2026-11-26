// The "highlands" expansion ruleset: lead three tribes in turn to their cultural goal. Built on the base
// ruleset with its own map (coast, land, jungle), goods (plume, herb, fish), tribes that decline (overgrown
// buildings anyone may build over) and award powers instead of award VP. Played alone: ['base', 'highlands'].
// Rules: docs/RULES_HIGHLANDS.md.
import type { Action, Bag, PlayerId, RuleError } from '../../types';
import type { ActionDef, ApplyCtx, Ctx, Ruleset, RulesConfig } from '../../ruleset/types';
import { legalRoadSpots, touchesOwnRoute } from '../../board/graph';
import { bagAdd, bagClean, bagHas, bagSub, bagTotal, bagValid } from '../../bag';
import { shuffle } from '../../rng';
import { canAfford } from '../base/build';
import { err, expect, player, updateLongestRoute, winningActor } from '../base/helpers';
import { FISHERY, GOODS, GROVE, HL, HL_ID, HL_LAYOUT, JUNGLE, FRAME, OCEAN, RUIN, RUIN_CITY, isGood, isRuin } from './config';
import { WILDS, makeHighlandsBoard, mapMode } from './map';
import { culture, hl, isLandHexHL, isPath, isPathVertex, roadConnectsHL, ruinAt, terrainOf, tribeOf, type HlState } from './state';
import { FOUND, addCulture, emitHl, foundingSpots, maybeJoinStack2 } from './tribes';

/** Expansions that change the same parts of the game (board, building pieces, VP). */
const INCOMPATIBLE = ['strongholds', 'tidelands'];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

type A<T extends string> = Extract<Action, { t: T }>;
type Check = (ctx: Ctx, a: Action) => RuleError | null;

function need(prev: ActionDef | undefined, t: string): ActionDef {
  if (!prev) throw new Error(`highlands needs the ${t} action`);
  return prev;
}

/** Wrap an action with an extra check (legal() keeps only actions that pass it) and a step after it. */
function guarded(prevDef: ActionDef | undefined, t: string, check: Check, after?: (ctx: ApplyCtx, a: Action) => void): ActionDef {
  const prev = need(prevDef, t);
  return {
    validate: (ctx, a) => prev.validate(ctx, a) ?? check(ctx, a),
    apply(ctx, a) {
      prev.apply(ctx, a);
      after?.(ctx, a);
    },
    legal: (ctx, id) => prev.legal(ctx, id).filter((a) => !check(ctx, a)),
  };
}

const hexResource = (ctx: Ctx, hex: string): string | null =>
  ctx.rules.config.terrainResource[terrainOf(ctx.state, hex) ?? ''] ?? null;

const usedThisTurn = (ctx: Ctx, turn: number): boolean => turn === ctx.state.turn.n;

// ---- building over a ruin --------------------------------------------------------------------------

/** Build a settlement over a building in decline (own or an opponent's): a road of yours leads to it. */
function overbuildError(ctx: Ctx, a: A<'placeSettlement'>): RuleError | null {
  const { state, graph } = ctx;
  const e = expect(state, a, ['main']);
  if (e) return e;
  if ((player(state, a.player).supply.settlement ?? 0) <= 0) return err('NO_PIECES', 'No settlements left in supply.');
  if (graph.vertexNeighbors[a.v].some((n) => state.pieces.buildings[n]))
    return err('DISTANCE_RULE', 'Vertex is adjacent to a building.');
  if (!touchesOwnRoute(graph, state.pieces, a.player, a.v))
    return err('NOT_CONNECTED', 'A road of yours must lead to the overgrown building.');
  return canAfford(ctx, a.player, 'settlement');
}

/** Give a removed building of a tribe in decline back to its owner's supply. */
function clearRuin(ctx: ApplyCtx, v: string, by: PlayerId): void {
  const b = ctx.state.pieces.buildings[v];
  if (!b || !isRuin(b.kind)) return;
  player(ctx.state, b.owner).supply[b.kind === RUIN_CITY ? 'city' : 'settlement'] += 1;
  delete ctx.state.pieces.buildings[v];
  emitHl(ctx, { kind: 'overbuilt', player: by, owner: b.owner, at: v, was: b.kind });
}

function settlementAction(prevDef: ActionDef | undefined): ActionDef {
  const prev = need(prevDef, 'placeSettlement');
  const onRuin = (ctx: Ctx, a: A<'placeSettlement'>) => ctx.state.phase.k !== 'setup' && ruinAt(ctx.state, a.v);
  const def: ActionDef = {
    validate(ctx, action) {
      const a = action as A<'placeSettlement'>;
      if (typeof a.v === 'string' && ctx.graph.vertexHexes[a.v] && onRuin(ctx, a)) return overbuildError(ctx, a);
      const e = prev.validate(ctx, a);
      if (e) return e;
      return isPathVertex(ctx, a.v) ? null : err('NOT_LAND', 'Settlements need a path: not in the jungle or the sea.');
    },
    apply(ctx, action) {
      const a = action as A<'placeSettlement'>;
      if (onRuin(ctx, a)) clearRuin(ctx, a.v, a.player);
      prev.apply(ctx, a);
      addCulture(ctx, a.player);
    },
    legal(ctx, id) {
      const out = prev.legal(ctx, id).filter((x) => isPathVertex(ctx, (x as A<'placeSettlement'>).v));
      if (ctx.state.phase.k === 'main')
        for (const v of Object.keys(ctx.state.pieces.buildings)) {
          const x = { t: 'placeSettlement', player: id, v } as A<'placeSettlement'>;
          if (ruinAt(ctx.state, v) && !overbuildError(ctx, x)) out.push(x);
        }
      return out;
    },
  };
  return def;
}

// ---- claim: at most two cards from each opponent ----------------------------------------------------

/** Rulebook: one card per turn, at any time of the turn, also before the roll. The base rule allows only a
 *  guard before the roll, so a card played then is checked as if in the action phase (the other checks do not
 *  depend on the phase), and free roads played before the roll return to the roll afterwards. */
const asActionPhase = (ctx: Ctx): Ctx =>
  ctx.state.phase.k === 'preRoll' ? { ...ctx, state: { ...ctx.state, phase: { k: 'main' } } } : ctx;

function cardAction(prevDef: ActionDef | undefined): ActionDef {
  const prev = need(prevDef, 'playCard');
  return {
    validate: (ctx, a) => prev.validate(asActionPhase(ctx), a),
    legal: (ctx, id) => prev.legal(asActionPhase(ctx), id),
    apply(ctx, action) {
      const a = action as A<'playCard'>;
      const before = ctx.state.phase.k;
      if (a.card !== 'claim') {
        prev.apply(ctx, a);
        const ph = ctx.state.phase;
        if (before === 'preRoll' && ph.k === 'freeRoads') ctx.state.phase = { ...ph, resume: 'preRoll' };
        return;
      }
      const { state } = ctx;
      const p = player(state, a.player);
      p.cards.splice(p.cards.indexOf(a.card), 1);
      p.played[a.card] = (p.played[a.card] ?? 0) + 1;
      state.turn.cardPlayed = true;
      const r = a.resource!;
      const taken: Record<PlayerId, number> = {};
      for (const o of state.players) {
        const n = o.id === a.player ? 0 : Math.min(HL.claimMax, o.hand[r] ?? 0);
        if (!n) continue;
        o.hand[r] -= n;
        p.hand[r] = (p.hand[r] ?? 0) + n;
        taken[o.id] = n;
      }
      ctx.emit({ e: 'cardPlayed', player: a.player, card: a.card, detail: { resource: r, taken } });
    },
  };
}

// ---- new actions -------------------------------------------------------------------------------------

type FoundAction = { t: typeof FOUND; player: PlayerId; v: string };

const foundAction: ActionDef = {
  validate(ctx, action) {
    const a = action as unknown as FoundAction;
    const { state } = ctx;
    const e = expect(state, action, ['ext']);
    if (e) return e;
    if (state.phase.k !== 'ext' || state.phase.id !== FOUND) return err('WRONG_PHASE', 'No tribe to found now.');
    if ((player(state, a.player).supply.settlement ?? 0) <= 0) return err('NO_PIECES', 'No settlements left in supply.');
    if (typeof a.v !== 'string' || !foundingSpots(ctx, a.player).spots.includes(a.v))
      return err('BAD_SPOT', 'A new tribe needs a free intersection with a path, no road leading to it and the distance rule.');
    return null;
  },
  apply(ctx, action) {
    const a = action as unknown as FoundAction;
    const { state } = ctx;
    if (ruinAt(state, a.v)) clearRuin(ctx, a.v, a.player);
    state.pieces.buildings[a.v] = { owner: a.player, kind: 'settlement' };
    player(state, a.player).supply.settlement -= 1;
    ctx.emit({ e: 'placed', player: a.player, kind: 'settlement', at: a.v, free: true });
    addCulture(ctx, a.player);
    updateLongestRoute(ctx);
    maybeJoinStack2(ctx);
    // Founding ends the turn at once: no trade, build, card or award power afterwards.
    state.phase = { k: 'main' };
    ctx.rules.actions.endTurn.apply(ctx, { t: 'endTurn', player: a.player });
  },
  legal(ctx, id) {
    const probe = { t: FOUND, player: id, v: '' } as unknown as Action;
    if (expect(ctx.state, probe, ['ext']) || ctx.state.phase.k !== 'ext' || ctx.state.phase.id !== FOUND) return [];
    return foundingSpots(ctx, id).spots.map((v) => ({ t: FOUND, player: id, v }) as unknown as Action);
  },
};

const resourcesOnly = (ctx: Ctx): string[] => ctx.rules.config.resources.filter((r) => !isGood(r));

type GoodsSetAction = { t: 'hl:goodsSet'; player: PlayerId; get: Bag };

/** Three different goods (one of each) for two resources of choice. */
const goodsSetAction: ActionDef = {
  validate(ctx, action) {
    const a = action as unknown as GoodsSetAction;
    const { state } = ctx;
    const e = expect(state, action, ['main']);
    if (e) return e;
    const hand = player(state, a.player).hand;
    if (!GOODS.every((g) => (hand[g] ?? 0) > 0)) return err('NOT_ENOUGH', 'You need one of each good.');
    if (!bagValid(a.get, resourcesOnly(ctx)) || bagTotal(a.get) !== HL.goodsSetGets)
      return err('BAD_BAG', `Choose ${HL.goodsSetGets} resources.`);
    if (!bagHas(state.bank.hand, a.get)) return err('BANK_EMPTY', 'The bank does not have those cards.');
    return null;
  },
  apply(ctx, action) {
    const a = action as unknown as GoodsSetAction;
    const p = player(ctx.state, a.player);
    const give = Object.fromEntries(GOODS.map((g) => [g, 1]));
    const get = bagClean(a.get);
    bagSub(p.hand, give);
    bagAdd(ctx.state.bank.hand, give);
    bagSub(ctx.state.bank.hand, get);
    bagAdd(p.hand, get);
    ctx.emit({ e: 'traded', a: a.player, b: 'bank', aGave: give, bGave: get });
  },
  legal(ctx, id) {
    if (expect(ctx.state, { t: 'hl:goodsSet', player: id } as Action, ['main'])) return [];
    const rs = resourcesOnly(ctx);
    const out: Action[] = [];
    for (let i = 0; i < rs.length; i++)
      for (let j = i; j < rs.length; j++) {
        const get: Bag = {};
        get[rs[i]] = 1;
        get[rs[j]] = (get[rs[j]] ?? 0) + 1;
        out.push({ t: 'hl:goodsSet', player: id, get } as unknown as Action);
      }
    return out.filter((x) => !goodsSetAction.validate(ctx, x));
  },
};

type CaravanAction = { t: 'hl:caravan'; player: PlayerId; give: Bag; get: Bag };

/** Longest-route power: once per turn, any 2 cards for 1 card of another kind. */
const caravanAction: ActionDef = {
  validate(ctx, action) {
    const a = action as unknown as CaravanAction;
    const { state, rules } = ctx;
    const e = expect(state, action, ['main']);
    if (e) return e;
    if (state.awards.longestRoute !== a.player) return err('NO_AWARD', 'Only the holder of the longest route may do this.');
    if (usedThisTurn(ctx, hl(state).caravanTurn)) return err('USED', 'Already used this turn.');
    const rs = rules.config.resources;
    if (!bagValid(a.give, rs) || bagTotal(a.give) !== HL.caravanGives) return err('BAD_BAG', `Give ${HL.caravanGives} cards.`);
    if (!bagValid(a.get, rs) || bagTotal(a.get) !== 1) return err('BAD_BAG', 'Take 1 card.');
    const give = bagClean(a.give);
    if (Object.keys(bagClean(a.get)).some((r) => give[r])) return err('SAME_RESOURCE', 'Take a different kind.');
    if (!bagHas(player(state, a.player).hand, give)) return err('NOT_ENOUGH', 'You do not have those cards.');
    if (!bagHas(state.bank.hand, a.get)) return err('BANK_EMPTY', 'The bank does not have that card.');
    return null;
  },
  apply(ctx, action) {
    const a = action as unknown as CaravanAction;
    const p = player(ctx.state, a.player);
    const give = bagClean(a.give);
    const get = bagClean(a.get);
    bagSub(p.hand, give);
    bagAdd(ctx.state.bank.hand, give);
    bagSub(ctx.state.bank.hand, get);
    bagAdd(p.hand, get);
    hl(ctx.state).caravanTurn = ctx.state.turn.n;
    ctx.emit({ e: 'traded', a: a.player, b: 'bank', aGave: give, bGave: get });
    emitHl(ctx, { kind: 'caravan', player: a.player });
  },
  legal(ctx, id) {
    const { state, rules } = ctx;
    if (expect(state, { t: 'hl:caravan', player: id } as Action, ['main'])) return [];
    if (state.awards.longestRoute !== id || usedThisTurn(ctx, hl(state).caravanTurn)) return [];
    const hand = player(state, id).hand;
    const have = rules.config.resources.filter((r) => (hand[r] ?? 0) > 0);
    const out: Action[] = [];
    for (let i = 0; i < have.length; i++)
      for (let j = i; j < have.length; j++) {
        if (i === j && hand[have[i]] < 2) continue;
        const give: Bag = { [have[i]]: 1 };
        give[have[j]] = (give[have[j]] ?? 0) + 1;
        for (const r of rules.config.resources)
          if (!give[r] && (state.bank.hand[r] ?? 0) > 0)
            out.push({ t: 'hl:caravan', player: id, give, get: { [r]: 1 } } as unknown as Action);
      }
    return out;
  },
};

/** Largest-force power: once per turn (also before rolling) send the blocker from a hex next to one of
 *  your buildings back to the wilds and take one resource of that hex. */
const recallAction: ActionDef = {
  validate(ctx, action) {
    const { state, graph } = ctx;
    const e = expect(state, action, ['preRoll', 'main']);
    if (e) return e;
    if (state.awards.largestForce !== action.player) return err('NO_AWARD', 'Only the holder of the largest force may do this.');
    if (usedThisTurn(ctx, hl(state).recallTurn)) return err('USED', 'Already used this turn.');
    const hex = state.board.blocker;
    if (hex === WILDS) return err('NOT_BLOCKED', 'The blocker already rests in the wilds.');
    if (!(graph.hexVertices[hex] ?? []).some((v) => state.pieces.buildings[v]?.owner === action.player))
      return err('NOT_ADJACENT', 'The blocker must stand next to one of your buildings.');
    return null;
  },
  apply(ctx, action) {
    const { state } = ctx;
    const from = state.board.blocker;
    const r = hexResource(ctx, from);
    state.board.blocker = WILDS;
    hl(state).recallTurn = state.turn.n;
    ctx.emit({ e: 'blockerMoved', player: action.player, hex: WILDS });
    const gain: Bag = {};
    if (r && (state.bank.hand[r] ?? 0) > 0) {
      gain[r] = 1;
      bagSub(state.bank.hand, gain);
      bagAdd(player(state, action.player).hand, gain);
    }
    emitHl(ctx, { kind: 'recall', player: action.player, from, gain });
  },
  legal(ctx, id) {
    const a = { t: 'hl:recall', player: id } as Action;
    return recallAction.validate(ctx, a) ? [] : [a];
  },
};

// ---- the ruleset -----------------------------------------------------------------------------------

const cpOfTribe = (ctx: Ctx, id: PlayerId): { tribe: number; cp: number } => {
  const t = tribeOf(ctx.state, id);
  return { tribe: t.tribe, cp: t.cp[t.tribe - 1] };
};

function viewOf(state: Ctx['state']) {
  const s = hl(state);
  return {
    players: s.players,
    stack2Left: s.stack2.length,
    stack2Joined: s.stack2Joined,
    caravanUsed: s.caravanTurn === state.turn.n,
    recallUsed: s.recallTurn === state.turn.n,
    wilds: WILDS,
    map: mapMode(state.init),
  };
}

export type HighlandsView = ReturnType<typeof viewOf>;

export const highlandsRuleset: Ruleset = {
  id: HL_ID,
  requires: ['base'],

  config(prev) {
    if (!prev) throw new Error('highlands extends the base ruleset');
    const c: RulesConfig = clone(prev);
    c.resources = [...prev.resources, ...GOODS];
    Object.assign(c.terrainResource, { [JUNGLE]: 'plume', [GROVE]: 'herb', [FISHERY]: 'fish', [OCEAN]: null, [FRAME]: null });
    c.supply = { ...HL.supply };
    Object.assign(c.buildingYield, { [RUIN]: 1, [RUIN_CITY]: 2 });
    Object.assign(c.buildingVP, { [RUIN]: 0, [RUIN_CITY]: 0 });
    c.scoringCards = [];
    c.layouts[HL_LAYOUT] = { terrains: {}, tokens: [], harbors: [], bankPerResource: HL.bankPerResource, deck: { ...HL.stack } };
    c.bankRate = HL.bankRate;
    c.discardLimit = HL.discardLimit;
    c.awards = {
      longestRoute: { min: HL.longestRouteMin, vp: 0 },
      largestForce: { min: HL.largestForceMin, vp: 0, cards: ['guard'] },
    };
    c.vpToWin = HL.vpToWin;
    return c;
  },

  prepare(init) {
    const other = init.rulesetIds.filter((id) => INCOMPATIBLE.includes(id));
    if (other.length) throw new Error(`highlands cannot be combined with ${other.join(', ')}`);
    if (init.playerCount > 4) throw new Error('highlands is for 2-4 players');
    init.layout = HL_LAYOUT;
    init.vpToWin = HL.vpToWin;
    init.options = { ...(init.options ?? {}), map: mapMode(init) };
  },

  makeBoard: (rng, init) => makeHighlandsBoard(rng, init),

  init(ctx) {
    const { state } = ctx;
    for (const g of GOODS) state.bank.hand[g] = HL.bankPerGood;
    const stack = Object.entries(HL.stack).flatMap(([card, n]) => Array<string>(n).fill(card));
    const s: HlState = {
      players: Object.fromEntries(state.players.map((p) => [p.id, { tribe: 1, cp: [0, 0, 0] }])),
      stack2: shuffle(state.rng, stack),
      stack2Joined: false,
      caravanTurn: -1,
      recallTurn: -1,
    };
    state.ext[HL_ID] = s;
  },

  hooks: {
    landHex: (ctx, prev, hex) => prev && isLandHexHL(ctx.state, hex),
    landVertex: (ctx, prev, v) => prev && isPathVertex(ctx, v),
    // The blocker stands on a resource hex or rests in the wilds, never on a goods hex or the sea.
    blockerAllowed: (ctx, prev, hex) => prev && (hex === WILDS || isLandHexHL(ctx.state, hex)),
    tradeRate: (_ctx, prev, _id, r) => (isGood(r) ? HL.goodsRate : prev),
    discardLimit: (ctx, prev, id) => prev + (player(ctx.state, id).played.guard ?? 0),
    victoryPoints: (ctx, _prev, id) => culture(ctx.state, id),
    // The first player whose third tribe reaches its goal wins (4 + 4 + 3 culture points).
    checkWinner(ctx) {
      const id = winningActor(ctx.state);
      if (!id) return undefined;
      const { tribe, cp } = cpOfTribe(ctx, id);
      return tribe >= HL.tribes && cp >= HL.finalGoal ? id : undefined;
    },
    freeRouteAvailable(ctx, prev, id, only) {
      if (!prev || only === 'ship') return false;
      const { state, graph } = ctx;
      return (player(state, id).supply.road ?? 0) > 0 &&
        legalRoadSpots(graph, state.pieces, id).some((e) => isPath(ctx, e) && roadConnectsHL(ctx, id, e));
    },
  },

  actions: {
    placeSettlement: settlementAction,
    placeRoad: (prev) =>
      guarded(prev, 'placeRoad', (ctx, action) => {
        const a = action as A<'placeRoad'>;
        if (!ctx.graph.edgeEnds[a.e]) return null;
        if (!isPath(ctx, a.e)) return err('NO_PATH', 'No path here (between jungle, sea or the frame).');
        if (ctx.state.phase.k !== 'setup' && !roadConnectsHL(ctx, a.player, a.e))
          return err('NOT_CONNECTED', 'Roads lead up to an overgrown building, never from or past it.');
        return null;
      }),
    buildCity: (prev) =>
      guarded(
        prev,
        'buildCity',
        (ctx, action) => {
          const { state } = ctx;
          const cities = Object.values(state.pieces.buildings).filter((b) => b.owner === action.player && b.kind === 'city').length;
          return cities >= HL.citiesPerTribe ? err('CITY_LIMIT', 'Each tribe builds at most one city.') : null;
        },
        (ctx, a) => addCulture(ctx, a.player),
      ),
    playCard: cardAction,
    [FOUND]: () => foundAction,
    'hl:goodsSet': () => goodsSetAction,
    'hl:caravan': () => caravanAction,
    'hl:recall': () => recallAction,
  },

  view: (ctx) => viewOf(ctx.state),
};
