// City actions: improvements (with capitals), ramparts, and the wrapped base actions that behave
// differently in expansion games (second setup piece is a city, rebuilding pillaged cities, end of turn).
import type { Action, ExtAction, GameEvent, VertexId } from '../../types';
import type { ActionDef } from '../../ruleset/types';
import { canAfford, pay } from '../base/build';
import { actors, cost, err, expect, player, setPhase } from '../base/helpers';
import { SH, type Track } from './config';
import { settle } from './flow';
import {
  doImprove, doRampart, doUpgrade, improveError, improveOptions, rampartError, returnCard, upgradeError,
} from './ops';
import { citiesOf, emitSh, occupants, sh } from './state';
import { ACTION_PHASES } from './wardens';

export const improve: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    return expect(ctx.state, a, ACTION_PHASES) ?? improveError(ctx, a.player, a.track, a.v, 0);
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    doImprove(ctx, a.player, a.track as Track, a.v as VertexId | undefined, 0);
    settle(ctx);
  },
  legal(ctx, id) {
    if (expect(ctx.state, { t: 'sh:improve', player: id }, ACTION_PHASES)) return [];
    return improveOptions(ctx, id, 0).map((o) => ({ t: 'sh:improve', player: id, ...o }) as Action);
  },
};

export const rampart: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    return (
      expect(ctx.state, a, ACTION_PHASES) ?? rampartError(ctx, a.player, a.v) ?? canAfford(ctx, a.player, 'rampart')
    );
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    pay(ctx, a.player, cost(ctx, 'rampart'));
    doRampart(ctx, a.player, a.v as VertexId);
    settle(ctx);
  },
  legal(ctx, id) {
    if (expect(ctx.state, { t: 'sh:rampart', player: id }, ACTION_PHASES)) return [];
    return citiesOf(ctx.state, id)
      .map((v) => ({ t: 'sh:rampart', player: id, v }) as Action)
      .filter((x) => !rampart.validate(ctx, x));
  },
};

/** Discard an advance card while over the hand limit (the acting player, before ending the turn). */
export const discardCard: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ACTION_PHASES);
    if (e) return e;
    const cards = player(ctx.state, a.player).cards;
    if (cards.length <= SH.handLimit) return err('UNDER_LIMIT', `You may keep ${SH.handLimit} advance cards.`);
    if (typeof a.card !== 'string' || !cards.includes(a.card)) return err('NO_CARD', 'You do not have that card.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const cards = player(ctx.state, a.player).cards;
    const card = a.card as string;
    cards.splice(cards.indexOf(card), 1);
    returnCard(ctx.state, card);
    emitSh(ctx, { type: 'cardDiscarded', player: a.player }, { card }, [a.player]);
    settle(ctx);
  },
  legal(ctx, id) {
    if (expect(ctx.state, { t: 'sh:discardCard', player: id }, ACTION_PHASES)) return [];
    const cards = player(ctx.state, id).cards;
    if (cards.length <= SH.handLimit) return [];
    return [...new Set(cards)].map((card) => ({ t: 'sh:discardCard', player: id, card }) as Action);
  },
};

function need(prev: ActionDef | undefined, t: string): ActionDef {
  if (!prev) throw new Error(`strongholds needs the base ${t} action`);
  return prev;
}

/** Setup: the second starting piece is a city (it still yields 1 resource per adjacent hex). */
export function placeSettlementAction(prevDef: ActionDef | undefined): ActionDef {
  const prev = need(prevDef, 'placeSettlement');
  return {
    validate: (ctx, a) => prev.validate(ctx, a),
    legal: (ctx, id) => prev.legal(ctx, id),
    apply(ctx, action) {
      const { state } = ctx;
      const ph = state.phase;
      if (!(ph.k === 'setup' && ph.idx >= state.players.length)) {
        prev.apply(ctx, action);
        return;
      }
      const a = action as Extract<Action, { t: 'placeSettlement' }>;
      const asCity = (ev: GameEvent): GameEvent =>
        ev.e === 'placed' && ev.kind === 'settlement' ? { ...ev, kind: 'city' } : ev;
      prev.apply({ ...ctx, emit: (ev) => ctx.emit(asCity(ev)) }, action);
      const p = player(state, a.player);
      state.pieces.buildings[a.v] = { owner: a.player, kind: 'city' };
      p.supply.settlement += 1;
      p.supply.city -= 1;
    },
  };
}

/** Building a city also covers rebuilding a pillaged city whose piece stayed on the board. */
export function buildCityAction(prevDef: ActionDef | undefined): ActionDef {
  need(prevDef, 'buildCity');
  const def: ActionDef = {
    validate(ctx, action) {
      const a = action as Extract<Action, { t: 'buildCity' }>;
      return expect(ctx.state, a, ['main', 'extraBuild', 'paired']) ?? upgradeError(ctx, a.player, a.v, 'city');
    },
    apply(ctx, action) {
      const a = action as Extract<Action, { t: 'buildCity' }>;
      doUpgrade(ctx, a.player, a.v, 'city');
      settle(ctx);
    },
    legal(ctx, id) {
      if (!actors(ctx.state).includes(id)) return [];
      return Object.entries(ctx.state.pieces.buildings)
        .filter(([, b]) => b.owner === id && b.kind === 'settlement')
        .map(([v]) => ({ t: 'buildCity', player: id, v }) as Action)
        .filter((x) => !def.validate(ctx, x));
    },
  };
  return def;
}

/** Ending an action phase: the advance hand limit applies, and per-turn effects expire. */
export function endTurnAction(prevDef: ActionDef | undefined): ActionDef {
  const prev = need(prevDef, 'endTurn');
  const def: ActionDef = {
    validate(ctx, action) {
      const e = prev.validate(ctx, action);
      if (e) return e;
      if (player(ctx.state, action.player).cards.length > SH.handLimit)
        return err('HAND_LIMIT', `Play or discard advance cards down to ${SH.handLimit} first.`);
      return null;
    },
    apply(ctx, action) {
      const s = sh(ctx.state);
      s.fleet = null;
      s.bazaar = null;
      s.peek = null;
      for (const o of Object.values(occupants(ctx.state))) o.tags = [];
      prev.apply(ctx, action);
    },
    legal(ctx, id) {
      const a: Action = { t: 'endTurn', player: id };
      return def.validate(ctx, a) ? [] : [a];
    },
  };
  return def;
}

/** A rolled 7 before the first raid: cards are discarded but the blocker is not on the board yet. */
export function discardAction(prevDef: ActionDef | undefined): ActionDef {
  const prev = need(prevDef, 'discard');
  return {
    validate: (ctx, a) => prev.validate(ctx, a),
    legal: (ctx, id) => prev.legal(ctx, id),
    apply(ctx, action) {
      if (sh(ctx.state).blockerActive) {
        prev.apply(ctx, action);
        return;
      }
      const quiet = (ev: GameEvent): boolean => ev.e === 'phase' && ev.phase === 'moveBlocker';
      prev.apply({ ...ctx, emit: (ev) => (quiet(ev) ? undefined : ctx.emit(ev)) }, action);
      if (ctx.state.phase.k === 'moveBlocker') setPhase(ctx, { k: 'main' });
    },
  };
}
