// Public engine API. All functions are pure: input states are never mutated; randomness comes only
// from state.rng; no Date / Math.random / I/O.
import type { Action, GameEvent, GameInit, GameState, LargeTableMode, LayoutId, PlayerId, Validation } from './types';
import type { ApplyCtx, Ctx, Rules, Ruleset } from './ruleset/types';
import { composeRules } from './ruleset/compose';
import { baseRuleset } from './rules/base';
import { strongholdsRuleset } from './rules/strongholds';
import { tidelandsRuleset } from './rules/tidelands';
import { highlandsRuleset } from './rules/highlands';
import { getGraph } from './board/graph';
import { generateBoard } from './board/generate';
import { randInt, seedRng, shuffle } from './rng';
import { emptyBag } from './bag';
import { vp } from './rules/base/helpers';

const REGISTRY: Record<string, Ruleset> = {
  base: baseRuleset,
  [strongholdsRuleset.id]: strongholdsRuleset,
  [tidelandsRuleset.id]: tidelandsRuleset,
  [highlandsRuleset.id]: highlandsRuleset,
};
const rulesCache: Record<string, Rules> = {};

/** Register an extension ruleset (e.g. a later "advanced" module). Call once at startup. */
export function registerRuleset(r: Ruleset): void {
  REGISTRY[r.id] = r;
  for (const k of Object.keys(rulesCache)) delete rulesCache[k];
}

export function getRules(ids: string[]): Rules {
  const key = ids.join('+');
  return (rulesCache[key] ??= composeRules(
    ids.map((id) => {
      const r = REGISTRY[id];
      if (!r) throw new Error(`unknown ruleset ${id}`);
      return r;
    }),
  ));
}

export function makeCtx(state: GameState): Ctx {
  return { state, graph: getGraph(state.board.layout), rules: getRules(state.init.rulesetIds) };
}

export class IllegalActionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = 'IllegalActionError';
  }
}

export interface CreateGameOptions {
  seed: string;
  playerCount: number;
  layout?: LayoutId;
  rulesets?: string[];
  vpToWin?: number;
  /** Legacy: extra build phase after each turn. Defaults to true only for 5-6 players with
   *  `largeTableMode: 'extraBuild'` (the paired mode ignores it). */
  extraBuild?: boolean;
  /** 5-6 players: 'normal' (default, turns as with 2-4 players), 'paired' (official paired players)
   *  or 'extraBuild' (legacy extra build phase). Ignored with 2-4 players. */
  largeTableMode?: LargeTableMode;
  /** Force the first player; default: uniform over the seats from the game RNG (per seed). */
  firstPlayer?: PlayerId;
  /** Ruleset options, e.g. `{ scenario: 'firstLandfall' }` for the tidelands expansion. Plain JSON. */
  options?: Record<string, unknown>;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function createGame(opts: CreateGameOptions): GameState {
  const { seed, playerCount } = opts;
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6)
    throw new Error('playerCount must be 2..6');
  const rulesetIds = opts.rulesets ?? ['base'];
  if (rulesetIds[0] !== 'base') throw new Error('the base ruleset must come first');
  const rules = getRules(rulesetIds);
  const cfg = rules.config;
  const layout: LayoutId = opts.layout ?? (playerCount >= 5 ? 'large' : 'standard');
  const ids: PlayerId[] = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  if (opts.firstPlayer !== undefined && !ids.includes(opts.firstPlayer))
    throw new Error(`firstPlayer must be one of ${ids.join(', ')}`);
  // A replay passes the stored mode back in, so it is kept as given (only 5-6 players use it).
  const largeTableMode: LargeTableMode = opts.largeTableMode ?? 'normal';
  if (!['normal', 'paired', 'extraBuild'].includes(largeTableMode))
    throw new Error(`unknown largeTableMode ${String(largeTableMode)}`);
  const init: GameInit = {
    seed,
    playerCount,
    layout,
    rulesetIds,
    vpToWin: opts.vpToWin ?? cfg.vpToWin,
    extraBuild: opts.extraBuild ?? (playerCount >= 5 && largeTableMode === 'extraBuild'),
    largeTableMode,
  };
  if (opts.options !== undefined) init.options = clone(opts.options);
  rules.prepare(init, { vpToWin: opts.vpToWin !== undefined, layout: opts.layout !== undefined });
  const spec = cfg.layouts[init.layout];
  if (!spec) throw new Error(`no layout spec for ${init.layout}`);
  const rng = seedRng(seed);
  const board =
    rules.makeBoard(rng, init) ??
    generateBoard(rng, init.layout, spec, {
      producing: (t) => !!cfg.terrainResource[t],
      hotNumbers: cfg.hotNumbers,
      genericRate: cfg.genericHarborRate,
      specificRate: cfg.specificHarborRate,
    });
  const deck = shuffle(
    rng,
    Object.entries(spec.deck).flatMap(([c, n]) => Array<string>(n).fill(c)),
  );
  // First player (base p.5/p.12: start roll; engine: one uniform pick from the game RNG). The pick
  // is always consumed so the RNG stream — and therefore replay(init, actions) — stays identical.
  const pick = randInt(rng, playerCount);
  const firstPlayer = opts.firstPlayer ?? ids[pick];
  init.firstPlayer = firstPlayer;
  const state: GameState = {
    schemaVersion: 1,
    init,
    rng,
    board,
    pieces: { buildings: {}, roads: {} },
    players: ids.map((id) => ({
      id,
      hand: emptyBag(cfg.resources),
      cards: [],
      newCards: [],
      played: {},
      supply: { ...cfg.supply },
    })),
    bank: { hand: emptyBag(cfg.resources, spec.bankPerResource), deck },
    phase: { k: 'setup', idx: 0, step: 'settlement' },
    turn: { n: 0, current: firstPlayer, cardPlayed: false },
    awards: { longestRoute: null, largestForce: null },
    ext: {},
    log: [],
  };
  const events: GameEvent[] = [];
  rules.init({ ...makeCtx(state), emit: (e) => events.push(e) });
  return state;
}

