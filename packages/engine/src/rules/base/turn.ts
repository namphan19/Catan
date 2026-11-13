// roll / discard / moveBlocker / steal / endTurn (incl. the extra build phase for 5-6 players).
import type { Action, Phase, PlayerId } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { bagAdd, bagHas, bagSub, bagToList, bagTotal, bagValid } from '../../bag';
import { randInt } from '../../rng';
import {
  err, expect, handSize, nextSeat, player, releaseNewCards, setPhase, startTurn, subBags,
} from './helpers';

type A<T extends string> = Extract<Action, { t: T }>;

/** Players (seat order) with a building on the hex and at least one card, excluding the thief. */
export function stealCandidates(ctx: Ctx, hex: string, thief: PlayerId): PlayerId[] {
  const { state, graph } = ctx;
  const owners = new Set<PlayerId>();
  for (const v of graph.hexVertices[hex] ?? []) {
    const b = state.pieces.buildings[v];
    if (b && b.owner !== thief) owners.add(b.owner);
  }
  return state.players.filter((p) => owners.has(p.id) && handSize(p) > 0).map((p) => p.id);
}

export const roll: ActionDef = {
  validate(ctx, a) {
    return expect(ctx.state, a, ['preRoll']);
  },
  apply(ctx, a) {
    const { state, rules } = ctx;
    const dice = rules.call('rollDice', ctx, []);
    const sum = dice.reduce((s, d) => s + d, 0);
    state.turn.roll = dice;
    ctx.emit({ e: 'rolled', player: a.player, dice, sum });
    let next: Phase;
    if (sum === rules.config.blockerNumber) {
      const owed: Record<PlayerId, number> = {};
      for (const p of state.players) {
        const n = handSize(p);
        if (n > rules.config.discardLimit) owed[p.id] = Math.floor(n / 2);
      }
      next = Object.keys(owed).length ? { k: 'discard', owed } : { k: 'moveBlocker', resume: 'main' };
    } else {
      const gains = rules.call('production', ctx, {}, sum);
      for (const [id, bag] of Object.entries(gains)) {
        bagSub(state.bank.hand, bag);
        bagAdd(player(state, id).hand, bag);
      }
      ctx.emit({ e: 'produced', gains });
      next = { k: 'main' };
    }
    setPhase(ctx, rules.call('phaseAfterRoll', ctx, next, sum));
  },
  legal(ctx, id) {
    const a: Action = { t: 'roll', player: id };
    return roll.validate(ctx, a) ? [] : [a];
  },
};

export const discard: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'discard'>;
    const { state, rules } = ctx;
    const e = expect(state, a, ['discard']);
    if (e) return e;
    if (state.phase.k !== 'discard') return err('WRONG_PHASE', 'Not discarding.');
    const owed = state.phase.owed[a.player] ?? 0;
    if (!bagValid(a.bag, rules.config.resources)) return err('BAD_BAG', 'Invalid resource bag.');
    if (bagTotal(a.bag) !== owed) return err('WRONG_AMOUNT', `You must discard exactly ${owed} cards.`);
    if (!bagHas(player(state, a.player).hand, a.bag)) return err('NOT_ENOUGH', 'You do not have those cards.');
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'discard'>;
    const { state } = ctx;
    if (state.phase.k !== 'discard') return;
    bagSub(player(state, a.player).hand, a.bag);
    bagAdd(state.bank.hand, a.bag);
    ctx.emit({ e: 'discarded', player: a.player, bag: a.bag });
    const owed = { ...state.phase.owed, [a.player]: 0 };
    if (Object.values(owed).every((n) => n === 0)) setPhase(ctx, { k: 'moveBlocker', resume: 'main' });
    else state.phase = { k: 'discard', owed };
  },
  legal(ctx, id) {
    const { state, rules } = ctx;
    // Enumerates every sub-bag of exactly `owed` cards. With very large hands the list may be
    // capped (subBags limit, default 5000); validateAction is the authority — any specific bag
    // combination is legal even if it is not listed here.
    if (state.phase.k !== 'discard' || expect(state, { t: 'discard', player: id, bag: {} }, ['discard']))
      return [];
    const owed = state.phase.owed[id] ?? 0;
    return subBags(player(state, id).hand, rules.config.resources, owed).map(
      (bag) => ({ t: 'discard', player: id, bag }) as Action,
    );
  },
};

export const moveBlocker: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'moveBlocker'>;
    const { state, graph } = ctx;
    const e = expect(state, a, ['moveBlocker']);
    if (e) return e;
    if (!graph.hexVertices[a.hex]) return err('BAD_HEX', `Unknown hex ${String(a.hex)}.`);
    if (a.hex === state.board.blocker) return err('SAME_HEX', 'The blocker must move to a different hex.');
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'moveBlocker'>;
    const { state } = ctx;
    if (state.phase.k !== 'moveBlocker') return;
    const resume = state.phase.resume;
    state.board.blocker = a.hex;
    ctx.emit({ e: 'blockerMoved', player: a.player, hex: a.hex });
    const from = stealCandidates(ctx, a.hex, a.player);
    if (from.length) setPhase(ctx, { k: 'steal', from, resume });
    else setPhase(ctx, { k: resume });
  },
  legal(ctx, id) {
    return ctx.graph.hexes
      .map((hex) => ({ t: 'moveBlocker', player: id, hex }) as Action)
      .filter((x) => !moveBlocker.validate(ctx, x));
  },
};

export const steal: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'steal'>;
    const { state } = ctx;
    const e = expect(state, a, ['steal']);
    if (e) return e;
    if (state.phase.k !== 'steal' || !state.phase.from.includes(a.target))
      return err('BAD_TARGET', 'You cannot steal from that player.');
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'steal'>;
    const { state, rules } = ctx;
    if (state.phase.k !== 'steal') return;
    const resume = state.phase.resume;
    const victim = player(state, a.target);
    const cards = bagToList(victim.hand, rules.config.resources);
    let resource: string | undefined;
    if (cards.length) {
      resource = cards[randInt(state.rng, cards.length)];
      bagSub(victim.hand, { [resource]: 1 });
      bagAdd(player(state, a.player).hand, { [resource]: 1 });
    }
    ctx.emit({ e: 'stole', from: a.target, to: a.player, resource });
    setPhase(ctx, { k: resume });
  },
  legal(ctx, id) {
    const { state } = ctx;
    if (state.phase.k !== 'steal') return [];
    return state.phase.from
      .map((target) => ({ t: 'steal', player: id, target }) as Action)
      .filter((x) => !steal.validate(ctx, x));
  },
};

export const endTurn: ActionDef = {
  validate(ctx, a) {
    return expect(ctx.state, a, ['main', 'extraBuild']);
  },
  apply(ctx, a) {
    const { state, rules } = ctx;
    releaseNewCards(player(state, a.player));
    if (state.phase.k === 'extraBuild') {
      const queue = state.phase.queue.slice(1);
      if (queue.length) setPhase(ctx, { k: 'extraBuild', queue });
      else startTurn(ctx, nextSeat(state, state.turn.current));
      return;
    }
    state.trade = undefined;
    const next = rules.call('phaseAfterTurn', ctx, { k: 'preRoll' });
    if (next.k === 'preRoll') startTurn(ctx, nextSeat(state, state.turn.current));
    else setPhase(ctx, next);
  },
  legal(ctx, id) {
    const a: Action = { t: 'endTurn', player: id };
    return endTurn.validate(ctx, a) ? [] : [a];
  },
};
