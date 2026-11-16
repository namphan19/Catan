// Advance cards: `sh:play` (one definition per card) and the follow-up `sh:bazaarOffer`.
// A played card goes back under its deck. Any number of cards may be played in an action phase.
import type { Action, EdgeId, ExtAction, HexId, Phase, PlayerId, RuleError, VertexId } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { legalRoadSpots } from '../../board/graph';
import { bagAdd, bagSub, bagTotal } from '../../bag';
import { actors, err, expect, hasPlayer, player, setPhase, updateLongestRoute, vp } from '../base/helpers';
import { SH, isCommodity, type Track } from './config';
import { settle } from './flow';
import {
  doImprove, doPromote, doRampart, doUpgrade, improveError, improveOptions, isOpenRoad, liftWarden,
  promoteError, rampartError, returnCard, stealRandom, transfer, upgradeError, wardenPiece,
} from './ops';
import {
  citiesOf, emitSh, hexById, occupants, sh, turnOrderFrom, wardensOf,
} from './state';
import { ACTION_PHASES } from './wardens';

type Params = Record<string, unknown>;

interface CardDef {
  /** Phases the card may be played in (default: the action phases). */
  phases?: Phase['k'][];
  check(ctx: Ctx, a: ExtAction): RuleError | null;
  run(ctx: ApplyCtx, a: ExtAction): void;
  /** Parameter sets worth trying for legal-action enumeration. */
  options(ctx: Ctx, id: PlayerId): Params[];
}

const NONE: Params[] = [{}];
const ok = (): null => null;
const others = (ctx: Ctx, id: PlayerId): PlayerId[] => turnOrderFrom(ctx.state, id).slice(1);
const baseResources = (ctx: Ctx): string[] => ctx.rules.config.resources.filter((r) => !isCommodity(r));
const handTotal = (ctx: Ctx, id: PlayerId): number => bagTotal(player(ctx.state, id).hand);

const otherPlayer = (ctx: Ctx, a: ExtAction): RuleError | null =>
  !hasPlayer(ctx.state, a.target) || a.target === a.player ? err('BAD_TARGET', 'Choose another player.') : null;

/** Hexes of the terrain that yields `resource`, next to at least one of the player's buildings. */
function ownHexes(ctx: Ctx, id: PlayerId, resource: string): HexId[] {
  const { state, graph, rules } = ctx;
  return state.board.hexes
    .filter(
      (h) =>
        rules.config.terrainResource[h.terrain] === resource &&
        graph.hexVertices[h.id].some((v) => state.pieces.buildings[v]?.owner === id),
    )
    .map((h) => h.id);
}

/** Take 2 of the resource per matching hex (as far as the bank can pay). */
function bounty(ctx: ApplyCtx, id: PlayerId, resource: string): void {
  const { state } = ctx;
  const n = Math.min(2 * ownHexes(ctx, id, resource).length, state.bank.hand[resource] ?? 0);
  if (n > 0) {
    bagSub(state.bank.hand, { [resource]: n });
    bagAdd(player(state, id).hand, { [resource]: n });
  }
  emitSh(ctx, { type: 'bounty', player: id, resource, count: n });
}

/** Everyone else hands over up to `max` cards of the named type. */
function collect(ctx: ApplyCtx, id: PlayerId, resource: string, max: number): void {
  const taken: Record<PlayerId, number> = {};
  for (const o of others(ctx, id)) {
    const n = Math.min(max, player(ctx.state, o).hand[resource] ?? 0);
    if (n > 0) {
      transfer(ctx.state, o, id, { [resource]: n });
      taken[o] = n;
    }
  }
  emitSh(ctx, { type: 'collected', player: id, resource, taken });
}

function freeRoads(ctx: ApplyCtx, id: PlayerId, count: number): void {
  const { state, graph } = ctx;
  const left = Math.min(count, player(state, id).supply.road ?? 0);
  if (left <= 0 || legalRoadSpots(graph, state.pieces, id).length === 0) return;
  setPhase(ctx, state.phase.k === 'paired' ? { k: 'freeRoads', left, actor: id } : { k: 'freeRoads', left });
}

