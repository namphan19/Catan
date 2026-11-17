// Strongholds expansion (docs/RULES_STRONGHOLDS.md). Scenario tests build states by editing plain JSON.
import { describe, expect, it } from 'vitest';
import {
  CARD_TRACK, SH, TRACKS, applyAction, getEventsView, getLegalActions, getPlayerView, randInt, replay, seedRng,
  validateAction, victoryPoints,
  type Action, type GameEvent, type GameState, type Graph, type HexId, type ShState, type StrongholdsView,
  type VertexId,
} from '../src';
import { checkInvariants } from '../fuzz/randomGame';
import { act, autoSetup, findPath, graphOf, hand, newGame, pl, setHand } from './helpers';

const RS = ['base', 'strongholds', 'testdice'];
/** Event die faces for state.ext.forceDice = [red, yellow, face]. */
const RAID = 0;
const COMMERCE = 3;
const COUNCIL = 4;
const LEARNING = 5;

const x = (s: GameState) => s.ext.strongholds as ShState;
const code = (s: GameState, a: Action) => {
  const v = validateAction(s, a);
  return v.ok ? 'OK' : v.code;
};
const occ = (s: GameState) => s.pieces.occupants ?? {};

/** Expansion game jumped straight to a phase with an empty board; p1 to move. */
function game(n = 4, phase: GameState['phase'] = { k: 'main' }, seed = 'sh'): GameState {
  const s = newGame(n, seed, { rulesets: RS, firstPlayer: 'p1' });
  s.phase = phase;
  s.turn = { n: 1, current: 'p1', cardPlayed: false, roll: [3, 4] };
  return s;
}
function put(s: GameState, id: string, v: VertexId, kind: 'settlement' | 'city'): void {
  s.pieces.buildings[v] = { owner: id, kind };
  pl(s, id).supply[kind] -= 1;
}
function road(s: GameState, id: string, e: string): void {
  s.pieces.roads[e] = id;
  pl(s, id).supply.road -= 1;
}
function warden(s: GameState, id: string, v: VertexId, level = 1, active = false, tags: string[] = []): void {
  occ(s)[v] = { owner: id, kind: 'warden', level, active, tags };
  pl(s, id).supply[`warden${level}`] -= 1;
}
/** Move cards from their decks into a player's hand. */
function give(s: GameState, id: string, ...cards: string[]): void {
  for (const c of cards) {
    const d = x(s).decks[CARD_TRACK[c]];
    d.splice(d.indexOf(c), 1);
    pl(s, id).cards.push(c);
  }
}
/** Put a card on top of its deck. */
function top(s: GameState, card: string): void {
  const d = x(s).decks[CARD_TRACK[card]];
  d.splice(d.indexOf(card), 1);
  d.push(card);
}
function rollWith(s: GameState, red: number, yellow: number, face: number): GameState {
  s.ext.forceDice = [red, yellow, face];
  return act(s, { t: 'roll', player: s.turn.current });
}
/** Make every token 12 so that a roll of 5 produces only on the given hexes. */
function isolate(s: GameState, ...hexes: HexId[]): void {
  for (const h of s.board.hexes) if (h.token !== undefined) h.token = hexes.includes(h.id) ? 5 : 12;
}
/** n vertices far from each other and from the centre lane used by `lane()`. */
function spread(s: GameState, n: number, avoid: VertexId[] = []): VertexId[] {
  const g = graphOf(s);
  const taken = new Set<VertexId>(avoid.flatMap((v) => [v, ...g.vertexNeighbors[v]]));
  const out: VertexId[] = [];
  for (const v of [...g.vertices].reverse()) {
    if (out.length === n) break;
    if (taken.has(v)) continue;
    out.push(v);
    for (const u of [v, ...g.vertexNeighbors[v]]) taken.add(u);
  }
  return out;
}
/** p1 settlement on the centre vertex with `len` roads in a line. */
function lane(s: GameState, len = 4): { g: Graph; V: VertexId[]; E: string[] } {
  const g = graphOf(s);
  const P = findPath(g, 'v:0,0,N', len);
  put(s, 'p1', P.vertices[0], 'settlement');
  P.edges.forEach((e) => road(s, 'p1', e));
  return { g, V: P.vertices, E: P.edges };
}
const sideEdge = (g: Graph, v: VertexId, path: string[]): string => g.vertexEdges[v].find((e) => !path.includes(e))!;
const farEnd = (g: Graph, e: string, v: VertexId): VertexId => g.edgeEnds[e].find((u) => u !== v)!;
const hexOf = (s: GameState, terrain: string) => s.board.hexes.find((h) => h.terrain === terrain)!;
const view = (s: GameState, id: string | null) => getPlayerView(s, id).ext!.strongholds as StrongholdsView;

describe('strongholds: setup and components', () => {
  it('second starting piece is a city; commodities, decks and the 13 VP target are set up', () => {
    const s = autoSetup(newGame(4, 'sh-setup', { rulesets: RS }));
    const g = graphOf(s);
    expect(s.init.vpToWin).toBe(13);
    expect(s.bank.deck).toEqual([]);
    expect(s.board.blocker).toBe('');
    expect(x(s).blockerActive).toBe(false);
    for (const t of TRACKS) expect(x(s).decks[t]).toHaveLength(18);
    for (const c of SH.commodities) expect(s.bank.hand[c]).toBe(12);
    for (const p of s.players) {
      const own = Object.entries(s.pieces.buildings).filter(([, b]) => b.owner === p.id);
      expect(own.map(([, b]) => b.kind).sort()).toEqual(['city', 'settlement']);
      expect(p.supply).toMatchObject({ settlement: 4, city: 3, road: 13, warden1: 2, warden2: 2, warden3: 2, rampart: 3 });
      // starting resources: 1 per producing hex next to the city, no commodities
      const cityV = own.find(([, b]) => b.kind === 'city')![0];
      const hexes = g.vertexHexes[cityV].map((h) => s.board.hexes.find((q) => q.id === h)!);
      const total = Object.values(p.hand).reduce((a, b) => a + b, 0);
      expect(total).toBe(hexes.filter((h) => h.terrain !== 'waste').length);
      for (const c of SH.commodities) expect(p.hand[c]).toBe(0);
      expect(victoryPoints(s, p.id)).toBe(3);
    }
  });

  it('5-6 players: 18 commodity cards each and paired players', () => {
    const s = newGame(6, 'sh-6', { rulesets: RS });
    for (const c of SH.commodities) expect(s.bank.hand[c]).toBe(18);
    expect(s.init.largeTableMode).toBe('paired');
    expect(() => newGame(6, 'sh-6', { rulesets: RS, largeTableMode: 'extraBuild' })).toThrow(/paired/);
  });
});

