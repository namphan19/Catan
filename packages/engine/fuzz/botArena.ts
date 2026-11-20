// Bot arena: full games between seat policies, with the fuzzer's invariants checked after every action.
// Usage: pnpm --filter @hexgame/engine arena [games=40] [lineup=hard,random,random,random] [strongholds]
//   lineup: comma-separated seat policies: easy | normal | hard | random (seats rotate every game).
import {
  applyAction, createGame, decide, expertDecide, getLegalActions, getPlayerView, randInt, seedRng, validateAction,
  type Action, type BotLevel, type GameState, type PlayerId, type RngState,
} from '../src';
import { checkInvariants, parseMode } from './randomGame';

export type Policy = BotLevel | 'random';

/** Thinking time per searched decision of 'expert' seats (env ARENA_MS, default 200 ms). */
const SEARCH_MS = Number(process.env.ARENA_MS ?? 200);
/** Optional search tuning for experiments: ARENA_HORIZON, ARENA_MARGIN, ARENA_CANDS. */
const envNum = (k: string): number | undefined => (process.env[k] === undefined ? undefined : Number(process.env[k]));
const SEARCH_OPTS = {
  clock: () => performance.now(),
  timeMs: SEARCH_MS,
  horizon: envNum('ARENA_HORIZON'),
  margin: envNum('ARENA_MARGIN'),
  candidates: envNum('ARENA_CANDS'),
};

const RANDOM_W: Record<string, number> = {
  buildCity: 60, placeSettlement: 60, placeRoad: 8, buyCard: 12, playCard: 10, bankTrade: 4,
  offerTrade: 0.3, confirmTrade: 5, cancelTrade: 2, endTurn: 3,
  'sh:improve': 40, 'sh:recruit': 12, 'sh:activate': 10, 'sh:promote': 8, 'sh:rampart': 6, 'sh:play': 3,
  'sh:moveWarden': 0.3, 'sh:displace': 3, 'sh:chase': 2, 'sh:bazaarOffer': 2, 'sh:discardCard': 1,
  'tl:buildShip': 10, 'tl:moveShip': 1, 'tl:moveCorsair': 1, 'tl:placeHarbor': 20, 'tl:claimWonder': 40,
  'tl:buildWonder': 40,
};

function randomPick(rng: RngState, legal: Action[]): Action {
  let total = 0;
  const w = legal.map((a) => (total += RANDOM_W[a.t] ?? 1));
  const pick = (randInt(rng, 1_000_000) / 1_000_000) * total;
  return legal[w.findIndex((x) => x > pick)] ?? legal[legal.length - 1];
}

export interface ArenaGame {
  seed: string;
  winner?: PlayerId;
  winnerPolicy?: Policy;
  turns: number;
  actions: number;
  /** Bot decisions the engine rejected (heuristic bugs). */
  invalid: number;
  botMs: number;
  botCalls: number;
}

