// QA tests: RULES.md sections 1 (components/boards), 3 (placement), 4 (setup) and decisions
// D1 (start player), D2 (second-setup yield), D14 (harbor layout), D15 (large board), D16 (numbers).
import { describe, expect, it } from 'vitest';
import { baseConfig, getGraph } from '../../src';
import { act, autoSetup, graphOf, hand, newGame, pl } from '../helpers';

const bagSum = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);

describe('setup: 3 players (RULES.md 4, D1)', () => {
  it('places p1..p3 then p3..p1 and starts turn 1 with p1; supply after setup', () => {
    // RULES.md 4 (snake order) + RULES.md 1 (15 roads, 5 settlements, 4 cities per player) + D1.
    // firstPlayer: 'p1' pins the D1 start seat for this scenario (default: random per seed).
    const s = autoSetup(newGame(3, 'test-seed', { firstPlayer: 'p1' }));
    const order = s.log.filter((l) => l.action.t === 'placeSettlement').map((l) => l.action.player);
    expect(order).toEqual(['p1', 'p2', 'p3', 'p3', 'p2', 'p1']);
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn).toMatchObject({ n: 1, current: 'p1' });
    for (const p of s.players) {
      expect(p.supply).toMatchObject({ road: 13, settlement: 3, city: 4 });
      expect(Object.values(s.pieces.buildings).filter((b) => b.owner === p.id)).toHaveLength(2);
      expect(Object.values(s.pieces.roads).filter((r) => r === p.id)).toHaveLength(2);
    }
  });

  it('3 players use the standard board (19 hexes, 9 harbors, bank 19, deck 25)', () => {
    // RULES.md 1 (components) + D15 (standard numbers).
    const s = newGame(3);
    expect(s.init.layout).toBe('standard');
    expect(s.board.hexes).toHaveLength(19);
    expect(s.board.harbors).toHaveLength(9);
    expect(s.bank.deck).toHaveLength(25);
    for (const r of baseConfig.resources) expect(s.bank.hand[r]).toBe(19);
  });

  it('standard board contents match RULES.md 1 (terrains, tokens, blocker, deck)', () => {
    // RULES.md 1: 19 hexes; forest 4, claypit 3, meadow 4, field 4, quarry 3, waste 1; 18 tokens
    // without 7; blocker on waste; deck 14/2/2/2/5.
    const s = newGame(4, 'qa-standard-board');
    const g = getGraph('standard');
    const count: Record<string, number> = {};
    for (const h of s.board.hexes) count[h.terrain] = (count[h.terrain] ?? 0) + 1;
    expect(count).toEqual({ forest: 4, claypit: 3, meadow: 4, field: 4, quarry: 3, waste: 1 });
    const tokens = s.board.hexes.filter((h) => h.token !== undefined);
    expect(tokens).toHaveLength(18);
    expect(tokens.some((h) => h.token === 7)).toBe(false);
    const deck: Record<string, number> = {};
    for (const c of s.bank.deck) deck[c] = (deck[c] ?? 0) + 1;
    expect(deck).toEqual({ guard: 14, freeRoads: 2, harvest: 2, claim: 2, relic: 5 });
    expect(s.board.hexes.find((h) => h.id === s.board.blocker)!.terrain).toBe('waste');
    expect(g.coast.length).toBeGreaterThan(s.board.harbors.length);
  });

  it('terrain -> resource mapping and piece/bank numbers match RULES.md 1', () => {
    // RULES.md 1: five resources, five producing terrains + waste -> nothing, 15 roads / 5
    // settlements / 4 cities, bank 19 (large: 24).
    expect(baseConfig.resources).toEqual(['timber', 'clay', 'fiber', 'grain', 'stone']);
    expect(baseConfig.terrainResource).toEqual({
      forest: 'timber', claypit: 'clay', meadow: 'fiber', field: 'grain', quarry: 'stone', waste: null,
    });
    expect(baseConfig.supply).toEqual({ road: 15, settlement: 5, city: 4 });
    expect(baseConfig.layouts.standard!.bankPerResource).toBe(19);
    expect(baseConfig.layouts.large!.bankPerResource).toBe(24);
  });

  it('harbors sit on distinct coast edges and use the right ratios (RULES.md 1, D14)', () => {
    // RULES.md 1: "Harbors on the coast"; D14: evenly spread, kinds shuffled.
    for (const layout of ['standard', 'large'] as const) {
      const s = newGame(layout === 'large' ? 5 : 4, `qa-harbors-${layout}`);
      const g = getGraph(layout);
      const edges = s.board.harbors.map((h) => h.edge);
      expect(new Set(edges).size).toBe(edges.length);
      for (const h of s.board.harbors) {
        expect(g.coast).toContain(h.edge);
        expect(h.vertices).toHaveLength(2);
        expect(g.edgeEnds[h.edge]).toEqual(h.vertices);
        expect(h.ratio).toBe(h.kind === 'any' ? 3 : 2);
      }
      expect(s.board.harbors.filter((h) => h.kind === 'any')).toHaveLength(
        layout === 'large' ? 6 : 4,
      );
      // D14: "placed evenly along the coast" - consecutive harbor positions differ by <= 1 edge.
      const idx = s.board.harbors.map((h) => g.coast.indexOf(h.edge));
      const gaps = idx.slice(1).map((n, i) => n - idx[i]);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    }
  });

  it('createGame refuses fewer than 3 or more than 6 players (API.md)', () => {
    // API.md createGame: 3-6 players (RULES.md does not define 2-player games).
    expect(() => newGame(2)).toThrow();
    expect(() => newGame(7)).toThrow();
    expect(() => newGame(3)).not.toThrow();
    expect(() => newGame(6)).not.toThrow();
  });

  it('the second-setup yield is capped by what the bank holds (D2)', () => {
    // D2: "Yield is capped by what the bank has (never negative)" (RULES.md 4).
    const s = newGame(3, 'qa-yield-bank');
    s.phase = { k: 'setup', idx: 3, step: 'settlement' }; // second setup round, p3
    s.turn = { n: 0, current: 'p1', cardPlayed: false }; // first player p1: third placement is p3
    const g = graphOf(s);
    let pick: { v: string; a: string; b: string } | null = null;
    for (const h of s.board.hexes) {
      const ra = baseConfig.terrainResource[h.terrain];
      if (!ra) continue;
      for (const v of g.hexVertices[h.id]) {
        for (const h2 of g.vertexHexes[v]) {
          if (h2 === h.id) continue;
          const rb = baseConfig.terrainResource[s.board.hexes.find((x) => x.id === h2)!.terrain];
          if (rb && rb !== ra) pick = { v, a: ra, b: rb };
        }
        if (pick) break;
      }
      if (pick) break;
    }
    expect(pick).not.toBeNull();
    for (const r of baseConfig.resources) s.bank.hand[r] = 1;
    s.bank.hand[pick!.a] = 0; // the bank cannot pay this resource at all
    const before = hand(s, 'p3')[pick!.a] ?? 0;
    const r = act(s, { t: 'placeSettlement', player: 'p3', v: pick!.v });
    expect(hand(r, 'p3')[pick!.b]).toBe(1);
    expect(hand(r, 'p3')[pick!.a] ?? 0).toBe(before);
    expect(r.bank.hand[pick!.a]).toBe(0); // never negative
  });
});

