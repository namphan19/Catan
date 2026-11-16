// Shared checks and state changes of the expansion (used by actions, cards and pending choices).
import type { Bag, CardId, EdgeId, GameState, Occupant, PlayerId, RuleError, VertexId } from '../../types';
import type { ApplyCtx, Ctx } from '../../ruleset/types';
import { bagAdd, bagHas, bagSub, bagToList } from '../../bag';
import { randInt } from '../../rng';
import { pay } from '../base/build';
import { cost, err, player, updateLongestRoute } from '../base/helpers';
import { CARD_TRACK, SH, TRACKS, type Track } from './config';
import { capitalAt, citiesOf, emitSh, hasTag, levelOf, occupants, sh } from './state';

// ---- cards -------------------------------------------------------------------------------------

/** Played and discarded cards go face down under their deck. */
export function returnCard(state: GameState, card: CardId): void {
  sh(state).decks[CARD_TRACK[card]].unshift(card);
}

/** Draw the top card of a deck. VP cards are revealed at once; `exempt` (the player whose action
 *  phase it is) may exceed the hand limit until the end of that phase, others trim immediately. */
export function drawCard(ctx: ApplyCtx, id: PlayerId, track: Track, exempt: PlayerId): void {
  const { state } = ctx;
  const s = sh(state);
  const card = s.decks[track].pop();
  if (!card) return;
  if (SH.vpCards.includes(card)) {
    s.vpCards[id].push(card);
    emitSh(ctx, { type: 'vpCard', player: id, card });
    return;
  }
  const p = player(state, id);
  p.cards.push(card);
  emitSh(ctx, { type: 'drew', player: id, track }, { card }, [id]);
  const queued = s.pending.some((x) => x.kind === 'trimHand' && x.player === id);
  if (id !== exempt && p.cards.length > SH.handLimit && !queued) s.pending.push({ kind: 'trimHand', player: id });
}

// ---- hands -------------------------------------------------------------------------------------

export function transfer(state: GameState, from: PlayerId, to: PlayerId, bag: Bag): void {
  bagSub(player(state, from).hand, bag);
  bagAdd(player(state, to).hand, bag);
}

/** Move one random hand card (resource or commodity) from `from` to `to`. */
export function stealRandom(ctx: ApplyCtx, from: PlayerId, to: PlayerId): void {
  const { state, rules } = ctx;
  const cards = bagToList(player(state, from).hand, rules.config.resources);
  if (!cards.length) return;
  const resource = cards[randInt(state.rng, cards.length)];
  transfer(state, from, to, { [resource]: 1 });
  ctx.emit({ e: 'stole', from, to, resource });
}

// ---- wardens -----------------------------------------------------------------------------------

export const wardenPiece = (level: number): string => `warden${level}`;

/** Put a warden from the supply on the board. */
export function placeWarden(
  ctx: ApplyCtx, id: PlayerId, v: VertexId, level: number, active: boolean, tags: string[] = [],
): void {
  const { state } = ctx;
  (state.pieces.occupants ??= {})[v] = { owner: id, kind: 'warden', level, active, tags };
  player(state, id).supply[wardenPiece(level)] -= 1;
  emitSh(ctx, { type: 'warden', op: 'placed', player: id, v, level, active });
  updateLongestRoute(ctx);
}

/** Take a warden off the board without returning it to the supply (it is being moved). */
export function liftWarden(ctx: ApplyCtx, v: VertexId): Occupant {
  const occ = ctx.state.pieces.occupants ?? {};
  const o = occ[v];
  delete occ[v];
  return o;
}

/** Put a lifted warden back on the board (no supply change). */
export function setWarden(ctx: ApplyCtx, v: VertexId, o: Occupant): void {
  (ctx.state.pieces.occupants ??= {})[v] = o;
  updateLongestRoute(ctx);
}

/** Return a lifted warden to its owner's supply. */
export function shelveWarden(ctx: ApplyCtx, o: Occupant, from: VertexId): void {
  player(ctx.state, o.owner).supply[wardenPiece(o.level)] += 1;
  emitSh(ctx, { type: 'warden', op: 'removed', player: o.owner, v: from, level: o.level });
  updateLongestRoute(ctx);
}

/** Why the player's warden on `v` cannot be promoted now (null = it can). `supply` lets callers
 *  simulate several promotions in a row. */