export function playArenaGame(
  seed: string, seats: Policy[], rulesets: string[] = ['base'], maxActions = 20000, options?: Record<string, unknown>,
): ArenaGame {
  let s: GameState = createGame({ seed, playerCount: seats.length, rulesets, options });
  const ids = s.players.map((p) => p.id);
  const policy: Record<PlayerId, Policy> = Object.fromEntries(ids.map((id, i) => [id, seats[i]]));
  const rng = seedRng(`arena:${seed}`);
  const sum = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);
  const reserved = ((s.ext.tidelands as { castaways?: { reserved: string[] } } | undefined)?.castaways?.reserved.length) ?? 0;
  const initial = { resources: sum(s.bank.hand), cards: s.bank.deck.length + reserved };
  const out: ArenaGame = { seed, turns: 0, actions: 0, invalid: 0, botMs: 0, botCalls: 0 };

  const choose = (id: PlayerId, legal: Action[], timedOut: boolean): Action | null => {
    const pol = policy[id];
    if (pol === 'random') {
      const t = s.trade;
      const answers = legal.filter((a) => a.t === 'respondTrade' && 'accept' in a);
      if (t && t.from !== id && !t.responses[id] && answers.length)
        return answers.find((a) => (a as { accept?: boolean }).accept === (randInt(rng, 3) === 0)) ?? answers[0];
      const pool = legal.filter((a) => a.t !== 'respondTrade');
      return pool.length ? randomPick(rng, pool) : null;
    }
    const t0 = performance.now();
    const view = getPlayerView(s, id);
    const bo = { level: pol, tradeTimedOut: timedOut };
    const a = pol === 'expert' ? expertDecide(view, legal, { ...bo, search: SEARCH_OPTS }) : decide(view, legal, bo);
    out.botMs += performance.now() - t0;
    out.botCalls++;
    if (!a) return null;
    const v = validateAction(s, a);
    if (v.ok) return a;
    out.invalid++;
    if (out.invalid <= 3) console.error(`  ${seed}: invalid ${JSON.stringify(a)} in ${s.phase.k}: ${v.code}`);
    return legal.find((x) => x.t === 'endTurn') ?? legal.find((x) => x.t !== 'respondTrade' && x.t !== 'offerTrade') ?? null;
  };

  while (!s.winner) {
    if (s.log.length >= maxActions) throw new Error(`game ${seed} did not finish in ${maxActions} actions`);
    const cur = s.turn.current;
    // Responders first, so an open offer is answered before its owner decides.
    const order = [...ids.filter((id) => id !== cur), cur];
    let action: Action | null = null;
    for (const timedOut of [false, true]) {
      for (const id of order) {
        const legal = getLegalActions(s, id);
        if (legal.length) action = choose(id, legal, timedOut);
        if (action) break;
      }
      if (action) break;
    }
    if (!action) throw new Error(`stall in phase ${s.phase.k} (seed ${seed}, action #${s.log.length})`);
    s = applyAction(s, action).state;
    checkInvariants(s, initial);
  }
  out.winner = s.winner;
  out.winnerPolicy = s.winner ? policy[s.winner] : undefined;
  out.turns = s.turn.n;
  out.actions = s.log.length;
  return out;
}

function main(): void {
  const games = Number(process.argv[2] ?? 40);
  const lineup = (process.argv[3] ?? 'hard,random,random,random').split(',') as Policy[];
  const mode = process.argv[4];
  const wins: Record<string, number> = {};
  const seatsOf: Record<string, number> = {};
  for (const p of lineup) seatsOf[p] = (seatsOf[p] ?? 0) + 1;
  let turns = 0, invalid = 0, ms = 0, calls = 0;
  const t0 = Date.now();
  // ARENA_START shifts the seeds so several processes can split one big run.
  const start = Number(process.env.ARENA_START ?? 0);
  for (let i = 0; i < games; i++) {
    // Rotate seats so no policy always sits first.
    const k = i % lineup.length;
    const seats = [...lineup.slice(k), ...lineup.slice(0, k)];
    const { rulesets, options } = parseMode(mode, start + i);
    const r = playArenaGame(`arena-${start + i}`, seats, rulesets, 20000, options);
    if (options?.scenario) console.log(`  arena-${start + i} ${String(options.scenario)}: winner ${r.winnerPolicy} in ${r.turns} turns, invalid ${r.invalid}`);
    const key = r.winnerPolicy ?? 'none';
    wins[key] = (wins[key] ?? 0) + 1;
    turns += r.turns;
    invalid += r.invalid;
    ms += r.botMs;
    calls += r.botCalls;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${games} games, lineup ${lineup.join(',')} (${mode ?? 'base'}), ${secs} s`);
  for (const p of Object.keys(seatsOf)) {
    const w = wins[p] ?? 0;
    const fair = (seatsOf[p] / lineup.length) * 100;
    console.log(`  ${p.padEnd(7)} wins ${String(w).padStart(4)}  ${((w / games) * 100).toFixed(1)}%  (fair share ${fair.toFixed(0)}%)`);
  }
  if (wins.none) console.log(`  no winner: ${wins.none}`);
  const perCall = (ms / Math.max(1, calls)).toFixed(2);
  console.log(`  avg turns ${(turns / games).toFixed(1)}, invalid bot actions ${invalid}, ${perCall} ms per bot decision`);
  // Machine-readable line for summing split runs.
  console.log(`RESULT games=${games} invalid=${invalid} ${Object.entries(wins).map(([p, w]) => `${p}=${w}`).join(' ')}`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('fuzz/botArena.ts')) main();