describe('strongholds: production', () => {
  it('cities yield resource + commodity on forest/meadow/quarry and 2 resources elsewhere', () => {
    const s = game(4, { k: 'preRoll' });
    const g = graphOf(s);
    const forest = hexOf(s, 'forest');
    const field = s.board.hexes.find((h) => h.terrain === 'field' && !g.hexNeighbors[forest.id].includes(h.id))!;
    isolate(s, forest.id, field.id);
    put(s, 'p1', g.hexVertices[forest.id][0], 'city');
    put(s, 'p2', g.hexVertices[forest.id][3], 'settlement');
    put(s, 'p3', g.hexVertices[field.id].find((v) => !g.vertexHexes[v].includes(forest.id))!, 'city');
    const r = rollWith(s, 2, 3, RAID);
    expect(hand(r, 'p1')).toMatchObject({ timber: 1, books: 1 });
    expect(hand(r, 'p2')).toMatchObject({ timber: 1, books: 0 });
    expect(hand(r, 'p3')).toMatchObject({ grain: 2 });
    expect(r.phase.k).toBe('main');
    expect(x(r).raid.pos).toBe(1);
  });
});

describe('strongholds: event die and advance cards', () => {
  it('players whose track level covers the red die draw a card; hands are hidden', () => {
    const s = game(4, { k: 'preRoll' });
    x(s).levels.p1.commerce = 1; // red 1-2
    x(s).levels.p2.commerce = 2; // red 1-3
    top(s, 'levy');
    const res = applyAction(Object.assign(s, { ext: { ...s.ext, forceDice: [3, 1, COMMERCE] } }), { t: 'roll', player: 'p1' });
    const r = res.state;
    expect(pl(r, 'p1').cards).toEqual([]);
    expect(pl(r, 'p2').cards).toEqual(['levy']);
    expect(x(r).decks.commerce).toHaveLength(17);
    const v1 = getPlayerView(r, 'p1');
    expect(v1.players.find((p) => p.id === 'p2')).toMatchObject({ cardCount: 1 });
    expect(v1.players.find((p) => p.id === 'p2')).not.toHaveProperty('cards');
    expect(JSON.stringify(v1.ext)).not.toContain('"decks"');
    expect(view(r, 'p1').deckCounts).toEqual({ commerce: 17, council: 18, learning: 18 });
    // the drawn card is secret in the event stream
    const drew = (evs: GameEvent[]) => evs.find((e) => e.e === 'ext' && (e.data as { type: string }).type === 'drew')!;
    expect(drew(getEventsView(res.events, 'p3'))).not.toHaveProperty('secret');
    expect(drew(getEventsView(res.events, 'p2'))).toMatchObject({ secret: { card: 'levy' } });
  });

  it('VP cards are revealed and scored at once', () => {
    const s = game(4, { k: 'preRoll' });
    x(s).levels.p1.learning = 1;
    top(s, 'press');
    const r = rollWith(s, 1, 3, LEARNING);
    expect(x(r).vpCards.p1).toEqual(['press']);
    expect(pl(r, 'p1').cards).toEqual([]);
    expect(victoryPoints(r, 'p1', { public: true })).toBe(1);
  });

  it('a non-active player over the limit discards before production; the roller may wait until end of turn', () => {
    let s = game(4, { k: 'preRoll' });
    x(s).levels.p2.commerce = 5;
    give(s, 'p2', 'levy', 'levy', 'corner', 'fleet');
    top(s, 'caravan');
    s = rollWith(s, 2, 2, COMMERCE);
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p2'], data: { kind: 'trimHand' } });
    expect(x(s).productionDue).toBe(true);
    expect(getLegalActions(s, 'p1')).toEqual([]);
    expect(code(s, { t: 'sh:resolve', player: 'p2', kind: 'trimHand', card: 'omen' })).toBe('BAD_CHOICE');
    s = act(s, { t: 'sh:resolve', player: 'p2', kind: 'trimHand', card: 'levy' });
    expect(pl(s, 'p2').cards).toHaveLength(4);
    expect(x(s).decks.commerce[0]).toBe('levy'); // back under the deck
    expect(s.phase.k).toBe('main');
    expect(x(s).productionDue).toBe(false);
    // hidden from the others in the log
    const last = (id: string) => getPlayerView(s, id).log.at(-1)!.action;
    expect(last('p3')).not.toHaveProperty('card');
    expect(last('p2')).toMatchObject({ card: 'levy' });

    give(s, 'p1', 'rally', 'rally', 'plot', 'plot', 'toll');
    expect(code(s, { t: 'endTurn', player: 'p1' })).toBe('HAND_LIMIT');
    s = act(s, { t: 'sh:discardCard', player: 'p1', card: 'toll' });
    expect(code(s, { t: 'endTurn', player: 'p1' })).toBe('OK');
  });
});

