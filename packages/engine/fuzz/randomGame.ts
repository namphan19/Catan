// Fuzzer: plays full random games through getLegalActions and asserts invariants after every action.
// Usage: pnpm fuzz [games=50] [startSeed=0]
import {
  applyAction, baseConfig, createGame, getLegalActions, randInt, seedRng, validateAction,
  type Action, type GameState,
} from '../src';

const WEIGHTS: Record<string, number> = {
  buildCity: 60, placeSettlement: 60, placeRoad: 8, buyCard: 12, playCard: 10, bankTrade: 4,
  offerTrade: 0.3, respondTrade: 3, confirmTrade: 5, cancelTrade: 1, endTurn: 3,
};

export interface FuzzResult {
  seed: string;
  players: number;
  winner?: string;
  actions: number;
  turns: number;
}

export function checkInvariants(s: GameState, initial: { resources: number; cards: number }): void {
  const fail = (m: string) => {
    throw new Error(`invariant: ${m} (seed ${s.init.seed}, action #${s.log.length})`);
  };
  let res = 0;
  for (const [r, n] of Object.entries(s.bank.hand)) {
    if (n < 0) fail(`bank ${r} negative`);
    res += n;
  }
  let cards = s.bank.deck.length;
  for (const p of s.players) {
    for (const [r, n] of Object.entries(p.hand)) {
      if (!Number.isInteger(n) || n < 0) fail(`${p.id} ${r}=${n}`);
      res += n;
    }
    for (const [k, n] of Object.entries(p.supply)) if (n < 0) fail(`${p.id} supply ${k} negative`);
    cards += p.cards.length + p.newCards.length + Object.values(p.played).reduce((a, b) => a + b, 0);
    // placed + supply = initial pieces
    const own = Object.values(s.pieces.buildings).filter((b) => b.owner === p.id);
    const cities = own.filter((b) => b.kind === 'city').length;
    const settlements = own.length - cities;
    const roads = Object.values(s.pieces.roads).filter((o) => o === p.id).length;
    if (roads + p.supply.road !== baseConfig.supply.road) fail(`${p.id} road count`);
    if (cities + p.supply.city !== baseConfig.supply.city) fail(`${p.id} city count`);
    if (settlements + p.supply.settlement !== baseConfig.supply.settlement) fail(`${p.id} settlement count`);
  }
  if (res !== initial.resources) fail(`resources not conserved: ${res} != ${initial.resources}`);
  if (cards !== initial.cards) fail(`cards not conserved: ${cards} != ${initial.cards}`);
  if (JSON.stringify(JSON.parse(JSON.stringify(s))) !== JSON.stringify(s)) fail('state is not plain JSON');
}

export function runRandomGame(seed: string, players: number, maxActions = 30000): FuzzResult {
  let s = createGame({ seed, playerCount: players });
  const policy = seedRng(`policy:${seed}`);
  const sumBag = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);
  const initial = { resources: sumBag(s.bank.hand), cards: s.bank.deck.length };
  checkInvariants(s, initial);
  while (!s.winner) {
    if (s.log.length >= maxActions) throw new Error(`game ${seed} did not finish in ${maxActions} actions`);
    const options: Action[] = [];
    for (const p of s.players) options.push(...getLegalActions(s, p.id));
    if (!options.length) throw new Error(`deadlock in phase ${s.phase.k} (seed ${seed})`);
    let total = 0;
    const w = options.map((a) => (total += WEIGHTS[a.t] ?? 1));
    const pick = (randInt(policy, 1_000_000) / 1_000_000) * total;
    const action = options[w.findIndex((x) => x > pick)] ?? options[options.length - 1];
    const v = validateAction(s, action);
    if (!v.ok) throw new Error(`getLegalActions returned an illegal action ${JSON.stringify(action)}: ${v.code}`);
    s = applyAction(s, action).state;
    checkInvariants(s, initial);
  }
  return { seed, players, winner: s.winner, actions: s.log.length, turns: s.turn.n };
}

function main(): void {
  const games = Number(process.argv[2] ?? 50);
  const start = Number(process.argv[3] ?? 0);
  let actions = 0;
  for (let i = start; i < start + games; i++) {
    const players = 3 + (i % 4);
    const r = runRandomGame(`fuzz-${i}`, players);
    actions += r.actions;
    console.log(`${r.seed} players=${players} winner=${r.winner} turns=${r.turns} actions=${r.actions}`);
  }
  console.log(`OK ${games} games, ${actions} actions, all invariants held`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('fuzz/randomGame.ts')) main();
