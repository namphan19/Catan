// Resources of choice: gold mines on a roll or at setup, and discovered gold mines. Everyone who is owed
// something picks in a short window (phase ext/tidelands/gold); then the interrupted phase resumes.
import type { Action, Bag, ExtAction, Phase, PlayerId } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { bagAdd, bagHas, bagSub, bagTotal, bagValid } from '../../bag';
import { RESOURCES } from '../base/config';
import { err, expect, player, setPhase, subBags } from '../base/helpers';
import { GOLD, TL_ID } from './config';
import { emitTl, hexIndex, tl } from './state';

const BASE_RES: readonly string[] = RESOURCES;

/** Base resources left in the bank (commodities of other rulesets are not on offer). */
export const bankResources = (ctx: Ctx): number => BASE_RES.reduce((s, r) => s + (ctx.state.bank.hand[r] ?? 0), 0);

export const goldPhase = (owed: Record<PlayerId, number>): Phase => ({
  k: 'ext',
  id: TL_ID,
  data: { kind: 'gold' },
  actors: Object.keys(owed).filter((p) => owed[p] > 0),
});

export const inGoldWindow = (ctx: Ctx): boolean => {
  const ph = ctx.state.phase;
  return ph.k === 'ext' && ph.id === TL_ID && (ph.data as { kind?: string })?.kind === 'gold';
};

/** How many cards the player picks now: what is owed, capped by the bank. */
export function goldDue(ctx: Ctx, id: PlayerId): number {
  return Math.min(tl(ctx.state).gold?.owed[id] ?? 0, bankResources(ctx));
}

/** Gold owed for production of `sum`: 1 per settlement, the building yield (2) per city. */
export function goldClaims(ctx: Ctx, sum: number): Record<PlayerId, number> {
  const { state, graph, rules } = ctx;
  const owed: Record<PlayerId, number> = {};
  for (const hex of state.board.hexes) {
    if (hex.terrain !== GOLD || hex.token !== sum || hex.id === state.board.blocker) continue;
    for (const v of graph.hexVertices[hex.id]) {
      const b = state.pieces.buildings[v];
      if (!b) continue;
      owed[b.owner] = (owed[b.owner] ?? 0) + (rules.config.buildingYield[b.kind] ?? 0);
    }
  }
  return owed;
}

/** Gold mines next to a vertex (starting resources of the second setup settlement). */
export function goldAround(ctx: Ctx, v: string): number {
  const idx = hexIndex(ctx.state);
  return ctx.graph.vertexHexes[v].filter((h) => idx[h]?.terrain === GOLD).length;
}

/**
 * The phase to enter for gold owed after `resume`: a gold window (owed stored), or `resume` itself when
 * nobody can be paid. Used by phaseAfterRoll, which sets the phase itself.
 */
export function goldWindowAfter(ctx: Ctx, owed: Record<PlayerId, number>, resume: Phase): Phase {
  const s = tl(ctx.state);
  const due = Object.fromEntries(Object.entries(owed).filter(([, n]) => n > 0));
  if (!Object.keys(due).length || bankResources(ctx) === 0) return resume;
  s.gold = { owed: due, resume };
  return goldPhase(due);
}

/** Owe `n` resources of choice to a player right now (opens or extends the window). */
export function oweGold(ctx: ApplyCtx, id: PlayerId, n: number): void {
  if (n <= 0) return;
  const { state } = ctx;
  const s = tl(state);
  if (s.gold && inGoldWindow(ctx)) {
    s.gold.owed[id] = (s.gold.owed[id] ?? 0) + n;
    state.phase = goldPhase(s.gold.owed);
    return;
  }
  const next = goldWindowAfter(ctx, { [id]: n }, state.phase);
  if (next !== state.phase) setPhase(ctx, next);
}

/** Close the window when everyone has picked (or the bank cannot pay anybody any more). */
function settleGold(ctx: ApplyCtx): void {
  const { state } = ctx;
  const s = tl(state);
  if (!s.gold) return;
  const left = bankResources(ctx) > 0 ? Object.keys(s.gold.owed).filter((p) => s.gold!.owed[p] > 0) : [];
  if (left.length) {
    state.phase = goldPhase(s.gold.owed);
    return;
  }
  const back = s.gold.resume;
  s.gold = null;
  setPhase(ctx, back);
}

export const takeGold: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ['ext']);
    if (e) return e;
    if (!inGoldWindow(ctx)) return err('WRONG_PHASE', 'Nothing to choose now.');
    const n = goldDue(ctx, a.player);
    if (n <= 0) return err('NOTHING_OWED', 'You have nothing to choose.');
    if (!bagValid(a.bag, BASE_RES)) return err('BAD_BAG', 'Choose resources.');
    const bag = a.bag as Bag;
    if (bagTotal(bag) !== n) return err('WRONG_AMOUNT', `Choose exactly ${n} resource(s).`);
    if (!bagHas(ctx.state.bank.hand, bag)) return err('BANK_EMPTY', 'The bank does not have those resources.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const bag = a.bag as Bag;
    bagSub(state.bank.hand, bag);
    bagAdd(player(state, a.player).hand, bag);
    tl(state).gold!.owed[a.player] = 0;
    ctx.emit({ e: 'produced', gains: { [a.player]: { ...bag } } });
    emitTl(ctx, { type: 'gold', player: a.player, bag: { ...bag } });
    settleGold(ctx);
  },
  legal(ctx, id) {
    if (expect(ctx.state, { t: 'tl:gold', player: id }, ['ext']) || !inGoldWindow(ctx)) return [];
    const n = goldDue(ctx, id);
    if (n <= 0) return [];
    return subBags(ctx.state.bank.hand, BASE_RES, n).map((bag) => ({ t: 'tl:gold', player: id, bag }) as Action);
  },
};
