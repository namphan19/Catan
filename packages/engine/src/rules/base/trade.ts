// bankTrade (4:1, harbors 3:1 / 2:1) and player trades (offer -> responses -> confirm with one).
// base p.7: the other players may accept, decline or make a counteroffer, and may change their
// answer until the offer is confirmed or cancelled (replaces decision D20). Repeating the same answer
// is rejected (SAME_RESPONSE): it changes nothing and only floods the log.
import type { Action, Bag, TradeResponse } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { bagAdd, bagClean, bagHas, bagSub, bagTotal, bagValid } from '../../bag';
import { err, expect, hasPlayer, player, tradeRate } from './helpers';

type A<T extends string> = Extract<Action, { t: T }>;

type RespondAction = A<'respondTrade'>;

function bagEqual(a: Bag | undefined, b: Bag | undefined): boolean {
  const x = bagClean(a ?? {});
  const y = bagClean(b ?? {});
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].every((k) => (x[k] ?? 0) === (y[k] ?? 0));
}

function nonEmptyBags(ctx: Ctx, give: unknown, get: unknown) {
  const rs = ctx.rules.config.resources;
  if (!bagValid(give, rs) || !bagValid(get, rs)) return err('BAD_BAG', 'Invalid resource bag.');
  if (bagTotal(give) === 0 || bagTotal(get) === 0)
    return err('EMPTY_TRADE', 'Both sides of a trade must contain at least one card.');
  const g = bagClean(give);
  if (Object.keys(bagClean(get)).some((r) => g[r])) return err('SAME_RESOURCE', 'A resource cannot be on both sides.');
  return null;
}

/** Normalize the action's response: an explicit `response` wins over the `accept` shorthand. */
function normalizeResponse(a: RespondAction): { response: TradeResponse['response']; give?: Bag; get?: Bag } | null {
  if (a.response) return { response: a.response, give: a.give, get: a.get };
  if (typeof a.accept === 'boolean') return { response: a.accept ? 'accept' : 'decline' };
  return null;
}

export const bankTrade: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'bankTrade'>;
    const { state } = ctx;
    // base p.7: bank/ports trades are allowed in the action phase, including the paired phase.
    const e = expect(state, a, ['main', 'paired']) ?? nonEmptyBags(ctx, a.give, a.get);
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
    if (expect(state, { t: 'bankTrade', player: id, give: {}, get: {} }, ['main', 'paired'])) return [];
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

/**
 * Answers per responder per offer (D20): a responder may change their mind, but not forever -
 * an endless accept/decline toggle stalls clients and floods the log.
 */
export const MAX_TRADE_ANSWERS = 5;

export const respondTrade: ActionDef = {
  validate(ctx, action) {
    const a = action as A<'respondTrade'>;
    const { state } = ctx;
    if (state.winner) return err('GAME_OVER', 'The game is over.');
    if (!hasPlayer(state, a.player)) return err('UNKNOWN_PLAYER', `Unknown player ${String(a.player)}.`);
    if (state.phase.k !== 'main' || !state.trade) return err('NO_TRADE', 'There is no open trade offer.');
    if (a.player === state.trade.from) return err('OWN_OFFER', 'You cannot respond to your own offer.');
    // base p.7: accept, decline or counteroffer. There is no one-response lock (D20 removed):
    // a responder may change the answer until the offer is confirmed or cancelled.
    const r = normalizeResponse(a);
    if (!r)
      return err('BAD_ARGS', 'Use accept: true/false or response: "accept" | "decline" | "counter".');
    if (r.response === 'accept' && !bagHas(player(state, a.player).hand, state.trade.get))
      return err('NOT_ENOUGH', 'You do not have the requested cards.');
    if (r.response === 'counter') {
      const e = nonEmptyBags(ctx, r.give, r.get);
      if (e) return e;
      if (!bagHas(player(state, a.player).hand, bagClean(r.give!)))
        return err('NOT_ENOUGH', 'You do not have those cards.');
    }
    // Changing the answer is allowed, repeating it is not: an identical answer changes nothing and
    // would only flood the log (a double click, or a UI that keeps the button live).
    const prev = state.trade.responses[a.player];
    if (
      prev &&
      prev.response === r.response &&
      (r.response !== 'counter' ||
        (bagEqual(prev.give, r.give) && bagEqual(prev.get, r.get)))
    )
      return err('SAME_RESPONSE', 'You already gave this answer.');
    if ((state.trade.answers?.[a.player] ?? 0) >= MAX_TRADE_ANSWERS)
      return err('ANSWER_LIMIT', `You cannot change your answer more than ${MAX_TRADE_ANSWERS - 1} times.`);
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'respondTrade'>;
    const t = ctx.state.trade;
    if (!t) return;
    const r = normalizeResponse(a)!;
    t.responses[a.player] =
      r.response === 'counter'
        ? { response: 'counter', give: bagClean(r.give!), get: bagClean(r.get!) }
        : { response: r.response };
    t.answers = { ...(t.answers ?? {}), [a.player]: (t.answers?.[a.player] ?? 0) + 1 };
    ctx.emit({ e: 'tradeResponse', player: a.player, response: r.response, accept: r.response === 'accept' });
  },
  legal(ctx, id) {
    const { state, rules } = ctx;
    const t = state.trade;
    if (!t || t.from === id || state.phase.k !== 'main') return [];
    const out: Action[] = [];
    for (const accept of [true, false]) {
      const a = { t: 'respondTrade', player: id, accept } as Action;
      if (!respondTrade.validate(ctx, a)) out.push(a);
    }
    // Counters are an open-ended space; legal() samples the 1-for-1 counters (like offerTrade).
    const hand = player(state, id).hand;
    for (const r of rules.config.resources)
      if ((hand[r] ?? 0) > 0)
        for (const s of rules.config.resources)
          if (s !== r) {
            const a = {
              t: 'respondTrade', player: id, response: 'counter', give: { [r]: 1 }, get: { [s]: 1 },
            } as Action;
            if (!respondTrade.validate(ctx, a)) out.push(a);
          }
    return out;
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
    const r = t.responses[a.with];
    if (!r || r.response === 'decline') return err('NOT_ACCEPTED', `${String(a.with)} has not accepted.`);
    // Re-validate both hands against the terms that will be executed.
    const giveByMe = r.response === 'counter' ? r.get! : t.give;
    const giveByThem = r.response === 'counter' ? r.give! : t.get;
    if (!bagHas(player(state, a.player).hand, giveByMe))
      return err('NOT_ENOUGH', 'You no longer have those cards.');
    if (!bagHas(player(state, a.with).hand, giveByThem))
      return err('NOT_ENOUGH', `${a.with} no longer has those cards.`);
    return null;
  },
  apply(ctx, action) {
    const a = action as A<'confirmTrade'>;
    const { state } = ctx;
    const t = state.trade;
    if (!t) return;
    const r = t.responses[a.with]!;
    // base p.7: a confirmed counteroffer executes the counter terms instead of the original offer.
    const giveByMe = r.response === 'counter' ? r.get! : t.give;
    const giveByThem = r.response === 'counter' ? r.give! : t.get;
    const me = player(state, a.player);
    const them = player(state, a.with);
    bagSub(me.hand, giveByMe);
    bagAdd(them.hand, giveByMe);
    bagSub(them.hand, giveByThem);
    bagAdd(me.hand, giveByThem);
    state.trade = undefined;
    ctx.emit({ e: 'traded', a: a.player, b: a.with, aGave: giveByMe as Bag, bGave: giveByThem as Bag });
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
