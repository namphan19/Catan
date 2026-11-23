// Text rendering of a PlayerView for an LLM agent: board, positions, actions and events.
// Everything here works on the redacted view the server sends, so it never knows more than a
// human player at the table would.
import {
  getGraph, getRules, parseHex, type Action, type Bag, type GameEvent, type LoggedAction, type PlayerView,
} from '@hexgame/engine';

export interface SeatInfo {
  seat: string;
  name: string;
  connected: boolean;
  ready: boolean;
  bot?: string;
  afk?: boolean;
}

export interface Ctx {
  view: PlayerView;
  seats: SeatInfo[];
  me: string | null;
}

/** Familiar names for the engine's neutral resource ids (actions must use the engine ids). */
export const RES_ALIAS: Record<string, string> = {
  timber: 'wood', clay: 'brick', fiber: 'wool', grain: 'wheat', stone: 'ore',
  books: 'paper', linen: 'cloth', silver: 'coin',
};
export const CARD_ALIAS: Record<string, string> = {
  guard: 'knight', freeRoads: 'road building', harvest: 'year of plenty', claim: 'monopoly', relic: 'victory point',
};
const TERRAIN_SHORT: Record<string, string> = {
  forest: 'Wood', claypit: 'Brick', meadow: 'Wool', field: 'Wheat', quarry: 'Ore', waste: 'Desert',
  sea: '~~', goldmine: 'Gold', mist: 'Mist',
};

export const pips = (token?: number): number => (token ? 6 - Math.abs(7 - token) : 0);

