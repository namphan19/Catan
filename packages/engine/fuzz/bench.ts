// Engine speed benchmark: where does the time go per action? (M4 step 2 baseline)
// Usage: pnpm --filter @hexgame/engine exec tsx fuzz/bench.ts [games=10]
import {
  applyAction, cloneSim, createGame, getLegalActions, randInt, seedRng, simActors, simApply, simLegal, toSim, validateAction,
  type Action, type GameState,
} from '../src';

const W: Record<string, number> = {
  buildCity: 60, placeSettlement: 60, placeRoad: 8, buyCard: 12, playCard: 10, bankTrade: 4, offerTrade: 0,
  respondTrade: 0, confirmTrade: 0, cancelTrade: 1, endTurn: 3,
};

function main(): void {
  const games = Number(process.argv[2] ?? 10);
  const t = { legal: 0, validate: 0, apply: 0, clone: 0, actions: 0 };
  for (let g = 0; g < games; g++) {
    let s: GameState = createGame({ seed: `bench-${g}`, playerCount: 4 });
    const rng = seedRng(`bench-policy-${g}`);
    while (!s.winner && s.log.length < 20000) {
      let t0 = performance.now();
      const legal: Action[] = [];
      for (const p of s.players) legal.push(...getLegalActions(s, p.id));
      t.legal += performance.now() - t0;
      const opts = legal.filter((a) => (W[a.t] ?? 1) > 0);
      let total = 0;
      const w = opts.map((a) => (total += W[a.t] ?? 1));
      const pick = (randInt(rng, 1_000_000) / 1_000_000) * total;
      const a = opts[w.findIndex((x) => x > pick)] ?? opts[opts.length - 1];
      t0 = performance.now();
      validateAction(s, a);
      t.validate += performance.now() - t0;
      t0 = performance.now();
      JSON.parse(JSON.stringify(s));
      t.clone += performance.now() - t0;
      t0 = performance.now();
      s = applyAction(s, a).state;
      t.apply += performance.now() - t0;
      t.actions++;
    }
  }
  const per = (x: number) => `${((x / t.actions) * 1000).toFixed(0)} us`;
  console.log(`${games} games, ${t.actions} actions (${(t.actions / games).toFixed(0)} per game)`);
  console.log(`  legal (all players) ${per(t.legal)}  validate ${per(t.validate)}  apply ${per(t.apply)}  (of which ~JSON clone ${per(t.clone)})`);
  console.log(`  full game ~ ${(((t.legal + t.validate + t.apply) / games) | 0)} ms`);
  benchSim(games);
}

/** Same kind of games in sim mode: in-place moves, legal actions only for the player who must act. */
function benchSim(games: number): void {
  const t = { legal: 0, apply: 0, clone: 0, actions: 0, wall: 0 };
  for (let g = 0; g < games; g++) {
    const w0 = performance.now();
    const s = toSim(createGame({ seed: `bench-${g}`, playerCount: 4 }));
    const rng = seedRng(`bench-policy-${g}`);
    let n = 0;
    while (!s.winner && n++ < 20000) {
      const id = simActors(s)[0];
      let t0 = performance.now();
      const opts = simLegal(s, id).filter((a) => (W[a.t] ?? 1) > 0);
      t.legal += performance.now() - t0;
      let total = 0;
      const w = opts.map((a) => (total += W[a.t] ?? 1));
      const pick = (randInt(rng, 1_000_000) / 1_000_000) * total;
      const a = opts[w.findIndex((x) => x > pick)] ?? opts[opts.length - 1];
      t0 = performance.now();
      simApply(s, a, false);
      t.apply += performance.now() - t0;
      if (n % 50 === 0) {
        t0 = performance.now();
        cloneSim(s);
        t.clone += performance.now() - t0;
      }
      t.actions++;
    }
    t.wall += performance.now() - w0;
  }
  const per = (x: number, k = t.actions) => `${((x / k) * 1000).toFixed(1)} us`;
  console.log(`sim mode: ${t.actions} actions`);
  console.log(`  legal (actor only) ${per(t.legal)}  apply ${per(t.apply)}  clone ${per(t.clone, t.actions / 50)}`);
  console.log(`  full game ~ ${(t.wall / games).toFixed(1)} ms  (${((t.actions / t.wall) * 1000).toFixed(0)} actions/s)`);
}

main();
