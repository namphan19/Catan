// Generates replay fixtures for the Highlands e2e tests: all-bot games (heuristic 'hard', every move checked
// by the engine) stopped at a position worth testing.
//   midgame: a main phase after a tribe declined (overgrown buildings on the board), nobody founding
//   found:   the moment a player must found a new tribe (phase ext / hl:found)
// Usage (from packages/e2e): npx tsx tools/gen-highlands-log.mts <midgame|found> <players> [map] > fixtures/x.json
import { applyAction, botAct, createGame, getLegalActions, type GameState, type HlState } from '../../engine/src/index.ts';

const [mode = 'midgame', players = '3', map = 'variable'] = process.argv.slice(2);
let s: GameState = createGame({ seed: `e2e-hl-${mode}`, playerCount: Number(players), rulesets: ['base', 'highlands'], options: { map } });
const hl = (x: GameState) => x.ext.highlands as HlState;
const ruins = (x: GameState) => Object.values(x.pieces.buildings).filter((b) => b.kind === 'ruin' || b.kind === 'ruinCity').length;
const ready = (x: GameState) =>
  mode === 'found'
    ? x.phase.k === 'ext' && x.phase.id === 'hl:found' && ruins(x) >= 4
    : x.phase.k === 'main' && !x.trade && ruins(x) >= 4 &&
      Object.values(hl(x).players).filter((p) => p.tribe >= 2).length >= 2 && x.turn.n >= 30;
for (let i = 0; i < 30000 && !s.winner && !ready(s); i++) {
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
