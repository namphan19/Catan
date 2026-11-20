// Scenario maps: a small picture language, its parser, and the board generator.
//
// A map is drawn as rows of cells separated by spaces; odd rows sit half a hex to the right
// ("odd-r" offset rows of pointy-top hexes). Cells:
//   ~        sea                         @        sea, the corsair starts here
//   h0..h5   sea with a harbor on the edge towards the neighbour in HEX_DIRS[d]
//            (0 NE, 1 E, 2 SE, 3 SW, 4 W, 5 NW)
//   Xr[n]    land: X = terrain letter (F forest, C claypit, M meadow, G field, Q quarry, W waste,
//            A gold mine, * random from the region's pool), r = region letter, n = fixed number
//   ?r       mist: undiscovered hex of region r (terrain and number come from the region's mist stacks)
//   r0..r5   sea with a reward (castaways scenario) on the edge towards the neighbour in HEX_DIRS[d]
//   V        (as a terrain letter) a weavers' village on an islet (silk scenario), always with a number
//   .        no hex (outside the frame)
// Regions are islands or areas of the map (landfall bonus, setup areas). Pools give the random terrains
// and numbers per group of regions.
import type { Board, Harbor, Hex, HexId, RngState } from '../../types';
import type { Axial } from '../../board/coords';
import { HEX_DIRS, hexCorners, hexId } from '../../board/coords';
import { getGraph } from '../../board/graph';
import { registerLayout } from '../../board/layouts';
import { randInt, shuffle } from '../../rng';
import { GOLD, MIST, SEA, TERRAIN_LETTER } from './config';

export interface PoolDef {
  /** Region letters that draw from this pool. */
  regions: string;
  /** Terrains for the `*` cells (or, with mist, the face-down hex stack incl. sea). */
  terrains: Record<string, number>;
  /** Number tokens for producing cells without a fixed number (or the face-down number stack). */
  numbers: number[];
  /** Mist pool: the cells are `?` and the stacks are drawn during play. */
  mist?: boolean;
  /** Land without number tokens (it never produces). */
  unnumbered?: boolean;
}

/** A marked intersection, given as a cell of the picture and one of its corners (0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW). */
export interface MarkerDef {
  col: number;
  row: number;
  corner: number;
  kind: string;
}

export interface MapDef {
  /** Layout id, e.g. "tl:firstLandfall:4". */
  id: string;
  rows: string[];
  pools: PoolDef[];
  /** Harbor kinds: a resource id (2:1) or "any" (3:1), shuffled onto the h-cells. */
  harbors: string[];
  /** Regions where starting settlements must go; undefined: anywhere (the chosen islands become home). */
  home?: string;
  /** Where the blocker starts: the first waste hex (default), else the 12, else the first land hex. */
  blocker?: 'waste' | 'twelve';
  /** Hot numbers (6, 8) may be neighbours (the rulebook allows it on some maps). */
  hotNeighboursOk?: boolean;
  /** Terrains that must not get the low numbers 2, 3, 11, 12. */
  noLowOn?: string[];
  /** Regions that never count as home or for landfall (e.g. the waste hexes splitting an island). */
  neutral?: string;
  /** Random map: every cell is `*u`, the pool includes sea; islands, harbors and the corsair are drawn. */
  scatter?: boolean;
  /** Rewards on the r-cells (castaways): counts per kind ('vp', 'card', 'harbor'); shuffled at setup. */
  rewards?: Record<string, number>;
  /** Harbor kinds handed out as rewards. */
  rewardHarbors?: string[];
  /** Marked intersections (wonder sites, no-build marks). */
  markers?: MarkerDef[];
  /** Corsair coves: per seat (seat order) the starting settlement, the landing and the fort,
   *  each a cell and corner [col, row, corner]. Smaller tables use the first seats. */
  seats?: Array<{ start: [number, number, number]; landing: [number, number, number]; fort: [number, number, number] }>;
  /** Corsair coves: the pirate fleet's loop of sea cells [col, row] in sailing order. */
  fleet?: Array<[number, number]>;
  /** Cells of the loop where the fleet never attacks. */
  calm?: Array<[number, number]>;
}