/** Simulate promoting the listed wardens in order (a promotion frees a piece of the old rank). */
function armoryError(ctx: Ctx, id: PlayerId, vs: unknown): RuleError | null {
  if (!Array.isArray(vs) || vs.length < 1 || vs.length > 2 || new Set(vs).size !== vs.length)
    return err('BAD_ARGS', 'Choose one or two different wardens.');
  const supply = { ...player(ctx.state, id).supply };
  for (const v of vs) {
    const e = promoteError(ctx, id, v as VertexId, supply);
    if (e) return e;
    const level = occupants(ctx.state)[v as VertexId].level;
    supply[wardenPiece(level)] += 1;
    supply[wardenPiece(level + 1)] -= 1;
  }
  return null;
}

export const CARDS: Record<string, CardDef> = {
  // ---- learning --------------------------------------------------------------------------------
  /** Set the production dice of your roll (played before rolling; the event die is still rolled). */
  omen: {
    phases: ['preRoll'],
    check(_ctx, a) {
      const d = a.dice;
      const good =
        Array.isArray(d) && d.length === 2 && d.every((x) => Number.isInteger(x) && x >= 1 && x <= 6);
      return good ? null : err('BAD_ARGS', 'Choose two dice values from 1 to 6.');
    },
    run(ctx, a) {
      sh(ctx.state).fixedDice = [...(a.dice as number[])];
    },
    options() {
      const out: Params[] = [];
      for (let x = 1; x <= 6; x++) for (let y = 1; y <= 6; y++) out.push({ dice: [x, y] });
      return out;
    },
  },
  /** One city improvement for 1 commodity less. */
  scaffold: {
    check: (ctx, a) => improveError(ctx, a.player, a.track, a.v, 1),
    run: (ctx, a) => doImprove(ctx, a.player, a.track as Track, a.v as VertexId | undefined, 1),
    options: (ctx, id) => improveOptions(ctx, id, 1),
  },
  /** A rampart at no cost. */
  mason: {
    check: (ctx, a) => rampartError(ctx, a.player, a.v),
    run: (ctx, a) => doRampart(ctx, a.player, a.v as VertexId),
    options: (ctx, id) => citiesOf(ctx.state, id).map((v) => ({ v })),
  },
  /** Swap two number tokens (not 2, 6, 8 or 12). The blocker stays where it is. */
  surveyor: {
    check(ctx, a) {
      const ha = typeof a.a === 'string' ? hexById(ctx.state, a.a) : undefined;
      const hb = typeof a.b === 'string' ? hexById(ctx.state, a.b) : undefined;
      const free = (t: number | undefined) => t !== undefined && !SH.frozenTokens.includes(t);
      if (!ha || !hb || ha.id === hb.id || !free(ha.token) || !free(hb.token))
        return err('BAD_ARGS', 'Choose two different number tokens other than 2, 6, 8 and 12.');
      return null;
    },
    run(ctx, a) {
      const ha = hexById(ctx.state, a.a as HexId);
      const hb = hexById(ctx.state, a.b as HexId);
      if (!ha || !hb) return;
      [ha.token, hb.token] = [hb.token, ha.token];
      emitSh(ctx, { type: 'tokensSwapped', a: ha.id, b: hb.id });
    },
    options(ctx) {
      const hs = ctx.state.board.hexes.filter(
        (h) => h.token !== undefined && !SH.frozenTokens.includes(h.token),
      );
      const out: Params[] = [];
      for (let i = 0; i < hs.length; i++)
        for (let j = i + 1; j < hs.length; j++)
          if (hs[i].token !== hs[j].token) out.push({ a: hs[i].id, b: hs[j].id });
      return out;
    },
  },
  /** 2 grain per field hex next to your buildings. */
  irrigate: { check: ok, run: (ctx, a) => bounty(ctx, a.player, 'grain'), options: () => NONE },
  /** 2 stone per quarry hex next to your buildings. */
  prospect: { check: ok, run: (ctx, a) => bounty(ctx, a.player, 'stone'), options: () => NONE },
  /** Upgrade a settlement to a city for 1 grain + 2 stone. */
  charter: {
    check: (ctx, a) => upgradeError(ctx, a.player, a.v, 'charter'),
    run: (ctx, a) => doUpgrade(ctx, a.player, a.v as VertexId, 'charter'),
    options: (ctx, id) =>
      Object.entries(ctx.state.pieces.buildings)
        .filter(([, b]) => b.owner === id && b.kind === 'settlement')
        .map(([v]) => ({ v })),
  },
  /** Two roads at no cost. */
  pavers: {
    check(ctx, a) {
      const { state, graph } = ctx;
      const can = (player(state, a.player).supply.road ?? 0) > 0 && legalRoadSpots(graph, state.pieces, a.player).length > 0;
      return can ? null : err('NO_ROAD_SPOT', 'You have nowhere to build a road.');
    },
    run: (ctx, a) => freeRoads(ctx, a.player, 2),
    options: () => NONE,
  },
  /** Promote one or two of your wardens at no cost. */
  armory: {
    check: (ctx, a) => armoryError(ctx, a.player, a.vs),
    run(ctx, a) {
      for (const v of a.vs as VertexId[]) doPromote(ctx, v);
    },
    options(ctx, id) {
      const vs = wardensOf(ctx.state, id).map(([v]) => v);
      const out: Params[] = vs.map((v) => ({ vs: [v] }));
      for (const x of vs) for (const y of vs) if (x !== y) out.push({ vs: [x, y] });
      return out;
    },
  },

  // ---- commerce --------------------------------------------------------------------------------
  /** This turn you may offer each other player 1 resource for a commodity of their choice. */
  bazaar: {
    check: ok,
    run(ctx, a) {
      sh(ctx.state).bazaar = { player: a.player, offered: [] };
    },
    options: () => NONE,
  },
  /** Look at the hand of a player with more VP and take 2 cards. */
  tithe: {
    check(ctx, a) {
      const e = otherPlayer(ctx, a);
      if (e) return e;
      return vp(ctx, a.target as PlayerId) > vp(ctx, a.player) ? null : err('BAD_TARGET', 'Choose a player with more victory points than you.');
    },
    run(ctx, a) {
      const s = sh(ctx.state);
      const target = a.target as PlayerId;
      const count = Math.min(2, handTotal(ctx, target));
      if (count === 0) return;
      s.peek = { viewer: a.player, target, what: 'hand' };
      s.pending.push({ kind: 'titheTake', player: a.player, target, count });
    },
    options: (ctx, id) => others(ctx, id).map((target) => ({ target })),
  },
  /** Take the caravan and put it on a hex next to one of your buildings (2:1 for its resource, 1 VP). */
  caravan: {
    check(ctx, a) {
      const { state, graph } = ctx;
      const vs = typeof a.hex === 'string' ? graph.hexVertices[a.hex] : undefined;
      return vs && vs.some((v) => state.pieces.buildings[v]?.owner === a.player)
        ? null
        : err('BAD_HEX', 'The caravan goes on a hex next to one of your buildings.');
    },
    run(ctx, a) {
      const s = sh(ctx.state);
      const from = s.caravan?.owner ?? null;
      s.caravan = { owner: a.player, hex: a.hex as HexId };
      emitSh(ctx, { type: 'caravan', from, to: a.player, hex: a.hex });
    },
    options(ctx, id) {
      const { state, graph } = ctx;
      return graph.hexes
        .filter((h) => graph.hexVertices[h].some((v) => state.pieces.buildings[v]?.owner === id))
        .map((hex) => ({ hex }));
    },
  },
  /** For the rest of the turn trade one resource or commodity type 2:1 with the bank. */
  fleet: {
    check: (ctx, a) =>
      typeof a.resource === 'string' && ctx.rules.config.resources.includes(a.resource)
        ? null
        : err('BAD_ARGS', 'Name a resource or commodity.'),
    run(ctx, a) {
      sh(ctx.state).fleet = { player: a.player, resource: a.resource as string };
    },
    options: (ctx) => ctx.rules.config.resources.map((resource) => ({ resource })),
  },
  /** Name a resource: every other player gives you 2 of it (1 if they have only 1). */
  levy: {
    check: (ctx, a) =>
      typeof a.resource === 'string' && baseResources(ctx).includes(a.resource)
        ? null
        : err('BAD_ARGS', 'Name a resource.'),
    run: (ctx, a) => collect(ctx, a.player, a.resource as string, 2),
    options: (ctx) => baseResources(ctx).map((resource) => ({ resource })),
  },
  /** Name a commodity: every other player gives you 1 of it. */
  corner: {
    check: (_ctx, a) =>
      typeof a.resource === 'string' && isCommodity(a.resource) ? null : err('BAD_ARGS', 'Name a commodity.'),
    run: (ctx, a) => collect(ctx, a.player, a.resource as string, 1),
    options: () => SH.commodities.map((resource) => ({ resource })),
  },

  // ---- council ---------------------------------------------------------------------------------
  /** Remove an open road; if it was yours you may rebuild one road for free. */
  envoy: {
    check: (ctx, a) =>
      typeof a.e === 'string' && isOpenRoad(ctx, a.e) ? null : err('BAD_EDGE', 'Choose an open road (one with a loose end).'),
    run(ctx, a) {
      const { state } = ctx;
      const e = a.e as EdgeId;
      const owner = state.pieces.roads[e];
      delete state.pieces.roads[e];
      player(state, owner).supply.road += 1;
      emitSh(ctx, { type: 'roadRemoved', player: a.player, owner, e });
      updateLongestRoute(ctx);
      if (owner === a.player && a.rebuild) freeRoads(ctx, a.player, 1);
    },
    options(ctx, id) {
      const out: Params[] = [];
      for (const [e, owner] of Object.entries(ctx.state.pieces.roads)) {
        if (!isOpenRoad(ctx, e)) continue;
        out.push({ e });
        if (owner === id) out.push({ e, rebuild: true });
      }
      return out;
    },
  },
  /** Look at another player's advance cards; you may take one. */
  informant: {
    check: otherPlayer,
    run(ctx, a) {
      const s = sh(ctx.state);
      const target = a.target as PlayerId;
      if (player(ctx.state, target).cards.length === 0) return;
      s.peek = { viewer: a.player, target, what: 'cards' };
      s.pending.push({ kind: 'informantTake', player: a.player, target });
    },
    options: (ctx, id) => others(ctx, id).map((target) => ({ target })),
  },
  /** Activate all your wardens at no cost. */
  rally: {
    check: ok,
    run(ctx, a) {
      for (const [, o] of wardensOf(ctx.state, a.player)) {
        if (o.active) continue;
        o.active = true;
        o.tags = [...(o.tags ?? []), 'fresh'];
      }
      emitSh(ctx, { type: 'rallied', player: a.player });
    },
    options: () => NONE,
  },
  /** Displace an opponent's warden that stands on one of your roads, without using a warden. */
  plot: {
    check(ctx, a) {
      const { state, graph } = ctx;
      const o = typeof a.v === 'string' ? occupants(state)[a.v] : undefined;
      const onMyRoad = !!o && graph.vertexEdges[a.v as VertexId].some((e) => state.pieces.roads[e] === a.player);
      return o && o.kind === 'warden' && o.owner !== a.player && onMyRoad
        ? null
        : err('BAD_TARGET', "Choose an opponent's warden on one of your roads.");
    },
    run(ctx, a) {
      const v = a.v as VertexId;
      const o = liftWarden(ctx, v);
      emitSh(ctx, { type: 'warden', op: 'displaced', player: a.player, v, victim: o.owner });
      sh(ctx.state).pending.push({
        kind: 'relocate', player: o.owner, from: v, level: o.level, active: o.active, tags: o.tags ?? [],
      });
      updateLongestRoute(ctx);
    },
    options: (ctx, id) =>
      Object.entries(occupants(ctx.state))
        .filter(([, o]) => o.owner !== id)
        .map(([v]) => ({ v })),
  },
  /** Move the blocker and steal 1 random card from every player with a building on its new hex. */
  toll: {
    check(ctx, a) {
      const { state, graph } = ctx;
      if (!sh(state).blockerActive) return err('NO_BLOCKER', 'The blocker is not on the board yet.');
      return typeof a.hex === 'string' && graph.hexVertices[a.hex] && a.hex !== state.board.blocker
        ? null
        : err('BAD_HEX', 'Move the blocker to a different hex.');
    },
    run(ctx, a) {
      const { state, graph } = ctx;
      const hex = a.hex as HexId;
      state.board.blocker = hex;
      ctx.emit({ e: 'blockerMoved', player: a.player, hex });
      const owners = new Set(graph.hexVertices[hex].map((v) => state.pieces.buildings[v]?.owner));
      for (const o of others(ctx, a.player)) if (owners.has(o)) stealRandom(ctx, o, a.player);
    },
    options: (ctx) => ctx.graph.hexes.map((hex) => ({ hex })),
  },
  /** Another player removes one of their wardens; you may place one of yours of at most that rank. */
  turncoat: {
    check(ctx, a) {
      const e = otherPlayer(ctx, a);
      if (e) return e;
      return wardensOf(ctx.state, a.target as PlayerId).length ? null : err('BAD_TARGET', 'That player has no warden.');
    },
    run(ctx, a) {
      sh(ctx.state).pending.push({ kind: 'turncoatRemove', player: a.target as PlayerId, by: a.player });
    },
    options: (ctx, id) => others(ctx, id).map((target) => ({ target })),
  },
  /** Every player with more VP than you gives you 2 cards of their choice. */
  dowry: {
    check: ok,
    run(ctx, a) {
      const mine = vp(ctx, a.player);
      for (const o of others(ctx, a.player)) {
        const count = Math.min(2, handTotal(ctx, o));
        if (vp(ctx, o) > mine && count > 0) sh(ctx.state).pending.push({ kind: 'dowryGive', player: o, to: a.player, count });
      }
    },
    options: () => NONE,
  },
  /** Every player with at least as many VP as you discards half of their hand (rounded down). */
  sabotage: {
    check: ok,
    run(ctx, a) {
      const mine = vp(ctx, a.player);
      for (const o of others(ctx, a.player)) {
        const count = Math.floor(handTotal(ctx, o) / 2);
        if (vp(ctx, o) >= mine && count > 0) sh(ctx.state).pending.push({ kind: 'sabotageDiscard', player: o, count });
      }
    },
    options: () => NONE,
  },
};

