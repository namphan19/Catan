// Heuristic bot (M4 step 1). decide() sees only the bot's own PlayerView plus its legal actions, so it
// cannot use hidden information (other hands, deck order, dice seed). Every legal action of the
// current window is scored and the best one is played; ending the turn scores 0, so the bot keeps
// building while something is worth more than stopping. Extension actions (e.g. "sh:*") get generic
// scores so games with an expansion never stall.
import type { Action, Bag, EdgeId, HexId, PlayerId, VertexId } from '../types';
import type { PlayerView, PublicPlayer } from '../view';
import type { Graph } from '../board/graph';
import type { RulesConfig } from '../ruleset/types';
import { getGraph, longestRoute, satisfiesDistanceRule } from '../board/graph';
import { getRules } from '../engine';
import { bagTotal } from '../bag';

/** 'expert' searches (bot/search.ts); its heuristic fallback plays like 'hard'. */
export type BotLevel = 'easy' | 'normal' | 'hard' | 'expert';

export interface BotOptions {
  level?: BotLevel;
  /** The bot's own trade offer has waited long enough: settle it (best answer so far, or cancel)
   *  even if not everyone has answered. */
  tradeTimedOut?: boolean;
}

interface Level {
  /** Amplitude of the random term added to every score. */
  noise: number;
  /** Chance per turn to offer a player trade. */
  trade: number;
  /** Accept margin for player trades (higher = pickier). */
  margin: number;
}

const LEVELS: Record<BotLevel, Level> = {
  easy: { noise: 6, trade: 0.2, margin: -0.3 },
  normal: { noise: 1.5, trade: 0.6, margin: 0.1 },
  hard: { noise: 0.2, trade: 1, margin: 0.3 },
  expert: { noise: 0.2, trade: 1, margin: 0.3 },
};

/** Dots under a number token: how many of the 36 dice outcomes produce it. */
export const pips = (n: number | undefined): number => (n ? 6 - Math.abs(7 - n) : 0);

type PlayCard = Extract<Action, { t: 'playCard' }>;

interface Ctx {
  view: PlayerView;
  me: PlayerId;
  mine: PublicPlayer;
  hand: Bag;
  g: Graph;
  cfg: RulesConfig;
  lvl: Level;
  hexes: Record<HexId, { terrain: string; token?: number }>;
  /** Expected cards per 36 rolls, per resource, from my buildings. */
  prod: Bag;
  salt: number;
}

// ---------- small helpers ----------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Deterministic noise in [0, 1) per (state, key): replays and tests stay reproducible. */
const noise = (c: Ctx, key: string): number => hash(`${c.salt}|${c.me}|${key}`);

function missing(hand: Bag, cost: Bag): { m: Bag; n: number } {
  const m: Bag = {};
  let n = 0;
  for (const [r, k] of Object.entries(cost)) {
    const d = k - (hand[r] ?? 0);
    if (d > 0) {
      m[r] = d;
      n += d;
    }
  }
  return { m, n };
}

const resOf = (c: Ctx, hex: HexId): string | null => c.cfg.terrainResource[c.hexes[hex]?.terrain] ?? null;

function production(c: Omit<Ctx, 'prod'>, id: PlayerId): Bag {
  const out: Bag = {};
  for (const [v, b] of Object.entries(c.view.pieces.buildings)) {
    if (b.owner !== id) continue;
    for (const h of c.g.vertexHexes[v]) {
      const r = c.cfg.terrainResource[c.hexes[h]?.terrain];
      if (!r || h === c.view.board.blocker) continue;
      out[r] = (out[r] ?? 0) + pips(c.hexes[h].token) * (c.cfg.buildingYield[b.kind] ?? 1);
    }
  }
  return out;
}

/** Value of one card of each resource for me right now. */
function resWeight(c: Ctx, r: string): number {
  const early = c.view.turn.n < 25;
  const base: Record<string, number> = early
    ? { timber: 1.1, clay: 1.1, fiber: 0.9, grain: 1.05, stone: 0.85 }
    : { timber: 0.9, clay: 0.9, fiber: 0.85, grain: 1.15, stone: 1.15 };
  return base[r] ?? 1;
}