export interface Cell {
  col: number;
  row: number;
  q: number;
  r: number;
  id: HexId;
  kind: 'sea' | 'land' | 'mist';
  /** Fixed terrain letter or '*' (land only). */
  letter?: string;
  region?: string;
  token?: number;
  harborDir?: number;
  rewardDir?: number;
  corsair?: boolean;
}

export interface ParsedMap {
  def: MapDef;
  cells: Cell[];
  byPos: Record<string, Cell>;
}

const LAND_RE = /^([FCMGQWAV*])([a-z])(\d+)?$/;

/** Parse a map picture into cells with centred axial coordinates. */
export function parseMap(def: MapDef): ParsedMap {
  const raw: Omit<Cell, 'q' | 'r' | 'id'>[] = [];
  def.rows.forEach((line, row) => {
    line
      .trim()
      .split(/\s+/)
      .forEach((tok, col) => {
        if (tok === '.') return;
        const base = { col, row };
        if (tok === '~') raw.push({ ...base, kind: 'sea' });
        else if (tok === '@') raw.push({ ...base, kind: 'sea', corsair: true });
        else if (/^h[0-5]$/.test(tok)) raw.push({ ...base, kind: 'sea', harborDir: Number(tok[1]) });
        else if (/^r[0-5]$/.test(tok)) raw.push({ ...base, kind: 'sea', rewardDir: Number(tok[1]) });
        else if (/^\?[a-z]$/.test(tok)) raw.push({ ...base, kind: 'mist', region: tok[1] });
        else {
          const m = LAND_RE.exec(tok);
          if (!m) throw new Error(`${def.id}: bad cell "${tok}" at row ${row} col ${col}`);
          raw.push({ ...base, kind: 'land', letter: m[1], region: m[2], token: m[3] ? Number(m[3]) : undefined });
        }
      });
  });
  // Odd rows are shifted half a hex right: axial q = col - (row - (row & 1)) / 2, r = row. Then move the
  // whole map by an integer axial vector so that it is centred around the origin.
  const ax = raw.map((c) => ({ q: c.col - (c.row - (c.row & 1)) / 2, r: c.row }));
  const mr = ax.reduce((s, a) => s + a.r, 0) / ax.length;
  const dr = -Math.round(mr);
  const mq = ax.reduce((s, a) => s + a.q, 0) / ax.length;
  const dq = -Math.round(mq + (mr + dr) / 2);
  const cells: Cell[] = raw.map((c, i) => {
    const q = ax[i].q + dq;
    const r = ax[i].r + dr;
    return { ...c, q, r, id: hexId(q, r) };
  });
  const byPos: Record<string, Cell> = {};
  for (const c of cells) byPos[`${c.col},${c.row}`] = c;
  return { def, cells, byPos };
}

const PARSED: Record<string, ParsedMap> = {};

/** Parse, check and register a map (its hex positions become a layout for getGraph). */
export function defineMap(def: MapDef): ParsedMap {
  const pm = parseMap(def);
  checkMap(pm);
  registerLayout(def.id, pm.cells.map((c): Axial => ({ q: c.q, r: c.r })));
  PARSED[def.id] = pm;
  return pm;
}

export function mapById(id: string): ParsedMap {
  const pm = PARSED[id];
  if (!pm) throw new Error(`unknown map ${id}`);
  return pm;
}

const isProducing = (t: string): boolean => t !== 'waste' && t !== SEA;

/** Corners per hex for the static checks (the layout is not registered yet). */
function buildCheckGraph(cells: Cell[]): { corners: Record<HexId, string[]> } {
  return { corners: Object.fromEntries(cells.map((c) => [c.id, hexCorners(c.q, c.r)])) };
}