describe('strongholds: raid', () => {
  function atShore(n = 4) {
    const s = game(n, { k: 'preRoll' });
    x(s).raid.pos = SH.raidTrack - 1;
    isolate(s);
    const [a, b, c, d, e] = spread(s, 5);
    return { s, a, b, c, d, e };
  }

  it('defended: the strongest defender gets a shield (1 VP); wardens stand down; the blocker arrives', () => {
    const { s, a, b, c } = atShore();
    put(s, 'p1', a, 'city');
    put(s, 'p2', b, 'city');
    warden(s, 'p1', c, 2, true);
    const r = rollWith(s, 1, 2, RAID);
    expect(x(r).shields.p1).toBe(1);
    expect(victoryPoints(r, 'p1')).toBe(3);
    expect(x(r).raid).toEqual({ pos: 0, attacks: 1 });
    expect(occ(r)[c].active).toBe(false);
    expect(x(r).blockerActive).toBe(true);
    expect(r.board.blocker).toBe(x(r).blockerHome);
    expect(r.phase.k).toBe('main');
  });

  it('lost: the weakest defender with a city is pillaged and loses the rampart', () => {
    const { s, a, b, c } = atShore();
    put(s, 'p1', a, 'city');
    put(s, 'p2', b, 'city');
    x(s).ramparts.push(b);
    pl(s, 'p2').supply.rampart -= 1;
    warden(s, 'p1', c, 1, true);
    const r = rollWith(s, 1, 2, RAID);
    expect(r.pieces.buildings[b]).toEqual({ owner: 'p2', kind: 'settlement' });
    expect(r.pieces.buildings[a].kind).toBe('city');
    expect(x(r).ramparts).toEqual([]);
    expect(pl(r, 'p2').supply).toMatchObject({ rampart: 3, city: 4, settlement: 4 });
    expect(x(r).shields).toMatchObject({ p1: 0, p2: 0 });
  });

  it('capitals are safe: the next weakest player is pillaged and chooses the city', () => {
    const { s, a, b, c, d } = atShore();
    put(s, 'p2', a, 'city');
    x(s).levels.p2.commerce = 4;
    x(s).capitals.commerce = { owner: 'p2', v: a };
    put(s, 'p1', b, 'city');
    put(s, 'p1', c, 'city');
    warden(s, 'p1', d, 1, true);
    let r = rollWith(s, 1, 2, RAID); // raiders 3 vs defenders 1
    expect(r.phase).toMatchObject({ k: 'ext', actors: ['p1'], data: { kind: 'pillage' } });
    expect(getLegalActions(r, 'p1').map((q) => (q as { v: string }).v).sort()).toEqual([b, c].sort());
    r = act(r, { t: 'sh:resolve', player: 'p1', kind: 'pillage', v: c });
    expect(r.pieces.buildings[c].kind).toBe('settlement');
    expect(r.pieces.buildings[a].kind).toBe('city');
    expect(r.phase.k).toBe('main');
  });

  it('tie for the strongest defence: each tied player draws from a deck of their choice', () => {
    const { s, a, b, c, d } = atShore();
    put(s, 'p1', a, 'city');
    put(s, 'p2', b, 'city');
    warden(s, 'p1', c, 1, true);
    warden(s, 'p2', d, 1, true);
    top(s, 'rally');
    top(s, 'irrigate');
    let r = rollWith(s, 1, 2, RAID);
    expect(r.phase).toMatchObject({ k: 'ext', actors: ['p1'], data: { kind: 'pickDeck' } });
    expect(getLegalActions(r, 'p1')).toHaveLength(3);
    r = act(r, { t: 'sh:resolve', player: 'p1', kind: 'pickDeck', deck: 'council' });
    expect(r.phase).toMatchObject({ k: 'ext', actors: ['p2'] });
    r = act(r, { t: 'sh:resolve', player: 'p2', kind: 'pickDeck', deck: 'learning' });
    expect(pl(r, 'p1').cards).toEqual(['rally']);
    expect(pl(r, 'p2').cards).toEqual(['irrigate']);
    expect(x(r).shields).toMatchObject({ p1: 0, p2: 0 });
    expect(r.phase.k).toBe('main');
  });

  it('no settlement piece left: the city piece stays toppled and must be rebuilt first', () => {
    const { s, a, b, c, d } = atShore();
    put(s, 'p1', a, 'city');
    warden(s, 'p1', c, 1, true);
    put(s, 'p2', b, 'city');
    put(s, 'p2', d, 'settlement');
    pl(s, 'p2').supply.settlement = 0;
    let r = rollWith(s, 1, 2, RAID);
    expect(x(r).toppled).toEqual([b]);
    expect(r.pieces.buildings[b].kind).toBe('settlement');
    expect(pl(r, 'p2').supply).toMatchObject({ settlement: 0, city: 3 });
    r.turn.current = 'p2';
    setHand(r, 'p2', { grain: 2, stone: 3 });
    expect(code(r, { t: 'buildCity', player: 'p2', v: d })).toBe('TOPPLED_FIRST');
    r = act(r, { t: 'buildCity', player: 'p2', v: b });
    expect(r.pieces.buildings[b].kind).toBe('city');
    expect(x(r).toppled).toEqual([]);
    expect(pl(r, 'p2').supply).toMatchObject({ settlement: 0, city: 3 });
  });
});

describe('strongholds: rolling a 7', () => {
  it('ramparts raise the hand limit by 2; before the first raid the blocker does not move', () => {
    let s = game(4, { k: 'preRoll' });
    const [a] = spread(s, 1);
    put(s, 'p1', a, 'city');
    x(s).ramparts.push(a);
    setHand(s, 'p1', { timber: 5, books: 4 }); // 9 cards, limit 9
    setHand(s, 'p2', { clay: 5, linen: 4 }); // 9 cards, limit 7
    s = rollWith(s, 3, 4, RAID);
    expect(s.phase).toEqual({ k: 'discard', owed: { p2: 4 } });
    s = act(s, { t: 'discard', player: 'p2', bag: { clay: 2, linen: 2 } });
    expect(s.phase.k).toBe('main');
  });

  it('after the first raid a 7 moves the blocker as usual', () => {
    const s = game(4, { k: 'preRoll' });
    x(s).blockerActive = true;
    s.board.blocker = x(s).blockerHome;
    expect(rollWith(s, 3, 4, COUNCIL).phase).toEqual({ k: 'moveBlocker', resume: 'main' });
  });
});