export function promoteError(
  ctx: Ctx, id: PlayerId, v: VertexId, supply: Record<string, number> = player(ctx.state, id).supply,
): RuleError | null {
  const o = occupants(ctx.state)[v];
  if (!o || o.owner !== id || o.kind !== 'warden') return err('NOT_YOUR_WARDEN', 'Choose one of your wardens.');
  if (o.level >= 3) return err('MAX_LEVEL', 'This warden already has the highest rank.');
  if (hasTag(o, 'promoted')) return err('ALREADY_PROMOTED', 'A warden can be promoted only once per turn.');
  if (o.level === 2 && levelOf(ctx.state, id, 'council') < SH.perkLevel)
    return err('NEED_COUNCIL', 'Rank 3 wardens need council level 3.');
  if ((supply[wardenPiece(o.level + 1)] ?? 0) <= 0)
    return err('NO_PIECES', 'No warden of the next rank left in your supply.');
  return null;
}

export function doPromote(ctx: ApplyCtx, v: VertexId): void {
  const o = occupants(ctx.state)[v];
  const p = player(ctx.state, o.owner);
  p.supply[wardenPiece(o.level)] += 1;
  o.level += 1;
  p.supply[wardenPiece(o.level)] -= 1;
  o.tags = [...(o.tags ?? []), 'promoted'];
  emitSh(ctx, { type: 'warden', op: 'promoted', player: o.owner, v, level: o.level });
}

// ---- improvements and capitals -----------------------------------------------------------------

/** Would reaching `newLevel` on the track give the player its capital? */
export function gainsCapital(state: GameState, id: PlayerId, track: Track, newLevel: number): boolean {
  if (newLevel < SH.capitalLevel) return false;
  const cap = sh(state).capitals[track];
  if (!cap) return true;
  if (cap.owner === id) return false;
  // Another player holds it: only the first player to reach the top level takes it over for good.
  return newLevel >= SH.maxLevel && levelOf(state, cap.owner, track) < SH.maxLevel;
}

/** Own cities that do not carry a capital yet. */
export const freeCities = (state: GameState, id: PlayerId): VertexId[] =>
  citiesOf(state, id).filter((v) => !capitalAt(state, v));

export function improveCost(state: GameState, id: PlayerId, track: Track, discount: number): Bag {
  return { [SH.trackCommodity[track]]: Math.max(0, levelOf(state, id, track) + 1 - discount) };
}

export function improveError(
  ctx: Ctx, id: PlayerId, track: unknown, v: unknown, discount: number,
): RuleError | null {
  const { state } = ctx;
  if (typeof track !== 'string' || !(TRACKS as readonly string[]).includes(track))
    return err('BAD_TRACK', 'Unknown improvement track.');
  const t = track as Track;
  if (citiesOf(state, id).length === 0) return err('NO_CITY', 'You need a city to improve it.');
  const next = levelOf(state, id, t) + 1;
  if (next > SH.maxLevel) return err('MAX_LEVEL', 'This track is complete.');
  if (!bagHas(player(state, id).hand, improveCost(state, id, t, discount)))
    return err('CANNOT_AFFORD', `Not enough ${SH.trackCommodity[t]}.`);
  if (gainsCapital(state, id, t, next)) {
    const free = freeCities(state, id);
    if (!free.length) return err('NO_CITY_FOR_CAPITAL', 'You have no city left to carry this capital.');
    if (v === undefined || v === null) {
      if (free.length > 1) return err('CHOOSE_CITY', 'Choose the city that becomes the capital.');
    } else if (typeof v !== 'string' || !free.includes(v)) {
      return err('BAD_CITY', 'The capital must go on one of your cities without a capital.');
    }
  }
  return null;
}

export function doImprove(ctx: ApplyCtx, id: PlayerId, track: Track, v: VertexId | undefined, discount: number): void {
  const { state } = ctx;
  const s = sh(state);
  pay(ctx, id, improveCost(state, id, track, discount));
  const level = (s.levels[id][track] += 1);
  emitSh(ctx, { type: 'improved', player: id, track, level });
  if (gainsCapital(state, id, track, level)) {
    const from = s.capitals[track]?.owner ?? null;
    const at = v ?? freeCities(state, id)[0];
    s.capitals[track] = { owner: id, v: at };
    emitSh(ctx, { type: 'capital', track, from, to: id, v: at });
  }
}