/** Static consistency of a map: pools match the cells, harbors face land, numbers fit. */
function checkMap(pm: ParsedMap): void {
  const { def, cells } = pm;
  const fail = (m: string) => {
    throw new Error(`${def.id}: ${m}`);
  };
  const byId = Object.fromEntries(cells.map((c) => [c.id, c]));
  for (const c of cells) {
    const dir = c.harborDir ?? c.rewardDir;
    if (dir === undefined) continue;
    const d = HEX_DIRS[dir];
    const n = byId[hexId(c.q + d.q, c.r + d.r)];
    if (!n || n.kind !== 'land') fail(`harbor or reward at row ${c.row} col ${c.col} does not face land`);
  }
  const rewardCount = Object.values(def.rewards ?? {}).reduce((s, n) => s + n, 0);
  if (cells.filter((c) => c.rewardDir !== undefined).length !== rewardCount) fail('reward cells and rewards differ');
  if ((def.rewards?.harbor ?? 0) !== (def.rewardHarbors?.length ?? 0)) fail('reward harbors and harbor kinds differ');
  for (const m of def.markers ?? []) if (!pm.byPos[`${m.col},${m.row}`]) fail(`marker at row ${m.row} col ${m.col} is off the map`);
  for (const c of cells)
    if (c.letter === 'V' && c.token === undefined) fail(`village at row ${c.row} col ${c.col} needs a number`);
  if (!def.scatter && cells.filter((c) => c.harborDir !== undefined).length !== def.harbors.length)
    fail('harbor cells and harbor kinds differ');
  // Harbors keep at least one edge between them (no shared corner).
  const g = buildCheckGraph(cells);
  const corners = cells
    .filter((c) => c.harborDir !== undefined)
    .map((c) => {
      const d = HEX_DIRS[c.harborDir!];
      const land = hexId(c.q + d.q, c.r + d.r);
      const shared = g.corners[c.id].filter((v) => g.corners[land].includes(v));
      return { c, shared };
    });
  for (let i = 0; i < corners.length; i++)
    for (let j = i + 1; j < corners.length; j++)
      if (corners[i].shared.some((v) => corners[j].shared.includes(v)))
        fail(`harbors at row ${corners[i].c.row} col ${corners[i].c.col} and row ${corners[j].c.row} col ${corners[j].c.col} touch`);
  // Different regions are separated by sea, except across a waste hex (e.g. a desert splitting an island).
  for (const c of cells) {
    if (c.kind !== 'land' || !c.region) continue;
    for (const d of HEX_DIRS) {
      const n = byId[hexId(c.q + d.q, c.r + d.r)];
      if (!n || n.kind !== 'land' || !n.region || n.region === c.region) continue;
      if (c.letter === 'W' || n.letter === 'W') continue;
      fail(`regions ${c.region} and ${n.region} touch at row ${c.row} col ${c.col}`);
    }
  }
  const regions = new Set(cells.filter((c) => c.region).map((c) => c.region as string));
  for (const r of regions)
    if (def.pools.filter((p) => p.regions.includes(r)).length > 1) fail(`region ${r} is in two pools`);
  for (const p of def.pools) {
    const mine = cells.filter((c) => c.region && p.regions.includes(c.region));
    const terrainCount = Object.values(p.terrains).reduce((s, n) => s + n, 0);
    if (p.mist) {
      const slots = mine.filter((c) => c.kind === 'mist').length;
      if (slots !== terrainCount) fail(`mist pool ${p.regions}: ${terrainCount} hexes for ${slots} cells`);
      const producing = Object.entries(p.terrains)
        .filter(([t]) => isProducing(t))
        .reduce((s, [, n]) => s + n, 0);
      if (producing !== p.numbers.length) fail(`mist pool ${p.regions}: ${p.numbers.length} numbers for ${producing} land hexes`);
      continue;
    }
    if (p.unnumbered && p.numbers.length) fail(`pool ${p.regions}: unnumbered pool with numbers`);
    const stars = mine.filter((c) => c.kind === 'land' && c.letter === '*').length;
    if (stars !== terrainCount) fail(`pool ${p.regions}: ${terrainCount} terrains for ${stars} random cells`);
    const fixed: Record<string, number> = {};
    for (const c of mine) if (c.kind === 'land' && c.letter !== '*') fixed[TERRAIN_LETTER[c.letter!]] = (fixed[TERRAIN_LETTER[c.letter!]] ?? 0) + 1;
    const all = { ...p.terrains };
    for (const [t, n] of Object.entries(fixed)) all[t] = (all[t] ?? 0) + n;
    const needNumbers =
      Object.entries(all)
        .filter(([t]) => isProducing(t))
        .reduce((s, [, n]) => s + n, 0) - mine.filter((c) => c.kind === 'land' && c.token !== undefined).length;
    if (!p.unnumbered && needNumbers !== p.numbers.length) fail(`pool ${p.regions}: ${p.numbers.length} numbers for ${needNumbers} hexes`);
  }
  for (const c of cells)
    if (c.region && !def.pools.some((p) => p.regions.includes(c.region!)) && (c.letter === '*' || c.kind === 'mist'))
      fail(`region ${c.region} has random cells but no pool`);
}

