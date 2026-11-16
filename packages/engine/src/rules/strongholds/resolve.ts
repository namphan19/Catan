// Pending choices: the `sh:resolve` action and automatic resolution of forced choices.
import type { Action, Bag, ExtAction, RuleError } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { bagAdd, bagClean, bagHas, bagSub, bagTotal, bagValid } from '../../bag';
import { err, expect, player, subBags } from '../base/helpers';
import { SH, SH_ID, TRACKS, isCommodity, type Track } from './config';
import { settle } from './flow';
import {
  drawCard, liftWarden, pillage, placeWarden, returnCard, setWarden, shelveWarden, transfer, wardenPiece,
} from './ops';
import {
  emitSh, moveTargets, pillageable, sh, wardenSpots, wardensOf, type Pending,
} from './state';

type Answer = Record<string, unknown>;

const BAG_KINDS = ['titheTake', 'dowryGive', 'sabotageDiscard'];
/** Enumerated bag answers are a bounded sample; validateAction accepts any exact bag. */
const BAG_SAMPLE = 300;

/** Whose hand a bag choice is taken from, and how many cards. */
function bagSource(ctx: Ctx, p: Pending): { hand: Bag; need: number } {
  const { state } = ctx;
  if (p.kind === 'titheTake') {
    const hand = player(state, p.target).hand;
    return { hand, need: Math.min(p.count, bagTotal(hand)) };
  }
  if (p.kind === 'dowryGive' || p.kind === 'sabotageDiscard') {
    const hand = player(state, p.player).hand;
    return { hand, need: Math.min(p.count, bagTotal(hand)) };
  }
  return { hand: {}, need: 0 };
}

/** Concrete answers to a pending choice. */
export function choices(ctx: Ctx, p: Pending): Answer[] {
  const { state, rules } = ctx;
  switch (p.kind) {
    case 'pillage':
      return pillageable(state, p.player).map((v) => ({ v }));
    case 'pickDeck':
      return TRACKS.filter((t) => sh(state).decks[t].length > 0).map((deck) => ({ deck }));
    case 'trimHand':
      return [...new Set(player(state, p.player).cards)].map((card) => ({ card }));
    case 'provision':
      return rules.config.resources
        .filter((r) => !isCommodity(r) && (state.bank.hand[r] ?? 0) > 0)
        .map((resource) => ({ resource }));
    case 'relocate':
      return moveTargets(ctx, p.player, p.from).map((v) => ({ v }));
    case 'bazaarGive':
      return SH.commodities
        .filter((c) => (player(state, p.player).hand[c] ?? 0) > 0)
        .map((resource) => ({ resource }));
    case 'informantTake':
      return [...[...new Set(player(state, p.target).cards)].map((card) => ({ card })), { skip: true }];
    case 'turncoatRemove':
      return wardensOf(state, p.player).map(([v]) => ({ v }));
    case 'turncoatPlace': {
      const out: Answer[] = [];
      const spots = wardenSpots(ctx, p.player);
      for (let level = 1; level <= p.maxLevel; level++)
        if ((player(state, p.player).supply[wardenPiece(level)] ?? 0) > 0)
          for (const v of spots) out.push({ v, level });
      out.push({ skip: true });
      return out;
    }
    case 'titheTake':
    case 'dowryGive':
    case 'sabotageDiscard': {
      const { hand, need } = bagSource(ctx, p);
      return subBags(hand, rules.config.resources, need, BAG_SAMPLE).map((bag) => ({ bag }));
    }
  }
}

const FIELDS = ['v', 'deck', 'card', 'resource', 'level'] as const;
const sameAnswer = (a: Answer, b: Answer): boolean =>
  !!a.skip === !!b.skip && FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));

function checkAnswer(ctx: Ctx, p: Pending, a: Answer): RuleError | null {
  if (BAG_KINDS.includes(p.kind)) {
    const { hand, need } = bagSource(ctx, p);
    if (!bagValid(a.bag, ctx.rules.config.resources)) return err('BAD_BAG', 'Invalid card selection.');
    if (bagTotal(a.bag) !== need) return err('WRONG_AMOUNT', `Choose exactly ${need} card(s).`);
    if (!bagHas(hand, a.bag)) return err('NOT_ENOUGH', 'Those cards are not in that hand.');
    return null;
  }
  return choices(ctx, p).some((o) => sameAnswer(o, a)) ? null : err('BAD_CHOICE', 'That is not one of the options.');
}

