// Simulation mode for bots (M4 step 2). The public engine API is pure: every applyAction deep-copies the
// whole state (incl. the growing log), which costs ~95% of its time. Search needs millions of moves,
// so a "sim state" is a GameState that is changed IN PLACE and keeps no log. It runs the very same
// rule code (base + extensions) as applyAction, so the two can never drift apart; test/sim.test.ts
// checks this move by move. Never hand a sim state to the server or a client.
import type { Action, GameState, PlayerId } from '../types';
import type { ApplyCtx } from '../ruleset/types';
import { IllegalActionError, getLegalActions, getRules, makeCtx, validateAction } from '../engine';
import { actors } from '../rules/base/helpers';

/** Fast deep copy of plain JSON data (no Dates/Maps/cycles - GameState is plain JSON). */
export function deepCopy<T>(x: T): T {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) {
    const out = new Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = deepCopy(x[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in x as Record<string, unknown>) out[k] = deepCopy((x as Record<string, unknown>)[k]);
  return out as T;
}

/** A sim copy of a real state: independent, with an empty log. */
export function toSim(state: GameState): GameState {
  const { log: _log, ...rest } = state;
  const s = deepCopy(rest) as GameState;
  s.log = [];
  return s;
}

/** Independent copy of a sim state (e.g. one per search iteration). */
export const cloneSim = (s: GameState): GameState => toSim(s);

const noEmit = (): void => {};

/**
 * Apply an action to a sim state in place. Mirrors applyAction (same rule code, same winner check)
 * but does not copy the state or append to the log. With check=false the caller guarantees the
 * action is legal (e.g. it came from getLegalActions on this state) and validation is skipped.
 */
export function simApply(s: GameState, action: Action, check = true): void {
  if (check) {
    const v = validateAction(s, action);
    if (!v.ok) throw new IllegalActionError(v.code, v.message);
  }
  const ctx: ApplyCtx = { ...makeCtx(s), emit: noEmit };
  ctx.rules.actions[action.t].apply(ctx, deepCopy(action));
  if (!s.winner) {
    const w = ctx.rules.call('checkWinner', ctx, undefined);
    if (w) {
      s.winner = w;
      s.phase = { k: 'over' };
    }
  }
}

/** Player-to-player trading is left out of simulations (it needs the other players' consent). */
export const SIM_SKIP = ['offerTrade', 'respondTrade', 'confirmTrade', 'cancelTrade'];
const simTypes: Record<string, string[]> = {};

/** Legal actions in sim mode: every action type except player trades. */
export function simLegal(s: GameState, id: PlayerId): Action[] {
  const key = s.init.rulesetIds.join('+');
  const types = (simTypes[key] ??= Object.keys(getRules(s.init.rulesetIds).actions).filter((t) => !SIM_SKIP.includes(t)));
  return getLegalActions(s, id, types);
}

/** Players who must act now (ignores optional trade answers). Empty when the game is over. */
export function simActors(s: GameState): PlayerId[] {
  return s.winner ? [] : actors(s);
}