// ---------- board evaluation ----------

/** How good a settlement on v would be for me. */
function vertexValue(c: Ctx, v: VertexId): number {
  let sc = 0;
  const kinds = new Set<string>();
  for (const h of c.g.vertexHexes[v]) {
    const r = resOf(c, h);
    if (!r) continue;
    sc += pips(c.hexes[h].token) * resWeight(c, r) * (h === c.view.board.blocker ? 0.5 : 1);
    kinds.add(r);
  }
  for (const k of kinds) if (!c.prod[k]) sc += 1.5;
  for (const hb of c.view.board.harbors) {
    if (!hb.vertices.includes(v)) continue;
    if (hb.kind === 'any') sc += 1;
    else sc += (c.prod[hb.kind] ?? 0) + (kinds.has(hb.kind) ? 3 : 0) >= 5 ? 2.5 : 0.4;
  }
  return sc;
}

const openSpot = (c: Ctx, v: VertexId): boolean => satisfiesDistanceRule(c.g, c.view.pieces, v);

/** Value of the best open settlement spot a road on e brings within reach. */
function roadReach(c: Ctx, e: EdgeId): number {
  const pieces = c.view.pieces;
  const linked = (v: VertexId) =>
    pieces.buildings[v]?.owner === c.me || c.g.vertexEdges[v].some((x) => x !== e && pieces.roads[x] === c.me);
  const [a, b] = c.g.edgeEnds[e];
  let best = 0;
  for (const [from, to] of [[a, b], [b, a]]) {
    if (!linked(from)) continue;
    const bld = pieces.buildings[to];
    if (bld && bld.owner !== c.me) continue; // a dead end into an opponent
    if (openSpot(c, to)) best = Math.max(best, vertexValue(c, to));
    for (const w of c.g.vertexNeighbors[to])
      if (w !== from && openSpot(c, w)) best = Math.max(best, vertexValue(c, w) * 0.6);
  }
  return best;
}

function myRouteWith(c: Ctx, e: EdgeId): number {
  const pieces = { ...c.view.pieces, roads: { ...c.view.pieces.roads, [e]: c.me } };
  return longestRoute(c.g, pieces, c.me);
}

function routeLengths(c: Ctx): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const p of c.view.players) out[p.id] = longestRoute(c.g, c.view.pieces, p.id);
  return out;
}

/** Settlement spots I can build on now (connected, distance rule). */
function mySpots(c: Ctx): VertexId[] {
  return c.g.vertices.filter(
    (v) => openSpot(c, v) && c.g.vertexEdges[v].some((e) => c.view.pieces.roads[e] === c.me),
  );
}

const vpOf = (c: Ctx, p: PublicPlayer): number => (p.id === c.me ? p.vp ?? p.publicVP : p.publicVP);
const leaderVP = (c: Ctx): number =>
  Math.max(0, ...c.view.players.filter((p) => p.id !== c.me).map((p) => p.publicVP));

// ---------- goals ----------

interface Goal {
  what: 'city' | 'settlement' | 'road' | 'card';
  cost: Bag;
}

/** The build I am saving for: the cheapest useful one, with mild preferences. */
function chooseGoal(c: Ctx): Goal | null {
  const opts: { g: Goal; w: number }[] = [];
  const costs = c.cfg.costs;
  const supply = c.mine.supply;
  const hasSettlement = Object.values(c.view.pieces.buildings).some(
    (b) => b.owner === c.me && b.kind === 'settlement',
  );
  if ((supply.city ?? 0) > 0 && hasSettlement && costs.city) opts.push({ g: { what: 'city', cost: costs.city }, w: -0.3 });
  if ((supply.settlement ?? 0) > 0 && costs.settlement) {
    if (mySpots(c).length) opts.push({ g: { what: 'settlement', cost: costs.settlement }, w: -0.5 });
    else if ((supply.road ?? 0) > 0 && costs.road) opts.push({ g: { what: 'road', cost: costs.road }, w: 0.5 });
  }
  if (c.view.bank.deckCount > 0 && costs.card) opts.push({ g: { what: 'card', cost: costs.card }, w: 1.2 });
  if (!opts.length) return null;
  let best = opts[0];
  let bs = Infinity;
  for (const o of opts) {
    const s = missing(c.hand, o.g.cost).n + o.w;
    if (s < bs) {
      bs = s;
      best = o;
    }
  }
  return best.g;
}

