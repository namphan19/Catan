// Playtest harness: p1 plays like a sensible human (priority list over ALL action kinds) vs bots; logs everything.
import {
  applyAction, createGame, decide, getLegalActions, getPlayerView, victoryPoints, validateAction,
  type Action, type GameState, type PlayerId,
} from '../src';
import { writeFileSync } from 'node:fs';

const seed = process.argv[2] ?? 'pt1';
const maxTurns = Number(process.argv[3] ?? 200);
const vpToWin = Number(process.argv[4] ?? 13);
const OUT = process.argv[5] ?? 'playtest.log';
let s: GameState = createGame({ seed, playerCount: 4, rulesets: ['base', 'strongholds'], vpToWin });
const ME: PlayerId = 'p1';
const lines: string[] = [];
const log = (m: string) => lines.push(m);
const usedTypes: Record<string, number> = {};
const offeredTypes: Record<string, number> = {};
let myTurnActions = 0;

const hand = (id: PlayerId) => {
  const p: any = s.players.find((x) => x.id === id);
  return JSON.stringify(p.hand ?? p.resources);
};
const brief = (a: Action) => JSON.stringify(a).replace(/"player":"p\d",?/, '');

// Priority: lower = better. Human-ish.
const PRI: Array<[RegExp, number]> = [
  [/^sh:resolve$/, 0], [/^respondTrade$/, 1], [/^discard$/, 0], [/^moveBlocker$/, 0], [/^steal$/, 0], [/^roll$/, 0],
  [/^playCard$/, 5], [/^sh:play$/, 6], [/^buildCity$/, 7], [/^placeSettlement$/, 7], [/^sh:improve$/, 8], [/^sh:rampart$/, 9],
  [/^sh:activate$/, 10], [/^sh:recruit$/, 11], [/^sh:promote$/, 12], [/^placeRoad$/, 13], [/^sh:chase$/, 14],
  [/^sh:displace$/, 15], [/^sh:moveWarden$/, 16], [/^bankTrade$/, 40], [/^sh:bazaarOffer$/, 30],
  [/^offerTrade$/, 50], [/^confirmTrade$/, 3], [/^cancelTrade$/, 60], [/^sh:discardCard$/, 20], [/^endTurn$/, 99],
];
const pri = (a: Action) => PRI.find(([r]) => r.test(a.t))?.[1] ?? 70;

let tradeOffersThisTurn = 0, lastTurnN = -1, stuckGuard = 0;
const chosenKeys = new Set<string>();

function humanChoose(legal: Action[]): Action {
  if (s.turn.n !== lastTurnN) { lastTurnN = s.turn.n; tradeOffersThisTurn = 0; chosenKeys.clear(); }
  for (const a of legal) offeredTypes[a.t] = (offeredTypes[a.t] ?? 0) + 1;
  // setup / forced things: use the bot brain for placement quality
  if (s.phase.k === 'setup' || s.phase.k === 'discard' || s.phase.k === 'moveBlocker' || s.phase.k === 'steal') {
    const d = decide(getPlayerView(s, ME), legal, { level: 'hard' });
    if (d) return d;
  }
  let pool = legal.filter((a) => !chosenKeys.has(brief(a)));
  // do not spam trades: at most 2 offers per turn, and only try bank trades when a build is 1 card away (skip: rarely)
  pool = pool.filter((a) => a.t !== 'offerTrade' || tradeOffersThisTurn < 1);
  pool = pool.filter((a) => a.t !== 'bankTrade' || tradeOffersThisTurn < 3);
  // road only if we have <=? plenty of roads: leave to priority
  const sorted = [...pool].sort((a, b) => pri(a) - pri(b));
  let pick = sorted[0];
  // Be a bit smarter for specific classes: improve the track with the lowest level; rampart ok; resolve via bot
  const sameTop = sorted.filter((a) => pri(a) === pri(pick));
  if (pick.t === 'sh:resolve' || pick.t === 'respondTrade') {
    const d = decide(getPlayerView(s, ME), legal, { level: 'hard' });
    if (d && d.t === pick.t) return d;
  }
  if (pick.t === 'sh:improve') {
    const lv: any = (s as any).ext.strongholds.levels[ME];
    pick = sameTop.sort((a: any, b: any) => (lv[a.track] ?? 0) - (lv[b.track] ?? 0))[0];
  }
  if (pick.t === 'offerTrade') tradeOffersThisTurn++;
  if (pick.t === 'bankTrade') tradeOffersThisTurn++;
  if (pick.t === 'cancelTrade' || pick.t === 'sh:moveWarden' || pick.t === 'sh:bazaarOffer') chosenKeys.add(brief(pick));
  return pick;
}

