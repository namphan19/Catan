// buyCard / playCard. Cards: guard (move blocker + steal, counts for largest force), freeRoads,
// harvest (take resources from the bank), claim (take one resource type from everyone), relic (1 VP,
// hidden). In the paired phase (5-6 players) player 2 may play one card (5-6 p.3).
import type { Action, Resume } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { bagAdd, bagSub, bagTotal } from '../../bag';
import { canAfford, pay } from './build';
import { cost, err, expect, freeRouteAvailable, player, resumePhase, setPhase, updateLargestForce } from './helpers';

type A<T extends string> = Extract<Action, { t: T }>;

// The playable card set lives in config as `playableCards` (D21), so extensions can add cards.

export const buyCard: ActionDef = {
  validate(ctx, a) {
    const e = expect(ctx.state, a, ['main', 'extraBuild', 'paired']);
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
    const e = expect(state, a, ['preRoll', 'main', 'paired']);
    if (e) return e;
    if (!rules.config.playableCards.includes(a.card))
      return err('NOT_PLAYABLE', `${String(a.card)} cannot be played.`);
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
      if (!freeRouteAvailable(ctx, a.player)) return err('NO_ROAD_SPOT', 'You have nowhere to build a road.');
    }
    if (a.card === 'harvest') {
      // D19: with 0 cards in the bank harvest cannot be played (the card is not wasted).
      if (bagTotal(state.bank.hand) === 0) return err('BANK_EMPTY', 'The bank has no cards to harvest.');
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
      // The flow returns to the phase the card was played from (paired players resume to the
      // paired phase, 5-6 p.3); `actor` marks that the paired player owns the sub-phases.
      const from = state.phase;
      const inPaired = from.k === 'paired';
      const resume: Resume = from.k === 'preRoll' ? 'preRoll' : inPaired ? 'paired' : 'main';
      ctx.emit({ e: 'cardPlayed', player: a.player, card: a.card });
      setPhase(
        ctx,
        inPaired
          ? { k: 'moveBlocker', resume, actor: from.player }
          : { k: 'moveBlocker', resume },
      );
      return;
    }
    if (a.card === 'freeRoads') {
      // Ships (an extension piece) also count as free road-like pieces.
      const left = Math.min(rules.config.freeRoadsCount, p.supply.road + (p.supply.ship ?? 0));
      ctx.emit({ e: 'cardPlayed', player: a.player, card: a.card });
      if (left > 0 && freeRouteAvailable(ctx, a.player)) {
        const inPaired = state.phase.k === 'paired';
        setPhase(
          ctx,
          inPaired ? { k: 'freeRoads', left, actor: a.player } : { k: 'freeRoads', left },
        );
      }
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
    if (expect(state, { t: 'playCard', player: id, card: 'guard' }, ['preRoll', 'main', 'paired'])) return [];
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
        // n === 0 means the bank is empty (D19): harvest is not listed.
      } else if (card === 'claim') {
        for (const r of rs) out.push({ t: 'playCard', player: id, card, resource: r });
      } else out.push({ t: 'playCard', player: id, card });
    }
    return out.filter((x) => !playCard.validate(ctx, x));
  },
};
