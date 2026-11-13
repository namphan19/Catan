// buyCard / playCard. Cards: guard (move blocker + steal, counts for largest force), freeRoads,
// harvest (take resources from the bank), claim (take one resource type from everyone), relic (1 VP, hidden).
import type { Action } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { legalRoadSpots } from '../../board/graph';
import { bagAdd, bagSub, bagTotal } from '../../bag';
import { canAfford, pay } from './build';
import { cost, err, expect, player, setPhase, updateLargestForce } from './helpers';

type A<T extends string> = Extract<Action, { t: T }>;

export const PLAYABLE = ['guard', 'freeRoads', 'harvest', 'claim'];

export const buyCard: ActionDef = {
  validate(ctx, a) {
    const e = expect(ctx.state, a, ['main', 'extraBuild']);
    if (e) return e;
    if (ctx.state.bank.deck.length === 0) return err('DECK_EMPTY', 'No cards left to buy.');
    return canAfford(ctx, a.player, 'card');
  },
  apply(ctx, a) {
    const { state } = ctx;
    pay(ctx, a.player, cost(ctx, 'card'));
    const card = state.bank.deck.pop()!;
    player(state, a.player).newCards.push(card);
    ctx.emit({ e: 'cardBought', player: a.player, card });
  },
  legal(ctx, id) {
    const a: Action = { t: 'buyCard', player: id };
    return buyCard.validate(ctx, a) ? [] : [a];
  },
};

function harvestAmount(ctx: Ctx): number {
  return Math.min(ctx.rules.config.harvestCount, bagTotal(ctx.state.bank.hand));
}

export const playCard: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'playCard'>;
    const { state, graph, rules } = ctx;
    const e = expect(state, a, ['preRoll', 'main']);
    if (e) return e;
    if (!PLAYABLE.includes(a.card)) return err('NOT_PLAYABLE', `${String(a.card)} cannot be played.`);
    const p = player(state, a.player);
    if (!p.cards.includes(a.card))
      return p.newCards.includes(a.card)
        ? err('JUST_BOUGHT', 'Cards cannot be played in the turn they were bought.')
        : err('NO_CARD', `You have no ${a.card} card.`);
    if (state.turn.cardPlayed) return err('ONE_CARD', 'Only one card may be played per turn.');
    if (state.phase.k === 'preRoll' && a.card !== 'guard')
      return err('WRONG_PHASE', 'Only a guard may be played before rolling.');
    const rs = rules.config.resources;
    if (a.card === 'freeRoads') {
      if (p.supply.road <= 0 || legalRoadSpots(graph, state.pieces, a.player).length === 0)
        return err('NO_ROAD_SPOT', 'You have nowhere to build a road.');
    }
    if (a.card === 'harvest') {
      const want = a.resources;
      const n = harvestAmount(ctx);
      if (!Array.isArray(want) || want.length !== n || !want.every((r) => rs.includes(r)))
        return err('BAD_ARGS', `Choose exactly ${n} resource(s).`);
      const need: Record<string, number> = {};
      for (const r of want) need[r] = (need[r] ?? 0) + 1;
      if (Object.entries(need).some(([r, k]) => (state.bank.hand[r] ?? 0) < k))
        return err('BANK_EMPTY', 'The bank does not have those resources.');
    }
    if (a.card === 'claim' && (typeof a.resource !== 'string' || !rs.includes(a.resource)))
      return err('BAD_ARGS', 'Name one resource to claim.');
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'playCard'>;
    const { state, graph, rules } = ctx;
    const p = player(state, a.player);
    p.cards.splice(p.cards.indexOf(a.card), 1);
    p.played[a.card] = (p.played[a.card] ?? 0) + 1;
    state.turn.cardPlayed = true;
    let detail: unknown;
    if (a.card === 'guard') {
      updateLargestForce(ctx, a.player);
      const resume = state.phase.k === 'preRoll' ? 'preRoll' : 'main';
      ctx.emit({ e: 'cardPlayed', player: a.player, card: a.card });
      setPhase(ctx, { k: 'moveBlocker', resume });
      return;
    }
    if (a.card === 'freeRoads') {
      const left = Math.min(rules.config.freeRoadsCount, p.supply.road);
      ctx.emit({ e: 'cardPlayed', player: a.player, card: a.card });
      if (left > 0 && legalRoadSpots(graph, state.pieces, a.player).length) setPhase(ctx, { k: 'freeRoads', left });
      return;
    }
    if (a.card === 'harvest') {
      const gain: Record<string, number> = {};
      for (const r of a.resources ?? []) gain[r] = (gain[r] ?? 0) + 1;
      bagSub(state.bank.hand, gain);
      bagAdd(p.hand, gain);
      detail = { gain };
    }
    if (a.card === 'claim') {
      const r = a.resource!;
      const taken: Record<string, number> = {};
      for (const o of state.players) {
        if (o.id === a.player || !o.hand[r]) continue;
        taken[o.id] = o.hand[r];
        p.hand[r] = (p.hand[r] ?? 0) + o.hand[r];
        o.hand[r] = 0;
      }
      detail = { resource: r, taken };
    }
    ctx.emit({ e: 'cardPlayed', player: a.player, card: a.card, detail });
  },
  legal(ctx, id) {
    const { state, rules } = ctx;
    if (expect(state, { t: 'playCard', player: id, card: 'guard' }, ['preRoll', 'main'])) return [];
    const p = player(state, id);
    const rs = rules.config.resources;
    const out: Action[] = [];
    for (const card of [...new Set(p.cards)]) {
      if (card === 'harvest') {
        const n = harvestAmount(ctx);
        if (n === 2) {
          for (let i = 0; i < rs.length; i++)
            for (let j = i; j < rs.length; j++)
              out.push({ t: 'playCard', player: id, card, resources: [rs[i], rs[j]] });
        } else if (n === 1) for (const r of rs) out.push({ t: 'playCard', player: id, card, resources: [r] });
        else if (n === 0) out.push({ t: 'playCard', player: id, card, resources: [] });
      } else if (card === 'claim') {
        for (const r of rs) out.push({ t: 'playCard', player: id, card, resource: r });
      } else out.push({ t: 'playCard', player: id, card });
    }
    return out.filter((x) => !playCard.validate(ctx, x));
  },
};
