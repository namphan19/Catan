// Fuzzer: plays full random games through getLegalActions and asserts invariants after every action.
// Usage: pnpm fuzz [games=50] [startSeed=0] [strongholds]
import {
  MIST, SCENARIO_IDS, SEA, SH, SH_ID, TL, TL_ID, TRACKS, applyAction, baseConfig, createGame, getGraph, getLegalActions,
  randInt, seedRng, validateAction, type Action, type GameState, type ShState, type TlState,
} from '../src';

const WEIGHTS: Record<string, number> = {
  buildCity: 60, placeSettlement: 60, placeRoad: 8, buyCard: 12, playCard: 10, bankTrade: 4,
  offerTrade: 0.3, respondTrade: 3, confirmTrade: 5, cancelTrade: 1, endTurn: 3,
  'sh:improve': 40, 'sh:recruit': 12, 'sh:activate': 10, 'sh:promote': 8, 'sh:rampart': 6, 'sh:play': 3,
  'sh:moveWarden': 0.3, 'sh:displace': 3, 'sh:chase': 2, 'sh:bazaarOffer': 2, 'sh:discardCard': 1,
  'tl:buildShip': 10, 'tl:moveShip': 1, 'tl:moveCorsair': 1, 'tl:placeHarbor': 20, 'tl:stealSilk': 1, 'tl:arm': 30,
  'tl:claimWonder': 40, 'tl:buildWonder': 40,
};

export interface FuzzResult {
  seed: string;
  players: number;
  winner?: string;
  actions: number;
  turns: number;
}

const ADVANCE_CARDS = TRACKS.reduce(
  (n, t) => n + Object.values(SH.decks[t]).reduce((a, b) => a + b, 0),
  0,
);

/** Invariants of the strongholds expansion. */
function checkStrongholds(s: GameState, fail: (m: string) => never): void {
  const x = s.ext[SH_ID] as ShState;
  const occ = s.pieces.occupants ?? {};
  // Another ruleset's window (tidelands gold) is an ext phase too; only ours must match the queue.
  const ours = s.phase.k === 'ext' && s.phase.id === SH_ID;
  if (ours !== x.pending.length > 0) fail('ext phase and pending queue disagree');
  if (ours && s.phase.k === 'ext' && s.phase.actors?.[0] !== x.pending[0].player) fail('wrong actor for the pending choice');
  let cards = TRACKS.reduce((n, t) => n + x.decks[t].length, 0);
  for (const p of s.players) {
    cards += p.cards.length + x.vpCards[p.id].length;
    const own = Object.entries(s.pieces.buildings).filter(([, b]) => b.owner === p.id);
    const toppled = own.filter(([v]) => x.toppled.includes(v)).length;
    const cities = own.filter(([, b]) => b.kind === 'city').length;
    const settlements = own.length - cities;
    if (cities + toppled + p.supply.city !== baseConfig.supply.city) fail(`${p.id} city pieces`);
    if (settlements - toppled + p.supply.settlement !== baseConfig.supply.settlement) fail(`${p.id} settlement pieces`);
    for (let level = 1; level <= 3; level++) {
      const board = Object.values(occ).filter((o) => o.owner === p.id && o.level === level).length;
      const lifted = x.pending.filter((q) => q.kind === 'relocate' && q.player === p.id && q.level === level).length;
      if (board + lifted + p.supply[`warden${level}`] !== SH.supply[`warden${level}`]) fail(`${p.id} rank ${level} wardens`);
    }
    const ramparts = x.ramparts.filter((v) => s.pieces.buildings[v]?.owner === p.id).length;
    if (ramparts + p.supply.rampart !== SH.supply.rampart) fail(`${p.id} ramparts`);
    for (const t of TRACKS) if (x.levels[p.id][t] < 0 || x.levels[p.id][t] > SH.maxLevel) fail(`${p.id} ${t} level`);
  }
  if (cards !== ADVANCE_CARDS) fail(`advance cards not conserved: ${cards} != ${ADVANCE_CARDS}`);
  for (const v of x.ramparts) if (s.pieces.buildings[v]?.kind !== 'city') fail(`rampart without a city at ${v}`);
  for (const v of x.toppled) if (s.pieces.buildings[v]?.kind !== 'settlement') fail(`toppled piece at ${v} is not a settlement`);
  for (const v of Object.keys(occ)) if (s.pieces.buildings[v]) fail(`warden and building share ${v}`);
  for (const t of TRACKS) {
    const cap = x.capitals[t];
    if (!cap) continue;
    const b = s.pieces.buildings[cap.v];
    if (!b || b.kind !== 'city' || b.owner !== cap.owner) fail(`${t} capital is not on its owner's city`);
    if (x.levels[cap.owner][t] < SH.capitalLevel) fail(`${t} capital holder is below level ${SH.capitalLevel}`);
  }
  if (x.raid.pos < 0 || x.raid.pos >= SH.raidTrack) fail('raid track position');
  if (x.blockerActive !== (s.board.blocker !== '')) fail('blocker activity and position disagree');
}