export function validateAction(state: GameState, action: Action): Validation {
  if (!action || typeof action !== 'object' || typeof action.t !== 'string' || typeof action.player !== 'string')
    return { ok: false, code: 'BAD_ACTION', message: 'An action needs a string t and player.' };
  const ctx = makeCtx(state);
  const def = ctx.rules.actions[action.t];
  if (!def) return { ok: false, code: 'UNKNOWN_ACTION', message: `Unknown action ${action.t}.` };
  const e = def.validate(ctx, action);
  return e ? { ok: false, ...e } : { ok: true };
}

/** Log line for an applied action, with its public outcome (dice, production) from the events. */
function logEntry(seq: number, action: Action, events: GameEvent[]): GameState['log'][number] {
  const entry: GameState['log'][number] = { seq, action: clone(action) };
  for (const ev of events) {
    if (ev.e === 'rolled') entry.roll = { dice: [...ev.dice], sum: ev.sum };
    if (ev.e === 'produced') {
      for (const [id, bag] of Object.entries(ev.gains)) {
        const into = ((entry.gains ??= {})[id] ??= {});
        for (const [r, n] of Object.entries(bag)) if (n) into[r] = (into[r] ?? 0) + n;
      }
    }
  }
  if (entry.gains) {
    for (const id of Object.keys(entry.gains)) if (!Object.keys(entry.gains[id]).length) delete entry.gains[id];
    if (!Object.keys(entry.gains).length) delete entry.gains;
  }
  return entry;
}

/** Apply a legal action. Throws IllegalActionError if validateAction rejects it. */
export function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const v = validateAction(state, action);
  if (!v.ok) throw new IllegalActionError(v.code, v.message);
  const draft = clone(state);
  const events: GameEvent[] = [];
  const ctx: ApplyCtx = { ...makeCtx(draft), emit: (e) => events.push(e) };
  ctx.rules.actions[action.t].apply(ctx, clone(action));
  draft.log.push(logEntry(draft.log.length, action, events));
  if (!draft.winner) {
    const w = ctx.rules.call('checkWinner', ctx, undefined);
    if (w) {
      draft.winner = w;
      draft.phase = { k: 'over' };
      events.push({ e: 'won', player: w, vp: vp(ctx, w) });
      events.push({ e: 'phase', phase: 'over' });
    }
  }
  return { state: draft, events };
}

/** Every concrete legal action for the player right now (bounded samples for huge spaces).
 *  `only` limits the scan to those action types (bots skip e.g. offerTrade to save time). */
export function getLegalActions(state: GameState, playerId: PlayerId, only?: readonly string[]): Action[] {
  if (state.winner) return [];
  const ctx = makeCtx(state);
  const defs = only ? only.map((t) => ctx.rules.actions[t]).filter(Boolean) : Object.values(ctx.rules.actions);
  return defs.flatMap((d) => d.legal(ctx, playerId));
}

/** Rebuild a game from its init (incl. seed) and action list. */
export function replay(init: GameInit, actions: Action[]): GameState {
  let s = createGame({
    seed: init.seed,
    playerCount: init.playerCount,
    layout: init.layout,
    rulesets: init.rulesetIds,
    vpToWin: init.vpToWin,
    extraBuild: init.extraBuild,
    largeTableMode: init.largeTableMode,
    firstPlayer: init.firstPlayer,
    options: init.options,
  });
  for (const a of actions) s = applyAction(s, a).state;
  return s;
}

export function victoryPoints(state: GameState, id: PlayerId, opts = { public: false }): number {
  return vp(makeCtx(state), id, opts);
}
