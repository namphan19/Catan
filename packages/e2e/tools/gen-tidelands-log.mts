// Generates replay fixtures for the Tidelands e2e tests: all-bot games (heuristic 'hard', every move
// checked by the engine) stopped in a main phase after `turns` turns, when cogs are on the board.
// Usage (from packages/e2e): npx tsx tools/gen-tidelands-log.mts <scenario> <players> <turns> [both] > fixtures/x.json
import { applyAction, botAct, createGame, getLegalActions, type GameState } from '../../engine/src/index.ts';

const [scenario = 'firstLandfall', players = '4', turns = '24', mode] = process.argv.slice(2);
const rulesets = mode === 'both' ? ['base', 'strongholds', 'tidelands'] : ['base', 'tidelands'];
let s: GameState = createGame({ seed: `e2e-tl-${scenario}`, playerCount: Number(players), rulesets, options: { scenario } });
// The player to move can build a cog (so the e2e test can click one onto the board).
const ready = (x: GameState) =>
  x.turn.n >= Number(turns) && x.phase.k === 'main' && Object.keys(x.pieces.ships ?? {}).length >= 3 && !x.trade &&
  getLegalActions(x, x.turn.current).some((a) => a.t === 'tl:buildShip');
for (let i = 0; i < 20000 && !s.winner && !ready(s); i++) {
  let moved = false;
  for (const p of [s.turn.current, ...s.players.map((x) => x.id)]) {
    if (!getLegalActions(s, p).length) continue;
    const a = botAct(s, p, { level: 'hard', tradeTimedOut: true });
    if (!a || a.t === 'offerTrade') continue;
    s = applyAction(s, a).state;
    moved = true;
    break;
  }
  if (!moved) {
    const p = s.players.find((x) => getLegalActions(s, x.id).length)!;
    s = applyAction(s, getLegalActions(s, p.id)[0]).state;
  }
}
if (!ready(s)) throw new Error('no suitable position found');
process.stdout.write(JSON.stringify({ init: s.init, actions: s.log.map((l) => l.action) }));