/** Cards in hand not needed for the goal. */
function surplus(c: Ctx, goal: Goal | null): Bag {
  const out: Bag = {};
  for (const r of c.cfg.resources) out[r] = (c.hand[r] ?? 0) - (goal?.cost[r] ?? 0);
  return out;
}

/** What cards are worth to me given my goal: needed cards count more (sign 1 = receive, -1 = give). */
function bagValue(c: Ctx, bag: Bag, goal: Goal | null, sign: 1 | -1): number {
  const { m } = missing(c.hand, goal?.cost ?? {});
  const sp = surplus(c, goal);
  let v = 0;
  for (const [r, n] of Object.entries(bag)) {
    if (!n) continue;
    if (sign > 0) {
      const need = Math.min(n, m[r] ?? 0);
      v += need * 1.6 + (n - need) * 0.5 * resWeight(c, r);
    } else {
      const spare = Math.min(n, Math.max(0, sp[r] ?? 0));
      v += spare * 0.6 * resWeight(c, r) + (n - spare) * 1.7;
    }
  }
  return v;
}

// ---------- individual decisions ----------

function forceCount(p: PublicPlayer, cfg: RulesConfig): number {
  return cfg.awards.largestForce.cards.reduce((s, k) => s + (p.played[k] ?? 0), 0);
}

function blockerOnMe(c: Ctx): boolean {
  const hex = c.view.board.blocker;
  return !!hex && (c.g.hexVertices[hex] ?? []).some((v) => c.view.pieces.buildings[v]?.owner === c.me);
}

function scoreCard(c: Ctx, a: PlayCard, goal: Goal | null): number {
  const pre = c.view.phase.k === 'preRoll';
  const vpNow = vpOf(c, c.mine);
  const toWin = c.view.init.vpToWin;
  if (a.card === 'guard') {
    const mine = forceCount(c.mine, c.cfg) + 1;
    const holder = c.view.awards.largestForce;
    const holderP = holder ? c.view.players.find((p) => p.id === holder) : undefined;
    const hc = holderP ? forceCount(holderP, c.cfg) : 0;
    const grab = holder !== c.me && mine >= c.cfg.awards.largestForce.min && mine > hc;
    if (grab && vpNow + c.cfg.awards.largestForce.vp >= toWin) return 500; // wins the game
    let s = 0;
    if (blockerOnMe(c)) s += 30;
    if (grab) s += 35;
    if ((c.mine.cards ?? []).filter((x) => x === 'guard').length >= 2) s += 12;
    if (s) return s + (pre ? 5 : 0);
    return pre ? -1 : 4;
  }
  if (pre) return -1;
  if (a.card === 'claim') {
    const r = a.resource!;
    // Estimate what opponents hold of r from their production share and hand counts.
    let est = 0;
    for (const p of c.view.players) {
      if (p.id === c.me || !p.handCount) continue;
      const pr = production(c, p.id);
      const tot = bagTotal(pr) || 1;
      est += (p.handCount * (pr[r] ?? 0)) / tot;
    }
    const need = missing(c.hand, goal?.cost ?? {}).m[r] ?? 0;
    return est >= 2.5 ? est * 4 * resWeight(c, r) + need * 4 : -1;
  }
  if (a.card === 'harvest') {
    const got: Bag = {};
    for (const r of a.resources ?? []) got[r] = (got[r] ?? 0) + 1;
    const v = bagValue(c, got, goal, 1);
    return v >= 2.5 ? 10 + v * 3 : -1;
  }
  if (a.card === 'freeRoads') {
    let reach = 0;
    for (const e of c.g.edges) if (!c.view.pieces.roads[e]) reach = Math.max(reach, roadReach(c, e));
    return mySpots(c).length === 0 && reach > 6 ? 22 : 3;
  }
  return 1; // unknown playable card: low but positive
}