export const play: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const def = typeof a.card === 'string' ? CARDS[a.card] : undefined;
    if (!def) return err('NOT_PLAYABLE', `${String(a.card)} cannot be played.`);
    const e = expect(ctx.state, a, def.phases ?? ACTION_PHASES);
    if (e) return e;
    if (!player(ctx.state, a.player).cards.includes(a.card as string))
      return err('NO_CARD', `You have no ${String(a.card)} card.`);
    return def.check(ctx, a);
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const card = a.card as string;
    const p = player(ctx.state, a.player);
    p.cards.splice(p.cards.indexOf(card), 1);
    p.played[card] = (p.played[card] ?? 0) + 1;
    returnCard(ctx.state, card);
    emitSh(ctx, { type: 'played', player: a.player, card });
    CARDS[card].run(ctx, a);
    settle(ctx);
  },
  legal(ctx, id) {
    const { state } = ctx;
    if (state.winner || !actors(state).includes(id)) return [];
    const out: Action[] = [];
    for (const card of new Set(player(state, id).cards)) {
      const def = CARDS[card];
      if (!def || !(def.phases ?? ACTION_PHASES).includes(state.phase.k)) continue;
      for (const o of def.options(ctx, id)) {
        const a = { t: 'sh:play', player: id, card, ...o } as Action;
        if (!play.validate(ctx, a)) out.push(a);
      }
    }
    return out;
  },
};