/** Invariants of the tidelands expansion. */
function checkTidelands(s: GameState, fail: (m: string) => never): void {
  const x = s.ext[TL_ID] as TlState;
  const g = getGraph(s.board.layout);
  const terrain = Object.fromEntries(s.board.hexes.map((h) => [h.id, h.terrain]));
  const land = (h: string) => terrain[h] !== undefined && terrain[h] !== SEA && terrain[h] !== MIST;
  const ships = s.pieces.ships ?? {};
  for (const p of s.players) {
    const n = Object.values(ships).filter((o) => o === p.id).length;
    if (n + p.supply.ship !== TL.supply.ship) fail(`${p.id} cog count`);
  }
  for (const e of Object.keys(ships)) {
    if (s.pieces.roads[e]) fail(`road and cog share ${e}`);
    const hs = g.edgeHexes[e];
    if (!(hs.length === 1 || hs.some((h) => terrain[h] === SEA))) fail(`cog off the sea at ${e}`);
  }
  for (const e of Object.keys(s.pieces.roads)) if (!g.edgeHexes[e].some(land)) fail(`road off the land at ${e}`);
  for (const v of Object.keys(s.pieces.buildings)) if (!g.vertexHexes[v].some(land)) fail(`building off the land at ${v}`);
  if (x.corsair && terrain[x.corsair] !== SEA) fail('corsair is not at sea');
  const isGold = (ph: GameState['phase'] | null | undefined) =>
    !!ph && ph.k === 'ext' && ph.id === TL_ID && (ph.data as { kind?: string }).kind === 'gold';
  // The gold window is open, or waits behind a strongholds choice that resumes into it.
  const sh = s.ext[SH_ID] as ShState | undefined;
  const waiting = !!sh && s.phase.k === 'ext' && s.phase.id === SH_ID && isGold(sh.resume);
  if ((isGold(s.phase) || waiting) !== !!x.gold) fail('gold window and gold debts disagree');
  if (x.silk) {
    const total = Object.values(x.silk.silk).reduce((a, b) => a + b, 0) + x.silk.supply +
      Object.values(x.silk.villages).reduce((a, v) => a + v.silk, 0);
    const villages = Object.keys(x.silk.villages).length;
    if (total !== villages * 5 + 10) fail(`silk not conserved: ${total}`);
  }
  const strongholds = s.init.rulesetIds.includes(SH_ID);
  if (!strongholds && s.board.blocker && !land(s.board.blocker)) fail('blocker at sea');
}

export function checkInvariants(s: GameState, initial: { resources: number; cards: number }): void {
  const fail = (m: string): never => {
    throw new Error(`invariant: ${m} (seed ${s.init.seed}, action #${s.log.length})`);
  };
  const strongholds = s.init.rulesetIds.includes(SH_ID);
  let res = 0;
  for (const [r, n] of Object.entries(s.bank.hand)) {
    if (n < 0) fail(`bank ${r} negative`);
    res += n;
  }
  let cards = s.bank.deck.length;
  for (const p of s.players) {
    for (const [r, n] of Object.entries(p.hand)) {
      if (!Number.isInteger(n) || n < 0) fail(`${p.id} ${r}=${n}`);
      res += n;
    }
    for (const [k, n] of Object.entries(p.supply)) if (n < 0) fail(`${p.id} supply ${k} negative`);
    const roads = Object.values(s.pieces.roads).filter((o) => o === p.id).length;
    if (roads + p.supply.road !== baseConfig.supply.road) fail(`${p.id} road count`);
    if (strongholds) continue; // cards and building pieces are checked by checkStrongholds
    cards += p.cards.length + p.newCards.length + Object.values(p.played).reduce((a, b) => a + b, 0);
    if (p.id === s.players[0].id) cards += ((s.ext[TL_ID] as TlState | undefined)?.castaways?.reserved.length ?? 0);
    // placed + supply = initial pieces
    const own = Object.values(s.pieces.buildings).filter((b) => b.owner === p.id);
    const cities = own.filter((b) => b.kind === 'city').length;
    // Corsair coves: a fort not yet taken holds one of the player's settlement pieces.
    const fort = ((s.ext[TL_ID] as TlState | undefined)?.coves?.lairs[p.id] ?? 0) > 0 ? 1 : 0;
    const settlements = own.length - cities + fort;
    if (cities + p.supply.city !== baseConfig.supply.city) fail(`${p.id} city count`);
    if (settlements + p.supply.settlement !== baseConfig.supply.settlement) fail(`${p.id} settlement count`);
  }
  if (res !== initial.resources) fail(`resources not conserved: ${res} != ${initial.resources}`);
  if (s.init.rulesetIds.includes(TL_ID)) checkTidelands(s, fail);
  if (strongholds) checkStrongholds(s, fail);
  else if (cards !== initial.cards) fail(`cards not conserved: ${cards} != ${initial.cards}`);
  if (JSON.stringify(JSON.parse(JSON.stringify(s))) !== JSON.stringify(s)) fail('state is not plain JSON');
}