/** A fresh random board for a map (deterministic for the rng). */
export function generateMapBoard(rng: RngState, mapId: string, opts: { hot: number[]; genericRate: number; specificRate: number }): Board {
  const { def, cells } = mapById(mapId);
  const hexes: Hex[] = cells.map((c) => {
    const h: Hex = { id: c.id, q: c.q, r: c.r, terrain: c.kind === 'sea' ? SEA : c.kind === 'mist' ? MIST : '' };
    if (c.kind === 'land' && c.letter !== '*') h.terrain = TERRAIN_LETTER[c.letter!];
    if (c.token !== undefined) h.token = c.token;
    if (c.region) h.region = c.region;
    return h;
  });
  const byId: Record<HexId, Hex> = Object.fromEntries(hexes.map((h) => [h.id, h]));
  if (def.scatter) return scatterBoard(rng, mapId, hexes, opts);
  const landPools = def.pools.filter((p) => !p.mist);
  // Terrains of the random cells, pool by pool.
  for (const p of landPools) {
    const slots = cells.filter((c) => c.kind === 'land' && c.letter === '*' && p.regions.includes(c.region!));
    const bag = shuffle(rng, Object.entries(p.terrains).flatMap(([t, n]) => Array<string>(n).fill(t)));
    slots.forEach((c, i) => (byId[c.id].terrain = bag[i]));
  }
  // Numbers: reshuffle until the placement rules hold.
  const slotsOf = landPools.map((p) =>
    p.unnumbered ? [] : cells
      .filter((c) => c.kind === 'land' && p.regions.includes(c.region!) && c.token === undefined)
      .map((c) => byId[c.id])
      .filter((h) => isProducing(h.terrain)),
  );
  landPools.forEach((p, i) => {
    const nums = shuffle(rng, [...p.numbers]);
    slotsOf[i].forEach((h, k) => (h.token = nums[k]));
  });
  if (!repairNumbers(rng, mapId, hexes, slotsOf, opts.hot)) throw new Error(`${mapId}: could not place the number tokens`);
  return finishBoard(rng, mapId, hexes, opts);
}

/** Hexes whose number breaks a placement rule (hot on gold, low on a protected terrain, hot neighbours). */
function badNumbers(mapId: string, hexes: Hex[], hot: number[]): Hex[] {
  const { def } = mapById(mapId);
  const g = getGraph(mapId);
  const byId: Record<HexId, Hex> = Object.fromEntries(hexes.map((h) => [h.id, h]));
  const isHot = (n: number | undefined) => n !== undefined && hot.includes(n);
  const low = (n: number | undefined) => n === 2 || n === 3 || n === 11 || n === 12;
  return hexes.filter((h) => {
    if (h.token === undefined) return false;
    if (isHot(h.token) && h.terrain === GOLD) return true;
    if (low(h.token) && def.noLowOn?.includes(h.terrain)) return true;
    if (isHot(h.token) && !def.hotNeighboursOk) return g.hexNeighbors[h.id].some((n) => isHot(byId[n]?.token));
    return false;
  });
}

const REPAIR_STEPS = 4000;