interface Board2 {
  spots: VertexId[];
  routes: Record<PlayerId, number>;
}

function scoreMain(c: Ctx, a: Action, goal: Goal | null, b: Board2): number {
  const vpNow = vpOf(c, c.mine);
  const toWin = c.view.init.vpToWin;
  switch (a.t) {
    case 'endTurn':
      return 0;
    case 'buildCity':
      return (vpNow + 1 >= toWin ? 1000 : 100) + vertexValue(c, a.v) * 1.5;
    case 'placeSettlement':
      return (vpNow + 1 >= toWin ? 1000 : 90) + vertexValue(c, a.v);
    case 'placeRoad': {
      const holder = c.view.awards.longestRoute;
      const myLen = myRouteWith(c, a.e);
      const rival = Math.max(0, ...Object.entries(b.routes).filter(([p]) => p !== c.me).map(([, n]) => n));
      const min = c.cfg.awards.longestRoute.min;
      const grabs = holder !== c.me && myLen >= min && myLen > rival;
      if (grabs && vpNow + c.cfg.awards.longestRoute.vp >= toWin) return 900;
      let s = 0;
      if (grabs) s += 45;
      else if (holder !== c.me && myLen > b.routes[c.me] && myLen >= min - 2 && rival >= min - 1) s += 8;
      const reach = roadReach(c, a.e);
      if (!b.spots.length && (c.mine.supply.settlement ?? 0) > 0) s += reach > 0 ? 20 + reach : 1;
      else s += reach * 0.4;
      // Keep cards for the goal unless the road is clearly useful.
      if (goal && goal.what !== 'road' && s < 15) s -= 6;
      return s;
    }
    case 'buyCard': {
      if (vpNow >= toWin - 2) return 40;
      if (!goal || goal.what === 'card') return 30;
      const sp = surplus(c, goal);
      const spare = Object.entries(c.cfg.costs.card ?? {}).every(([r, n]) => (sp[r] ?? 0) >= n);
      return spare ? 25 : -1;
    }
    case 'playCard':
      return scoreCard(c, a, goal);
    case 'bankTrade': {
      if (!goal) return -1;
      const { m, n } = missing(c.hand, goal.cost);
      const get = Object.keys(a.get)[0];
      const [give, k] = Object.entries(a.give)[0];
      if (!((m[get] ?? 0) > 0)) return -1;
      const sp = surplus(c, goal);
      if ((sp[give] ?? 0) < k) return -1; // would eat into the goal
      // Prefer trades that finish the goal now, and giving away the most redundant resource.
      return (n === 1 ? 30 : 12) + (sp[give] - k) * 0.5 - k;
    }
    default:
      return scoreExt(a);
  }
}

/** Generic scores for extension actions (strongholds "sh:*"): build-like first, never loop moves. */
const EXT_SCORES: Record<string, number> = {
  'sh:improve': 70, 'sh:rampart': 18, 'sh:recruit': 14, 'sh:activate': 10, 'sh:promote': 9, 'sh:play': 20,
  'sh:chase': 12, 'sh:displace': 6, 'sh:resolve': 5, 'sh:bazaarOffer': 4, 'sh:discardCard': -2,
  'sh:moveWarden': -5,
};
function scoreExt(a: Action): number {
  const s = EXT_SCORES[a.t];
  if (s !== undefined) return s;
  return a.t.includes(':') ? 1 : -1;
}

function best(c: Ctx, items: Action[], score: (a: Action) => number, salt: string): Action {
  let bi = items[0];
  let bs = -Infinity;
  items.forEach((a, i) => {
    const s = score(a) + noise(c, `${salt}${i}`) * c.lvl.noise;
    if (s > bs) {
      bs = s;
      bi = a;
    }
  });
  return bi;
}

