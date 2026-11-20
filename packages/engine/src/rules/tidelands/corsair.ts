// The corsair: instead of the blocker, a player who must move the blocker (a rolled 7, a guard card) may
// move the corsair to another sea hex and rob a player whose cog is on that hex.
import type { Action, ExtAction, HexId, PlayerId } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { err, expect, handSize, resumePhase, setPhase } from '../base/helpers';
import { emitTl, isSea, tl } from './state';

/** Players (seat order) other than the thief with a cog on the hex and at least one card. */
export function corsairVictims(ctx: Ctx, hex: HexId, thief: PlayerId): PlayerId[] {
  const { state, graph } = ctx;
  const owners = new Set<PlayerId>();
  for (const e of graph.hexEdges[hex] ?? []) {
    const o = state.pieces.ships?.[e];
    if (o && o !== thief) owners.add(o);
  }
  return state.players.filter((p) => owners.has(p.id) && handSize(p) > 0).map((p) => p.id);
}

export const moveCorsair: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const { state, graph } = ctx;
    const e = expect(state, a, ['moveBlocker']);
    if (e) return e;
    const s = tl(state);
    if (!s.corsair) return err('NO_CORSAIR', 'There is no corsair in this scenario.');
    if (typeof a.hex !== 'string' || !graph.hexVertices[a.hex] || !isSea(state, a.hex))
      return err('BAD_HEX', 'The corsair sails on sea hexes.');
    if (a.hex === s.corsair) return err('SAME_HEX', 'The corsair must move to a different hex.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const { state } = ctx;
    if (state.phase.k !== 'moveBlocker') return;
    const { resume, actor } = state.phase;
    const hex = a.hex as HexId;
    tl(state).corsair = hex;
    emitTl(ctx, { type: 'corsairMoved', player: a.player, hex });
    const from = corsairVictims(ctx, hex, a.player);
    if (from.length) setPhase(ctx, { k: 'steal', from, resume, ...(actor ? { actor } : {}) });
    else setPhase(ctx, resumePhase(state, resume));
  },
  legal(ctx, id) {
    const { state, graph } = ctx;
    if (expect(state, { t: 'tl:moveCorsair', player: id }, ['moveBlocker']) || !tl(state).corsair) return [];
    return graph.hexes
      .filter((h) => h !== tl(state).corsair && isSea(state, h))
      .map((hex) => ({ t: 'tl:moveCorsair', player: id, hex }) as Action);
  },
};
