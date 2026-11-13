// Generates the replay fixture used by the 3D "close-up" screenshot test.
// This is a plain legal-play bot (all moves come from getLegalActions — the engine is the
// authority); it plays a deterministic 4-player game until at least two cities exist, so
// the e2e test can load a real mid-game position through the app's normal load-log path.
import {
  applyAction,
  createGame,
  getGraph,
  getLegalActions,
  type Action,
  type GameState,
  type VertexId,
} from '../../engine/src/index.ts';

/** Prefer setup spots next to grain/stone so the bot can actually afford a city. */
function spotScore(state: GameState, v: VertexId): number {
  const graph = getGraph(state.init.layout);
  const hexes = new Map(state.board.hexes.map((h) => [h.id, h]));
  let score = 0;
  for (const h of graph.vertexHexes[v] ?? []) {
    const hex = hexes.get(h);
    if (!hex) continue;
    if (hex.terrain === 'field' || hex.terrain === 'quarry') score += 4;
    if (hex.token === 6 || hex.token === 8) score += 3;
    if (hex.token === 5 || hex.token === 9) score += 1;
  }
  return score;
}

function pick(state: GameState): { action: Action; actor: string } | null {
  const order = [state.turn.current, ...state.players.map((p) => p.id)];
  for (const actor of order) {
    const legal = getLegalActions(state, actor);
    if (legal.length === 0) continue;
    const phase = state.phase.k;
    const by = (t: string) => legal.find((a) => a.t === t);

    if (phase === 'setup') {
      const settles = legal.filter((a) => a.t === 'placeSettlement');
      if (settles.length) {
        let best = settles[0];
        let bestScore = -1;
        for (const a of settles) {
          const s = spotScore(state, (a as { v: VertexId }).v) - settles.indexOf(a) * 0.001;
          if (s > bestScore) {
            best = a;
            bestScore = s;
          }
        }
        return { action: best, actor };
      }
      const road = by('placeRoad');
      if (road) return { action: road, actor };
      continue;
    }
    if (phase === 'preRoll') return { action: by('roll') ?? legal[0], actor };
    if (phase === 'discard') return { action: by('discard') ?? legal[0], actor };
    if (phase === 'moveBlocker') return { action: by('moveBlocker') ?? legal[0], actor };
    if (phase === 'steal') return { action: by('steal') ?? legal[0], actor };
    if (phase === 'freeRoads') return { action: by('placeRoad') ?? legal[0], actor };
    if (phase === 'extraBuild') {
      const a = by('buildCity') ?? by('placeSettlement') ?? by('placeRoad') ?? by('endTurn');
      return { action: a ?? legal[0], actor };
    }
    if (phase === 'main') {
      const city = by('buildCity');
      if (city) return { action: city, actor };

      // Bank trades are concrete in the legal list: convert surplus stone/timber into
      // the missing grain for a city (4:1, or better with a harbor).
      const hand = state.players.find((p) => p.id === actor)?.hand;
      if (hand) {
        const missingGrain = Math.max(0, 2 - (hand.grain ?? 0));
        const missingStone = Math.max(0, 3 - (hand.stone ?? 0));
        if (missingGrain > 0 || missingStone > 0) {
          for (const a of legal) {
            if (a.t !== 'bankTrade') continue;
            const give = a.give as Record<string, number>;
            const get = a.get as Record<string, number>;
            const surplus = ['timber', 'clay', 'fiber', 'stone'].some(
              (r) => (hand[r] ?? 0) >= (give[r] ?? 999) + 2,
            );
            if ((get.grain ?? 0) > 0 && missingGrain > 0 && surplus) return { action: a, actor };
            if ((get.stone ?? 0) > 0 && missingStone > 0 && surplus) return { action: a, actor };
          }
        }
      }
      const settle = by('placeSettlement');
      if (settle && state.players.find((p) => p.id === actor)!.supply.settlement > 1) {
        return { action: settle, actor };
      }
      return { action: by('endTurn') ?? legal[0], actor };
    }
    if (phase === 'over') return null;
    return { action: by('endTurn') ?? legal[0], actor };
  }
  return null;
}

let state = createGame({ seed: 'city-demo-3d', playerCount: 4 });
const actions: Action[] = [];
let cities = 0;
let roads = 0;

for (let step = 0; step < 9000; step += 1) {
  if (state.phase.k === 'over' || state.winner) break;
  const choice = pick(state);
  if (!choice) break;
  const res = applyAction(state, choice.action);
  state = res.state;
  actions.push(choice.action);
  cities = Object.values(state.pieces.buildings).filter((b) => b.kind === 'city').length;
  roads = Object.keys(state.pieces.roads).length;
  if (cities >= 2 && roads >= 8) break;
}

process.stderr.write(
  `actions=${actions.length} cities=${cities} roads=${roads} phase=${JSON.stringify(state.phase)} winner=${state.winner ?? '-'}\n` +
    JSON.stringify(state.players.map((p) => ({ id: p.id, hand: p.hand }))) +
    '\n',
);
process.stdout.write(JSON.stringify({ init: state.init, actions }, null, 1));