function setupRoadScore(c: Ctx, a: Action, at?: VertexId): number {
  const e = (a as { e: EdgeId }).e;
  const [x, y] = c.g.edgeEnds[e];
  const far = x === at ? y : x;
  let sc = 0;
  for (const w of c.g.vertexNeighbors[far]) if (w !== at && openSpot(c, w)) sc = Math.max(sc, vertexValue(c, w));
  return sc;
}

function setupRoad(c: Ctx, legal: Action[], at?: VertexId): Action {
  return best(c, legal, (a) => setupRoadScore(c, a, at), 'setupR');
}

function blockerScore(c: Ctx, a: Action): number {
  const hex = (a as { hex: HexId }).hex;
  const p = pips(c.hexes[hex]?.token);
  let sc = 0;
  for (const v of c.g.hexVertices[hex]) {
    const b = c.view.pieces.buildings[v];
    if (!b) continue;
    const w = (c.cfg.buildingYield[b.kind] ?? 1) * Math.max(p, 0.5);
    if (b.owner === c.me) sc -= w * 4;
    else {
      const o = c.view.players.find((x) => x.id === b.owner);
      sc += w * (1 + (o ? o.publicVP : 0) / 4) + (o?.handCount ? 1.5 : 0);
    }
  }
  return sc;
}

function moveBlocker(c: Ctx, legal: Action[]): Action {
  return best(c, legal, (a) => blockerScore(c, a), 'blocker');
}

function stealScore(c: Ctx, a: Action): number {
  const p = c.view.players.find((x) => x.id === (a as { target: PlayerId }).target);
  if (!p) return -100;
  return p.publicVP * 2 + Math.min(p.handCount, 8) * 0.5 + (p.handCount ? 3 : -10);
}

function steal(c: Ctx, legal: Action[]): Action {
  return best(c, legal, (a) => stealScore(c, a), 'steal');
}

function discard(c: Ctx, owed: number): Action {
  const goal = chooseGoal(c);
  const hand = { ...c.hand };
  const out: Bag = {};
  for (let i = 0; i < owed; i++) {
    let pick: string | null = null;
    let bs = -Infinity;
    for (const r of Object.keys(hand)) {
      if (!(hand[r] > 0)) continue;
      const s = hand[r] - (goal?.cost[r] ?? 0) * 1.5 - resWeight(c, r);
      if (s > bs) {
        bs = s;
        pick = r;
      }
    }
    if (!pick) break;
    hand[pick] -= 1;
    out[pick] = (out[pick] ?? 0) + 1;
  }
  return { t: 'discard', player: c.me, bag: out };
}

function respondToOffer(c: Ctx): Action | null {
  const t = c.view.trade!;
  if (t.responses[c.me]) return null; // already answered: do not flip-flop
  const decline: Action = { t: 'respondTrade', player: c.me, accept: false };
  const from = c.view.players.find((p) => p.id === t.from);
  if (!from || from.publicVP >= c.view.init.vpToWin - 2) return decline; // never feed a near-winner
  if (!Object.entries(t.get).every(([r, n]) => (c.hand[r] ?? 0) >= n)) return decline;
  const goal = chooseGoal(c);
  const gain = bagValue(c, t.give, goal, 1);
  const loss = bagValue(c, t.get, goal, -1);
  const leads = from.publicVP >= leaderVP(c) && from.publicVP > vpOf(c, c.mine) ? 0.4 : 0;
  const jitter = (noise(c, 'resp') - 0.5) * c.lvl.noise * 0.2;
  return { t: 'respondTrade', player: c.me, accept: gain - loss - leads + jitter > c.lvl.margin };
}