/** Local search: swap a misplaced number with a random hex of the same group until all rules hold. */
function repairNumbers(rng: RngState, mapId: string, hexes: Hex[], groups: Hex[][], hot: number[]): boolean {
  const groupOf = new Map<Hex, Hex[]>();
  for (const gr of groups) for (const h of gr) groupOf.set(h, gr);
  for (let step = 0; step < REPAIR_STEPS; step++) {
    const bad = badNumbers(mapId, hexes, hot).filter((h) => groupOf.has(h));
    if (!bad.length) return badNumbers(mapId, hexes, hot).length === 0;
    const h = bad[randInt(rng, bad.length)];
    const gr = groupOf.get(h)!;
    const o = gr[randInt(rng, gr.length)];
    [h.token, o.token] = [o.token, h.token];
  }
  return false;
}

/** Harbors on the marked cells and the blocker's start; shared by drawn and random maps. */
function finishBoard(rng: RngState, mapId: string, hexes: Hex[], opts: { hot: number[]; genericRate: number; specificRate: number }): Board {
  const { def, cells } = mapById(mapId);
  const g = getGraph(mapId);
  // Harbors on the marked sea cells, kinds shuffled.
  const kinds = shuffle(rng, [...def.harbors]);
  const harbors: Harbor[] = cells
    .filter((c) => c.harborDir !== undefined)
    .map((c, i) => {
      const d = HEX_DIRS[c.harborDir!];
      const land = hexId(c.q + d.q, c.r + d.r);
      const edge = g.hexEdges[c.id].find((e) => g.hexEdges[land].includes(e))!;
      const [a, b] = g.edgeEnds[edge];
      const kind = kinds[i];
      return { edge, vertices: [a, b], kind, ratio: kind === 'any' ? opts.genericRate : opts.specificRate };
    });
  return { layout: mapId, hexes, harbors, blocker: blockerStart(def, hexes) };
}

function blockerStart(def: MapDef, hexes: Hex[]): HexId {
  const land = hexes.filter((h) => h.terrain !== SEA && h.terrain !== MIST);
  const b =
    (def.blocker !== 'twelve' && land.find((h) => h.terrain === 'waste')) || land.find((h) => h.token === 12) || land[0];
  return b.id;
}

const SCATTER_TRIES = 400;
const REGION_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** A random map (rulebook "new world"): terrains and sea shuffled over the frame, then islands are
 *  labelled as regions, numbers placed, harbors put on random coast edges at least one edge apart. */
function scatterBoard(rng: RngState, mapId: string, hexes: Hex[], opts: { hot: number[]; genericRate: number; specificRate: number }): Board {
  const { def } = mapById(mapId);
  const g = getGraph(mapId);
  const pool = def.pools[0];
  const byId: Record<HexId, Hex> = Object.fromEntries(hexes.map((h) => [h.id, h]));
  for (let attempt = 0; attempt < SCATTER_TRIES; attempt++) {
    const bag = shuffle(rng, Object.entries(pool.terrains).flatMap(([t, n]) => Array<string>(n).fill(t)));
    hexes.forEach((h, i) => {
      h.terrain = bag[i];
      delete h.token;
      delete h.region;
    });
    // Islands: connected land hexes.
    const islands: HexId[][] = [];
    for (const h of hexes) {
      if (h.terrain === SEA || h.region) continue;
      const letter = REGION_LETTERS[islands.length] ?? 'z';
      const isle: HexId[] = [];
      const queue = [h.id];
      h.region = letter;
      while (queue.length) {
        const id = queue.pop()!;
        isle.push(id);
        for (const n of g.hexNeighbors[id]) {
          const nh = byId[n];
          if (nh.terrain !== SEA && !nh.region) {
            nh.region = letter;
            queue.push(n);
          }
        }
      }
      islands.push(isle);
    }
    const landCount = hexes.filter((h) => h.terrain !== SEA).length;
    // Playable shape: at least three islands, none bigger than two thirds of the land, no lone hex.
    if (islands.length < 3 || islands.some((i) => i.length < 2) || Math.max(...islands.map((i) => i.length)) * 3 > landCount * 2)
      continue;
    const slots = hexes.filter((h) => isProducing(h.terrain));
    const nums = shuffle(rng, [...pool.numbers]);
    slots.forEach((h, k) => (h.token = nums[k]));
    if (!repairNumbers(rng, mapId, hexes, [slots], opts.hot)) continue;
    // Harbors: random coast edges (land on one side, sea or the frame on the other), spaced apart.
    const coast = g.edges.filter((e) => {
      const hs = g.edgeHexes[e];
      const landSide = hs.filter((x) => byId[x].terrain !== SEA);
      return landSide.length === 1 && (hs.length === 1 || hs.some((x) => byId[x].terrain === SEA));
    });
    const kinds = shuffle(rng, [...def.harbors]);
    const used = new Set<string>();
    const harbors: Harbor[] = [];
    for (const e of shuffle(rng, coast)) {
      if (harbors.length === kinds.length) break;
      const [a, b] = g.edgeEnds[e];
      if (used.has(a) || used.has(b)) continue;
      used.add(a);
      used.add(b);
      const kind = kinds[harbors.length];
      harbors.push({ edge: e, vertices: [a, b], kind, ratio: kind === 'any' ? opts.genericRate : opts.specificRate });
    }
    if (harbors.length < kinds.length) continue;
    return { layout: mapId, hexes, harbors, blocker: blockerStart(def, hexes) };
  }
  throw new Error(`${mapId}: could not draw a random map`);
}