/** Bazaar follow-up: offer one resource to a player who must answer with a commodity. */
export const bazaarOffer: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const e = expect(state, a, ACTION_PHASES);
    if (e) return e;
    const b = sh(state).bazaar;
    if (!b || b.player !== a.player) return err('NO_BAZAAR', 'Play a bazaar card first.');
    const t = otherPlayer(ctx, a);
    if (t) return t;
    if (b.offered.includes(a.target as PlayerId)) return err('ALREADY_OFFERED', 'One offer per player.');
    if (typeof a.resource !== 'string' || !baseResources(ctx).includes(a.resource))
      return err('BAD_ARGS', 'Offer a resource.');
    if ((player(state, a.player).hand[a.resource] ?? 0) <= 0) return err('NOT_ENOUGH', 'You do not have that card.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const s = sh(ctx.state);
    const target = a.target as PlayerId;
    s.bazaar?.offered.push(target);
    const hand = player(ctx.state, target).hand;
    if (SH.commodities.some((c) => (hand[c] ?? 0) > 0))
      s.pending.push({ kind: 'bazaarGive', player: target, to: a.player, resource: a.resource as string });
    else emitSh(ctx, { type: 'bazaar', from: a.player, to: target, gave: null });
    settle(ctx);
  },
  legal(ctx, id) {
    const b = sh(ctx.state).bazaar;
    if (!b || b.player !== id || expect(ctx.state, { t: 'sh:bazaarOffer', player: id }, ACTION_PHASES)) return [];
    const hand = player(ctx.state, id).hand;
    const out: Action[] = [];
    for (const target of others(ctx, id))
      if (!b.offered.includes(target))
        for (const resource of baseResources(ctx))
          if ((hand[resource] ?? 0) > 0) out.push({ t: 'sh:bazaarOffer', player: id, target, resource });
    return out;
  },
};
