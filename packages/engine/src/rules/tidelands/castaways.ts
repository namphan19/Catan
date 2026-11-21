// Castaways scenario: the outer islets give no production and take no settlements; rewards lie on sea
// edges around them (VP tokens, face-down cards, harbors). The first cog built or moved onto such an
// edge takes it. A harbor taken is placed next to one of the taker's coastal buildings, at least one edge
// away from other harbors, at once if possible, otherwise later.
import type { Action, EdgeId, ExtAction, GameState, Phase, PlayerId, RngState } from '../../types';
import type { ActionDef, ApplyCtx, Ctx } from '../../ruleset/types';
import { shuffle } from '../../rng';
import { err, expect, player, setPhase } from '../base/helpers';
import { TL_ID } from './config';
import { mapById, rewardEdges } from './maps';
import { emitTl, hexIndex, isLand, isSea, tl, type CastawaysState } from './state';

export const cw = (state: GameState): CastawaysState | undefined => tl(state).castaways;

export function initCastaways(state: GameState, rng: RngState): CastawaysState {
  const { def } = mapById(state.board.layout);
  const edges = rewardEdges(state.board.layout);
  const kinds = shuffle(
    rng,
    Object.entries(def.rewards ?? {}).flatMap(([k, n]) => Array<'vp' | 'card' | 'harbor'>(n).fill(k as 'vp')),
  );
  const harborKinds = shuffle(rng, [...(def.rewardHarbors ?? [])]);
  const rewards: CastawaysState['rewards'] = {};
  const hk: Record<EdgeId, string> = {};
  edges.forEach((e, i) => {
    rewards[e] = kinds[i];
    if (kinds[i] === 'harbor') hk[e] = harborKinds.pop()!;
  });
  const cards = Object.values(rewards).filter((k) => k === 'card').length;
  const reserved = state.bank.deck.splice(Math.max(0, state.bank.deck.length - cards), cards);
  const ids = state.players.map((p) => p.id);
  return {
    rewards,
    harborKinds: hk,
    reserved,
    vpTokens: Object.fromEntries(ids.map((id) => [id, 0])),
    held: Object.fromEntries(ids.map((id) => [id, [] as string[]])),
    resume: null,
  };
}

/** Coast edges next to one of the player's buildings where a harbor may go (one edge from any other). */
export function harborSpots(ctx: Ctx, id: PlayerId): EdgeId[] {
  const { state, graph } = ctx;
  const taken = new Set<string>();
  for (const h of state.board.harbors) for (const v of h.vertices) taken.add(v);
  const out: EdgeId[] = [];
  for (const [v, b] of Object.entries(state.pieces.buildings)) {
    if (b.owner !== id) continue;
    for (const e of graph.vertexEdges[v]) {
      if (out.includes(e)) continue;
      const hs = graph.edgeHexes[e];
      const land = hs.filter((h) => isLand(state, h));
      const coast = land.length === 1 && (hs.length === 1 || hs.some((h) => isSea(state, h)));
      if (!coast) continue;
      if (graph.edgeEnds[e].some((x) => taken.has(x))) continue;
      out.push(e);
    }
  }
  return out.sort();
}

const inHarborWindow = (state: GameState): boolean =>
  state.phase.k === 'ext' && state.phase.id === TL_ID && (state.phase.data as { kind?: string })?.kind === 'harbor';

/** A cog ended on edge e: take what lies there. */
export function takeReward(ctx: ApplyCtx, id: PlayerId, e: EdgeId): void {
  const c = cw(ctx.state);
  if (!c || !c.rewards[e]) return;
  const { state } = ctx;
  const kind = c.rewards[e];
  delete c.rewards[e];
  if (kind === 'vp') {
    c.vpTokens[id] += 1;
    emitTl(ctx, { type: 'reward', player: id, kind, e });
  } else if (kind === 'card') {
    const card = c.reserved.pop();
    if (card) player(state, id).newCards.push(card);
    emitTl(ctx, { type: 'reward', player: id, kind, e }, { card }, [id]);
  } else {
    const harbor = c.harborKinds[e];
    delete c.harborKinds[e];
    c.held[id].push(harbor);
    emitTl(ctx, { type: 'reward', player: id, kind, e, harbor });
    if (!inHarborWindow(state) && harborSpots(ctx, id).length) {
      c.resume = state.phase;
      setPhase(ctx, { k: 'ext', id: TL_ID, data: { kind: 'harbor' }, actors: [id] });
    }
  }
}

function placeError(ctx: Ctx, a: ExtAction): ReturnType<ActionDef['validate']> {
  const c = cw(ctx.state);
  if (!c) return err('WRONG_SCENARIO', 'There are no harbors to place.');
  if (typeof a.kind !== 'string' || !c.held[a.player]?.includes(a.kind)) return err('NO_HARBOR', 'You hold no such harbor.');
  if (typeof a.e !== 'string' || !harborSpots(ctx, a.player).includes(a.e))
    return err('BAD_EDGE', 'A harbor goes on a coast edge next to your building, one edge away from other harbors.');
  return null;
}

const PLACE_PHASES: Phase['k'][] = ['main', 'paired', 'ext'];

export const placeHarbor: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, PLACE_PHASES);
    if (e) return e;
    if (ctx.state.phase.k === 'ext' && !inHarborWindow(ctx.state)) return err('WRONG_PHASE', 'Not now.');
    return placeError(ctx, a);
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const { state, graph, rules } = ctx;
    const c = cw(state)!;
    const kind = a.kind as string;
    const e = a.e as EdgeId;
    c.held[a.player].splice(c.held[a.player].indexOf(kind), 1);
    const [v1, v2] = graph.edgeEnds[e];
    const ratio = kind === 'any' ? rules.config.genericHarborRate : rules.config.specificHarborRate;
    state.board.harbors.push({ edge: e, vertices: [v1, v2], kind, ratio });
    emitTl(ctx, { type: 'harborPlaced', player: a.player, e, harbor: kind });
    if (inHarborWindow(state)) {
      const back = c.resume ?? { k: 'main' };
      c.resume = null;
      setPhase(ctx, back);
    }
  },
  legal(ctx, id) {
    const c = cw(ctx.state);
    if (!c || !c.held[id]?.length) return [];
    if (expect(ctx.state, { t: 'tl:placeHarbor', player: id }, PLACE_PHASES)) return [];
    if (ctx.state.phase.k === 'ext' && !inHarborWindow(ctx.state)) return [];
    const spots = harborSpots(ctx, id);
    return [...new Set(c.held[id])].flatMap((kind) =>
      spots.map((e) => ({ t: 'tl:placeHarbor', player: id, kind, e }) as Action),
    );
  },
};

/** Castaways: settlements only next to a numbered hex. */
export function castawaysSettleBan(ctx: Ctx, v: string): string | null {
  const idx = hexIndex(ctx.state);
  return ctx.graph.vertexHexes[v].some((h) => idx[h]?.token !== undefined) ? null : 'Settlements need a hex with a number.';
}
