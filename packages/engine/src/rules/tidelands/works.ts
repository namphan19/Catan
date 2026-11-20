// Great Works scenario: claim one wonder whose requirement you meet, then build its four levels (each level
// costs the same five resources). You win on your turn by finishing your wonder, or with 10+ VP while your
// wonder stands higher than everyone else's. Wonder sites are marked intersections; starting settlements
// may not use a marked or "x" intersection.
import type { Action, Bag, ExtAction, GameState, Phase, PlayerId } from '../../types';
import type { ActionDef, Ctx } from '../../ruleset/types';
import { bagHas } from '../../bag';
import { longestRoute } from '../../board/graph';
import { pay } from '../base/build';
import { err, expect, player, vp, winningActor } from '../base/helpers';
import { mapMarkers } from './maps';
import { emitTl, tl, type WorksState } from './state';

export interface WonderDef {
  id: string;
  /** Cost of each of the four levels. */
  cost: Bag;
  /** Requirement to claim it. */
  needs: 'twoCities' | 'cityAndVP' | 'portCityAndRoute' | 'atWall' | 'atBridge' | 'atBeacon';
  /** Only with 5-6 players. */
  large?: boolean;
}

export const WONDERS: WonderDef[] = [
  { id: 'cathedral', cost: { clay: 1, timber: 1, fiber: 3 }, needs: 'twoCities' },
  { id: 'seaWall', cost: { clay: 3, timber: 1, grain: 1 }, needs: 'atWall' },
  { id: 'kingsBridge', cost: { timber: 3, fiber: 1, grain: 1 }, needs: 'atBridge' },
  { id: 'obelisk', cost: { grain: 3, stone: 2 }, needs: 'portCityAndRoute' },
  { id: 'highKeep', cost: { clay: 1, grain: 1, stone: 3 }, needs: 'cityAndVP' },
  { id: 'beacon', cost: { timber: 3, fiber: 1, grain: 1 }, needs: 'atBeacon', large: true },
  { id: 'scriptorium', cost: { clay: 1, timber: 1, fiber: 3 }, needs: 'twoCities', large: true },
];

export const WONDER_LEVELS = 4;
/** VP needed to win by standing highest (without finishing). */
export const WORKS_VP = 10;

export const worksOf = (state: GameState): WorksState | undefined => tl(state).works;

export function initWorks(state: GameState): WorksState {
  const large = state.players.length >= 5;
  return {
    wonders: WONDERS.filter((w) => large || !w.large).map((w) => w.id),
    claims: {},
    levels: Object.fromEntries(state.players.map((p) => [p.id, 0])),
    markers: mapMarkers(state.board.layout),
  };
}

const defOf = (id: unknown): WonderDef | undefined => WONDERS.find((w) => w.id === id);

const KIND_OF: Record<string, string> = { atWall: 'wall', atBridge: 'bridge', atBeacon: 'beacon' };

/** Does the player meet the wonder's requirement right now? */
export function meetsRequirement(ctx: Ctx, id: PlayerId, w: WonderDef): boolean {
  const { state, graph } = ctx;
  const mine = Object.entries(state.pieces.buildings).filter(([, b]) => b.owner === id);
  const cities = mine.filter(([, b]) => b.kind === 'city');
  switch (w.needs) {
    case 'twoCities':
      return cities.length >= 2;
    case 'cityAndVP':
      return cities.length >= 1 && vp(ctx, id) >= 6;
    case 'portCityAndRoute': {
      const ports = new Set(state.board.harbors.flatMap((h) => h.vertices));
      return cities.some(([v]) => ports.has(v)) && longestRoute(graph, state.pieces, id) >= 5;
    }
    default: {
      const sites = new Set(worksOf(state)!.markers.filter((m) => m.kind === KIND_OF[w.needs]).map((m) => m.v));
      return mine.some(([v]) => sites.has(v));
    }
  }
}

const PHASES: Phase['k'][] = ['main', 'paired'];

function claimedBy(state: GameState, id: PlayerId): string | null {
  const w = worksOf(state);
  return w ? Object.keys(w.claims).find((k) => w.claims[k] === id) ?? null : null;
}

export const claimWonder: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, PHASES);
    if (e) return e;
    const w = worksOf(ctx.state);
    const d = defOf(a.wonder);
    if (!w || !d || !w.wonders.includes(d.id)) return err('BAD_WONDER', 'Choose a wonder of this game.');
    if (w.claims[d.id]) return err('CLAIMED', 'Someone already claimed that wonder.');
    if (claimedBy(ctx.state, a.player)) return err('HAVE_WONDER', 'You may claim only one wonder.');
    if (!meetsRequirement(ctx, a.player, d)) return err('REQUIREMENT', 'You do not meet the requirement of that wonder.');
    return null;
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    worksOf(ctx.state)!.claims[a.wonder as string] = a.player;
    emitTl(ctx, { type: 'wonderClaimed', player: a.player, wonder: a.wonder });
  },
  legal(ctx, id) {
    const w = worksOf(ctx.state);
    if (!w || expect(ctx.state, { t: 'tl:claimWonder', player: id }, PHASES) || claimedBy(ctx.state, id)) return [];
    return w.wonders
      .map((wonder) => ({ t: 'tl:claimWonder', player: id, wonder }) as Action)
      .filter((x) => !claimWonder.validate(ctx, x));
  },
};

export const buildWonder: ActionDef = {
  validate(ctx, action) {
    const a = action as ExtAction;
    const e = expect(ctx.state, a, PHASES);
    if (e) return e;
    const mine = claimedBy(ctx.state, a.player);
    if (!mine) return err('NO_WONDER', 'Claim a wonder first.');
    const w = worksOf(ctx.state)!;
    if (w.levels[a.player] >= WONDER_LEVELS) return err('DONE', 'Your wonder is complete.');
    return bagHas(player(ctx.state, a.player).hand, defOf(mine)!.cost) ? null : err('CANNOT_AFFORD', 'Not enough resources.');
  },
  apply(ctx, action) {
    const a = action as ExtAction;
    const mine = claimedBy(ctx.state, a.player)!;
    pay(ctx, a.player, defOf(mine)!.cost);
    const w = worksOf(ctx.state)!;
    w.levels[a.player] += 1;
    emitTl(ctx, { type: 'wonderBuilt', player: a.player, wonder: mine, level: w.levels[a.player] });
  },
  legal(ctx, id) {
    const a: Action = { t: 'tl:buildWonder', player: id };
    return buildWonder.validate(ctx, a) ? [] : [a];
  },
};

/** Works win: the acting player finished the wonder, or has 10+ VP and the highest wonder alone. */
export function worksWinner(ctx: Ctx): PlayerId | undefined {
  const w = worksOf(ctx.state);
  const id = winningActor(ctx.state);
  if (!w || !id) return undefined;
  const mine = w.levels[id];
  if (mine >= WONDER_LEVELS) return id;
  const others = Object.entries(w.levels).filter(([p]) => p !== id).map(([, n]) => n);
  if (mine > 0 && others.every((n) => n < mine) && vp(ctx, id) >= WORKS_VP) return id;
  return undefined;
}

/** Starting settlements stay off wonder sites and "x" intersections. */
export function worksSetupBan(ctx: Ctx, v: string): string | null {
  const w = worksOf(ctx.state);
  return w && ctx.state.phase.k === 'setup' && w.markers.some((m) => m.v === v)
    ? 'Starting settlements may not use a marked intersection.'
    : null;
}
