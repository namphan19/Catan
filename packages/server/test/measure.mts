import { applyAction, createGame, getLegalActions, randInt, seedRng, type Action, type GameState } from '@hexgame/engine';
const WEIGHTS: Record<string, number> = {
  buildCity: 60, placeSettlement: 60, placeRoad: 8, buyCard: 12, playCard: 10, bankTrade: 4,
  offerTrade: 0.3, respondTrade: 3, confirmTrade: 5, cancelTrade: 1, endTurn: 3, roll: 2,
  discard: 2, moveBlocker: 2, steal: 2,
};
function run(seed: string, vp: number, maxActions: number) {
  let s: GameState = createGame({ seed, playerCount: 3, vpToWin: vp });
  const policy = seedRng(`policy:${seed}`);
  let actions = 0;
  while (!s.winner && actions < maxActions) {
    const options: Action[] = [];
    for (const p of s.players) options.push(...getLegalActions(s, p.id));
    if (!options.length) { return -1; }
    let total = 0;
    const w = options.map((a) => (total += WEIGHTS[a.t] ?? 1));
    const pick = (randInt(policy, 1_000_000) / 1_000_000) * total;
    const action = options[w.findIndex((x) => x > pick)] ?? options[options.length - 1];
    s = applyAction(s, action).state;
    actions++;
  }
  return actions;
}
const lens: number[] = [];
for (let i = 0; i < 50; i++) {
  const r = run(`u${i}`, 3, 3000);
  if (r < 0) { console.log(`stall at u${i}`); continue; }
  lens.push(r);
}
lens.sort((a, b) => a - b);
console.log(`min=${lens[0]} median=${lens[Math.floor(lens.length / 2)]} p90=${lens[Math.floor(lens.length * 0.9)]} max=${lens[lens.length - 1]}`);