function manageOwnOffer(c: Ctx, opts: BotOptions): Action | null {
  const t = c.view.trade!;
  // Give everyone (humans too) the chance to answer before picking a partner.
  const allAnswered = Object.keys(t.responses).length >= c.view.players.length - 1;
  if (!allAnswered && !opts.tradeTimedOut) return null;
  const goal = chooseGoal(c);
  let bestA: Action | null = null;
  let bs = -Infinity;
  for (const [pid, r] of Object.entries(t.responses)) {
    if (r.response === 'decline') continue;
    const give = r.response === 'counter' ? r.get ?? {} : t.give;
    const get = r.response === 'counter' ? r.give ?? {} : t.get;
    if (!Object.entries(give).every(([k, n]) => (c.hand[k] ?? 0) >= n)) continue;
    const s = bagValue(c, get, goal, 1) - bagValue(c, give, goal, -1);
    if (r.response === 'counter' && s <= c.lvl.margin) continue;
    if (s > bs) {
      bs = s;
      bestA = { t: 'confirmTrade', player: c.me, with: pid };
    }
  }
  return bestA ?? { t: 'cancelTrade', player: c.me };
}

/** Log entries since the current turn started (the last endTurn). */
function turnLog(c: Ctx): PlayerView['log'] {
  const log = c.view.log;
  let i = log.length - 1;
  while (i >= 0 && log[i].action.t !== 'endTurn') i--;
  return log.slice(i + 1);
}

/** Offer at most one 1-for-1 trade per turn toward the goal. */
function maybeOffer(c: Ctx, goal: Goal | null, legal: Action[]): Action | null {
  if (!goal || !legal.some((a) => a.t === 'offerTrade')) return null;
  const { m, n } = missing(c.hand, goal.cost);
  if (n === 0 || n > 2) return null;
  if (turnLog(c).some((l) => l.action.t === 'offerTrade' && l.action.player === c.me)) return null;
  if (noise(c, 'offer') > c.lvl.trade) return null;
  const sp = surplus(c, goal);
  const need = Object.keys(m).sort((x, y) => m[y] - m[x])[0];
  // Do not pester the table with an offer everybody just turned down (it came back each turn).
  const refused = recentlyRefused(c);
  let give: string | null = null;
  for (const r of c.cfg.resources) {
    if (r === need || (sp[r] ?? 0) < 1 || refused.has(`${r}>${need}`)) continue;
    if (!give || sp[r] > sp[give]) give = r;
  }
  if (!give) return null;
  return { t: 'offerTrade', player: c.me, give: { [give]: 1 }, get: { [need]: 1 } };
}

/** How many of the bot's own past turns an unanswered (cancelled) 1:1 offer stays "refused". */
const REFUSED_TURNS = 3;

/** "give>get" keys of 1:1 offers the bot made in its last REFUSED_TURNS turns that ended cancelled. */
function recentlyRefused(c: Ctx): Set<string> {
  const log = c.view.log;
  const out = new Set<string>();
  let myTurns = 0;
  let open: string | null = null; // the offer whose fate we are reading (scanning backwards)
  let fate: 'cancel' | 'confirm' | null = null;
  for (let i = log.length - 1; i >= 0 && myTurns <= REFUSED_TURNS; i--) {
    const a = log[i].action;
    if (a.t === 'endTurn' && a.player === c.me) myTurns++;
    if (a.player !== c.me) continue;
    if (a.t === 'cancelTrade') fate = 'cancel';
    else if (a.t === 'confirmTrade') fate = 'confirm';
    else if (a.t === 'offerTrade') {
      const o = a as { give: Record<string, number>; get: Record<string, number> };
      const g = Object.keys(o.give);
      const w = Object.keys(o.get);
      open = g.length === 1 && w.length === 1 ? `${g[0]}>${w[0]}` : null;
      if (open && fate !== 'confirm') out.add(open);
      fate = null;
    }
  }
  return out;
}

// ---------- entry point ----------

/**
 * Pick the bot's next action from its own view and its legal actions, or null when the bot has
 * nothing to do right now (not its move, or waiting for answers to its own trade offer).
 */
