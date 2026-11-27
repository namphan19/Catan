// The "strongholds" expansion ruleset. It only uses the public extension points of the engine:
// config, hooks, wrapped/new actions, init, view and action redaction. Rules: docs/RULES_STRONGHOLDS.md.
import type { Action, ExtAction, GameState, PlayerId } from '../../types';
import type { Ruleset, RulesConfig } from '../../ruleset/types';
import { randInt, shuffle } from '../../rng';
import { player, settleClaims } from '../base/helpers';
import { bazaarOffer, play } from './cards';
import {
  buildCityAction, discardAction, discardCard, endTurnAction, improve, placeSettlementAction, rampart,
} from './city';
import { SH, SH_ID, TRACKS, isCommodity, type Track } from './config';
import { rollAction } from './flow';
import { resolve } from './resolve';
import { hexById, levelOf, sh, type ShState } from './state';
import { activate, chase, displace, moveWarden, promote, recruit } from './wardens';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Private fields of logged choices, per pending kind. */
const PRIVATE_FIELDS: Record<string, string> = {
  trimHand: 'card', informantTake: 'card', titheTake: 'bag', dowryGive: 'bag', bazaarGive: 'resource',
};

/** What a viewer may know about the expansion state. Deck order and other players' cards stay hidden. */
function viewOf(state: GameState, viewer: PlayerId | null) {
  const s = sh(state);
  const { decks, peek, resume: _resume, productionDue: _due, ...pub } = s;
  const deckCounts = Object.fromEntries(TRACKS.map((t) => [t, decks[t].length]));
  let peeked: unknown = null;
  if (peek && viewer === peek.viewer) {
    const target = player(state, peek.target);
    peeked =
      peek.what === 'hand'
        ? { target: peek.target, what: 'hand', hand: target.hand }
        : { target: peek.target, what: 'cards', cards: target.cards };
  }
  return { ...pub, deckCounts, peek: peeked };
}

export type StrongholdsView = ReturnType<typeof viewOf>;