describe('strongholds: wardens', () => {
  it('recruit, activate, move and promote follow their costs and limits', () => {
    let s = game();
    const { V } = lane(s);
    const far = spread(s, 1, V)[0];
    expect(code(s, { t: 'sh:recruit', player: 'p1', v: V[1] })).toBe('CANNOT_AFFORD');
    setHand(s, 'p1', { fiber: 3, stone: 3, grain: 1 });
    expect(code(s, { t: 'sh:recruit', player: 'p1', v: V[0] })).toBe('BAD_SPOT'); // a building
    expect(code(s, { t: 'sh:recruit', player: 'p1', v: far })).toBe('BAD_SPOT'); // not on a road
    s = act(s, { t: 'sh:recruit', player: 'p1', v: V[1] });
    expect(occ(s)[V[1]]).toMatchObject({ owner: 'p1', kind: 'warden', level: 1, active: false });
    expect(pl(s, 'p1').supply.warden1).toBe(1);
    expect(hand(s, 'p1')).toMatchObject({ fiber: 2, stone: 2 });

    expect(code(s, { t: 'sh:moveWarden', player: 'p1', from: V[1], to: V[3] })).toBe('INACTIVE');
    s = act(s, { t: 'sh:activate', player: 'p1', v: V[1] });
    expect(hand(s, 'p1').grain).toBe(0);
    expect(code(s, { t: 'sh:moveWarden', player: 'p1', from: V[1], to: V[3] })).toBe('JUST_ACTIVATED');
    occ(s)[V[1]].tags = []; // a later turn
    expect(code(s, { t: 'sh:moveWarden', player: 'p1', from: V[1], to: far })).toBe('BAD_TARGET');
    expect(code(s, { t: 'sh:moveWarden', player: 'p1', from: V[1], to: V[0] })).toBe('BAD_TARGET');
    s = act(s, { t: 'sh:moveWarden', player: 'p1', from: V[1], to: V[3] });
    expect(occ(s)[V[1]]).toBeUndefined();
    expect(occ(s)[V[3]]).toMatchObject({ owner: 'p1', level: 1, active: false });

    s = act(s, { t: 'sh:promote', player: 'p1', v: V[3] });
    expect(occ(s)[V[3]].level).toBe(2);
    expect(pl(s, 'p1').supply).toMatchObject({ warden1: 2, warden2: 1 });
    expect(code(s, { t: 'sh:promote', player: 'p1', v: V[3] })).toBe('ALREADY_PROMOTED');
    occ(s)[V[3]].tags = [];
    expect(code(s, { t: 'sh:promote', player: 'p1', v: V[3] })).toBe('NEED_COUNCIL');
    x(s).levels.p1.council = 3;
    s = act(s, { t: 'sh:promote', player: 'p1', v: V[3] });
    expect(occ(s)[V[3]].level).toBe(3);
    expect(code(s, { t: 'sh:promote', player: 'p1', v: V[3] })).toBe('MAX_LEVEL');
  });

  it('only two wardens of each rank; tags expire at the end of the turn', () => {
    let s = game();
    const { V } = lane(s);
    warden(s, 'p1', V[1], 1, true, ['fresh', 'promoted']);
    warden(s, 'p1', V[2]);
    setHand(s, 'p1', { fiber: 1, stone: 1 });
    expect(code(s, { t: 'sh:recruit', player: 'p1', v: V[3] })).toBe('NO_PIECES');
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(occ(s)[V[1]].tags).toEqual([]);
    expect(occ(s)[V[1]].active).toBe(true);
  });

  it('displace: only a weaker warden; its owner relocates it or loses it', () => {
    const base = game();
    const { g, V, E } = lane(base);
    warden(base, 'p1', V[1], 2, true);
    warden(base, 'p2', V[3], 2);
    expect(code(base, { t: 'sh:displace', player: 'p1', from: V[1], to: V[3] })).toBe('BAD_TARGET'); // same rank
    occ(base)[V[3]].level = 1;
    pl(base, 'p2').supply.warden2 += 1;
    pl(base, 'p2').supply.warden1 -= 1;

    // no road of its own: the displaced warden goes back to the supply
    const lost = act(base, { t: 'sh:displace', player: 'p1', from: V[1], to: V[3] });
    expect(occ(lost)[V[3]]).toMatchObject({ owner: 'p1', level: 2, active: false });
    expect(Object.values(occ(lost)).filter((o) => o.owner === 'p2')).toEqual([]);
    expect(pl(lost, 'p2').supply.warden1).toBe(2);
    expect(lost.phase.k).toBe('main');

    // with a road it moves along it (single destination: resolved automatically)
    const side = sideEdge(g, V[3], E);
    road(base, 'p2', side);
    const moved = act(base, { t: 'sh:displace', player: 'p1', from: V[1], to: V[3] });
    expect(occ(moved)[farEnd(g, side, V[3])]).toMatchObject({ owner: 'p2', level: 1, active: false });
    expect(moved.phase.k).toBe('main');
  });

  it('chase: an active warden next to the blocker moves it and steals', () => {
    let s = game();
    const g = graphOf(s);
    x(s).blockerActive = true;
    s.board.blocker = x(s).blockerHome;
    const at = g.hexVertices[s.board.blocker][0];
    const target = s.board.hexes.find((h) => h.id !== s.board.blocker && !g.hexVertices[h.id].includes(at))!.id;
    warden(s, 'p1', at, 1, true);
    put(s, 'p2', g.hexVertices[target].find((v) => v !== at && !g.vertexNeighbors[at].includes(v))!, 'settlement');
    setHand(s, 'p2', { silver: 1 });
    occ(s)[at].tags = ['fresh'];
    expect(code(s, { t: 'sh:chase', player: 'p1', v: at })).toBe('JUST_ACTIVATED');
    occ(s)[at].tags = [];
    s = act(s, { t: 'sh:chase', player: 'p1', v: at });
    expect(s.phase).toEqual({ k: 'moveBlocker', resume: 'main' });
    expect(occ(s)[at].active).toBe(false);
    s = act(s, { t: 'moveBlocker', player: 'p1', hex: target });
    s = act(s, { t: 'steal', player: 'p1', target: 'p2' });
    expect(hand(s, 'p1').silver).toBe(1);
    expect(s.phase.k).toBe('main');
  });

  it('wardens block building sites and opponent roads, and cut opponent routes', () => {
    let s = game();
    const { g, V, E } = lane(s, 4);
    // p1 completes a route of 5 and takes the award
    const next = g.vertexEdges[V[4]].find((e) => !E.includes(e))!;
    setHand(s, 'p1', { timber: 1, clay: 1 });
    s = act(s, { t: 'placeRoad', player: 'p1', e: next });
    expect(s.awards.longestRoute).toBe('p1');
    // p2 recruits a warden in the middle of it
    road(s, 'p2', sideEdge(g, V[2], E));
    s.turn.current = 'p2';
    setHand(s, 'p2', { fiber: 1, stone: 1 });
    s = act(s, { t: 'sh:recruit', player: 'p2', v: V[2] });
    expect(s.awards.longestRoute).toBeNull();
    // nobody can settle on the warden's intersection
    s.turn.current = 'p1';
    setHand(s, 'p1', { timber: 1, clay: 1, fiber: 1, grain: 1 });
    expect(code(s, { t: 'placeSettlement', player: 'p1', v: V[2] })).toBe('DISTANCE_RULE');

    // a road cannot continue past an opponent warden
    const t = game();
    const L = lane(t, 1);
    warden(t, 'p2', L.V[1]);
    setHand(t, 'p1', { timber: 1, clay: 1 });
    const beyond = sideEdge(L.g, L.V[1], L.E);
    expect(code(t, { t: 'placeRoad', player: 'p1', e: beyond })).toBe('NOT_CONNECTED');
  });
});

