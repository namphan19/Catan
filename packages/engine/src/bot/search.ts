// Search bot ('expert', M4 step 3): determinized Monte Carlo search over the root moves with common
// random numbers (every candidate is simulated on the same sampled world and the same dice).
//
// Each iteration:
//   1. determinize: build a full GameState from the bot's OWN PlayerView only. Hidden information is
//      sampled: opponents' hands (the per-resource total they hold together is exact: game total -
//      bank - my hand; it is dealt out at random by their hand sizes), unplayed cards (deck makeup
//      minus everything public and my own, shuffled over opponents' card counts and the deck), and a
//      fresh dice seed. The bot therefore cannot cheat: the real seed, deck and hands never reach it.
//   2. for EVERY root candidate: copy that world, apply the candidate, then play on with a fast
//      rollout policy for every player (same dice and policy seed for all candidates) until the game
//      ends or `horizon` more rounds have been played.
//   3. score: 1 / 0 if someone won, else a softmax share of a VP + production evaluation.
// Candidates are the heuristic's top moves (rankActions); the heuristic's first choice is kept unless
// another candidate's mean reward is higher by more than `margin`, so the search refines the heuristic.
// The run is incremental (step(ms)) so a server can yield to its event loop between slices.
import type { Action, Bag, GameState, PlayerId, RngState, VertexId } from '../types';
import type { PlayerView } from '../view';
import type { RulesConfig } from '../ruleset/types';
import { getGraph, legalSettlementSpots, type Graph } from '../board/graph';
import { getLegalActions, getRules, victoryPoints } from '../engine';
import { randInt, seedRng } from '../rng';
import { cloneSim, deepCopy, simActors, simApply, simLegal } from '../sim';
import { pips, rankActions } from './heuristic';

export interface SearchOptions {
  /**
   * Millisecond clock supplied by the caller (e.g. () => performance.now()). The engine itself never
   * reads a clock (purity rule); without one the search runs a fixed number of iterations and is
   * fully deterministic.
   */
  clock?: () => number;
  /** Thinking time per decision (ms); needs `clock`. */
  timeMs?: number;
  /** Hard cap on iterations (tests, reproducible runs). */
  maxIterations?: number;
  /** Root candidates kept from the heuristic ranking. */
  candidates?: number;
  /** Rounds simulated after the root move (one round = every player takes a turn). */
  horizon?: number;
  /** Leave the heuristic's first choice only for a mean reward at least this much higher. */
  margin?: number;
  /** Seed for determinizations and rollouts (default: derived from the view). */
  seed?: string;
}

export interface SearchStats {
  iterations: number;
  candidates: { action: Action; visits: number; mean: number }[];
}

const DEFAULTS = { timeMs: 1000, maxIterations: 1_000_000, candidates: 8, horizon: 2, margin: 0.01 };
/** Iteration budget when no clock is given. */
const UNTIMED_ITERATIONS = 200;

// ---------- determinization ----------

const bagSum = (b: Bag): number => Object.values(b).reduce((a, n) => a + n, 0);

