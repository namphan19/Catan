// Corsair Coves scenario: corsairs hold forts on the western islets and their fleet sails a loop between
// the islands. Every player starts with a settlement and a cog on the home island and builds ONE line of
// cogs, always by the shortest way, to their landing (where they may settle) and on to their fort.
// Guard cards turn the line's first plain cog into a warship. At the end of an action phase in which the
// line reaches the fort, the player attacks it. Taking the fort (3 wins) is needed to win. There is no
// blocker: a 7 lets the roller rob any player. After each roll the fleet sails (the lower die) and attacks
// players next to its hex: stronger fleet = lose cards, stronger player = 1 resource of choice.
import type { Action, Bag, EdgeId, ExtAction, GameState, PlayerId, VertexId } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { bagToList } from '../../bag';
import { randInt } from '../../rng';
import { err, expect, handSize, player, vp, winningActor } from '../base/helpers';
import { covesGeometry } from './maps';
import { emitTl, isSeaEdge, tl, type CovesState } from './state';

export const LAIRS = 3;

export const covesOf = (state: GameState): CovesState | undefined => tl(state).coves;

/** Seats, starting pieces and the deck for this table size. */
export function initCoves(state: GameState): CovesState {
  const geo = covesGeometry(state.board.layout);
  const ids = state.players.map((p) => p.id);
  const c: CovesState = {
    fleet: 0,
    loop: geo.loop,
    calm: geo.calm,
    seats: {},
    lines: {},
    war: {},
    lairs: {},
  };
  ids.forEach((id, i) => {
    c.seats[id] = geo.seats[i];
    c.lines[id] = [];
    c.war[id] = 0;
    c.lairs[id] = LAIRS;
  });
  // No blocker in this scenario; 3 players play without relic cards, larger tables use them as guards.
  state.board.blocker = '';
  state.bank.deck = state.players.length === 3
    ? state.bank.deck.filter((x) => x !== 'relic')
    : state.bank.deck.map((x) => (x === 'relic' ? 'guard' : x));
  return c;
}

/** Put the starting settlement and cog of each player (after the expansion state exists). */
export function placeCovesStart(ctx: ApplyCtx): void {
  const { state, graph } = ctx;
  const c = covesOf(state)!;
  for (const p of state.players) {
    const seat = c.seats[p.id];
    state.pieces.buildings[seat.start] = { owner: p.id, kind: 'settlement' };
    // The fort is a settlement piece of the player held by the corsairs until it is taken.
    p.supply.settlement -= 2;
    const dist = shortestTo(ctx, seat.landing);
    const first = graph.vertexEdges[seat.start]
      .filter((e) => isSeaEdge(ctx, e))
      .sort((a, b) => (dist[otherEnd(ctx, a, seat.start)] ?? 99) - (dist[otherEnd(ctx, b, seat.start)] ?? 99))[0];
    state.pieces.ships![first] = p.id;
    p.supply.ship -= 1;
    c.lines[p.id] = [first];
  }
  c.fleet = 0;
  tl(state).corsair = c.loop[0] ?? null;
}

const otherEnd = (ctx: Ctx, e: EdgeId, v: VertexId): VertexId => ctx.graph.edgeEnds[e].find((u) => u !== v)!;

/** Sea distance (edges) from every vertex to `target`, over edges with a sea side (pieces ignored). */
export function shortestTo(ctx: Ctx, target: VertexId): Record<VertexId, number> {
  const { graph } = ctx;
  const dist: Record<VertexId, number> = { [target]: 0 };
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    for (const e of graph.vertexEdges[v]) {
      if (!isSeaEdge(ctx, e)) continue;
      const u = otherEnd(ctx, e, v);
      if (dist[u] !== undefined) continue;
      dist[u] = dist[v] + 1;
      queue.push(u);
    }
  }
  return dist;
}

/** The open end of a player's line (where the next cog goes). */
export function lineEnd(ctx: Ctx, id: PlayerId): VertexId {
  const c = covesOf(ctx.state)!;
  let v = c.seats[id].start;
  for (const e of c.lines[id]) v = otherEnd(ctx, e, v);
  return v;
}