const vpTable = () => s.players.map((p) => `${p.id}:${victoryPoints(s, p.id, { public: false } as any)}`).join(' ');
let lastReported = -1;
let guard = 0;
while (!s.winner && s.turn.n <= maxTurns && guard++ < 40000) {
  const ids = s.players.map((p) => p.id);
  const cur = s.turn.current;
  // first, anyone who can answer something
  let acted = false;
  const order = [...ids.filter((i) => i !== cur), cur];
  for (const timedOut of [false, true]) {
    for (const id of order) {
      let legal = getLegalActions(s, id);
      if (id === ME && (s as any).trade?.responses?.[ME]) legal = legal.filter((x) => x.t !== 'respondTrade');
      if (!legal.length) continue;
      let a: Action | null;
      if (id === ME) a = humanChoose(legal);
      else a = decide(getPlayerView(s, id), legal, { level: 'hard', tradeTimedOut: timedOut });
      if (!a) continue;
      const v = validateAction(s, a);
      if (!v.ok) { log(`!! INVALID by ${id}: ${brief(a)} -> ${v.code} ${v.message}`); a = legal.find((x) => x.t === 'endTurn') ?? legal[0]; }
      if (s.turn.n !== lastReported && s.phase.k !== 'setup') {
        lastReported = s.turn.n;
        const shs: any = (s as any).ext.strongholds;
        log(`\n=== turn ${s.turn.n} (round ${Math.ceil(s.turn.n / 4)}) current=${cur} raid=${shs.raid.pos}/7 attacks=${shs.raid.attacks} blockerActive=${shs.blockerActive} | VP ${vpTable()} | levels ${JSON.stringify(shs.levels)} | caps ${JSON.stringify(Object.fromEntries(Object.entries(shs.capitals).map(([k, v]: any) => [k, v?.owner ?? null])))}`);
        log(`   p1 hand: ${hand(ME)} cards=${JSON.stringify((s.players.find((x) => x.id === ME) as any).cards ?? null)}`);
      }
      const before = s;
      s = applyAction(s, a).state;
      usedTypes[a.t] = (usedTypes[a.t] ?? 0) + 1;
      const last = s.log[s.log.length - 1] as any;
      const extra = last?.roll ? ` roll=${JSON.stringify(last.roll)}` : '';
      const gains = last?.gains && Object.keys(last.gains).length ? ` gains=${JSON.stringify(last.gains)}` : '';
      if (id === ME || ['sh:resolve', 'roll', 'moveBlocker', 'steal'].includes(a.t) || a.t.startsWith('sh:'))
        log(`  ${id}${id === ME ? '*' : ' '} ${brief(a)}${extra}${gains} [phase ${before.phase.k}->${s.phase.k}${(s.phase as any).id ? ':' + (s.phase as any).id : ''}]`);
      acted = true;
      break;
    }
    if (acted) break;
  }
  if (!acted) { log('!! STALL: nobody can act in phase ' + s.phase.k); break; }
}
log(`\nEND: turn ${s.turn.n}, winner=${s.winner ?? 'none'} | VP ${vpTable()} | actions ${s.log.length}`);
log(`used: ${JSON.stringify(usedTypes)}`);
log(`offered (p1, per decision): ${JSON.stringify(offeredTypes)}`);

{
  const shs: any = (s as any).ext.strongholds;
  for (const p of s.players) {
    const b = Object.entries(s.pieces.buildings).filter(([, x]: any) => x.owner === p.id);
    const cities = b.filter(([, x]: any) => x.kind === 'city').length, sett = b.length - cities;
    const roads = Object.values(s.pieces.roads).filter((o) => o === p.id).length;
    const w = Object.values((s.pieces as any).occupants ?? {}).filter((o: any) => o.owner === p.id) as any[];
    log(`FINAL ${p.id}: VP ${victoryPoints(s, p.id, { public: false } as any)} cities ${cities} sett ${sett} roads ${roads} wardens ${w.length} (ranks ${w.map((x) => x.level + (x.active ? 'a' : 'i')).join(',')}) shields ${shs.shields[p.id]} vpCards ${(shs.vpCards[p.id] ?? []).length} levels ${JSON.stringify(shs.levels[p.id])} longest=${(s as any).awards?.longestRoute ? JSON.stringify((s as any).awards.longestRoute) : '?'}`);
  }
  log(`FINAL caravan ${JSON.stringify(shs.caravan)} ramparts ${shs.ramparts.length} toppled ${shs.toppled.length} attacks ${shs.raid.attacks} deckLeft ${JSON.stringify(Object.fromEntries(Object.entries(shs.decks).map(([k, v]: any) => [k, v.length])))}`);
}
writeFileSync(OUT, lines.join('\n'));
console.log(lines.slice(-4).join('\n'));
