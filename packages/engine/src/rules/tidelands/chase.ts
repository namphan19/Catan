// Strongholds + Tidelands (C&K rulebook 2025, combining with seafaring): a warden standing on a corner of
// the corsair's sea hex may chase the corsair away just as one next to the blocker chases the blocker.
// The piece that was chased is the one that moves (the blocker step remembers it in `chase`).
import type { Action, ExtAction, Occupant, VertexId } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { err, expect, setPhase } from '../base/helpers';
import { emitTl, tl } from './state';

const PHASES = ['main', 'paired'] as const;

function wardenAt(ctx: Ctx, v: unknown): Occupant | undefined {
  return typeof v === 'string' ? ctx.state.pieces.occupants?.[v] : undefined;
}

function corsairChaseError(ctx: Ctx, a: ExtAction): ReturnType<ActionDef['validate']> {
  const { state, graph } = ctx;
  const e = expect(state, a, [...PHASES]);
  if (e) return e;
  const corsair = tl(state).corsair;
  if (!corsair) return err('NO_CORSAIR', 'The corsair is not on the board yet.');
  const o = wardenAt(ctx, a.v);
  if (!o || o.owner !== a.player || o.kind !== 'warden') return err('NOT_YOUR_WARDEN', 'Choose one of your wardens.');
  if (!o.active) return err('INACTIVE', 'Activate this warden first.');
  if ((o.tags ?? []).includes('fresh')) return err('JUST_ACTIVATED', 'A warden cannot act in the turn it was activated.');
  if (!graph.hexVertices[corsair].includes(a.v as VertexId)) return err('NOT_ADJACENT', 'The warden must stand next to the corsair.');
  return null;
}

export function chaseAction(prev: ActionDef): ActionDef {
  const def: ActionDef = {
    validate(ctx, action) {
      const a = action as ExtAction;
      return a.piece === 'corsair' ? corsairChaseError(ctx, a) : prev.validate(ctx, a);
    },
    apply(ctx, action) {
      const a = action as ExtAction;
      const { state } = ctx;
      const s = tl(state);
      if (a.piece !== 'corsair') {
        prev.apply(ctx, a);
        if (state.phase.k === 'moveBlocker') s.chase = 'blocker';
        return;
      }
      const o = wardenAt(ctx, a.v)!;
      o.active = false;
      s.chase = 'corsair';
      emitTl(ctx, { type: 'chaseCorsair', player: a.player, v: a.v, level: o.level });
      setPhase(
        ctx,
        state.phase.k === 'paired' ? { k: 'moveBlocker', resume: 'paired', actor: a.player } : { k: 'moveBlocker', resume: 'main' },
      );
    },
    legal(ctx, id) {
      const out = prev.legal(ctx, id);
      const corsair = tl(ctx.state).corsair;
      if (!corsair) return out;
      for (const v of ctx.graph.hexVertices[corsair]) {
        const a: Action = { t: 'sh:chase', player: id, v, piece: 'corsair' };
        if (!corsairChaseError(ctx, a as ExtAction)) out.push(a);
      }
      return out;
    },
  };
  return def;
}
