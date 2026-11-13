// bankTrade (4:1, harbors 3:1 / 2:1) and player trades (offer -> responses -> confirm with one).
import type { Action, Bag } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { bagAdd, bagClean, bagHas, bagSub, bagTotal, bagValid } from '../../bag';
import { err, expect, hasPlayer, player, tradeRate } from './helpers';

type A<T extends string> = Extract<Action, { t: T }>;

function nonEmptyBags(ctx: Ctx, give: unknown, get: unknown) {
  const rs = ctx.rules.config.resources;
  if (!bagValid(give, rs) || !bagValid(get, rs)) return err('BAD_BAG', 'Invalid resource bag.');
  if (bagTotal(give) === 0 || bagTotal(get) === 0)
    return err('EMPTY_TRADE', 'Both sides of a trade must contain at least one card.');
  const g = bagClean(give);
  if (Object.keys(bagClean(get)).some((r) => g[r])) return err('SAME_RESOURCE', 'A resource cannot be on both sides.');
  return null;
}

export const bankTrade: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'bankTrade'>;
    const { state } = ctx;
    const e = expect(state, a, ['main']) ?? nonEmptyBags(ctx, a.give, a.get);
    if (e) return e;
    const give = bagClean(a.give);
    const kinds = Object.keys(give);
    if (kinds.length !== 1) return err('ONE_KIND', 'Give exactly one kind of resource to the bank.');
    const rate = tradeRate(ctx, a.player, kinds[0]);
    const n = give[kinds[0]];
    if (n % rate !== 0) return err('BAD_RATE', `Your rate for ${kinds[0]} is ${rate}:1.`);
    if (bagTotal(a.get) !== n / rate) return err('BAD_RATE', `You get ${n / rate} card(s) for ${n}.`);
    if (!bagHas(player(state, a.player).hand, give)) return err('NOT_ENOUGH', 'You do not have those cards.');
    if (!bagHas(state.bank.hand, a.get)) return err('BANK_EMPTY', 'The bank does not have those cards.');
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'bankTrade'>;
    const { state } = ctx;
    const p = player(state, a.player);
    const give = bagClean(a.give);
    const get = bagClean(a.get);
    bagSub(p.hand, give);
    bagAdd(state.bank.hand, give);
    bagSub(state.bank.hand, get);
    bagAdd(p.hand, get);
    ctx.emit({ e: 'traded', a: a.player, b: 'bank', aGave: give, bGave: get });
  },
  legal(ctx, id) {
    const { state, rules } = ctx;
    if (expect(state, { t: 'bankTrade', player: id, give: {}, get: {} }, ['main'])) return [];
    const hand = player(state, id).hand;
    const out: Action[] = [];
    for (const r of rules.config.resources) {
      const rate = tradeRate(ctx, id, r);
      if ((hand[r] ?? 0) < rate) continue;
      for (const s of rules.config.resources)
        if (s !== r && (state.bank.hand[s] ?? 0) > 0)
          out.push({ t: 'bankTrade', player: id, give: { [r]: rate }, get: { [s]: 1 } });
    }
    return out;
  },
};

export const offerTrade: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'offerTrade'>;
    const e = expect(ctx.state, a, ['main']) ?? nonEmptyBags(ctx, a.give, a.get);
    if (e) return e;
    if (!bagHas(player(ctx.state, a.player).hand, a.give)) return err('NOT_ENOUGH', 'You do not have those cards.');
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'offerTrade'>;
    const give = bagClean(a.give);
    const get = bagClean(a.get);
    ctx.state.trade = { from: a.player, give, get, responses: {} };
    ctx.emit({ e: 'tradeOffered', player: a.player, give, get });
  },
  legal(ctx, id) {
    // The real offer space is unbounded; legal() lists the 1-for-1 offers (enough for fuzzing / UI hints).
    const { state, rules } = ctx;
    if (expect(state, { t: 'offerTrade', player: id, give: {}, get: {} }, ['main'])) return [];
    const hand = player(state, id).hand;
    const out: Action[] = [];
    for (const r of rules.config.resources)
      if ((hand[r] ?? 0) > 0)
        for (const s of rules.config.resources)
          if (s !== r) out.push({ t: 'offerTrade', player: id, give: { [r]: 1 }, get: { [s]: 1 } });
    return out;
  },
};

export const respondTrade: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'respondTrade'>;
    const { state } = ctx;
    if (state.winner) return err('GAME_OVER', 'The game is over.');
    if (!hasPlayer(state, a.player)) return err('UNKNOWN_PLAYER', `Unknown player ${String(a.player)}.`);
    if (state.phase.k !== 'main' || !state.trade) return err('NO_TRADE', 'There is no open trade offer.');
    if (a.player === state.trade.from) return err('OWN_OFFER', 'You cannot respond to your own offer.');
    if (typeof a.accept !== 'boolean') return err('BAD_ARGS', 'accept must be true or false.');
    if (a.accept && !bagHas(player(state, a.player).hand, state.trade.get))
      return err('NOT_ENOUGH', 'You do not have the requested cards.');
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'respondTrade'>;
    if (!ctx.state.trade) return;
    ctx.state.trade.responses[a.player] = a.accept ? 'accept' : 'decline';
    ctx.emit({ e: 'tradeResponse', player: a.player, accept: a.accept });
  },
  legal(ctx, id) {
    const { state } = ctx;
    if (!state.trade || state.trade.responses[id]) return [];
    return [true, false]
      .map((accept) => ({ t: 'respondTrade', player: id, accept }) as Action)
      .filter((x) => !respondTrade.validate(ctx, x));
  },
};

export const confirmTrade: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'confirmTrade'>;
    const { state } = ctx;
    const e = expect(state, a, ['main']);
    if (e) return e;
    const t = state.trade;
    if (!t || t.from !== a.player) return err('NO_TRADE', 'You have no open trade offer.');
    if (t.responses[a.with] !== 'accept') return err('NOT_ACCEPTED', `${String(a.with)} has not accepted.`);
    if (!bagHas(player(state, a.player).hand, t.give)) return err('NOT_ENOUGH', 'You no longer have those cards.');
    if (!bagHas(player(state, a.with).hand, t.get)) return err('NOT_ENOUGH', `${a.with} no longer has those cards.`);
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'confirmTrade'>;
    const { state } = ctx;
    const t = state.trade;
    if (!t) return;
    const me = player(state, a.player);
    const them = player(state, a.with);
    bagSub(me.hand, t.give);
    bagAdd(them.hand, t.give);
    bagSub(them.hand, t.get);
    bagAdd(me.hand, t.get);
    state.trade = undefined;
    ctx.emit({ e: 'traded', a: a.player, b: a.with, aGave: t.give as Bag, bGave: t.get as Bag });
  },
  legal(ctx, id) {
    const t = ctx.state.trade;
    if (!t) return [];
    return Object.keys(t.responses)
      .map((w) => ({ t: 'confirmTrade', player: id, with: w }) as Action)
      .filter((x) => !confirmTrade.validate(ctx, x));
  },
};

export const cancelTrade: ActionDef = {
  validate(ctx, action) {
    const e = expect(ctx.state, action, ['main']);
    if (e) return e;
    if (!ctx.state.trade || ctx.state.trade.from !== action.player) return err('NO_TRADE', 'You have no open trade offer.');
    return null;
  },
  apply(ctx, action) {
    ctx.state.trade = undefined;
    ctx.emit({ e: 'tradeCancelled', player: action.player });
  },
  legal(ctx, id) {
    const a: Action = { t: 'cancelTrade', player: id };
    return cancelTrade.validate(ctx, a) ? [] : [a];
  },
};
