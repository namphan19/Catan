// Generates fixtures/hand-cards.json for hand-cards.spec.ts: a deterministic base game in which
// the bots buy development cards whenever they can (and never play them), stopping at the
// player whose turn it is holding at least three kinds of development cards, so the card fan
// has neighbours to spread. All moves come from getLegalActions (the engine is the authority).
// Run: node ../../node_modules/tsx/dist/cli.mjs tools/gen-hand-log.mts > fixtures/hand-cards.json
import { applyAction, createGame, getLegalActions, type Action, type GameState } from '../../engine/src/index.ts';

const NEED = ['fiber', 'grain', 'stone'];

function pick(state: GameState): Action | null {
  const order = [state.turn.current, ...state.players.map((p) => p.id)];
  for (const actor of order) {
    const legal = getLegalActions(state, actor);
    if (legal.length === 0) continue;
    const by = (t: string) => legal.find((a) => a.t === t);
    const phase = state.phase.k;
    if (phase === 'setup') return by('placeSettlement') ?? by('placeRoad') ?? legal[0];
    if (phase === 'main') {
      const buy = by('buyCard');
      if (buy) return buy;
      // Bank trades are concrete in the legal list: turn a surplus into a missing card cost.
      const hand = state.players.find((p) => p.id === actor)?.hand ?? {};
      for (const a of legal) {
        if (a.t !== 'bankTrade') continue;
        const give = a.give as Record<string, number>;
        const get = a.get as Record<string, number>;
        const gets = Object.keys(get)[0];
        const gives = Object.keys(give)[0];
        if (NEED.includes(gets) && (hand[gets] ?? 0) < 1 && !(NEED.includes(gives) && (hand[gives] ?? 0) - give[gives] < 1)) return a;
      }
      return by('endTurn') ?? legal[0];
    }
    const prefer = by('roll') ?? by('discard') ?? by('moveBlocker') ?? by('steal') ?? by('placeRoad') ?? by('endTurn');
    return prefer && prefer.t !== 'playCard' ? prefer : legal.find((a) => a.t !== 'playCard') ?? legal[0];
  }
  return null;
}

function kinds(state: GameState, id: string): number {
  const p = state.players.find((x) => x.id === id) as unknown as { cards?: string[]; newCards?: string[] };
  return new Set([...(p.cards ?? []), ...(p.newCards ?? [])]).size;
}

let state = createGame({ seed: 'hand-cards', playerCount: 4 });
const actions: Action[] = [];
for (let step = 0; step < 20000; step += 1) {
  if (state.phase.k === 'over' || state.winner) break;
  if (state.phase.k === 'main' && kinds(state, state.turn.current) >= 3) break;
  const a = pick(state);
  if (!a) break;
  state = applyAction(state, a).state;
  actions.push(a);
}
const cur = state.players.find((p) => p.id === state.turn.current) as unknown as { cards?: string[]; newCards?: string[] };
process.stderr.write(`actions=${actions.length} phase=${state.phase.k} current=${state.turn.current} cards=${JSON.stringify(cur.cards)} new=${JSON.stringify(cur.newCards)}\n`);
process.stdout.write(JSON.stringify({ init: state.init, actions }, null, 1));
