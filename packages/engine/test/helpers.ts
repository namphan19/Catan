// Test utilities. Tests may build scenarios by editing plain-JSON states directly.
import {
  applyAction, createGame, getGraph, getLegalActions, registerRuleset,
  type Action, type Bag, type EdgeId, type GameState, type Graph, type PlayerId, type Ruleset, type VertexId,
} from '../src';

/** Test-only ruleset: state.ext.forceDice overrides the dice (shows how hooks extend base). */
export const testDice: Ruleset = {
  id: 'testdice',
  requires: ['base'],
  hooks: {
    rollDice: (ctx, prev) => (ctx.state.ext.forceDice as number[] | undefined) ?? prev,
  },
};
registerRuleset(testDice);

export function newGame(playerCount = 4, seed = 'test-seed', extra: Partial<Parameters<typeof createGame>[0]> = {}) {
  return createGame({ seed, playerCount, rulesets: ['base', 'testdice'], ...extra });
}

export function act(state: GameState, action: Action): GameState {
  return applyAction(state, action).state;
}

/** Play the setup phase choosing the first legal spot every time. */
export function autoSetup(state: GameState): GameState {
  let s = state;
  while (s.phase.k === 'setup') {
    const actor = setupActor(s);
    const legal = getLegalActions(s, actor).filter((a) => a.t === 'placeSettlement' || a.t === 'placeRoad');
    if (!legal.length) throw new Error(`no setup move for ${actor}`);
    s = act(s, legal[0]);
  }
  return s;
}

export function setupActor(s: GameState): PlayerId {
  // Ask the engine who can act instead of assuming the snake starts at p1 (first player is random, D1).
  return s.players.map((p) => p.id).find((id) => getLegalActions(s, id).length > 0) ?? s.turn.current;
}

/** A fresh game placed straight into a phase with an empty board (no setup), p1 to move. */
export function blankGame(playerCount = 4, phase: GameState['phase'] = { k: 'main' }, seed = 'blank'): GameState {
  const s = newGame(playerCount, seed);
  s.phase = phase;
  s.turn = { n: 1, current: 'p1', cardPlayed: false, roll: [3, 4] };
  return s;
}

export function pl(s: GameState, id: PlayerId) {
  return s.players.find((p) => p.id === id)!;
}

export function hand(s: GameState, id: PlayerId): Bag {
  return pl(s, id).hand;
}

/** Set a player's hand, moving cards to/from the bank so totals stay conserved. */
export function setHand(s: GameState, id: PlayerId, bag: Bag): void {
  const p = pl(s, id);
  for (const r of Object.keys(p.hand)) {
    s.bank.hand[r] += p.hand[r];
    p.hand[r] = 0;
  }
  for (const [r, n] of Object.entries(bag)) {
    p.hand[r] = n;
    s.bank.hand[r] -= n;
  }
}

/** Find a simple path (no repeated vertex) of n edges starting at v. */
export function findPath(g: Graph, v: VertexId, n: number): { edges: EdgeId[]; vertices: VertexId[] } {
  const rec = (cur: VertexId, seen: VertexId[], edges: EdgeId[]): { edges: EdgeId[]; vertices: VertexId[] } | null => {
    if (edges.length === n) return { edges, vertices: seen };
    for (const e of g.vertexEdges[cur]) {
      const [a, b] = g.edgeEnds[e];
      const nxt = a === cur ? b : a;
      if (seen.includes(nxt)) continue;
      const r = rec(nxt, [...seen, nxt], [...edges, e]);
      if (r) return r;
    }
    return null;
  };
  const r = rec(v, [v], []);
  if (!r) throw new Error(`no path of ${n} from ${v}`);
  return r;
}

export function graphOf(s: GameState): Graph {
  return getGraph(s.board.layout);
}

/** Sum of all resources in hands and bank (resource conservation). */
export function totalResources(s: GameState): number {
  let t = Object.values(s.bank.hand).reduce((a, b) => a + b, 0);
  for (const p of s.players) t += Object.values(p.hand).reduce((a, b) => a + b, 0);
  return t;
}