describe('strongholds: city improvements, capitals and ramparts', () => {
  it('improvements cost 1..5 commodities of the track and need a city', () => {
    let s = game();
    const [a] = spread(s, 1);
    setHand(s, 'p1', { linen: 3 });
    expect(code(s, { t: 'sh:improve', player: 'p1', track: 'commerce' })).toBe('NO_CITY');
    put(s, 'p1', a, 'city');
    expect(code(s, { t: 'sh:improve', player: 'p1', track: 'guild' })).toBe('BAD_TRACK');
    expect(code(s, { t: 'sh:improve', player: 'p1', track: 'council' })).toBe('CANNOT_AFFORD');
    s = act(s, { t: 'sh:improve', player: 'p1', track: 'commerce' });
    s = act(s, { t: 'sh:improve', player: 'p1', track: 'commerce' });
    expect(x(s).levels.p1.commerce).toBe(2);
    expect(hand(s, 'p1').linen).toBe(0);
    expect(s.bank.hand.linen).toBe(12);
  });

  it('level 4 claims the capital (+2 VP); the first player to reach level 5 takes it for good', () => {
    let s = game();
    const [a, b, c] = spread(s, 3);
    put(s, 'p1', a, 'city');
    put(s, 'p1', b, 'city');
    put(s, 'p2', c, 'city');
    x(s).levels.p1.commerce = 3;
    x(s).levels.p2.commerce = 4;
    setHand(s, 'p1', { linen: 9 });
    setHand(s, 'p2', { linen: 5 });
    expect(code(s, { t: 'sh:improve', player: 'p1', track: 'commerce' })).toBe('CHOOSE_CITY');
    expect(code(s, { t: 'sh:improve', player: 'p1', track: 'commerce', v: c })).toBe('BAD_CITY');
    s = act(s, { t: 'sh:improve', player: 'p1', track: 'commerce', v: b });
    expect(x(s).capitals.commerce).toEqual({ owner: 'p1', v: b });
    expect(victoryPoints(s, 'p1')).toBe(6);
    s.turn.current = 'p2';
    s = act(s, { t: 'sh:improve', player: 'p2', track: 'commerce' });
    expect(x(s).capitals.commerce).toEqual({ owner: 'p2', v: c });
    expect(victoryPoints(s, 'p1')).toBe(4);
    expect(victoryPoints(s, 'p2')).toBe(4);
    // p1 reaching level 5 later does not take it back
    s.turn.current = 'p1';
    s = act(s, { t: 'sh:improve', player: 'p1', track: 'commerce' });
    expect(x(s).capitals.commerce?.owner).toBe('p2');
  });

  it('a capital needs a city without one', () => {
    const s = game();
    const [a] = spread(s, 1);
    put(s, 'p1', a, 'city');
    x(s).levels.p1.council = 4;
    x(s).capitals.council = { owner: 'p1', v: a };
    x(s).levels.p1.commerce = 3;
    setHand(s, 'p1', { linen: 4 });
    expect(code(s, { t: 'sh:improve', player: 'p1', track: 'commerce' })).toBe('NO_CITY_FOR_CAPITAL');
  });

  it('level 3 perks: commodities 2:1 (commerce) and a free resource when nothing is produced (learning)', () => {
    let s = game();
    setHand(s, 'p1', { linen: 2 });
    const trade: Action = { t: 'bankTrade', player: 'p1', give: { linen: 2 }, get: { grain: 1 } };
    expect(code(s, trade)).toBe('BAD_RATE');
    x(s).levels.p1.commerce = 3;
    expect(code(s, trade)).toBe('OK');

    s = game(4, { k: 'preRoll' });
    isolate(s);
    x(s).levels.p1.learning = 3;
    s = rollWith(s, 2, 3, RAID);
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p1'], data: { kind: 'provision' } });
    expect(getLegalActions(s, 'p1')).toHaveLength(5); // resources only, no commodities
    s = act(s, { t: 'sh:resolve', player: 'p1', kind: 'provision', resource: 'stone' });
    expect(hand(s, 'p1').stone).toBe(1);
    expect(s.phase.k).toBe('main');
  });

  it('ramparts: 2 clay, cities only, one per city, three per player', () => {
    let s = game();
    const [a, b, c, d, e] = spread(s, 5);
    [a, b, c, d].forEach((v) => put(s, 'p1', v, 'city'));
    put(s, 'p1', e, 'settlement');
    expect(code(s, { t: 'sh:rampart', player: 'p1', v: a })).toBe('CANNOT_AFFORD');
    setHand(s, 'p1', { clay: 8 });
    expect(code(s, { t: 'sh:rampart', player: 'p1', v: e })).toBe('NOT_YOUR_CITY');
    s = act(s, { t: 'sh:rampart', player: 'p1', v: a });
    expect(code(s, { t: 'sh:rampart', player: 'p1', v: a })).toBe('HAS_RAMPART');
    s = act(s, { t: 'sh:rampart', player: 'p1', v: b });
    s = act(s, { t: 'sh:rampart', player: 'p1', v: c });
    expect(code(s, { t: 'sh:rampart', player: 'p1', v: d })).toBe('NO_PIECES');
    expect(hand(s, 'p1').clay).toBe(2);
  });
});

