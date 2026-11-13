// Shared helpers for base rule modules.
import type { Action, Bag, GameState, Phase, PlayerId, PlayerState, RuleError } from '../../types';
import type { ApplyCtx, Ctx } from '../../ruleset/types';
import { longestRoute } from '../../board/graph';
import { bagTotal } from '../../bag';

export const err = (code: string, message: string): RuleError => ({ code, message });

export function player(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export const hasPlayer = (state: GameState, id: unknown): id is PlayerId =>
  typeof id === 'string' && state.players.some((p) => p.id === id);

export const handSize = (p: PlayerState): number => bagTotal(p.hand);

export function seatOrder(state: GameState): PlayerId[] {
  return state.players.map((p) => p.id);
}

/** Setup placement order: seats forward, then backward (snake). */
export function setupOrder(state: GameState): PlayerId[] {
  const s = seatOrder(state);
  return [...s, ...[...s].reverse()];
}

export function nextSeat(state: GameState, id: PlayerId): PlayerId {
  const s = seatOrder(state);
  return s[(s.indexOf(id) + 1) % s.length];
}

/** Players who may act right now in the base phases (empty when nobody can). */
export function actors(state: GameState): PlayerId[] {
  const ph = state.phase;
  switch (ph.k) {
    case 'setup':
      return [setupOrder(state)[ph.idx]];
    case 'discard':
      return Object.keys(ph.owed).filter((p) => ph.owed[p] > 0);
    case 'extraBuild':
      return ph.queue.length ? [ph.queue[0]] : [];
    case 'over':
      return [];
    default:
      return [state.turn.current];
  }
}

/** Common precondition: phase kind and acting player. */
export function expect(state: GameState, a: Action, phases: Phase['k'][]): RuleError | null {
  if (state.winner) return err('GAME_OVER', 'The game is over.');
  if (!hasPlayer(state, a.player)) return err('UNKNOWN_PLAYER', `Unknown player ${String(a.player)}.`);
  if (!phases.includes(state.phase.k))
    return err('WRONG_PHASE', `${a.t} is not allowed in phase ${state.phase.k}.`);
  if (!actors(state).includes(a.player)) return err('NOT_YOUR_TURN', `It is not ${a.player}'s move.`);
  return null;
}

export function cost(ctx: Ctx, item: string): Bag {
  return ctx.rules.call('buildCost', ctx, { ...(ctx.rules.config.costs[item] ?? {}) }, item);
}

export function vp(ctx: Ctx, id: PlayerId, opts: { public: boolean } = { public: false }): number {
  return ctx.rules.call('victoryPoints', ctx, 0, id, opts);
}

/** Recompute the longest-route award after any road or settlement placement. */
export function updateLongestRoute(ctx: ApplyCtx): void {
  const { state, graph } = ctx;
  const { min } = ctx.rules.config.awards.longestRoute;
  const len: Record<PlayerId, number> = {};
  for (const p of state.players) len[p.id] = longestRoute(graph, state.pieces, p.id);
  const holder = state.awards.longestRoute ?? null;
  const max = Math.max(...Object.values(len));
  let next: PlayerId | null;
  if (holder && len[holder] >= min && len[holder] >= max) next = holder;
  else if (max < min) next = null;
  else {
    const top = Object.keys(len).filter((p) => len[p] === max);
    next = top.length === 1 ? top[0] : null;
  }
  if (next !== holder) {
    state.awards.longestRoute = next;
    ctx.emit({ e: 'awardChanged', award: 'longestRoute', from: holder, to: next });
  }
}

/** Largest force: first to reach min guards, then only a strictly larger count takes it. */
export function updateLargestForce(ctx: ApplyCtx, id: PlayerId): void {
  const { state } = ctx;
  const { min } = ctx.rules.config.awards.largestForce;
  const count = (p: PlayerId) => player(state, p).played.guard ?? 0;
  const holder = state.awards.largestForce ?? null;
  if (holder === id || count(id) < min) return;
  if (holder && count(holder) >= count(id)) return;
  state.awards.largestForce = id;
  ctx.emit({ e: 'awardChanged', award: 'largestForce', from: holder, to: id });
}

/** Best rate the player has for giving resource r. */
export function tradeRate(ctx: Ctx, id: PlayerId, r: string): number {
  const { state, rules } = ctx;
  let rate = rules.config.bankRate;
  for (const h of state.board.harbors) {
    const owns = h.vertices.some((v) => state.pieces.buildings[v]?.owner === id);
    if (!owns) continue;
    if (h.kind === 'any' || h.kind === r) rate = Math.min(rate, h.ratio);
  }
  return rate;
}

export function setPhase(ctx: ApplyCtx, phase: Phase): void {
  ctx.state.phase = phase;
  ctx.emit({ e: 'phase', phase: phase.k });
}

export function startTurn(ctx: ApplyCtx, id: PlayerId): void {
  const { state } = ctx;
  state.turn = { n: state.turn.n + 1, current: id, cardPlayed: false };
  state.trade = undefined;
  ctx.emit({ e: 'turnStarted', player: id, n: state.turn.n });
  setPhase(ctx, { k: 'preRoll' });
}

/** Move bought cards into the playable pile (end of the owner's turn or build window). */
export function releaseNewCards(p: PlayerState): void {
  p.cards.push(...p.newCards);
  p.newCards = [];
}

/** Bounded enumeration of sub-bags of exactly n cards from a hand (for discard legal moves). */
export function subBags(hand: Bag, resources: readonly string[], n: number, limit = 200): Bag[] {
  const out: Bag[] = [];
  const rs = resources.filter((r) => (hand[r] ?? 0) > 0);
  const cur: Bag = {};
  const rec = (i: number, left: number) => {
    if (out.length >= limit) return;
    if (left === 0) {
      out.push({ ...cur });
      return;
    }
    if (i >= rs.length) return;
    const r = rs[i];
    for (let k = Math.min(hand[r], left); k >= 0; k--) {
      if (k) cur[r] = k;
      else delete cur[r];
      rec(i + 1, left - k);
    }
    delete cur[r];
  };
  rec(0, n);
  return out;
}