/** Shuffled face-down stacks of a map's mist pools: hex terrains and number tokens per region group. */
export function mistStacks(rng: RngState, mapId: string): Array<{ regions: string; hexes: string[]; numbers: number[] }> {
  return mapById(mapId)
    .def.pools.filter((p) => p.mist)
    .map((p) => ({
      regions: p.regions,
      hexes: shuffle(rng, Object.entries(p.terrains).flatMap(([t, n]) => Array<string>(n).fill(t))),
      numbers: shuffle(rng, [...p.numbers]),
    }));
}

/** The corsair's starting hex on a map, if it has one. */
export const corsairStart = (mapId: string): HexId | null => mapById(mapId).cells.find((c) => c.corsair)?.id ?? null;

/** Hex id of the cell drawn at (col, row) in a map picture. */
export function cellAt(mapId: string, col: number, row: number): HexId {
  const c = mapById(mapId).byPos[`${col},${row}`];
  if (!c) throw new Error(`${mapId}: no cell at col ${col} row ${row}`);
  return c.id;
}

/** Edges of the reward cells (castaways), in map order. */
export function rewardEdges(mapId: string): string[] {
  const g = getGraph(mapId);
  return mapById(mapId)
    .cells.filter((c) => c.rewardDir !== undefined)
    .map((c) => {
      const d = HEX_DIRS[c.rewardDir!];
      const land = hexId(c.q + d.q, c.r + d.r);
      return g.hexEdges[c.id].find((e) => g.hexEdges[land].includes(e))!;
    });
}

/** Marked intersections of a map as vertex ids. */
export function mapMarkers(mapId: string): Array<{ v: string; kind: string }> {
  const pm = mapById(mapId);
  return (pm.def.markers ?? []).map((m) => {
    const c = pm.byPos[`${m.col},${m.row}`];
    return { v: hexCorners(c.q, c.r)[m.corner], kind: m.kind };
  });
}

const cornerOf = (pm: ParsedMap, [col, row, corner]: [number, number, number]): string => {
  const c = pm.byPos[`${col},${row}`];
  if (!c) throw new Error(`${pm.def.id}: no cell at col ${col} row ${row}`);
  return hexCorners(c.q, c.r)[corner];
};

/** Corsair coves geometry of a map: seats, the fleet loop and its calm hexes. */
export function covesGeometry(mapId: string): {
  seats: Array<{ start: string; landing: string; fort: string }>;
  loop: HexId[];
  calm: HexId[];
} {
  const pm = mapById(mapId);
  const cell = ([col, row]: [number, number]) => {
    const c = pm.byPos[`${col},${row}`];
    if (!c) throw new Error(`${mapId}: no cell at col ${col} row ${row}`);
    return c.id;
  };
  return {
    seats: (pm.def.seats ?? []).map((st) => ({ start: cornerOf(pm, st.start), landing: cornerOf(pm, st.landing), fort: cornerOf(pm, st.fort) })),
    loop: (pm.def.fleet ?? []).map(cell),
    calm: (pm.def.calm ?? []).map(cell),
  };
}