describe('strongholds: learning cards', () => {
  it('omen sets the production dice of the next roll and goes back under its deck', () => {
    let s = game(4, { k: 'preRoll' });
    give(s, 'p1', 'omen');
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'omen', dice: [7, 1] })).toBe('BAD_ARGS');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'omen', dice: [6, 5] });
    expect(x(s).decks.learning[0]).toBe('omen');
    expect(pl(s, 'p1').played.omen).toBe(1);
    s = rollWith(s, 1, 1, COUNCIL);
    expect(s.turn.roll).toEqual([6, 5]);
    const main = game();
    give(main, 'p1', 'omen');
    expect(code(main, { t: 'sh:play', player: 'p1', card: 'omen', dice: [1, 1] })).toBe('WRONG_PHASE');
  });

  it('scaffold, mason and charter build cheaper', () => {
    let s = game();
    const [a, b] = spread(s, 2);
    put(s, 'p1', a, 'city');
    put(s, 'p1', b, 'settlement');
    give(s, 'p1', 'scaffold', 'mason', 'charter');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'scaffold', track: 'council' }); // level 1 for nothing
    expect(x(s).levels.p1.council).toBe(1);
    s = act(s, { t: 'sh:play', player: 'p1', card: 'mason', v: a });
    expect(x(s).ramparts).toEqual([a]);
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'charter', v: b })).toBe('CANNOT_AFFORD');
    setHand(s, 'p1', { grain: 1, stone: 2 });
    s = act(s, { t: 'sh:play', player: 'p1', card: 'charter', v: b });
    expect(s.pieces.buildings[b].kind).toBe('city');
    expect(pl(s, 'p1').cards).toEqual([]);
  });

  it('surveyor swaps two number tokens but never 2, 6, 8 or 12', () => {
    let s = game();
    give(s, 'p1', 'surveyor');
    const free = s.board.hexes.filter((h) => h.token !== undefined && !SH.frozenTokens.includes(h.token));
    const a = free[0];
    const b = free.find((h) => h.token !== a.token)!;
    const six = s.board.hexes.find((h) => h.token === 6)!;
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'surveyor', a: a.id, b: six.id })).toBe('BAD_ARGS');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'surveyor', a: a.id, b: b.id });
    const tok = (id: string) => s.board.hexes.find((h) => h.id === id)!.token;
    expect([tok(a.id), tok(b.id)]).toEqual([b.token, a.token]);
  });

  it('irrigate and prospect take 2 cards per matching hex next to your buildings', () => {
    let s = game();
    const g = graphOf(s);
    put(s, 'p1', g.hexVertices[hexOf(s, 'field').id][0], 'settlement');
    const count = (terrain: string) =>
      s.board.hexes.filter(
        (h) => h.terrain === terrain && g.hexVertices[h.id].some((v) => s.pieces.buildings[v]?.owner === 'p1'),
      ).length;
    give(s, 'p1', 'irrigate', 'prospect');
    const fields = count('field');
    const quarries = count('quarry');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'irrigate' });
    s = act(s, { t: 'sh:play', player: 'p1', card: 'prospect' });
    expect(fields).toBeGreaterThan(0);
    expect(hand(s, 'p1').grain).toBe(2 * fields);
    expect(hand(s, 'p1').stone).toBe(2 * quarries);
  });

  it('pavers gives two free roads; armory promotes up to two wardens', () => {
    let s = game();
    const { V } = lane(s);
    give(s, 'p1', 'pavers', 'armory');
    warden(s, 'p1', V[1]);
    warden(s, 'p1', V[2]);
    s = act(s, { t: 'sh:play', player: 'p1', card: 'armory', vs: [V[1], V[2]] });
    expect([occ(s)[V[1]].level, occ(s)[V[2]].level]).toEqual([2, 2]);
    expect(pl(s, 'p1').supply).toMatchObject({ warden1: 2, warden2: 0 });
    s = act(s, { t: 'sh:play', player: 'p1', card: 'pavers' });
    expect(s.phase).toEqual({ k: 'freeRoads', left: 2 });
    for (let i = 0; i < 2; i++) s = act(s, getLegalActions(s, 'p1').find((q) => q.t === 'placeRoad')!);
    expect(s.phase.k).toBe('main');
    expect(pl(s, 'p1').supply.road).toBe(9);
  });
});

describe('strongholds: commerce cards', () => {
  it('bazaar: one offer per player, answered with a commodity of their choice', () => {
    let s = game();
    give(s, 'p1', 'bazaar');
    setHand(s, 'p1', { timber: 3 });
    setHand(s, 'p2', { linen: 1, silver: 1 });
    const offer = (target: string): Action => ({ t: 'sh:bazaarOffer', player: 'p1', target, resource: 'timber' });
    expect(code(s, offer('p2'))).toBe('NO_BAZAAR');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'bazaar' });
    s = act(s, offer('p2'));
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p2'], data: { kind: 'bazaarGive' } });
    s = act(s, { t: 'sh:resolve', player: 'p2', kind: 'bazaarGive', resource: 'silver' });
    expect(hand(s, 'p1')).toMatchObject({ timber: 2, silver: 1 });
    expect(hand(s, 'p2')).toMatchObject({ timber: 1, silver: 0, linen: 1 });
    expect(code(s, offer('p2'))).toBe('ALREADY_OFFERED');
    // S8: an offer to a player without a commodity could only fail, so it is not allowed
    expect(code(s, offer('p3'))).toBe('NO_COMMODITY');
    expect(getLegalActions(s, 'p1').some((q) => q.t === 'sh:bazaarOffer' && (q as { target?: string }).target === 'p3')).toBe(false);
    expect(hand(s, 'p1').timber).toBe(2);
    expect(s.phase.k).toBe('main');
  });

  it('bazaar cannot be played when no offer could succeed (S8)', () => {
    const s = game();
    give(s, 'p1', 'bazaar');
    const play: Action = { t: 'sh:play', player: 'p1', card: 'bazaar' };
    setHand(s, 'p1', { timber: 1 });
    for (const id of ['p2', 'p3', 'p4']) setHand(s, id, { grain: 2 });
    expect(code(s, play)).toBe('NO_TARGET'); // nobody holds a commodity
    setHand(s, 'p3', { books: 1 });
    expect(code(s, play)).toBe('OK');
    setHand(s, 'p1', { linen: 2 });
    expect(code(s, play)).toBe('NO_TARGET'); // nothing to offer
  });

  it('tithe: look at the hand of a richer player and take 2 cards', () => {
    let s = game();
    const [a] = spread(s, 1);
    give(s, 'p1', 'tithe');
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'tithe', target: 'p2' })).toBe('BAD_TARGET');
    put(s, 'p2', a, 'city');
    setHand(s, 'p2', { timber: 2, grain: 1 });
    s = act(s, { t: 'sh:play', player: 'p1', card: 'tithe', target: 'p2' });
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p1'], data: { kind: 'titheTake' } });
    expect(view(s, 'p1').peek).toMatchObject({ target: 'p2', hand: { timber: 2, grain: 1 } });
    expect(view(s, 'p3').peek).toBeNull();
    const take = (bag: Record<string, number>): Action => ({ t: 'sh:resolve', player: 'p1', kind: 'titheTake', bag });
    expect(code(s, take({ timber: 1 }))).toBe('WRONG_AMOUNT');
    expect(code(s, take({ grain: 2 }))).toBe('NOT_ENOUGH');
    s = act(s, take({ timber: 1, grain: 1 }));
    expect(hand(s, 'p1')).toMatchObject({ timber: 1, grain: 1 });
    expect(hand(s, 'p2')).toMatchObject({ timber: 1, grain: 0 });
    expect(view(s, 'p1').peek).toBeNull();
    expect(getPlayerView(s, 'p3').log.at(-1)!.action).not.toHaveProperty('bag');
  });

  it('caravan: 2:1 for the resource of its hex and 1 VP for whoever controls it', () => {
    let s = game();
    const g = graphOf(s);
    const forest = hexOf(s, 'forest');
    put(s, 'p1', g.hexVertices[forest.id][0], 'settlement');
    put(s, 'p2', g.hexVertices[forest.id][3], 'settlement');
    give(s, 'p1', 'caravan');
    give(s, 'p2', 'caravan');
    const lone = s.board.hexes.find((h) => !g.hexVertices[h.id].some((v) => s.pieces.buildings[v]))!;
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'caravan', hex: lone.id })).toBe('BAD_HEX');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'caravan', hex: forest.id });
    expect(victoryPoints(s, 'p1')).toBe(2);
    setHand(s, 'p1', { timber: 2, clay: 2 });
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { timber: 2 }, get: { grain: 1 } })).toBe('OK');
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { clay: 2 }, get: { grain: 1 } })).toBe('BAD_RATE');
    s.turn.current = 'p2';
    s = act(s, { t: 'sh:play', player: 'p2', card: 'caravan', hex: forest.id });
    expect(victoryPoints(s, 'p1')).toBe(1);
    expect(victoryPoints(s, 'p2')).toBe(2);
  });

  it('fleet gives 2:1 for one type until the end of the turn', () => {
    let s = game();
    give(s, 'p1', 'fleet');
    setHand(s, 'p1', { clay: 2 });
    s = act(s, { t: 'sh:play', player: 'p1', card: 'fleet', resource: 'clay' });
    expect(code(s, { t: 'bankTrade', player: 'p1', give: { clay: 2 }, get: { books: 1 } })).toBe('OK');
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(x(s).fleet).toBeNull();
  });

  it('levy takes up to 2 of a resource, corner 1 of a commodity, from every other player', () => {
    let s = game();
    give(s, 'p1', 'levy', 'corner');
    setHand(s, 'p2', { timber: 3, linen: 2 });
    setHand(s, 'p3', { timber: 1, linen: 1 });
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'levy', resource: 'linen' })).toBe('BAD_ARGS');
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'corner', resource: 'timber' })).toBe('BAD_ARGS');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'levy', resource: 'timber' });
    s = act(s, { t: 'sh:play', player: 'p1', card: 'corner', resource: 'linen' });
    expect(hand(s, 'p1')).toMatchObject({ timber: 3, linen: 2 });
    expect(hand(s, 'p2')).toMatchObject({ timber: 1, linen: 1 });
    expect(hand(s, 'p3')).toMatchObject({ timber: 0, linen: 0 });
  });
});

