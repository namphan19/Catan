// Public engine API. All functions are pure: input states are never mutated; randomness comes only
// from state.rng; no Date / Math.random / I/O.
import type { Action, GameEvent, GameInit, GameState, LayoutId, PlayerId, Validation } from './types';
import type { ApplyCtx, Ctx, Rules, Ruleset } from './ruleset/types';
import { composeRules } from './ruleset/compose';
import { baseRuleset } from './rules/base';
import { getGraph } from './board/graph';
import { generateBoard } from './board/generate';
import { seedRng, shuffle } from './rng';
import { emptyBag } from './bag';
import { vp } from './rules/base/helpers';

const REGISTRY: Record<string, Ruleset> = { base: baseRuleset };
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
  /** Extra build phase after each turn. Defaults to true for 5-6 players. */
  extraBuild?: boolean;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function createGame(opts: CreateGameOptions): GameState {
  const { seed, playerCount } = opts;
  if (!Number.isInteger(playerCount) || playerCount < 3 || playerCount > 6)
    throw new Error('playerCount must be 3..6');
  const rulesetIds = opts.rulesets ?? ['base'];
  if (rulesetIds[0] !== 'base') throw new Error('the base ruleset must come first');
  const rules = getRules(rulesetIds);
  const cfg = rules.config;
  const layout: LayoutId = opts.layout ?? (playerCount >= 5 ? 'large' : 'standard');
  const init: GameInit = {
    seed,
    playerCount,
    layout,
    rulesetIds,
    vpToWin: opts.vpToWin ?? cfg.vpToWin,
    extraBuild: opts.extraBuild ?? playerCount >= 5,
  };
  const spec = cfg.layouts[layout];
  const rng = seedRng(seed);
  const board = generateBoard(rng, layout, spec, {
    producing: (t) => !!cfg.terrainResource[t],
    hotNumbers: cfg.hotNumbers,
    genericRate: cfg.genericHarborRate,
    specificRate: cfg.specificHarborRate,
  });
  const deck = shuffle(
    rng,
    Object.entries(spec.deck).flatMap(([c, n]) => Array<string>(n).fill(c)),
  );
  const ids: PlayerId[] = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
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
    turn: { n: 0, current: ids[0], cardPlayed: false },
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

/** Apply a legal action. Throws IllegalActionError if validateAction rejects it. */
export function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const v = validateAction(state, action);
  if (!v.ok) throw new IllegalActionError(v.code, v.message);
  const draft = clone(state);
  const events: GameEvent[] = [];
  const ctx: ApplyCtx = { ...makeCtx(draft), emit: (e) => events.push(e) };
  ctx.rules.actions[action.t].apply(ctx, clone(action));
  draft.log.push({ seq: draft.log.length, action: clone(action) });
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

/** Every concrete legal action for the player right now (bounded samples for huge spaces). */
export function getLegalActions(state: GameState, playerId: PlayerId): Action[] {
  if (state.winner) return [];
  const ctx = makeCtx(state);
  return Object.values(ctx.rules.actions).flatMap((d) => d.legal(ctx, playerId));
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
  });
  for (const a of actions) s = applyAction(s, a).state;
  return s;
}

export function victoryPoints(state: GameState, id: PlayerId, opts = { public: false }): number {
  return vp(makeCtx(state), id, opts);
}