function makeCtx(view: PlayerView, level: BotLevel): Ctx | null {
  const me = view.viewer;
  const mine = me ? view.players.find((p) => p.id === me) : undefined;
  if (!me || !mine) return null;
  const cfg = getRules(view.init.rulesetIds).config;
  const hexes: Ctx['hexes'] = {};
  for (const h of view.board.hexes) hexes[h.id] = h;
  const base = {
    view, me, mine, hand: mine.hand ?? {}, g: getGraph(view.init.layout), cfg,
    lvl: LEVELS[level], hexes, salt: view.log.length,
  };
  return { ...base, prod: production(base, me) };
}

/**
 * Heuristic scores (no noise) for the given actions of the current decision, best first. Used by the
 * search bot to pick the candidate moves worth simulating.
 */
export function rankActions(view: PlayerView, legal: Action[]): { action: Action; score: number }[] {
  const c = makeCtx(view, 'hard');
  if (!c) return [];
  const ph = view.phase;
  const goal = chooseGoal(c);
  const b: Board2 = { spots: mySpots(c), routes: routeLengths(c) };
  const score = (a: Action): number => {
    switch (a.t) {
      case 'placeSettlement':
        return ph.k === 'setup' ? vertexValue(c, a.v) : scoreMain(c, a, goal, b);
      case 'placeRoad':
        return ph.k === 'setup' ? setupRoadScore(c, a, ph.at) : scoreMain(c, a, goal, b);
      case 'moveBlocker':
        return blockerScore(c, a);
      case 'steal':
        return stealScore(c, a);
      case 'roll':
        return 0;
      default:
        return scoreMain(c, a, goal, b);
    }
  };
  return legal.map((action) => ({ action, score: score(action) })).sort((x, y) => y.score - x.score);
}

export function decide(view: PlayerView, legal: Action[], opts: BotOptions = {}): Action | null {
  if (view.winner || !legal.length) return null;
  const c = makeCtx(view, opts.level ?? 'normal');
  if (!c) return null;
  const me = c.me;
  const ph = view.phase;
  const only = (t: string) => legal.filter((a) => a.t === t);

  if (ph.k === 'setup') {
    const s = only('placeSettlement');
    if (s.length) return best(c, s, (a) => vertexValue(c, (a as { v: VertexId }).v), 'setupS');
    const r = only('placeRoad');
    if (r.length) return setupRoad(c, r, ph.at);
  }
  if (ph.k === 'discard') return (ph.owed[me] ?? 0) > 0 ? discard(c, ph.owed[me]) : null;
  if (ph.k === 'moveBlocker' && only('moveBlocker').length) return moveBlocker(c, only('moveBlocker'));
  if (ph.k === 'steal' && only('steal').length) return steal(c, only('steal'));

  if (view.trade) {
    // While my own offer is open I only manage it (building would change the hand it relies on).
    if (view.trade.from === me) return manageOwnOffer(c, opts);
    if (only('respondTrade').length && view.turn.current !== me) return respondToOffer(c);
  }

  const goal = chooseGoal(c);
  const skip = new Set(['offerTrade', 'respondTrade', 'confirmTrade', 'cancelTrade', 'discard']);
  const pool = legal.filter((a) => !skip.has(a.t));
  if (!pool.length) return null;

  if (ph.k === 'preRoll') {
    const cards = pool.filter((a): a is PlayCard => a.t === 'playCard');
    if (cards.length) {
      const a = best(c, cards, (x) => scoreCard(c, x as PlayCard, goal), 'pre') as PlayCard;
      if (scoreCard(c, a, goal) > 0) return a;
    }
    const roll = pool.find((a) => a.t === 'roll');
    if (roll) return roll;
  }

  const b: Board2 = { spots: mySpots(c), routes: routeLengths(c) };
  const pick = best(c, pool, (a) => scoreMain(c, a, goal, b), 'main');
  const end = pool.find((a) => a.t === 'endTurn');
  if (!end) return pick; // a window that must be resolved (free roads, extension choices)
  if (pick.t !== 'endTurn' && scoreMain(c, pick, goal, b) > 0) return pick;
  return maybeOffer(c, goal, legal) ?? end;
}
