// Diagnostics for tidelands bot games: action mix and VP sources at the end of all-bot games.
// Usage: tsx fuzz/tlDiag.ts [scenario] [games=3] [players=4] [level=hard] [both]
import { applyAction, botAct, createGame, getLegalActions, victoryPoints, type GameState, type TlState } from '../src';

const scenario = process.argv[2] ?? 'firstLandfall';
const games = Number(process.argv[3] ?? 3);
const players = Number(process.argv[4] ?? 4);
const level = (process.argv[5] ?? 'hard') as 'hard';
const rulesets = process.argv[6] === 'both' ? ['base', 'strongholds', 'tidelands'] : ['base', 'tidelands'];
for (let g = 0; g < games; g++) {
  let s: GameState = createGame({ seed: `diag-${scenario}-${g}`, playerCount: players, rulesets, options: { scenario } });
  const counts: Record<string, number> = {};
  while (!s.winner && s.log.length < 20000) {
    let moved = false;
    for (const p of [s.turn.current, ...s.players.map((x) => x.id)]) {
      if (!getLegalActions(s, p).length) continue;
      const a = botAct(s, p, { level, tradeTimedOut: true });
      if (!a) continue;
      counts[a.t] = (counts[a.t] ?? 0) + 1;
      s = applyAction(s, a).state;
      moved = true;
      break;
    }
    if (!moved) throw new Error(`stall in ${s.phase.k}`);
  }
  const x = s.ext.tidelands as TlState;
  const ships = Object.values(s.pieces.ships ?? {}).length;
  const lf = Object.values(x.landfall).reduce((a, r) => a + r.length, 0);
  console.log(`${scenario} #${g}: winner ${s.winner} turn ${s.turn.n}, cogs ${ships}, landfalls ${lf}, ` +
    `VP ${s.players.map((p) => victoryPoints(s, p.id)).join('/')}` +
    (x.silk ? `, silk ${JSON.stringify(x.silk.silk)} final=${x.silk.final}` : '') +
    (x.works ? `, wonders ${JSON.stringify(x.works.levels)}` : '') +
    (x.castaways ? `, rewards left ${Object.keys(x.castaways.rewards).length}` : ''));
  console.log('   ', Object.entries(counts).filter(([t]) => !['roll', 'endTurn'].includes(t)).map(([t, n]) => `${t}=${n}`).join(' '));
}