describe('strongholds: council cards', () => {
  it('envoy removes an open road; removing your own lets you rebuild one for free', () => {
    let s = game();
    const { g, V, E } = lane(s, 2);
    const [a] = spread(s, 1, V);
    put(s, 'p2', a, 'settlement');
    const open = g.vertexEdges[a][0];
    road(s, 'p2', open);
    // a p2 road between two p2 buildings is not open
    const closed = g.vertexEdges[a][1];
    road(s, 'p2', closed);
    put(s, 'p2', farEnd(g, closed, a), 'settlement');
    give(s, 'p1', 'envoy', 'envoy');
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'envoy', e: closed })).toBe('BAD_EDGE');
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'envoy', e: E[0] })).toBe('BAD_EDGE'); // p1's inner road
    s = act(s, { t: 'sh:play', player: 'p1', card: 'envoy', e: open });
    expect(s.pieces.roads[open]).toBeUndefined();
    expect(pl(s, 'p2').supply.road).toBe(14);
    s = act(s, { t: 'sh:play', player: 'p1', card: 'envoy', e: E[1], rebuild: true });
    expect(s.pieces.roads[E[1]]).toBeUndefined();
    expect(s.phase).toEqual({ k: 'freeRoads', left: 1 });
    s = act(s, { t: 'placeRoad', player: 'p1', e: E[1] });
    expect(s.phase.k).toBe('main');
    expect(pl(s, 'p1').supply.road).toBe(13);
  });

  it('informant: look at a player\'s advance cards and optionally take one', () => {
    let s = game();
    give(s, 'p1', 'informant');
    give(s, 'p2', 'levy', 'rally');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'informant', target: 'p2' });
    expect(view(s, 'p1').peek).toMatchObject({ target: 'p2', cards: ['levy', 'rally'] });
    expect(view(s, 'p2').peek).toBeNull();
    expect(getLegalActions(s, 'p1')).toHaveLength(3); // levy, rally, skip
    s = act(s, { t: 'sh:resolve', player: 'p1', kind: 'informantTake', card: 'rally' });
    expect(pl(s, 'p1').cards).toEqual(['rally']);
    expect(pl(s, 'p2').cards).toEqual(['levy']);
    expect(getPlayerView(s, 'p3').log.at(-1)!.action).not.toHaveProperty('card');
    expect(s.phase.k).toBe('main');
  });

  it('rally activates all your wardens; plot displaces an opponent warden on your road', () => {
    let s = game();
    const { V } = lane(s);
    warden(s, 'p1', V[1]);
    warden(s, 'p1', V[2], 2);
    warden(s, 'p2', V[3], 3, true);
    give(s, 'p1', 'rally', 'plot');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'rally' });
    expect([occ(s)[V[1]].active, occ(s)[V[2]].active]).toEqual([true, true]);
    expect(code(s, { t: 'sh:moveWarden', player: 'p1', from: V[1], to: V[4] })).toBe('JUST_ACTIVATED');
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'plot', v: V[1] })).toBe('BAD_TARGET');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'plot', v: V[3] });
    expect(occ(s)[V[3]]).toBeUndefined(); // no p2 road to flee along
    expect(pl(s, 'p2').supply.warden3).toBe(2);
  });

  it('toll moves the blocker and steals from every player on the new hex', () => {
    let s = game();
    const g = graphOf(s);
    give(s, 'p1', 'toll');
    const target = s.board.hexes.find((h) => h.id !== x(s).blockerHome)!.id;
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'toll', hex: target })).toBe('NO_BLOCKER');
    x(s).blockerActive = true;
    s.board.blocker = x(s).blockerHome;
    put(s, 'p2', g.hexVertices[target][0], 'settlement');
    put(s, 'p3', g.hexVertices[target][3], 'settlement');
    setHand(s, 'p2', { timber: 1 });
    setHand(s, 'p3', { books: 1 });
    s = act(s, { t: 'sh:play', player: 'p1', card: 'toll', hex: target });
    expect(s.board.blocker).toBe(target);
    expect(hand(s, 'p1')).toMatchObject({ timber: 1, books: 1 });
    expect(s.phase.k).toBe('main');
  });

  it('turncoat: the victim removes a warden, the player may place one of at most that rank', () => {
    let s = game();
    const { V } = lane(s);
    const [a, b] = spread(s, 2, V);
    warden(s, 'p2', a, 2, true);
    warden(s, 'p2', b, 1);
    give(s, 'p1', 'turncoat');
    expect(code(s, { t: 'sh:play', player: 'p1', card: 'turncoat', target: 'p3' })).toBe('BAD_TARGET');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'turncoat', target: 'p2' });
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p2'], data: { kind: 'turncoatRemove' } });
    s = act(s, { t: 'sh:resolve', player: 'p2', kind: 'turncoatRemove', v: a });
    expect(pl(s, 'p2').supply.warden2).toBe(2);
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p1'], data: { kind: 'turncoatPlace' } });
    const place = (v: string, level: number): Action => ({ t: 'sh:resolve', player: 'p1', kind: 'turncoatPlace', v, level });
    expect(code(s, place(V[1], 3))).toBe('BAD_CHOICE');
    expect(code(s, { t: 'sh:resolve', player: 'p1', kind: 'turncoatPlace', skip: true })).toBe('OK');
    s = act(s, place(V[1], 2));
    expect(occ(s)[V[1]]).toMatchObject({ owner: 'p1', level: 2, active: true });
    expect(s.phase.k).toBe('main');
  });

  it('dowry: richer players give 2 cards; sabotage: players with at least your VP discard half', () => {
    let s = game();
    const [a] = spread(s, 1);
    put(s, 'p2', a, 'city');
    setHand(s, 'p2', { timber: 3 });
    setHand(s, 'p3', { clay: 4 }); // p3 has no more VP than p1: not asked by dowry
    give(s, 'p1', 'dowry', 'sabotage');
    s = act(s, { t: 'sh:play', player: 'p1', card: 'dowry' });
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p2'], data: { kind: 'dowryGive' } });
    s = act(s, { t: 'sh:resolve', player: 'p2', kind: 'dowryGive', bag: { timber: 2 } });
    expect(hand(s, 'p1').timber).toBe(2);
    expect(s.phase.k).toBe('main');

    setHand(s, 'p2', { grain: 5 });
    const bank = s.bank.hand.grain;
    s = act(s, { t: 'sh:play', player: 'p1', card: 'sabotage' });
    // p2 (2 VP) and p3, p4 (0 VP, same as p1) are hit; p4 has no cards
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p2'], data: { kind: 'sabotageDiscard' } });
    s = act(s, { t: 'sh:resolve', player: 'p2', kind: 'sabotageDiscard', bag: { grain: 2 } });
    expect(s.phase).toMatchObject({ k: 'ext', actors: ['p3'] });
    s = act(s, { t: 'sh:resolve', player: 'p3', kind: 'sabotageDiscard', bag: { clay: 2 } });
    expect(hand(s, 'p2').grain).toBe(3);
    expect(s.bank.hand.grain).toBe(bank + 2);
    expect(s.phase.k).toBe('main');
  });
});