/** The line's current goal: the landing, then the fort; null once the fort is reached. */
function lineGoal(ctx: Ctx, id: PlayerId): VertexId | null {
  const c = covesOf(ctx.state)!;
  const seat = c.seats[id];
  const end = lineEnd(ctx, id);
  if (end === seat.fort) return null;
  const passed = [seat.start, ...lineVertices(ctx, id)].includes(seat.landing);
  return passed ? seat.fort : seat.landing;
}

function lineVertices(ctx: Ctx, id: PlayerId): VertexId[] {
  const c = covesOf(ctx.state)!;
  let v = c.seats[id].start;
  const out: VertexId[] = [];
  for (const e of c.lines[id]) {
    v = otherEnd(ctx, e, v);
    out.push(v);
  }
  return out;
}

/** Coves: a new cog must extend the player's line one step closer to its goal. */
export function covesShipError(ctx: Ctx, id: PlayerId, e: EdgeId): string | null {
  const c = covesOf(ctx.state);
  if (!c) return null;
  const goal = lineGoal(ctx, id);
  if (!goal) return 'Your line already reaches your fort.';
  const end = lineEnd(ctx, id);
  if (!ctx.graph.edgeEnds[e].includes(end)) return 'Cogs only extend your line at its open end.';
  const dist = shortestTo(ctx, goal);
  if ((dist[otherEnd(ctx, e, end)] ?? Infinity) !== (dist[end] ?? Infinity) - 1)
    return 'Your line must take the shortest way.';
  return null;
}

export const reachedFort = (ctx: Ctx, id: PlayerId): boolean => {
  const c = covesOf(ctx.state);
  return !!c && c.lairs[id] > 0 && lineEnd(ctx, id) === c.seats[id].fort;
};

/** Settlements: none on the corsairs' islets except on your own landing once your line reaches it. */
export function covesSettleBan(ctx: Ctx, id: PlayerId, v: VertexId): string | null {
  const c = covesOf(ctx.state);
  if (!c) return null;
  const pirate = ctx.graph.vertexHexes[v].some((h) => ctx.state.board.hexes.find((x) => x.id === h)?.region === 'p');
  if (!pirate) return null;
  if (v === c.seats[id].landing && lineVertices(ctx, id).includes(v)) return null;
  return 'The corsairs hold that islet.';
}

/** Guard card in this scenario: the first plain cog of the line (from its start) becomes a warship. */
export function covesGuardError(ctx: Ctx, id: PlayerId): string | null {
  const c = covesOf(ctx.state);
  if (!c) return null;
  return c.war[id] < c.lines[id].length ? null : 'You have no plain cog in your line to arm.';
}

export function armShip(ctx: ApplyCtx, id: PlayerId): void {
  const c = covesOf(ctx.state)!;
  c.war[id] += 1;
  emitTl(ctx, { type: 'warship', player: id, e: c.lines[id][c.war[id] - 1], war: c.war[id] });
}

/** Remove the last n cogs of a line (closest to the fort). */
function sink(ctx: ApplyCtx, id: PlayerId, n: number): EdgeId[] {
  const { state } = ctx;
  const c = covesOf(state)!;
  const gone: EdgeId[] = [];
  for (let i = 0; i < n && c.lines[id].length > 1; i++) {
    const e = c.lines[id].pop()!;
    delete state.pieces.ships![e];
    player(state, id).supply.ship += 1;
    gone.push(e);
  }
  c.war[id] = Math.min(c.war[id], c.lines[id].length);
  return gone;
}

/** End of an action phase with the line at the fort: battle (a die against the line's warships). */
export function attackFort(ctx: ApplyCtx, id: PlayerId): void {
  const { state } = ctx;
  const c = covesOf(state)!;
  const pirates = randInt(state.rng, 6) + 1;
  const war = c.war[id];
  let result: string;
  let sunk: EdgeId[] = [];
  if (war > pirates) {
    c.lairs[id] -= 1;
    result = 'won';
    if (c.lairs[id] === 0) {
      const fort = c.seats[id].fort;
      state.pieces.buildings[fort] = { owner: id, kind: 'settlement' };
      result = 'taken';
      if (Object.values(c.lairs).every((n) => n === 0)) {
        c.fleet = -1;
        tl(state).corsair = null;
      }
    }
  } else {
    sunk = sink(ctx, id, war < pirates ? 2 : 1);
    result = 'lost';
  }
  emitTl(ctx, { type: 'fortBattle', player: id, pirates, war, result, sunk, lairs: c.lairs[id] });
}