function applyAnswer(ctx: ApplyCtx, p: Pending, a: Answer): void {
  const { state } = ctx;
  const s = sh(state);
  switch (p.kind) {
    case 'pillage':
      pillage(ctx, a.v as string);
      return;
    case 'pickDeck':
      drawCard(ctx, p.player, a.deck as Track, state.turn.current);
      return;
    case 'trimHand': {
      const pl = player(state, p.player);
      const card = a.card as string;
      pl.cards.splice(pl.cards.indexOf(card), 1);
      returnCard(state, card);
      emitSh(ctx, { type: 'cardDiscarded', player: p.player }, { card }, [p.player]);
      if (pl.cards.length > SH.handLimit) s.pending.unshift({ kind: 'trimHand', player: p.player });
      return;
    }
    case 'provision': {
      const bag = { [a.resource as string]: 1 };
      bagSub(state.bank.hand, bag);
      bagAdd(player(state, p.player).hand, bag);
      emitSh(ctx, { type: 'provision', player: p.player, resource: a.resource });
      return;
    }
    case 'relocate':
      setWarden(ctx, a.v as string, {
        owner: p.player, kind: 'warden', level: p.level, active: p.active, tags: p.tags,
      });
      emitSh(ctx, { type: 'warden', op: 'moved', player: p.player, from: p.from, v: a.v, level: p.level });
      return;
    case 'bazaarGive': {
      transfer(state, p.player, p.to, { [a.resource as string]: 1 });
      if ((player(state, p.to).hand[p.resource] ?? 0) > 0) transfer(state, p.to, p.player, { [p.resource]: 1 });
      emitSh(
        ctx, { type: 'bazaar', from: p.to, to: p.player, gave: p.resource },
        { got: a.resource }, [p.to, p.player],
      );
      return;
    }
    case 'titheTake': {
      const bag = bagClean(a.bag as Bag);
      transfer(state, p.target, p.player, bag);
      s.peek = null;
      emitSh(ctx, { type: 'tithe', player: p.player, target: p.target, count: bagTotal(bag) }, { bag }, [
        p.player, p.target,
      ]);
      return;
    }
    case 'informantTake': {
      s.peek = null;
      if (a.skip) return;
      const card = a.card as string;
      const from = player(state, p.target);
      from.cards.splice(from.cards.indexOf(card), 1);
      player(state, p.player).cards.push(card);
      emitSh(ctx, { type: 'informant', player: p.player, target: p.target }, { card }, [p.player, p.target]);
      return;
    }
    case 'turncoatRemove': {
      const v = a.v as string;
      const o = liftWarden(ctx, v);
      shelveWarden(ctx, o, v);
      s.pending.unshift({ kind: 'turncoatPlace', player: p.by, maxLevel: o.level, active: o.active });
      return;
    }
    case 'turncoatPlace':
      if (!a.skip) placeWarden(ctx, p.player, a.v as string, a.level as number, p.active, p.active ? ['fresh'] : []);
      return;
    case 'dowryGive': {
      const bag = bagClean(a.bag as Bag);
      transfer(state, p.player, p.to, bag);
      emitSh(ctx, { type: 'dowry', from: p.player, to: p.to, count: bagTotal(bag) }, { bag }, [p.player, p.to]);
      return;
    }
    case 'sabotageDiscard': {
      const bag = bagClean(a.bag as Bag);
      bagSub(player(state, p.player).hand, bag);
      bagAdd(state.bank.hand, bag);
      ctx.emit({ e: 'discarded', player: p.player, bag });
      return;
    }
  }
}

/** Resolve the head of the queue when the player has no real choice. Returns true if it did. */
export function autoResolve(ctx: ApplyCtx): boolean {
  const { state } = ctx;
  const s = sh(state);
  const p = s.pending[0];
  if (!p) return false;
  const take = (a?: Answer): true => {
    s.pending.shift();
    if (a) applyAnswer(ctx, p, a);
    return true;
  };
  switch (p.kind) {
    case 'titheTake':
    case 'dowryGive': {
      const { hand, need } = bagSource(ctx, p);
      if (need === 0) {
        if (p.kind === 'titheTake') s.peek = null;
        return take();
      }
      return bagTotal(hand) <= need ? take({ bag: bagClean(hand) }) : false;
    }
    case 'sabotageDiscard':
      return bagSource(ctx, p).need === 0 ? take() : false;
    case 'trimHand':
      return player(state, p.player).cards.length <= SH.handLimit ? take() : false;
    case 'informantTake':
      if (player(state, p.target).cards.length > 0) return false;
      s.peek = null;
      return take();
    case 'turncoatPlace':
      return choices(ctx, p).length <= 1 ? take() : false;
    case 'relocate': {
      const opts = choices(ctx, p);
      if (opts.length === 0) {
        s.pending.shift();
        shelveWarden(ctx, { owner: p.player, kind: 'warden', level: p.level, active: p.active }, p.from);
        return true;
      }
      return opts.length === 1 ? take(opts[0]) : false;
    }
    default: {
      const opts = choices(ctx, p);
      if (opts.length === 0) return take();
      return opts.length === 1 ? take(opts[0]) : false;
    }
  }
}

export const resolve: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const e = expect(state, a, ['ext']);
    if (e) return e;
    const p = sh(state).pending[0];
    if (!p || state.phase.k !== 'ext' || state.phase.id !== SH_ID) return err('NO_PROMPT', 'Nothing to decide.');
    if (a.kind !== p.kind) return err('WRONG_KIND', `The pending choice is: ${p.kind}.`);
    return checkAnswer(ctx, p, a);
  },
  apply(ctx, action) {
    const p = sh(ctx.state).pending.shift();
    if (p) applyAnswer(ctx, p, action as ExtAction);
    settle(ctx);
  },
  legal(ctx, id) {
    const { state } = ctx;
    const p = sh(state).pending[0];
    if (!p || p.player !== id || state.phase.k !== 'ext' || state.winner) return [];
    return choices(ctx, p).map((o) => ({ t: 'sh:resolve', player: id, kind: p.kind, ...o }) as Action);
  },
};
