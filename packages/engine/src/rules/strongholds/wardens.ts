// Warden actions: recruit, promote, activate, move, displace, chase the blocker away.
import type { Action, ExtAction, Occupant, Phase, PlayerId, RuleError, VertexId } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { canAfford, pay } from '../base/build';
import { actors, cost, err, expect, player, setPhase } from '../base/helpers';
import { settle } from './flow';
import { doPromote, liftWarden, placeWarden, promoteError, setWarden } from './ops';
import { emitSh, hasTag, moveTargets, occupants, reach, sh, wardenSpots, wardensOf } from './state';

export const ACTION_PHASES: Phase['k'][] = ['main', 'paired'];

const mayAct = (ctx: Ctx, id: PlayerId): boolean =>
  !ctx.state.winner && ACTION_PHASES.includes(ctx.state.phase.k) && actors(ctx.state).includes(id);

function ownWarden(ctx: Ctx, id: PlayerId, v: unknown): Occupant | null {
  const o = typeof v === 'string' ? occupants(ctx.state)[v] : undefined;
  return o && o.owner === id && o.kind === 'warden' ? o : null;
}

/** A warden may act if it is active and was not activated during this action phase. */
const canAct = (o: Occupant): boolean => o.active && !hasTag(o, 'fresh');

function actingWarden(ctx: Ctx, id: PlayerId, v: unknown): Occupant | RuleError {
  const o = ownWarden(ctx, id, v);
  if (!o) return err('NOT_YOUR_WARDEN', 'Choose one of your wardens.');
  if (!o.active) return err('INACTIVE', 'Activate this warden first.');
  if (hasTag(o, 'fresh')) return err('JUST_ACTIVATED', 'A warden cannot act in the turn it was activated.');
  return o;
}
const isErr = (x: Occupant | RuleError): x is RuleError => 'code' in x;

/** Opponent wardens of lower rank that the warden on `from` can reach. */
function displaceTargets(ctx: Ctx, id: PlayerId, from: VertexId, level: number): VertexId[] {
  const occ = occupants(ctx.state);
  return reach(ctx, id, from).filter((v) => {
    const o = occ[v];
    return !!o && o.kind === 'warden' && o.owner !== id && o.level < level;
  });
}

export const recruit: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ACTION_PHASES);
    if (e) return e;
    if (typeof a.v !== 'string' || !wardenSpots(ctx, a.player).includes(a.v))
      return err('BAD_SPOT', 'A warden needs an empty intersection on one of your roads.');
    if ((player(ctx.state, a.player).supply.warden1 ?? 0) <= 0)
      return err('NO_PIECES', 'No rank 1 warden left; promote one first.');
    return canAfford(ctx, a.player, 'warden');
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    pay(ctx, a.player, cost(ctx, 'warden'));
    placeWarden(ctx, a.player, a.v as VertexId, 1, false);
    settle(ctx);
  },
  legal(ctx, id) {
    if (!mayAct(ctx, id) || canAfford(ctx, id, 'warden')) return [];
    return wardenSpots(ctx, id)
      .map((v) => ({ t: 'sh:recruit', player: id, v }) as Action)
      .filter((x) => !recruit.validate(ctx, x));
  },
};

export const promote: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ACTION_PHASES);
    if (e) return e;
    return promoteError(ctx, a.player, a.v as VertexId) ?? canAfford(ctx, a.player, 'promote');
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    pay(ctx, a.player, cost(ctx, 'promote'));
    doPromote(ctx, a.v as VertexId);
    settle(ctx);
  },
  legal(ctx, id) {
    if (!mayAct(ctx, id)) return [];
    return wardensOf(ctx.state, id)
      .map(([v]) => ({ t: 'sh:promote', player: id, v }) as Action)
      .filter((x) => !promote.validate(ctx, x));
  },
};