describe('setup: 6 players (RULES.md 4, D1)', () => {
  it('places p1..p6 then p6..p1 and starts turn 1 with p1; supply after setup', () => {
    // RULES.md 4 (snake order) + RULES.md 1 (per-player pieces) + D1.
    // firstPlayer: 'p1' pins the D1 start seat for this scenario (default: random per seed).
    const s = autoSetup(newGame(6, 'test-seed', { firstPlayer: 'p1' }));
    const order = s.log.filter((l) => l.action.t === 'placeSettlement').map((l) => l.action.player);
    expect(order).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p6', 'p5', 'p4', 'p3', 'p2', 'p1']);
    expect(s.phase.k).toBe('preRoll');
    expect(s.turn).toMatchObject({ n: 1, current: 'p1' });
    expect(s.init.extraBuild).toBe(true);
    for (const p of s.players) expect(p.supply).toMatchObject({ road: 13, settlement: 3, city: 4 });
  });

  it('the second settlement yields one resource per adjacent producing hex (D2)', () => {
    // RULES.md 4 (second settlement yields) + D2 (capped by the bank).
    const s = autoSetup(newGame(6, 'qa-yield-6', { firstPlayer: 'p1' }));
    const g = graphOf(s);
    const second = s.log.filter((l) => l.action.t === 'placeSettlement').slice(6);
    expect(second).toHaveLength(6);
    for (const l of second) {
      const v = (l.action as { v: string }).v;
      const producing = g.vertexHexes[v]
        .map((h) => s.board.hexes.find((x) => x.id === h)!)
        .filter((h) => baseConfig.terrainResource[h.terrain]).length;
      expect(bagSum(hand(s, l.action.player))).toBe(producing);
    }
  });
});