/** One legal improve parameter set per choice the player has on a track. */
export function improveOptions(ctx: Ctx, id: PlayerId, discount: number): Array<{ track: Track; v?: VertexId }> {
  const out: Array<{ track: Track; v?: VertexId }> = [];
  for (const track of TRACKS) {
    const next = levelOf(ctx.state, id, track) + 1;
    const choices: Array<{ track: Track; v?: VertexId }> = gainsCapital(ctx.state, id, track, next)
      ? freeCities(ctx.state, id).map((v) => ({ track, v }))
      : [{ track }];
    for (const c of choices) if (!improveError(ctx, id, c.track, c.v, discount)) out.push(c);
  }
  return out;
}

// ---- ramparts, pillage, city upgrades ----------------------------------------------------------

export function rampartError(ctx: Ctx, id: PlayerId, v: unknown): RuleError | null {
  const { state } = ctx;
  const b = typeof v === 'string' ? state.pieces.buildings[v] : undefined;
  if (!b || b.owner !== id || b.kind !== 'city') return err('NOT_YOUR_CITY', 'A rampart goes under one of your cities.');
  if (sh(state).ramparts.includes(v as VertexId)) return err('HAS_RAMPART', 'This city already has a rampart.');
  if ((player(state, id).supply.rampart ?? 0) <= 0) return err('NO_PIECES', 'No ramparts left in your supply.');
  return null;
}

export function doRampart(ctx: ApplyCtx, id: PlayerId, v: VertexId): void {
  sh(ctx.state).ramparts.push(v);
  player(ctx.state, id).supply.rampart -= 1;
  emitSh(ctx, { type: 'rampart', player: id, v });
}

/** Raiders reduce a city to a settlement; its rampart is lost. */
export function pillage(ctx: ApplyCtx, v: VertexId): void {
  const { state } = ctx;
  const s = sh(state);
  const b = state.pieces.buildings[v];
  const p = player(state, b.owner);
  b.kind = 'settlement';
  if (s.ramparts.includes(v)) {
    s.ramparts = s.ramparts.filter((x) => x !== v);
    p.supply.rampart += 1;
  }
  if ((p.supply.settlement ?? 0) > 0) {
    p.supply.settlement -= 1;
    p.supply.city += 1;
  } else {
    // No settlement piece left: the city piece stays, lying on its side, and counts as a settlement.
    s.toppled.push(v);
  }
  emitSh(ctx, { type: 'pillaged', player: b.owner, v });
}

const ownToppled = (state: GameState, id: PlayerId): VertexId[] =>
  sh(state).toppled.filter((v) => state.pieces.buildings[v]?.owner === id);

/** Why the settlement on `v` cannot become a city for the cost of `item` (null = it can). */
export function upgradeError(ctx: Ctx, id: PlayerId, v: unknown, item: string): RuleError | null {
  const { state } = ctx;
  const b = typeof v === 'string' ? state.pieces.buildings[v] : undefined;
  if (!b || b.owner !== id || b.kind !== 'settlement')
    return err('NOT_YOUR_SETTLEMENT', 'A city replaces one of your settlements.');
  const toppled = ownToppled(state, id);
  if (toppled.length && !toppled.includes(v as VertexId))
    return err('TOPPLED_FIRST', 'Rebuild your pillaged city (the piece lying on its side) first.');
  if (!toppled.length && (player(state, id).supply.city ?? 0) <= 0)
    return err('NO_PIECES', 'No cities left in supply.');
  if (!bagHas(player(state, id).hand, cost(ctx, item)))
    return err('CANNOT_AFFORD', `Not enough resources for: ${item}.`);
  return null;
}

export function doUpgrade(ctx: ApplyCtx, id: PlayerId, v: VertexId, item: string): void {
  const { state } = ctx;
  const s = sh(state);
  const p = player(state, id);
  pay(ctx, id, cost(ctx, item));
  state.pieces.buildings[v] = { owner: id, kind: 'city' };
  if (s.toppled.includes(v)) s.toppled = s.toppled.filter((x) => x !== v);
  else {
    p.supply.city -= 1;
    p.supply.settlement += 1;
  }
  ctx.emit({ e: 'placed', player: id, kind: 'city', at: v, free: false });
}

// ---- roads -------------------------------------------------------------------------------------

/** A road is open when one of its ends touches none of its owner's other roads, buildings or wardens. */
export function isOpenRoad(ctx: Ctx, e: EdgeId): boolean {
  const { state, graph } = ctx;
  const owner = state.pieces.roads[e];
  if (!owner) return false;
  const occ = occupants(state);
  return graph.edgeEnds[e].some(
    (v) =>
      state.pieces.buildings[v]?.owner !== owner &&
      occ[v]?.owner !== owner &&
      !graph.vertexEdges[v].some((x) => x !== e && state.pieces.roads[x] === owner),
  );
}