export const strongholdsRuleset: Ruleset = {
  id: SH_ID,
  requires: ['base'],

  config(prev) {
    if (!prev) throw new Error('strongholds extends the base ruleset');
    const c: RulesConfig = clone(prev);
    c.resources.push(...SH.commodities);
    Object.assign(c.costs, clone(SH.costs));
    Object.assign(c.supply, SH.supply);
    c.vpToWin = SH.vpToWin;
    // The base card deck and the largest-force award are not used: advance cards replace them.
    for (const spec of Object.values(c.layouts)) spec.deck = {};
    c.playableCards = [];
    return c;
  },

  hooks: {
    // Third value: the event die (index into SH.eventFaces).
    rollDice: (ctx, prev) => [...prev, randInt(ctx.state.rng, SH.eventFaces.length)],

    // Settlements: 1 resource. Cities: 1 resource + 1 commodity on forest / meadow / quarry,
    // 2 resources on the other terrains.
    production(ctx, _prev, sum) {
      const { state, graph, rules } = ctx;
      const claims: Record<string, Record<PlayerId, number>> = {};
      const add = (r: string, id: PlayerId, n: number) => {
        (claims[r] ??= {})[id] = (claims[r][id] ?? 0) + n;
      };
      for (const hex of state.board.hexes) {
        if (hex.token !== sum || hex.id === state.board.blocker) continue;
        const r = rules.config.terrainResource[hex.terrain];
        if (!r) continue;
        const commodity = SH.terrainCommodity[hex.terrain];
        for (const v of graph.hexVertices[hex.id]) {
          const b = state.pieces.buildings[v];
          if (!b) continue;
          if (b.kind !== 'city') add(r, b.owner, 1);
          else if (commodity) {
            add(r, b.owner, 1);
            add(commodity, b.owner, 1);
          } else add(r, b.owner, 2);
        }
      }
      return settleClaims(state.bank.hand, claims);
    },

    victoryPoints(ctx, prev, id) {
      const s = sh(ctx.state);
      let total = prev + s.shields[id] * SH.shieldVP + s.vpCards[id].length;
      for (const t of TRACKS) if (s.capitals[t]?.owner === id) total += SH.capitalVP;
      if (s.caravan?.owner === id) total += SH.caravanVP;
      return total;
    },

    // Each rampart lets its owner hold 2 more cards when a 7 is rolled.
    discardLimit(ctx, prev, id) {
      const { state } = ctx;
      const mine = sh(state).ramparts.filter((v) => state.pieces.buildings[v]?.owner === id).length;
      return prev + SH.rampartBonus * mine;
    },

    tradeRate(ctx, prev, id, r) {
      const { state, rules } = ctx;
      const s = sh(state);
      let rate = prev;
      if (isCommodity(r) && levelOf(state, id, 'commerce') >= SH.perkLevel) rate = Math.min(rate, 2);
      if (s.fleet && s.fleet.player === id && s.fleet.resource === r) rate = Math.min(rate, 2);
      if (s.caravan && s.caravan.owner === id) {
        const hex = hexById(state, s.caravan.hex);
        if (hex && rules.config.terrainResource[hex.terrain] === r) rate = Math.min(rate, 2);
      }
      return rate;
    },

    // A 7 before the first raid: the blocker is not on the board, so nothing moves.
    phaseAfterRoll: (ctx, prev) =>
      prev.k === 'moveBlocker' && !sh(ctx.state).blockerActive ? { k: 'main' } : prev,
  },

  actions: {
    roll: rollAction,
    discard: discardAction,
    endTurn: endTurnAction,
    placeSettlement: placeSettlementAction,
    buildCity: buildCityAction,
    'sh:improve': () => improve,
    'sh:rampart': () => rampart,
    'sh:recruit': () => recruit,
    'sh:promote': () => promote,
    'sh:activate': () => activate,
    'sh:moveWarden': () => moveWarden,
    'sh:displace': () => displace,
    'sh:chase': () => chase,
    'sh:play': () => play,
    'sh:bazaarOffer': () => bazaarOffer,
    'sh:discardCard': () => discardCard,
    'sh:resolve': () => resolve,
  },

  init(ctx) {
    const { state } = ctx;
    // The legacy extra build windows are not supported with the expansion; normal and paired turns are.
    if (state.players.length >= 5 && state.init.largeTableMode === 'extraBuild')
      throw new Error('strongholds with 5-6 players needs largeTableMode "normal" or "paired"');
    const ids = state.players.map((p) => p.id);
    const perTrack = <T>(make: (t: Track) => T) =>
      Object.fromEntries(TRACKS.map((t) => [t, make(t)])) as Record<Track, T>;
    const s: ShState = {
      raid: { pos: 0, attacks: 0 },
      blockerActive: false,
      blockerHome: state.board.blocker,
      eventDie: null,
      fixedDice: null,
      productionDue: false,
      resume: null,
      levels: Object.fromEntries(ids.map((id) => [id, perTrack(() => 0)])),
      capitals: perTrack(() => null),
      ramparts: [],
      toppled: [],
      caravan: null,
      shields: Object.fromEntries(ids.map((id) => [id, 0])),
      vpCards: Object.fromEntries(ids.map((id) => [id, [] as string[]])),
      decks: perTrack((t) =>
        shuffle(
          state.rng,
          Object.entries(SH.decks[t]).flatMap(([c, n]) => Array<string>(n).fill(c)),
        ),
      ),
      fleet: null,
      bazaar: null,
      pending: [],
      peek: null,
    };
    state.ext[SH_ID] = s;
    state.pieces.occupants = {};
    const bank = state.players.length >= 5 ? SH.commodityBank.large : SH.commodityBank.small;
    for (const c of SH.commodities) state.bank.hand[c] = bank;
    // The blocker waits beside the board until the first raid.
    state.board.blocker = '';
  },

  view: (ctx, viewer) => viewOf(ctx.state, viewer),

  redactAction(action: Action, viewer) {
    if (action.player === viewer) return action;
    const a = action as ExtAction;
    if (a.t === 'sh:discardCard') {
      const { card: _card, ...rest } = a;
      return rest as Action;
    }
    if (a.t === 'sh:resolve' && typeof a.kind === 'string' && PRIVATE_FIELDS[a.kind]) {
      const rest: Record<string, unknown> = { ...a };
      delete rest[PRIVATE_FIELDS[a.kind]];
      return rest as Action;
    }
    return action;
  },
};