function shuffleInPlace<T>(rng: RngState, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** Cards bought by `id` in the current turn (public: the buy is logged, the card is not). */
function boughtThisTurn(view: PlayerView, id: PlayerId): number {
  let n = 0;
  for (let i = view.log.length - 1; i >= 0; i--) {
    const a = view.log[i].action;
    if (a.t === 'endTurn') break;
    if (a.t === 'buyCard' && a.player === id) n++;
  }
  return n;
}

/**
 * A full game state consistent with everything the viewer knows, hidden parts sampled with `rng`.
 * Returns null when the view cannot be completed (e.g. an expansion with hidden state of its own).
 */
export function determinize(view: PlayerView, rng: RngState): GameState | null {
  const me = view.viewer;
  if (!me || view.ext) return null;
  const cfg = getRules(view.init.rulesetIds).config;
  const spec = cfg.layouts[view.init.layout];
  const mine = view.players.find((p) => p.id === me);
  if (!mine?.hand || !mine.cards || !mine.newCards) return null;

  // Resources held by opponents, per type: exact in total, dealt at random.
  const pool: string[] = [];
  for (const r of cfg.resources) {
    const n = spec.bankPerResource - (view.bank.hand[r] ?? 0) - (mine.hand[r] ?? 0);
    if (n < 0) return null;
    for (let i = 0; i < n; i++) pool.push(r);
  }
  const opps = view.players.filter((p) => p.id !== me);
  if (pool.length !== opps.reduce((a, p) => a + p.handCount, 0)) return null;
  shuffleInPlace(rng, pool);

  // Unplayed cards: deck makeup minus played (public) minus mine.
  const counts: Record<string, number> = { ...spec.deck };
  for (const p of view.players) for (const [c, n] of Object.entries(p.played)) counts[c] = (counts[c] ?? 0) - n;
  for (const c of [...mine.cards, ...mine.newCards]) counts[c] = (counts[c] ?? 0) - 1;
  const cards: string[] = [];
  for (const [c, n] of Object.entries(counts)) {
    if (n < 0) return null;
    for (let i = 0; i < n; i++) cards.push(c);
  }
  if (cards.length !== opps.reduce((a, p) => a + p.cardCount, 0) + view.bank.deckCount) return null;
  shuffleInPlace(rng, cards);

  let rp = 0;
  let cp = 0;
  const players = view.players.map((p) => {
    if (p.id === me) {
      return {
        id: p.id, hand: { ...mine.hand! }, cards: [...mine.cards!], newCards: [...mine.newCards!],
        played: { ...p.played }, supply: { ...p.supply },
      };
    }
    const hand: Bag = Object.fromEntries(cfg.resources.map((r) => [r, 0]));
    for (let i = 0; i < p.handCount; i++) hand[pool[rp++]]++;
    const held = cards.slice(cp, cp + p.cardCount);
    cp += p.cardCount;
    const fresh = Math.min(held.length, p.id === view.turn.current ? boughtThisTurn(view, p.id) : 0);
    return {
      id: p.id, hand, cards: held.slice(fresh), newCards: held.slice(0, fresh),
      played: { ...p.played }, supply: { ...p.supply },
    };
  });
  return {
    schemaVersion: 1,
    init: { ...deepCopy(view.init), seed: 'determinized' },
    rng: seedRng(`det:${randInt(rng, 2 ** 31)}:${randInt(rng, 2 ** 31)}`),
    board: deepCopy(view.board),
    pieces: deepCopy(view.pieces),
    players,
    bank: { hand: { ...view.bank.hand }, deck: cards.slice(cp) },
    phase: deepCopy(view.phase),
    turn: deepCopy(view.turn),
    awards: { ...view.awards },
    ext: {},
    log: [],
    ...(view.winner ? { winner: view.winner } : {}),
  };
}

// ---------- rollout policy (full information inside one determinization) ----------

interface RCtx {
  g: Graph;
  cfg: RulesConfig;
  token: Record<string, number | undefined>;
  res: Record<string, string | null>;
}

function rctx(s: GameState): RCtx {
  const cfg = getRules(s.init.rulesetIds).config;
  const token: RCtx['token'] = {};
  const res: RCtx['res'] = {};
  for (const h of s.board.hexes) {
    token[h.id] = h.token;
    res[h.id] = cfg.terrainResource[h.terrain] ?? null;
  }
  return { g: getGraph(s.init.layout), cfg, token, res };
}

function spotValue(r: RCtx, s: GameState, v: VertexId): number {
  let sc = 0;
  for (const h of r.g.vertexHexes[v]) if (r.res[h] && h !== s.board.blocker) sc += pips(r.token[h]);
  return sc;
}

const has = (hand: Bag, cost: Bag | undefined): boolean =>
  !!cost && Object.entries(cost).every(([k, n]) => (hand[k] ?? 0) >= n);

function bestBy(actions: Action[], score: (a: Action) => number, rng: RngState): Action {
  let bi = actions[0];
  let bs = -Infinity;
  for (const a of actions) {
    const sc = score(a) + randInt(rng, 1000) / 1000;
    if (sc > bs) {
      bs = sc;
      bi = a;
    }
  }
  return bi;
}

function pick<T>(xs: T[], rng: RngState): T {
  return xs[randInt(rng, xs.length)];
}

/** One move for `id` (legal in s, or an engine-validated construction such as a discard). */
function policy(r: RCtx, s: GameState, id: PlayerId, rng: RngState): Action | undefined {
  const ph = s.phase;
  const p = s.players.find((x) => x.id === id)!;
  const legalOf = (types: string[]) => getLegalActions(s, id, types);
  switch (ph.k) {
    case 'setup': {
      const st = legalOf(['placeSettlement']);
      if (st.length) return bestBy(st, (a) => spotValue(r, s, (a as { v: VertexId }).v), rng);
      const roads = legalOf(['placeRoad']);
      return roads.length ? pick(roads, rng) : undefined;
    }
    case 'preRoll': {
      if (p.cards.includes('guard') && !s.turn.cardPlayed && randInt(rng, 3) === 0) {
        const g = legalOf(['playCard']).find((a) => (a as { card?: string }).card === 'guard');
        if (g) return g;
      }
      return { t: 'roll', player: id };
    }
    case 'discard': {
      const hand = { ...p.hand };
      const bag: Bag = {};
      for (let i = 0; i < (ph.owed[id] ?? 0); i++) {
        let top = '';
        for (const k of Object.keys(hand)) if (!top || hand[k] > hand[top]) top = k;
        hand[top]--;
        bag[top] = (bag[top] ?? 0) + 1;
      }
      return { t: 'discard', player: id, bag };
    }
    case 'moveBlocker':
      return bestBy(legalOf(['moveBlocker']), (a) => {
        const hex = (a as { hex: string }).hex;
        let sc = 0;
        for (const v of r.g.hexVertices[hex]) {
          const b = s.pieces.buildings[v];
          if (b) sc += (b.owner === id ? -3 : 1) * pips(r.token[hex]) * (b.kind === 'city' ? 2 : 1);
        }
        return sc;
      }, rng);
    case 'steal':
      return bestBy(legalOf(['steal']), (a) => {
        const t = s.players.find((x) => x.id === (a as { target: string }).target);
        return t ? bagSum(t.hand) : 0;
      }, rng);
    case 'freeRoads': {
      const roads = legalOf(['placeRoad']);
      return roads.length ? roadMove(r, s, roads, rng) : undefined;
    }
    case 'main':
    case 'paired':
    case 'extraBuild':
      return buildMove(r, s, id, rng);
    default: {
      const l = simLegal(s, id);
      return l.length ? pick(l, rng) : undefined;
    }
  }
}

function openVertex(s: GameState, r: RCtx, v: VertexId): boolean {
  return !s.pieces.buildings[v] && r.g.vertexNeighbors[v].every((n) => !s.pieces.buildings[n]);
}

function roadMove(r: RCtx, s: GameState, roads: Action[], rng: RngState): Action {
  return bestBy(roads, (a) => {
    let sc = 0;
    for (const v of r.g.edgeEnds[(a as { e: string }).e]) if (openVertex(s, r, v)) sc = Math.max(sc, spotValue(r, s, v));
    return sc;
  }, rng);
}

function buildMove(r: RCtx, s: GameState, id: PlayerId, rng: RngState): Action {
  const p = s.players.find((x) => x.id === id)!;
  const costs = r.cfg.costs;
  const legalOf = (types: string[]) => getLegalActions(s, id, types);
  if (has(p.hand, costs.city)) {
    const c = legalOf(['buildCity']);
    if (c.length) return bestBy(c, (a) => spotValue(r, s, (a as { v: VertexId }).v), rng);
  }
  if (has(p.hand, costs.settlement)) {
    const st = legalOf(['placeSettlement']);
    if (st.length) return bestBy(st, (a) => spotValue(r, s, (a as { v: VertexId }).v), rng);
  }
  if (!s.turn.cardPlayed && p.cards.some((c) => !r.cfg.scoringCards.includes(c)) && randInt(rng, 2) === 0) {
    const cards = legalOf(['playCard']);
    if (cards.length) return pick(cards, rng);
  }
  const spots = (p.supply.settlement ?? 0) > 0 ? legalSettlementSpots(r.g, s.pieces, id, { setup: false }) : [];
  if (has(p.hand, costs.road) && (p.supply.road ?? 0) > 0 && (!spots.length || randInt(rng, 4) === 0)) {
    const roads = legalOf(['placeRoad']);
    if (roads.length) return roadMove(r, s, roads, rng);
  }
  if (has(p.hand, costs.card) && s.bank.deck.length && randInt(rng, 3) > 0) {
    const buy = legalOf(['buyCard']);
    if (buy.length) return buy[0];
  }
  // Bank trade toward the cheapest-missing goal, giving only cards the goal does not need.
  const hasSettlement = Object.values(s.pieces.buildings).some((b) => b.owner === id && b.kind === 'settlement');
  const goals = [hasSettlement && (p.supply.city ?? 0) > 0 ? costs.city : undefined, spots.length ? costs.settlement : costs.road]
    .filter((g): g is Bag => !!g);
  const miss = (g: Bag) => Object.entries(g).reduce((n, [k, c]) => n + Math.max(0, c - (p.hand[k] ?? 0)), 0);
  const goal = goals.sort((a, b) => miss(a) - miss(b))[0];
  const need = goal && Object.keys(goal).find((k) => (p.hand[k] ?? 0) < goal[k]);
  if (goal && need) {
    const trades = legalOf(['bankTrade']).filter((a) => {
      const t = a as { give: Bag; get: Bag };
      const [give, k] = Object.entries(t.give)[0];
      return !!t.get[need] && (p.hand[give] ?? 0) - k >= (goal[give] ?? 0);
    });
    if (trades.length) return pick(trades, rng);
  }
  return { t: 'endTurn', player: id };
}

// ---------- evaluation ----------

function production(r: RCtx, s: GameState, id: PlayerId): number {
  let n = 0;
  for (const [v, b] of Object.entries(s.pieces.buildings)) {
    if (b.owner !== id) continue;
    const y = r.cfg.buildingYield[b.kind] ?? 1;
    for (const h of r.g.vertexHexes[v]) if (r.res[h] && h !== s.board.blocker) n += pips(r.token[h]) * y;
  }
  return n;
}

/** Reward in [0, 1] for `me`: 1/0 when the game is decided, else a softmax share of position scores. */
export function evaluate(s: GameState, me: PlayerId): number {
  if (s.winner) return s.winner === me ? 1 : 0;
  const r = rctx(s);
  let mine = 0;
  let total = 0;
  for (const p of s.players) {
    const playable = p.cards.filter((c) => !r.cfg.scoringCards.includes(c)).length;
    const sc =
      victoryPoints(s, p.id) + production(r, s, p.id) / 12 + Math.min(bagSum(p.hand), 7) * 0.06 + playable * 0.25;
    const e = Math.exp(sc * 1.1);
    total += e;
    if (p.id === me) mine = e;
  }
  return mine / total;
}

// ---------- the search ----------

export class SearchRun {
  done = false;
  private readonly view: PlayerView;
  private readonly me: PlayerId;
  private readonly cands: Action[];
  private readonly visits: number[];
  private readonly totals: number[];
  private readonly rng: RngState;
  private readonly o: typeof DEFAULTS;
  private readonly clock?: () => number;
  private iterations = 0;
  private spent = 0;
  private failures = 0;

  constructor(view: PlayerView, candidates: Action[], opts: SearchOptions = {}) {
    this.view = view;
    this.me = view.viewer!;
    this.cands = candidates;
    this.visits = candidates.map(() => 0);
    this.totals = candidates.map(() => 0);
    const { clock, ...rest } = opts;
    this.clock = clock;
    this.o = { ...DEFAULTS, ...stripUndefined(rest) };
    this.rng = seedRng(opts.seed ?? `search:${this.me}:${view.log.length}`);
    if (candidates.length <= 1) this.done = true;
  }

  private broken(): boolean {
    return this.failures > 20 && this.failures > this.iterations;
  }

  private outOfBudget(): boolean {
    const cap = this.clock ? this.o.maxIterations : Math.min(this.o.maxIterations, UNTIMED_ITERATIONS);
    return this.iterations >= cap || (!!this.clock && this.spent >= this.o.timeMs) || this.broken();
  }

  /**
   * Run iterations for about `ms` milliseconds (with a clock; without one, a single iteration).
   * Returns true when the search is finished.
   */
  step(ms: number): boolean {
    if (this.done) return true;
    const clock = this.clock;
    if (!clock) {
      if (!this.outOfBudget()) this.iterate();
    } else {
      const t0 = clock();
      const start = this.spent;
      while (clock() - t0 < ms) {
        this.spent = start + (clock() - t0);
        if (this.outOfBudget()) break;
        this.iterate();
      }
      this.spent = start + (clock() - t0);
    }
    if (this.outOfBudget()) this.done = true;
    return this.done;
  }

  /**
   * The candidate with the best mean reward. The heuristic's first choice (candidate 0) is kept unless
   * another one beats it by more than `margin`: small differences are mostly noise.
   */
  best(): Action | null {
    if (this.cands.length === 1) return this.cands[0];
    const mean = (i: number) => (this.visits[i] ? this.totals[i] / this.visits[i] : -1);
    if (!this.visits[0]) return null;
    let bi = 0;
    for (let i = 1; i < this.cands.length; i++) if (mean(i) > mean(bi)) bi = i;
    return mean(bi) - mean(0) > this.o.margin ? this.cands[bi] : this.cands[0];
  }

  stats(): SearchStats {
    return {
      iterations: this.iterations,
      candidates: this.cands.map((action, i) => ({
        action, visits: this.visits[i], mean: this.visits[i] ? this.totals[i] / this.visits[i] : 0,
      })),
    };
  }

  /**
   * One iteration with common random numbers: a single determinization and a single rollout seed
   * are shared by every candidate, so their reward differences reflect the moves, not the dice.
   */
  private iterate(): void {
    const det = determinize(this.view, this.rng);
    if (!det) {
      this.failures++;
      return;
    }
    const seed = `${randInt(this.rng, 2 ** 31)}:${randInt(this.rng, 2 ** 31)}`;
    for (let i = 0; i < this.cands.length; i++) {
      const s = cloneSim(det);
      s.rng = seedRng(`dice:${seed}`);
      try {
        simApply(s, this.cands[i]);
      } catch {
        this.failures++;
        continue;
      }
      this.rollout(s, seedRng(`policy:${seed}`));
      this.visits[i]++;
      this.totals[i] += evaluate(s, this.me);
    }
    this.iterations++;
  }

  private rollout(s: GameState, rng: RngState): void {
    const r = rctx(s);
    const limit = s.turn.n + this.o.horizon * s.players.length;
    for (let steps = 0; !s.winner && s.turn.n <= limit && steps < 3000; steps++) {
      const id = simActors(s)[0];
      if (!id) break;
      const a = policy(r, s, id, rng);
      try {
        if (!a) throw new Error('no move');
        simApply(s, a);
      } catch {
        const l = simLegal(s, id);
        if (!l.length) break;
        simApply(s, l[0], false);
      }
    }
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Phases whose decisions are searched; others (discards, trades, expansion windows) use the heuristic. */
const SEARCHED = new Set(['setup', 'preRoll', 'main', 'paired', 'extraBuild', 'moveBlocker', 'steal', 'freeRoads']);
const NOT_SEARCHED = new Set(['offerTrade', 'respondTrade', 'confirmTrade', 'cancelTrade', 'discard']);

/**
 * Root candidates for a search, or null if this decision should be left to the heuristic bot.
 * Keeps the heuristic's top `k` moves and always the option to end the turn.
 */
export function searchCandidates(view: PlayerView, legal: Action[], k = DEFAULTS.candidates): Action[] | null {
  if (view.ext || view.trade || !SEARCHED.has(view.phase.k)) return null;
  const pool = legal.filter((a) => !NOT_SEARCHED.has(a.t));
  if (pool.length < 2) return null;
  if (view.phase.k === 'preRoll' && !pool.some((a) => a.t === 'playCard')) return null;
  const out = rankActions(view, pool).map((x) => x.action).slice(0, k);
  const end = pool.find((a) => a.t === 'endTurn');
  if (end && !out.includes(end)) out.push(end);
  return out;
}

/** Synchronous search (arena, tests): the chosen action, or null to fall back to the heuristic. */
export function searchDecide(view: PlayerView, legal: Action[], opts: SearchOptions = {}): Action | null {
  const cands = searchCandidates(view, legal, opts.candidates);
  if (!cands) return null;
  const run = new SearchRun(view, cands, opts);
  while (!run.step(50));
  return run.best();
}