describe('large board (RULES.md 1, 5-6 players; D14, D15, D16)', () => {
  it('5 players get 30 hexes, 11 harbors, bank 24 per resource and a 34-card deck', () => {
    // RULES.md 1 (boards, harbors, bank, deck) + D15 (large board contents).
    const s = newGame(5);
    expect(s.init.layout).toBe('large');
    expect(s.board.hexes).toHaveLength(30);
    expect(s.board.harbors).toHaveLength(11);
    expect(s.bank.deck).toHaveLength(34);
    for (const r of baseConfig.resources) expect(s.bank.hand[r]).toBe(24);
    // D14: large board = 6 generic + 5 specific harbors.
    expect(s.board.harbors.filter((h) => h.kind === 'any')).toHaveLength(6);
    expect(s.board.harbors.filter((h) => h.kind !== 'any')).toHaveLength(5);
    expect(s.board.harbors.every((h) => (h.kind === 'any' ? h.ratio === 3 : h.ratio === 2))).toBe(true);
  });

  it('has the D15 terrain mix, 28 number tokens and no adjacent hot numbers (D16)', () => {
    // RULES.md 1 (terrains, number tokens) + D15 (terrain counts) + D16 (no adjacent 6/8).
    const s = newGame(6, 'qa-large-board');
    const g = getGraph('large');
    const count: Record<string, number> = {};
    for (const h of s.board.hexes) count[h.terrain] = (count[h.terrain] ?? 0) + 1;
    expect(count).toEqual({ forest: 6, claypit: 5, meadow: 6, field: 6, quarry: 5, waste: 2 });
    const tokens = s.board.hexes.filter((h) => h.token !== undefined);
    expect(tokens).toHaveLength(28);
    expect(tokens.some((h) => h.token === 7)).toBe(false);
    const byId = new Map(s.board.hexes.map((h) => [h.id, h]));
    const hot = new Set(baseConfig.hotNumbers);
    for (const h of tokens) {
      if (!hot.has(h.token!)) continue;
      for (const n of g.hexNeighbors[h.id]) expect(hot.has(byId.get(n)!.token!)).toBe(false);
    }
    // The blocker starts on a waste hex (RULES.md 1).
    expect(byId.get(s.board.blocker)!.terrain).toBe('waste');
    // Deck composition D15: 20 guard / 3 freeRoads / 3 harvest / 3 claim / 5 relic.
    const deck: Record<string, number> = {};
    for (const c of s.bank.deck) deck[c] = (deck[c] ?? 0) + 1;
    expect(deck).toEqual({ guard: 20, freeRoads: 3, harvest: 3, claim: 3, relic: 5 });
  });

  it('6 players have the large board while 3-4 players have the standard one', () => {
    // RULES.md 1 (boards) + RULES.md 4 (seat order only).
    expect(newGame(4).init.layout).toBe('standard');
    expect(newGame(6).init.layout).toBe('large');
    expect(pl(newGame(6), 'p6').id).toBe('p6');
  });
});
