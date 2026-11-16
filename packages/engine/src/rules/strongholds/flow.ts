// Turn flow of the expansion: the roll (event die, raid fleet, card draws, then production) and the
// queue of pending choices that can interrupt any phase.
import type { Action, PlayerId } from '../../types';
import type { ActionDef, ApplyCtx } from '../../ruleset/types';
import { bagTotal } from '../../bag';
import { randInt } from '../../rng';
import { setPhase } from '../base/helpers';
import { resolveRoll } from '../base/turn';
import { SH, SH_ID, type Track } from './config';
import { drawCard } from './ops';
import { autoResolve } from './resolve';
import { emitSh, levelOf, occupants, pillageable, sh, turnOrderFrom } from './state';

/**
 * Bring the game into a consistent phase after any expansion state change:
 *  1. choices that have a single (or no) option are resolved automatically;
 *  2. while a choice is pending the phase is `ext` and only that player may act;
 *  3. once the queue is empty, a postponed production step runs, then the interrupted phase resumes.
 */
export function settle(ctx: ApplyCtx): void {
  const { state } = ctx;
  const s = sh(state);
  for (let guard = 0; guard < 500; guard++) {
    while (s.pending.length && autoResolve(ctx)) {
      /* autoResolve consumed the head of the queue */
    }
    if (s.pending.length) {
      const head = s.pending[0];
      const cur = state.phase;
      if (cur.k !== 'ext') s.resume = cur;
      const same =
        cur.k === 'ext' && cur.actors?.[0] === head.player && (cur.data as { kind?: string }).kind === head.kind;
      state.phase = { k: 'ext', id: SH_ID, data: { kind: head.kind }, actors: [head.player] };
      if (!same) {
        ctx.emit({ e: 'phase', phase: 'ext' });
        emitSh(ctx, { type: 'prompt', kind: head.kind, player: head.player });
      }
      return;
    }
    if (s.productionDue) {
      s.productionDue = false;
      s.resume = null;
      if (state.phase.k === 'ext') state.phase = { k: 'preRoll' };
      runProduction(ctx);
      continue; // production may have queued new choices
    }
    if (state.phase.k === 'ext') {
      const back = s.resume ?? { k: 'main' };
      s.resume = null;
      setPhase(ctx, back);
    }
    return;
  }
  throw new Error('strongholds: pending queue did not settle');
}

/** Base production / 7 handling, then the learning perk: players who got nothing take 1 resource. */
function runProduction(ctx: ApplyCtx): void {
  const { state, rules } = ctx;
  const { sum, gains } = resolveRoll(ctx);
  if (sum === rules.config.blockerNumber) return;
  for (const id of turnOrderFrom(state, state.turn.current))
    if (levelOf(state, id, 'learning') >= SH.perkLevel && bagTotal(gains[id] ?? {}) === 0)
      sh(state).pending.push({ kind: 'provision', player: id });
}

/** Every player whose level on the track covers the red die draws a card, in turn order. */
function drawRound(ctx: ApplyCtx, track: Track, red: number): void {
  const { state } = ctx;
  for (const id of turnOrderFrom(state, state.turn.current)) {
    const level = levelOf(state, id, track);
    if (level >= 1 && red <= level + 1) drawCard(ctx, id, track, state.turn.current);
  }
}

function moveRaid(ctx: ApplyCtx): void {
  const s = sh(ctx.state);
  s.raid.pos += 1;
  emitSh(ctx, { type: 'raidMoved', pos: s.raid.pos });
  if (s.raid.pos >= SH.raidTrack) raidAttack(ctx);
}

/** The raid fleet lands: raiders (number of cities) against the active wardens of all players. */
function raidAttack(ctx: ApplyCtx): void {
  const { state } = ctx;
  const s = sh(state);
  const order = turnOrderFrom(state, state.turn.current);
  const raiders = Object.values(state.pieces.buildings).filter((b) => b.kind === 'city').length;
  const contrib: Record<PlayerId, number> = Object.fromEntries(order.map((id) => [id, 0]));
  for (const o of Object.values(occupants(state))) if (o.kind === 'warden' && o.active) contrib[o.owner] += o.level;
  const defenders = Object.values(contrib).reduce((a, b) => a + b, 0);

  if (raiders > defenders) {
    // The weakest defenders lose a city; a tier in which nobody has a pillageable city is skipped.
    let victims: PlayerId[] = [];
    for (const tier of [...new Set(Object.values(contrib))].sort((a, b) => a - b)) {
      victims = order.filter((id) => contrib[id] === tier && pillageable(state, id).length > 0);
      if (victims.length) break;
    }
    for (const id of victims) s.pending.push({ kind: 'pillage', player: id });
    emitSh(ctx, { type: 'raid', result: 'pillage', raiders, defenders, contrib, victims });
  } else {
    const best = Math.max(...Object.values(contrib));
    const top = order.filter((id) => contrib[id] === best);
    if (top.length === 1) {
      s.shields[top[0]] += 1;
      emitSh(ctx, { type: 'raid', result: 'defended', raiders, defenders, contrib, hero: top[0] });
    } else {
      // Tie for the strongest defence: each tied player draws from a deck of their choice.
      for (const id of top) s.pending.push({ kind: 'pickDeck', player: id });
      emitSh(ctx, { type: 'raid', result: 'defended', raiders, defenders, contrib, tied: top });
    }
  }

  s.raid.pos = 0;
  s.raid.attacks += 1;
  for (const o of Object.values(occupants(state))) {
    if (o.kind !== 'warden') continue;
    o.active = false;
    o.tags = (o.tags ?? []).filter((t) => t !== 'fresh');
  }
  if (!s.blockerActive) {
    s.blockerActive = true;
    state.board.blocker = s.blockerHome;
    emitSh(ctx, { type: 'blockerArrived', hex: s.blockerHome });
  }
}

/** `roll` for expansion games: event die first (raid fleet or card draws), then production. */
export function rollAction(prev: ActionDef | undefined): ActionDef {
  if (!prev) throw new Error('strongholds needs the base roll action');
  const def: ActionDef = {
    validate: (ctx, a) => prev.validate(ctx, a),
    apply(ctx, a) {
      const { state, rules } = ctx;
      const s = sh(state);
      const rolled = rules.call('rollDice', ctx, []);
      const dice = s.fixedDice ?? rolled.slice(0, 2);
      s.fixedDice = null;
      const face = SH.eventFaces[rolled[2] ?? randInt(state.rng, SH.eventFaces.length)];
      state.turn.roll = dice;
      s.eventDie = face;
      ctx.emit({ e: 'rolled', player: a.player, dice, sum: dice.reduce((x, y) => x + y, 0) });
      emitSh(ctx, { type: 'eventDie', face });
      if (face === 'raid') moveRaid(ctx);
      else drawRound(ctx, face, dice[0]);
      s.productionDue = true;
      settle(ctx);
    },
    legal(ctx, id) {
      const a: Action = { t: 'roll', player: id };
      return def.validate(ctx, a) ? [] : [a];
    },
  };
  return def;
}
