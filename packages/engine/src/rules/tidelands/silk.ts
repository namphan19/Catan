// Silk scenario: weavers live on small islets (no settlements there). A road or cog on a side of a
// village's hex opens trade with it: the trader takes 1 silk at once, and 1 more whenever the village's
// number is rolled (from the village while it has silk, then from the general supply; an empty village
// produces nothing). Two silk are worth 1 VP. Cogs docked at a village never move. The corsair may only be
// moved by a player who trades with a village, and may take silk instead of a resource. The game also
// ends at the end of a turn on which enough villages are empty: then the most VP (then most silk) wins.
import type { Action, ExtAction, GameState, HexId, PlayerId } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { err, expect, resumePhase, setPhase, vp } from '../base/helpers';
import { VILLAGE } from './config';
import { emitTl, hexIndex, tl, type SilkState } from './state';

export const silkOf = (state: GameState): SilkState | undefined => tl(state).silk;

/** Silk tokens: 5 per village, the rest is the general supply (50 for 8 villages, 70 for 12). */
export function initSilk(state: GameState): SilkState {
  const villages: SilkState['villages'] = {};
  for (const h of state.board.hexes) if (h.terrain === VILLAGE) villages[h.id] = { silk: 5, traders: [] };
  const n = Object.keys(villages).length;
  return {
    villages,
    supply: 10,
    silk: Object.fromEntries(state.players.map((p) => [p.id, 0])),
    // 5 of 8 villages in the rulebook; the same share of a larger map's villages.
    endAt: Math.ceil((n * 5) / 8),
    final: false,
  };
}

/** A road or cog on edge e: open trade with the villages whose hex has that side. */
export function openTrade(ctx: ApplyCtx, id: PlayerId, e: string): void {
  const s = silkOf(ctx.state);
  if (!s) return;
  for (const h of ctx.graph.edgeHexes[e]) {
    const v = s.villages[h];
    if (!v || v.traders.includes(id)) continue;
    v.traders.push(id);
    let took = 0;
    if (v.silk > 0) {
      v.silk -= 1;
      s.silk[id] += 1;
      took = 1;
    }
    emitTl(ctx, { type: 'tradeOpened', player: id, hex: h, silk: took });
  }
}

/** Silk production for a rolled number. */
export function produceSilk(ctx: ApplyCtx, sum: number): void {
  const { state } = ctx;
  const s = silkOf(state);
  if (!s) return;
  const idx = hexIndex(state);
  const order = state.players.map((p) => p.id);
  const start = order.indexOf(state.turn.current);
  const seats = [...order.slice(start), ...order.slice(0, start)];
  const gains: Record<PlayerId, number> = {};
  for (const [h, v] of Object.entries(s.villages)) {
    if (idx[h]?.token !== sum || v.silk <= 0) continue;
    for (const id of seats) {
      if (!v.traders.includes(id)) continue;
      if (v.silk > 0) v.silk -= 1;
      else if (s.supply > 0) s.supply -= 1;
      else continue;
      s.silk[id] += 1;
      gains[id] = (gains[id] ?? 0) + 1;
    }
  }
  if (Object.keys(gains).length) emitTl(ctx, { type: 'silk', gains });
}

/** Docked cogs (on a side of a village hex) never move. */
export function silkLocked(ctx: Ctx, e: string): boolean {
  const s = silkOf(ctx.state);
  return !!s && ctx.graph.edgeHexes[e].some((h) => !!s.villages[h]);
}

export const tradesWithVillage = (state: GameState, id: PlayerId): boolean =>
  Object.values(silkOf(state)?.villages ?? {}).some((v) => v.traders.includes(id));

export const emptyVillages = (s: SilkState): number => Object.values(s.villages).filter((v) => v.silk <= 0).length;

/** Winner when the game ends by empty villages: most VP, then most silk, then seat order. */
export function silkFinalWinner(ctx: Ctx): PlayerId {
  const s = silkOf(ctx.state)!;
  const ids = ctx.state.players.map((p) => p.id);
  return [...ids].sort((a, b) => vp(ctx, b) - vp(ctx, a) || s.silk[b] - s.silk[a] || ids.indexOf(a) - ids.indexOf(b))[0];
}

/** In a corsair steal: take one silk from a victim instead of a resource. */
export const stealSilk: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const e = expect(state, a, ['steal']);
    if (e) return e;
    const s = silkOf(state);
    if (!s || !tl(state).corsairSteal) return err('NOT_NOW', 'Only the corsair takes silk.');
    if (state.phase.k !== 'steal' || typeof a.target !== 'string' || !state.phase.from.includes(a.target))
      return err('BAD_TARGET', 'You cannot steal from that player.');
    if (!(s.silk[a.target] > 0)) return err('NO_SILK', 'That player has no silk.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    if (state.phase.k !== 'steal') return;
    const s = silkOf(state)!;
    const target = a.target as PlayerId;
    s.silk[target] -= 1;
    s.silk[a.player] += 1;
    tl(state).corsairSteal = false;
    emitTl(ctx, { type: 'silkStolen', from: target, to: a.player });
    setPhase(ctx, resumePhase(state, state.phase.resume));
  },
  legal(ctx, id) {
    const { state } = ctx;
    if (state.phase.k !== 'steal' || !silkOf(state)) return [];
    return state.phase.from
      .map((target: HexId) => ({ t: 'tl:stealSilk', player: id, target }) as Action)
      .filter((x) => !stealSilk.validate(ctx, x));
  },
};