export function runRandomGame(
  seed: string, players: number, maxActions = 30000, rulesets: string[] = ['base'], options?: Record<string, unknown>,
): FuzzResult {
  let s = createGame({ seed, playerCount: players, rulesets, options });
  const policy = seedRng(`policy:${seed}`);
  const sumBag = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);
  const reserved = (s.ext[TL_ID] as TlState | undefined)?.castaways?.reserved.length ?? 0;
  const initial = { resources: sumBag(s.bank.hand), cards: s.bank.deck.length + reserved };
  checkInvariants(s, initial);
  while (!s.winner) {
    if (s.log.length >= maxActions) throw new Error(`game ${seed} did not finish in ${maxActions} actions`);
    const options: Action[] = [];
    for (const p of s.players) options.push(...getLegalActions(s, p.id));
    if (!options.length) throw new Error(`deadlock in phase ${s.phase.k} (seed ${seed})`);
    let total = 0;
    const w = options.map((a) => (total += WEIGHTS[a.t] ?? 1));
    const pick = (randInt(policy, 1_000_000) / 1_000_000) * total;
    const action = options[w.findIndex((x) => x > pick)] ?? options[options.length - 1];
    const v = validateAction(s, action);
    if (!v.ok) throw new Error(`getLegalActions returned an illegal action ${JSON.stringify(action)}: ${v.code}`);
    s = applyAction(s, action).state;
    checkInvariants(s, initial);
  }
  return { seed, players, winner: s.winner, actions: s.log.length, turns: s.turn.n };
}

/** Ruleset list and options from a CLI word: base | strongholds | tidelands[:scenario] | both[:scenario].
 *  Without a scenario, tidelands games cycle through all scenarios (by game index). */
export function parseMode(word: string | undefined, i: number): { rulesets: string[]; options?: Record<string, unknown> } {
  const [mode, sc] = (word ?? 'base').split(':');
  if (mode === SH_ID) return { rulesets: ['base', SH_ID] };
  if (mode !== TL_ID && mode !== 'both') return { rulesets: ['base'] };
  const both = mode === 'both';
  const pool = both ? SCENARIO_IDS.filter((id) => !['castaways', 'silk', 'greatWorks', 'corsairCoves'].includes(id)) : SCENARIO_IDS;
  const scenario = sc ?? pool[i % pool.length];
  return { rulesets: both ? ['base', SH_ID, TL_ID] : ['base', TL_ID], options: { scenario } };
}

function main(): void {
  const games = Number(process.argv[2] ?? 50);
  const start = Number(process.argv[3] ?? 0);
  let actions = 0;
  for (let i = start; i < start + games; i++) {
    const players = 3 + (i % 4);
    const { rulesets, options } = parseMode(process.argv[4], i);
    const r = runRandomGame(`fuzz-${i}`, players, 60000, rulesets, options);
    actions += r.actions;
    const sc = options?.scenario ? ` ${String(options.scenario)}` : '';
    console.log(`${r.seed} players=${players}${sc} winner=${r.winner} turns=${r.turns} actions=${r.actions}`);
  }
  console.log(`OK ${games} games (${process.argv[4] ?? 'base'}), ${actions} actions, all invariants held`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('fuzz/randomGame.ts')) main();