/** After a roll: the fleet sails the lower die and attacks everyone with a building next to its hex.
 *  Returns resources of choice owed to players who beat it. */
export function sailFleet(ctx: ApplyCtx, dice: number[]): Record<PlayerId, number> {
  const { state, graph, rules } = ctx;
  const c = covesOf(state);
  if (!c || c.fleet < 0 || !c.loop.length) return {};
  const steps = Math.min(...dice.slice(0, 2));
  c.fleet = (c.fleet + steps) % c.loop.length;
  const hex = c.loop[c.fleet];
  tl(state).corsair = hex;
  emitTl(ctx, { type: 'fleet', hex, steps });
  if (c.calm.includes(hex)) return {};
  const owed: Record<PlayerId, number> = {};
  const hit = new Set<PlayerId>();
  for (const v of graph.hexVertices[hex]) {
    const b = state.pieces.buildings[v];
    if (b) hit.add(b.owner);
  }
  for (const p of state.players) {
    if (!hit.has(p.id)) continue;
    const war = c.war[p.id];
    if (steps > war) {
      const cities = Object.values(state.pieces.buildings).filter((b) => b.owner === p.id && b.kind === 'city').length;
      const lose = Math.min(handSize(p), 1 + cities);
      const lost: Bag = {};
      for (let i = 0; i < lose; i++) {
        const cards = bagToList(p.hand, rules.config.resources);
        const r = cards[randInt(state.rng, cards.length)];
        p.hand[r] -= 1;
        state.bank.hand[r] = (state.bank.hand[r] ?? 0) + 1;
        lost[r] = (lost[r] ?? 0) + 1;
      }
      emitTl(ctx, { type: 'fleetAttack', player: p.id, pirates: steps, war, result: 'lost', count: lose }, { lost }, [p.id]);
    } else if (war > steps) {
      owed[p.id] = 1;
      emitTl(ctx, { type: 'fleetAttack', player: p.id, pirates: steps, war, result: 'won' });
    } else emitTl(ctx, { type: 'fleetAttack', player: p.id, pirates: steps, war, result: 'tie' });
  }
  return owed;
}

/** Coves win: the acting player took their fort and has the VP target. */
export function covesWinner(ctx: Ctx): PlayerId | undefined {
  const c = covesOf(ctx.state);
  const id = winningActor(ctx.state);
  if (!c || !id) return undefined;
  return c.lairs[id] === 0 && vp(ctx, id) >= ctx.state.init.vpToWin ? id : undefined;
}

/** A 7 without a blocker: rob any other player who holds cards. */
export const robAnyone = (state: GameState, thief: PlayerId): PlayerId[] =>
  state.players.filter((p) => p.id !== thief && handSize(p) > 0).map((p) => p.id);

/** Play a guard card to arm a cog (the only use of guards here). */
export const armCard: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ['preRoll', 'main', 'paired']);
    if (e) return e;
    if (!covesOf(ctx.state)) return err('WRONG_SCENARIO', 'Only in the corsair coves.');
    const p = player(ctx.state, a.player);
    if (!p.cards.includes('guard'))
      return p.newCards.includes('guard') ? err('JUST_BOUGHT', 'Cards cannot be played in the turn they were bought.') : err('NO_CARD', 'You have no guard card.');
    if (ctx.state.turn.cardPlayed) return err('ONE_CARD', 'Only one card may be played per turn.');
    const g = covesGuardError(ctx, a.player);
    return g ? err('NO_COG', g) : null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const p = player(ctx.state, a.player);
    p.cards.splice(p.cards.indexOf('guard'), 1);
    p.played.guard = (p.played.guard ?? 0) + 1;
    ctx.state.turn.cardPlayed = true;
    ctx.emit({ e: 'cardPlayed', player: a.player, card: 'guard' });
    armShip(ctx, a.player);
  },
  legal(ctx, id) {
    const a: Action = { t: 'tl:arm', player: id };
    return armCard.validate(ctx, a) ? [] : [a];
  },
};