describe('strongholds: paired players (5-6) and victory', () => {
  it('player 2 uses expansion actions in the paired phase and wins at 13 VP', () => {
    let s = game(6);
    const [a] = spread(s, 1);
    put(s, 'p4', a, 'city');
    x(s).shields.p4 = 10; // 12 VP with the city
    x(s).levels.p4.commerce = 3;
    setHand(s, 'p4', { linen: 4, timber: 1 });
    s = act(s, { t: 'endTurn', player: 'p1' });
    expect(s.phase).toEqual({ k: 'paired', player: 'p4' });
    expect(s.winner).toBeUndefined(); // 12 VP is not enough
    expect(code(s, { t: 'offerTrade', player: 'p4', give: { timber: 1 }, get: { clay: 1 } })).toBe('WRONG_PHASE');
    const r = applyAction(s, { t: 'sh:improve', player: 'p4', track: 'commerce' });
    expect(r.state.winner).toBe('p4');
    expect(r.events).toContainEqual({ e: 'won', player: 'p4', vp: 14 });
  });
});

describe('strongholds: engine guarantees', () => {
  function playRandom(seed: string, players: number, n: number, check = false): GameState {
    let s = newGame(players, seed, { rulesets: ['base', 'strongholds'] });
    const policy = seedRng(`p:${seed}`);
    const sum = (b: Record<string, number>) => Object.values(b).reduce((p, q) => p + q, 0);
    const initial = { resources: sum(s.bank.hand), cards: 0 };
    for (let i = 0; i < n && !s.winner; i++) {
      const opts: Action[] = s.players.flatMap((p) => getLegalActions(s, p.id));
      expect(opts.length).toBeGreaterThan(0);
      s = applyAction(s, opts[randInt(policy, opts.length)]).state;
      if (check) checkInvariants(s, initial);
    }
    return s;
  }

  it('replay: same seed + same actions = identical state', () => {
    const s = playRandom('sh-replay', 4, 500);
    expect(replay(s.init, s.log.map((l) => l.action))).toEqual(s);
  }, 60_000);

  it('random play keeps every invariant (resources, cards, pieces, pending queue)', () => {
    playRandom('sh-inv-5', 5, 900, true);
    playRandom('sh-inv-3', 3, 600, true);
  }, 120_000);

  it('views never contain deck order or other players\' cards', () => {
    const s = playRandom('sh-leak', 4, 700);
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      const v = getPlayerView(s, id);
      expect(JSON.stringify(v)).not.toContain('"decks"');
      for (const p of v.players) if (p.id !== id) expect(p.cards).toBeUndefined();
    }
  }, 60_000);
});