export const activate: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ACTION_PHASES);
    if (e) return e;
    const o = ownWarden(ctx, a.player, a.v);
    if (!o) return err('NOT_YOUR_WARDEN', 'Choose one of your wardens.');
    if (o.active) return err('ALREADY_ACTIVE', 'This warden is already active.');
    return canAfford(ctx, a.player, 'activate');
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const o = occupants(ctx.state)[a.v as VertexId];
    pay(ctx, a.player, cost(ctx, 'activate'));
    o.active = true;
    o.tags = [...(o.tags ?? []), 'fresh'];
    emitSh(ctx, { type: 'warden', op: 'activated', player: a.player, v: a.v, level: o.level });
    settle(ctx);
  },
  legal(ctx, id) {
    if (!mayAct(ctx, id)) return [];
    return wardensOf(ctx.state, id)
      .map(([v]) => ({ t: 'sh:activate', player: id, v }) as Action)
      .filter((x) => !activate.validate(ctx, x));
  },
};

export const moveWarden: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ACTION_PHASES);
    if (e) return e;
    const o = actingWarden(ctx, a.player, a.from);
    if (isErr(o)) return o;
    if (typeof a.to !== 'string' || !moveTargets(ctx, a.player, a.from as VertexId).includes(a.to))
      return err('BAD_TARGET', 'A warden moves along your roads to an empty intersection.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const o = liftWarden(ctx, a.from as VertexId);
    setWarden(ctx, a.to as VertexId, { ...o, active: false });
    emitSh(ctx, { type: 'warden', op: 'moved', player: a.player, from: a.from, v: a.to, level: o.level });
    settle(ctx);
  },
  legal(ctx, id) {
    if (!mayAct(ctx, id)) return [];
    const out: Action[] = [];
    for (const [from, o] of wardensOf(ctx.state, id))
      if (canAct(o))
        for (const to of moveTargets(ctx, id, from)) out.push({ t: 'sh:moveWarden', player: id, from, to });
    return out;
  },
};

export const displace: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, ACTION_PHASES);
    if (e) return e;
    const o = actingWarden(ctx, a.player, a.from);
    if (isErr(o)) return o;
    if (typeof a.to !== 'string' || !displaceTargets(ctx, a.player, a.from as VertexId, o.level).includes(a.to))
      return err('BAD_TARGET', 'You can only displace a weaker warden that your roads lead to.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const to = a.to as VertexId;
    const mine = liftWarden(ctx, a.from as VertexId);
    const theirs = liftWarden(ctx, to);
    setWarden(ctx, to, { ...mine, active: false });
    emitSh(ctx, { type: 'warden', op: 'displaced', player: a.player, from: a.from, v: to, victim: theirs.owner });
    // The displaced warden keeps its status; its owner moves it, or loses it if it cannot move.
    sh(ctx.state).pending.push({
      kind: 'relocate', player: theirs.owner, from: to, level: theirs.level, active: theirs.active,
      tags: theirs.tags ?? [],
    });
    settle(ctx);
  },
  legal(ctx, id) {
    if (!mayAct(ctx, id)) return [];
    const out: Action[] = [];
    for (const [from, o] of wardensOf(ctx.state, id))
      if (canAct(o))
        for (const to of displaceTargets(ctx, id, from, o.level)) out.push({ t: 'sh:displace', player: id, from, to });
    return out;
  },
};

export const chase: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const { state, graph } = ctx;
    const e = expect(state, a, ACTION_PHASES);
    if (e) return e;
    if (!sh(state).blockerActive) return err('NO_BLOCKER', 'The blocker is not on the board yet.');
    const o = actingWarden(ctx, a.player, a.v);
    if (isErr(o)) return o;
    if (!(graph.hexVertices[state.board.blocker] ?? []).includes(a.v as VertexId))
      return err('NOT_ADJACENT', 'The warden must stand next to the blocker.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    const o = occupants(state)[a.v as VertexId];
    o.active = false;
    emitSh(ctx, { type: 'warden', op: 'chased', player: a.player, v: a.v, level: o.level });
    setPhase(
      ctx,
      state.phase.k === 'paired'
        ? { k: 'moveBlocker', resume: 'paired', actor: a.player }
        : { k: 'moveBlocker', resume: 'main' },
    );
  },
  legal(ctx, id) {
    if (!mayAct(ctx, id) || !sh(ctx.state).blockerActive) return [];
    return wardensOf(ctx.state, id)
      .map(([v]) => ({ t: 'sh:chase', player: id, v }) as Action)
      .filter((x) => !chase.validate(ctx, x));
  },
};
