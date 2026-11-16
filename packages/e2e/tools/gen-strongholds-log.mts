// Generates the replay fixture for the Strongholds e2e test: a deterministic 4-player expansion
// game played by a weighted legal-move bot (every move comes from getLegalActions) until the
// position shows wardens, a rampart, improvements and advance cards during someone's main phase.
// Usage (from packages/e2e): npx tsx tools/gen-strongholds-log.mts > fixtures/strongholds-game.json
import {
  applyAction, createGame, getLegalActions, randInt, seedRng,
  type Action, type GameState, type ShState,
} from '../../engine/src/index.ts';

const WEIGHTS: Record<string, number> = {
  buildCity: 40, placeSettlement: 40, placeRoad: 6, bankTrade: 3, offerTrade: 0, respondTrade: 0,
  endTurn: 4, 'sh:improve': 60, 'sh:recruit': 40, 'sh:activate': 30, 'sh:promote': 10, 'sh:rampart': 60,
  'sh:play': 1, 'sh:moveWarden': 0.2, 'sh:displace': 1, 'sh:chase': 1, 'sh:discardCard': 1,
};

function ready(s: GameState): boolean {
  if (s.phase.k !== 'main') return false;
  const x = s.ext.strongholds as ShState;
  const me = s.turn.current;
  const wardens = Object.values(s.pieces.occupants ?? {});
  const mine = s.players.find((p) => p.id === me);
  return (
    wardens.length >= 2 &&
    (x.ramparts.length >= 1 || (mine?.cards.length ?? 0) >= 1) &&
    Object.values(x.levels[me]).some((n) => n >= 1) &&
    x.pending.length === 0
  );
}

let s = createGame({ seed: 'e2e-strongholds', playerCount: 4, rulesets: ['base', 'strongholds'] });
const policy = seedRng('e2e-strongholds-policy');
for (let i = 0; i < 20000 && !s.winner && !ready(s); i++) {
  const opts: Action[] = s.players.flatMap((p) => getLegalActions(s, p.id));
  let total = 0;
  const w = opts.map((a) => (total += WEIGHTS[a.t] ?? 1));
  const pick = (randInt(policy, 1_000_000) / 1_000_000) * total;
  s = applyAction(s, opts[w.findIndex((v) => v > pick)] ?? opts[opts.length - 1]).state;
}
if (!ready(s)) throw new Error('no suitable position found');
process.stdout.write(JSON.stringify({ init: s.init, actions: s.log.map((l) => l.action) }));