export function legend(view: PlayerView): string {
  const cfg = getRules(view.init.rulesetIds).config;
  const res = cfg.resources.map((r) => (RES_ALIAS[r] ? `${r}=${RES_ALIAS[r]}` : r)).join(', ');
  const terr = Object.entries(cfg.terrainResource)
    .map(([t, r]) => `${t}->${r ?? 'nothing'}`)
    .join(', ');
  const costs = Object.entries(cfg.costs)
    .map(([k, b]) => `${k}: ${bagStr(b as Bag)}`)
    .join('; ');
  return [
    `Resources (use these ids in actions): ${res}`,
    `Terrains: ${terr}`,
    `Costs: ${costs}`,
    `Cards: ${Object.entries(CARD_ALIAS).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    'Ids: hex "h:q,r" (axial, pointy-top); vertex "v:q,r,N|S" (top/bottom corner of hex q,r);',
    '     edge "e:q,r,NE|NW|W". Neighbours of hex (q,r): E(q+1,r) W(q-1,r) NE(q+1,r-1) NW(q,r-1) SE(q,r+1) SW(q-1,r+1).',
  ].join('\n');
}

export function who(c: Ctx, id: string | null | undefined): string {
  if (!id) return 'nobody';
  const s = c.seats.find((x) => x.seat === id);
  const tag = id === c.me ? ' (you)' : s?.bot ? ` (bot ${s.bot})` : '';
  return `${id}${s ? ` ${s.name}` : ''}${tag}`;
}

export function bagStr(b: Bag | undefined): string {
  if (!b) return 'nothing';
  const parts = Object.entries(b).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${r}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function hexStr(view: PlayerView, id: string): string {
  const h = view.board.hexes.find((x) => x.id === id);
  if (!h) return `${id} (off board)`;
  const tok = h.token ? ` ${h.token} (${pips(h.token)} pips)` : '';
  const blk = view.board.blocker === id ? ' [ROBBER]' : '';
  return `${id} ${h.terrain}${tok}${blk}`;
}

function hexShort(view: PlayerView, id: string): string {
  const h = view.board.hexes.find((x) => x.id === id);
  if (!h) return '';
  const t = TERRAIN_SHORT[h.terrain] ?? h.terrain;
  return `${t}${h.token ?? ''}${view.board.blocker === id ? '*' : ''}`;
}

/** Adjacent hexes, pips and harbor of a vertex, plus what stands on it. */
export function vertexStr(c: Ctx, v: string, pieces = true): string {
  const { view } = c;
  const g = getGraph(view.init.layout);
  const hexes = (g.vertexHexes[v] ?? []).filter((h) => view.board.hexes.some((x) => x.id === h));
  const land = hexes.map((h) => hexShort(view, h)).filter(Boolean);
  const total = hexes.reduce((n, h) => n + pips(view.board.hexes.find((x) => x.id === h)?.token), 0);
  const harbor = view.board.harbors.find((hb) => hb.vertices.includes(v));
  const b = view.pieces.buildings[v];
  const occ = view.pieces.occupants?.[v];
  const parts = [`${v} [${land.join(' + ') || 'no land'}; ${total} pips]`];
  if (harbor) parts.push(`harbor ${harbor.ratio}:1 ${harbor.kind}`);
  if (b && pieces) parts.push(`${b.kind} of ${who(c, b.owner)}`);
  if (occ && pieces) parts.push(`${occ.kind} L${occ.level}${occ.active ? ' active' : ''} of ${who(c, occ.owner)}`);
  return parts.join(', ');
}

export function edgeStr(c: Ctx, e: string): string {
  const g = getGraph(c.view.init.layout);
  const ends = g.edgeEnds[e];
  const hexes = (g.edgeHexes[e] ?? []).map((h) => hexShort(c.view, h)).filter(Boolean);
  return `${e} (between ${ends ? ends.join(' and ') : '?'}; side of ${hexes.join('/') || 'nothing'})`;
}

/** Describe any id-looking value inside an action. */
function idStr(c: Ctx, v: unknown): string {
  if (typeof v !== 'string') return JSON.stringify(v);
  if (v.startsWith('v:')) return vertexStr(c, v);
  if (v.startsWith('e:')) return edgeStr(c, v);
  if (v.startsWith('h:')) return hexStr(c.view, v);
  if (/^p[1-6]$/.test(v)) return who(c, v);
  return v;
}

export function actionStr(c: Ctx, a: Action): string {
  const x = a as Record<string, unknown> & Action;
  switch (a.t) {
    case 'placeSettlement': return `settlement at ${vertexStr(c, x.v as string)}`;
    case 'buildCity': return `city at ${vertexStr(c, x.v as string)}`;
    case 'placeRoad': return `road on ${edgeStr(c, x.e as string)}`;
    case 'roll': return 'roll the dice';
    case 'endTurn': return 'end the turn';
    case 'buyCard': return 'buy a development card';
    case 'discard': return `discard ${bagStr(x.bag as Bag)}`;
    case 'moveBlocker': return `move the robber to ${hexStr(c.view, x.hex as string)}${victimsStr(c, x.hex as string)}`;
    case 'steal': return `steal from ${who(c, x.target as string)}`;
    case 'bankTrade': return `bank/harbor trade: give ${bagStr(x.give as Bag)}, get ${bagStr(x.get as Bag)}`;
    case 'offerTrade': return `offer players: give ${bagStr(x.give as Bag)}, get ${bagStr(x.get as Bag)}`;
    case 'respondTrade': {
      const r = (x.response as string) ?? (x.accept ? 'accept' : 'decline');
      return r === 'counter' ? `counter: give ${bagStr(x.give as Bag)}, get ${bagStr(x.get as Bag)}` : `${r} the open offer`;
    }
    case 'confirmTrade': return `confirm the trade with ${who(c, x.with as string)}`;
    case 'cancelTrade': return 'cancel your trade offer';
    case 'playCard': {
      const extra = x.resources ? ` taking ${(x.resources as string[]).join(' + ')}` : x.resource ? ` naming ${x.resource}` : '';
      return `play ${x.card} (${CARD_ALIAS[x.card as string] ?? 'card'})${extra}`;
    }
    default: {
      const fields = Object.entries(x)
        .filter(([k]) => k !== 't' && k !== 'player')
        .map(([k, v]) => `${k}=${idStr(c, v)}`);
      return `${a.t}${fields.length ? ' ' + fields.join('; ') : ''}`;
    }
  }
}

function victimsStr(c: Ctx, hex: string): string {
  const g = getGraph(c.view.init.layout);
  const owners = new Set<string>();
  for (const v of g.hexVertices[hex] ?? []) {
    const b = c.view.pieces.buildings[v];
    if (b && b.owner !== c.me) owners.add(b.owner);
  }
  return owners.size ? ` (touches ${[...owners].map((o) => who(c, o)).join(', ')})` : ' (no opponent there)';
}

export function eventStr(c: Ctx, ev: GameEvent): string | null {
  switch (ev.e) {
    case 'placed': return `${who(c, ev.player)} built a ${ev.kind}${ev.free ? ' (free)' : ''} at ${idStr(c, ev.at)}`;
    case 'rolled': return `${who(c, ev.player)} rolled ${ev.dice.join('+')} = ${ev.sum}`;
    case 'produced': {
      const parts = Object.entries(ev.gains).map(([p, b]) => `${who(c, p)} got ${bagStr(b)}`);
      return parts.length ? `Production: ${parts.join('; ')}` : 'Production: nobody got anything';
    }
    case 'discarded': return `${who(c, ev.player)} discarded ${bagStr(ev.bag)}`;
    case 'blockerMoved': return `${who(c, ev.player)} moved the robber to ${hexStr(c.view, ev.hex)}`;
    case 'stole': return `${who(c, ev.to)} stole ${ev.resource ? `1 ${ev.resource}` : 'a card'} from ${who(c, ev.from)}`;
    case 'traded':
      return `${who(c, ev.a)} traded with ${ev.b === 'bank' ? 'the bank' : who(c, ev.b)}: gave ${bagStr(ev.aGave)}, got ${bagStr(ev.bGave)}`;
    case 'tradeOffered': return `${who(c, ev.player)} OFFERS: gives ${bagStr(ev.give)}, wants ${bagStr(ev.get)}`;
    case 'tradeResponse': return `${who(c, ev.player)} answered the offer: ${ev.response}`;
    case 'tradeCancelled': return `${who(c, ev.player)} cancelled the offer`;
    case 'cardBought': return `${who(c, ev.player)} bought a card${ev.card ? ` (${ev.card})` : ''}`;
    case 'cardPlayed': return `${who(c, ev.player)} played ${ev.card} (${CARD_ALIAS[ev.card] ?? 'card'})${ev.detail ? ' ' + JSON.stringify(ev.detail) : ''}`;
    case 'awardChanged': return `Award ${ev.award}: ${who(c, ev.from)} -> ${who(c, ev.to)}`;
    case 'phase': return null; // the state summary already shows the phase
    case 'turnStarted': return `--- Turn ${ev.n}: ${who(c, ev.player)} ---`;
    case 'won': return `*** ${who(c, ev.player)} WON with ${ev.vp} VP ***`;
    case 'ext': {
      const d = JSON.stringify(ev.data);
      const s = ev.secret !== undefined ? ` secret=${JSON.stringify(ev.secret)}` : '';
      return `[${ev.id}] ${d && d.length > 300 ? d.slice(0, 300) + '...' : d}${s}`;
    }
  }
}

/** One line per logged action (public history, from view.log). */
export function logStr(c: Ctx, l: LoggedAction): string {
  const a = l.action;
  let s = `#${l.seq} ${who(c, a.player)}: ${actionStr(c, a)}`;
  if (l.roll) s += ` -> ${l.roll.dice.join('+')}=${l.roll.sum}`;
  if (l.gains && Object.keys(l.gains).length)
    s += ` | gains: ${Object.entries(l.gains).map(([p, b]) => `${p} ${bagStr(b)}`).join('; ')}`;
  return s;
}

export function phaseStr(c: Ctx): string {
  const ph = c.view.phase;
  switch (ph.k) {
    case 'setup': return `setup placement ${ph.idx + 1} by ${who(c, setupActor(c))}, ${ph.step} step${ph.at ? ` (road must touch ${ph.at})` : ''}`;
    case 'preRoll': return 'before the roll';
    case 'main': return 'main phase (trade/build/play cards, then end turn)';
    case 'discard': return `discard (robber rolled): ${Object.entries(ph.owed).map(([p, n]) => `${who(c, p)} owes ${n}`).join(', ')}`;
    case 'paired': return `paired turn of ${who(c, ph.player)}`;
    case 'moveBlocker': return 'move the robber';
    case 'steal': return `steal from one of ${ph.from.map((p) => who(c, p)).join(', ')}`;
    case 'freeRoads': return `free roads (${ph.left} left)`;
    case 'extraBuild': return `extra build phase, queue ${ph.queue.join(',')}`;
    case 'over': return 'game over';
    case 'ext': return `expansion window "${ph.id}"${ph.actors ? ` for ${ph.actors.join(',')}` : ''}: ${JSON.stringify(ph.data).slice(0, 400)}`;
  }
}

/** Who places now in setup (base setupOrder: first player forward, then backward, extra rounds forward). */
function setupActor(c: Ctx): string | undefined {
  const ph = c.view.phase;
  if (ph.k !== 'setup') return undefined;
  const ids = c.view.players.map((p) => p.id);
  const k = ids.indexOf(c.view.turn.current);
  const rot = k < 0 ? ids : [...ids.slice(k), ...ids.slice(0, k)];
  const order = [...rot, ...[...rot].reverse()];
  for (let r = 2; r < (c.view.init.setupRounds ?? 2); r++) order.push(...rot);
  return order[ph.idx];
}

export function stateText(c: Ctx, legalCount: number): string {
  const { view } = c;
  const out: string[] = [];
  const meP = view.players.find((p) => p.id === c.me);
  out.push(view.phase.k === 'setup' ? `Setup; ${phaseStr(c)}` : `Turn ${view.turn.n}, current player ${who(c, view.turn.current)}; phase: ${phaseStr(c)}`);
  if (view.turn.roll) out.push(`Last roll this turn: ${view.turn.roll.join('+')} = ${view.turn.roll.reduce((a, b) => a + b, 0)}`);
  if (view.winner) out.push(`WINNER: ${who(c, view.winner)}`);
  out.push(legalCount ? `>>> You have ${legalCount} legal action(s) now: call list_actions.` : '>>> Nothing for you to do right now (waiting for others).');
  out.push(`Goal: ${view.init.vpToWin} VP. Rulesets: ${view.init.rulesetIds.join('+')}${view.init.options ? ' ' + JSON.stringify(view.init.options) : ''}`);
  if (meP) {
    out.push('');
    out.push(`YOU ${who(c, c.me)}: ${meP.vp ?? meP.publicVP} VP (public ${meP.publicVP})`);
    out.push(`  hand (${meP.handCount}): ${bagStr(meP.hand)}`);
    out.push(`  cards playable: ${meP.cards?.join(', ') || 'none'}; bought this turn: ${meP.newCards?.join(', ') || 'none'}`);
    out.push(`  played: ${JSON.stringify(meP.played)}; pieces left: ${JSON.stringify(meP.supply)}`);
    out.push(`  your ports: ${myHarbors(c).join(', ') || 'none (bank 4:1)'}`);
  }
  out.push('');
  out.push('Players:');
  for (const p of view.players) {
    if (p.id === c.me) continue;
    const s = c.seats.find((x) => x.seat === p.id);
    out.push(
      `  ${who(c, p.id)}: ${p.publicVP} public VP, ${p.handCount} resource cards, ${p.cardCount} dev cards, played ${JSON.stringify(p.played)}${s && !s.connected ? ' [offline]' : ''}${s?.afk ? ' [afk-bot]' : ''}${p.hand ? `, hand ${bagStr(p.hand)}` : ''}`,
    );
  }
  out.push(`Awards: ${Object.entries(view.awards).map(([k, v]) => `${k}=${who(c, v)}`).join(', ')}`);
  out.push(`Bank: ${bagStr(view.bank.hand)}; dev deck ${view.bank.deckCount}`);
  if (view.trade) {
    const t = view.trade;
    out.push('');
    out.push(`OPEN TRADE by ${who(c, t.from)}: they give ${bagStr(t.give)}, they want ${bagStr(t.get)}`);
    for (const [p, r] of Object.entries(t.responses))
      out.push(`  ${who(c, p)}: ${r.response}${r.response === 'counter' ? ` (gives ${bagStr(r.give)}, wants ${bagStr(r.get)})` : ''}`);
  }
  if (view.ext && Object.keys(view.ext).length) {
    out.push('');
    out.push(`Expansion state: ${JSON.stringify(view.ext).slice(0, 2500)}`);
  }
  return out.join('\n');
}

function myHarbors(c: Ctx): string[] {
  const out = new Set<string>();
  for (const hb of c.view.board.harbors) {
    if (hb.vertices.some((v) => c.view.pieces.buildings[v]?.owner === c.me)) out.add(`${hb.ratio}:1 ${hb.kind}`);
  }
  return [...out];
}

/** ASCII hex map, then the lists of hexes, harbors and pieces. */
export function boardText(c: Ctx): string {
  const { view } = c;
  const hexes = view.board.hexes;
  const W = 14;
  const rows = new Map<number, typeof hexes>();
  for (const h of hexes) rows.set(h.r, [...(rows.get(h.r) ?? []), h]);
  const minX = Math.min(...hexes.map((h) => h.q + h.r / 2));
  const lines: string[] = ['Map (pointy-top rows, top = smallest r; cell = terrain+token, * = robber):'];
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(r)!.sort((a, b) => a.q - b.q);
    let line = '';
    let col = 0;
    for (const h of row) {
      const x = Math.round((h.q + h.r / 2 - minX) * W);
      if (x > col) line += ' '.repeat(x - col);
      const cell = `${hexShort(view, h.id)}(${h.q},${h.r})`.padEnd(W);
      line += cell;
      col = x + cell.length;
    }
    lines.push(`r=${String(r).padStart(2)} ${line}`);
  }
  lines.push('');
  lines.push('Hexes:');
  for (const h of [...hexes].sort((a, b) => a.r - b.r || a.q - b.q)) {
    if (h.terrain === 'sea') continue;
    lines.push(`  ${hexStr(view, h.id)}${h.region ? ` region ${h.region}` : ''}`);
  }
  const sea = hexes.filter((h) => h.terrain === 'sea').length;
  if (sea) lines.push(`  (+${sea} sea hexes)`);
  lines.push('Harbors:');
  for (const hb of view.board.harbors) lines.push(`  ${hb.ratio}:1 ${hb.kind} at ${hb.vertices.join(' / ')}`);
  lines.push('Buildings:');
  for (const [v, b] of Object.entries(view.pieces.buildings)) lines.push(`  ${b.kind} ${who(c, b.owner)}: ${vertexStr(c, v, false)}`);
  const byOwner = (m: Record<string, string> | undefined) => {
    const g: Record<string, string[]> = {};
    for (const [e, p] of Object.entries(m ?? {})) (g[p] ??= []).push(e);
    return g;
  };
  lines.push('Roads:');
  for (const [p, es] of Object.entries(byOwner(view.pieces.roads))) lines.push(`  ${who(c, p)}: ${es.join(' ')}`);
  if (view.pieces.ships) {
    lines.push('Ships:');
    for (const [p, es] of Object.entries(byOwner(view.pieces.ships))) lines.push(`  ${who(c, p)}: ${es.join(' ')}`);
  }
  if (view.pieces.occupants) {
    lines.push('Wardens/occupants:');
    for (const [v, o] of Object.entries(view.pieces.occupants))
      lines.push(`  ${o.kind} L${o.level}${o.active ? ' active' : ' inactive'} ${who(c, o.owner)} at ${v}`);
  }
  return lines.join('\n');
}

/** The best free settlement spots by pips (public information a human sees as token dots). */
export function openSpots(c: Ctx, limit: number): string {
  const { view } = c;
  const g = getGraph(view.init.layout);
  const taken = new Set(Object.keys(view.pieces.buildings));
  const blocked = (v: string) => taken.has(v) || (g.vertexNeighbors[v] ?? []).some((n) => taken.has(n));
  const scored = g.vertices
    .filter((v) => !blocked(v))
    .map((v) => {
      const hs = (g.vertexHexes[v] ?? []).map((h) => view.board.hexes.find((x) => x.id === h)).filter(Boolean);
      return { v, p: hs.reduce((n, h) => n + pips(h!.token), 0) };
    })
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, limit);
  return scored.map((x) => `  ${vertexStr(c, x.v)}`).join('\n');
}

export { parseHex };
