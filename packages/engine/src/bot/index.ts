// Bot entry points. botAct() is what a server (or a test) calls: it builds the bot's own redacted
// view, so the decision never sees hidden information, and checks the result against the engine.
import type { Action, GameState, PlayerId } from '../types';
import type { PlayerView } from '../view';
import { getLegalActions, validateAction } from '../engine';
import { getPlayerView } from '../view';
import { bagHas } from '../bag';
import { decide, type BotOptions } from './heuristic';
import { SearchRun, searchCandidates, searchDecide, type SearchOptions } from './search';

export { decide, pips, rankActions, type BotLevel, type BotOptions } from './heuristic';
export {
  SearchRun, determinize, evaluate, searchCandidates, searchDecide, type SearchOptions, type SearchStats,
} from './search';

/**
 * The 'expert' bot: searches the main decisions (bot/search.ts) and leaves trades, discards and
 * expansion windows to the 'hard' heuristic. When the search would end the turn, the heuristic may
 * still try a player trade first.
 */
export function expertDecide(view: PlayerView, legal: Action[], opts: BotOptions & { search?: SearchOptions } = {}): Action | null {
  const hard = { ...opts, level: 'hard' as const };
  const a = searchDecide(view, legal, opts.search);
  if (!a) return decide(view, legal, hard);
  if (a.t === 'endTurn') {
    const h = decide(view, legal, hard);
    if (h?.t === 'offerTrade') return h;
  }
  return a;
}

/** How long a bot's own trade offer waits for human answers before the bot settles it (ms).
 *  Long enough to read the offer and think; shown to humans as a countdown. */
export const BOT_TRADE_WAIT_MS = 30_000;

/**
 * Whether the open offer should still wait for a human: someone who is not a bot, is not the
 * offerer, has not answered yet and holds the requested cards (could accept). When nobody could,
 * waiting only stalls the game, so the bot may settle its offer at once.
 */
export function tradeAwaitsHuman(state: GameState, isBot: (id: PlayerId) => boolean): boolean {
  const t = state.trade;
  if (!t) return false;
  return state.players.some(
    (p) => p.id !== t.from && !isBot(p.id) && !t.responses[p.id] && bagHas(p.hand, t.get),
  );
}

/** Short grace for an offer no human could accept: time to decline or counter, not to think. */
export const BOT_TRADE_GRACE_MS = 3_000;

/**
 * How long a bot's open offer waits (ms since it was made) before the bot settles it: the full
 * `waitMs` while a human could still accept, otherwise only a short grace (never longer than waitMs).
 */
export function botTradeWaitMs(state: GameState, isBot: (id: PlayerId) => boolean, waitMs = BOT_TRADE_WAIT_MS): number {
  return tradeAwaitsHuman(state, isBot) ? waitMs : Math.min(waitMs, BOT_TRADE_GRACE_MS);
}

export type BotPlan =
  | { kind: 'now'; action: Action | null }
  /** Step `run` (run.step(ms)) until it is done, then call finish() for the checked action. */
  | { kind: 'search'; run: SearchRun; finish: () => Action | null };

/**
 * Incremental version of botAct for servers: decisions the expert searches come back as a SearchRun
 * the caller steps in small slices (so it can keep serving other requests); everything else is
 * answered at once. finish() must be called on the same state the plan was made for.
 */
export function planBot(state: GameState, id: PlayerId, opts: BotOptions & { search?: SearchOptions } = {}): BotPlan {
  if (opts.level !== 'expert' || state.winner) return { kind: 'now', action: botAct(state, id, opts) };
  const legal = getLegalActions(state, id);
  const view = getPlayerView(state, id);
  const cands = legal.length ? searchCandidates(view, legal, opts.search?.candidates) : null;
  if (!cands) return { kind: 'now', action: botAct(state, id, { ...opts, level: 'hard' }) };
  const run = new SearchRun(view, cands, opts.search);
  const finish = (): Action | null => {
    let a = run.best();
    if (a?.t === 'endTurn') {
      const h = decide(view, legal, { ...opts, level: 'hard' });
      if (h?.t === 'offerTrade') a = h;
    }
    if (a && validateAction(state, a).ok) return a;
    return botAct(state, id, { ...opts, level: 'hard' });
  };
  return { kind: 'search', run, finish };
}

/** The bot's next action for `id`, or null when it has nothing to do right now. */
export function botAct(
  state: GameState, id: PlayerId, opts: BotOptions & { search?: SearchOptions } = {},
): Action | null {
  if (state.winner) return null;
  const legal = getLegalActions(state, id);
  if (!legal.length) return null;
  const view = getPlayerView(state, id);
  const a = opts.level === 'expert' ? expertDecide(view, legal, opts) : decide(view, legal, opts);
  if (!a) return null;
  if (validateAction(state, a).ok) return a;
  // Safety net: a heuristic slip must never stall a game. Fall back to a listed legal action,
  // preferring ones that move the game on.
  const order = ['endTurn', 'roll', 'cancelTrade', 'discard', 'moveBlocker', 'steal', 'placeRoad', 'placeSettlement'];
  for (const t of order) {
    const x = legal.find((l) => l.t === t);
    if (x) return x;
  }
  return legal.find((l) => l.t !== 'offerTrade' && l.t !== 'respondTrade') ?? null;
}
