// Tidelands scenarios and their maps. Every map is Boschtan's own drawing; the hex and number counts per
// scenario and player count follow the component lists of the PO's rulebooks (docs/RULES_TIDELANDS.md).
// Map pictures: see the legend in maps.ts. Odd rows are drawn indented by two spaces.
import { defineMap, type MapDef } from './maps';

export type SeatKey = '3' | '4' | '56';

export interface Scenario {
  id: string;
  /** VP needed to win (on your own turn). */
  vp: number;
  /** VP for your first settlement on each region that is not one of your home regions (0 = none). */
  landfall: number;
  /** Map id per table size. */
  maps: Record<SeatKey, string>;
  /** May be played together with the strongholds expansion. */
  strongholds: boolean;
  /** Undiscovered hexes are revealed when a road or cog reaches them. */
  mist?: boolean;
}

export const seatKey = (players: number): SeatKey => (players >= 5 ? '56' : players === 4 ? '4' : '3');

const R = ['timber', 'clay', 'fiber', 'grain', 'stone'];
/** 2:1 harbors (one per resource, +1 fiber with 5-6 players) and n generic 3:1 harbors. */
const harbors = (any: number, extraFiber = false): string[] => [
  ...R,
  ...(extraFiber ? ['fiber'] : []),
  ...Array<string>(any).fill('any'),
];

function maps(id: string, defs: Record<SeatKey, Omit<MapDef, 'id'> | SeatKey>): Record<SeatKey, string> {
  const out = {} as Record<SeatKey, string>;
  for (const k of ['3', '4', '56'] as SeatKey[]) {
    const d = defs[k];
    if (typeof d === 'string') continue;
    out[k] = defineMap({ ...d, id: `tl:${id}:${k}` }).def.id;
  }
  for (const k of ['3', '4', '56'] as SeatKey[]) {
    const d = defs[k];
    if (typeof d === 'string') out[k] = out[d];
  }
  return out;
}

// ---- 1. First Landfall: a home island and small islands to discover ---------------------------------
const firstLandfall: Scenario = {
  id: 'firstLandfall',
  vp: 14,
  landfall: 2,
  strongholds: true,
  maps: maps('firstLandfall', {
    '3': {
      rows: [
        '~   ~   *b  *b  h4  ~   ~   ~',
        '  ~   ~   h3  ~   ~   ~   *c  @',
        'h1  *a  *a  *a  h4  h1  *c  *c',
        '  *a  *a  *a  *a  ~   ~   ~   ~',
        'h1  *a  *a  *a  *a  h4  *d  ~',
        '  ~   *a  *a  *a  ~   ~   *d  *d',
        '~   ~   h0  ~   ~   ~   ~   ~',
      ],
      pools: [
        { regions: 'a', terrains: { claypit: 3, forest: 3, meadow: 4, field: 2, quarry: 2 }, numbers: [2, 3, 4, 4, 5, 5, 6, 8, 8, 9, 10, 10, 11, 12] },
        { regions: 'bcd', terrains: { goldmine: 2, claypit: 1, meadow: 1, field: 2, quarry: 2 }, numbers: [3, 4, 5, 6, 8, 9, 10, 11] },
      ],
      harbors: harbors(3),
      home: 'a',
      blocker: 'twelve',
    },
    '4': {
      rows: [
        '~   ~   ~   h2  ~   ~   h1  *b  *b',
        '  ~   h1  *a  *a  *a  h4  ~   ~   @',
        '~   ~   *a  *a  *a  *a  ~   *c  *c',
        '  h1  *a  *a  *a  *a  *a  h4  *c  ~',
        '~   ~   *a  *a  *a  *a  ~   ~   *c',
        '  ~   h1  *a  *a  *a  h4  *d  ~   ~',
        '~   ~   ~   h0  ~   ~   *d  *d  ~',
      ],
      pools: [
        { regions: 'a', terrains: { waste: 1, claypit: 4, forest: 4, meadow: 4, field: 3, quarry: 3 }, numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] },
        { regions: 'bcd', terrains: { goldmine: 2, claypit: 1, forest: 1, meadow: 1, field: 2, quarry: 2 }, numbers: [2, 3, 4, 5, 6, 8, 9, 10, 11] },
      ],
      harbors: harbors(4),
      home: 'a',
    },
    '56': {
      rows: [
        '~   ~   ~   h2  ~   ~   h1  *b  *b  ~',
        '  ~   h1  *a  *a  *a  h4  ~   ~   *b  @',
        '~   ~   *a  *a  *a  *a  ~   ~   ~   ~',
        '  h1  *a  *a  *a  *a  *a  h4  *c  *c  ~',
        '~   *a  *a  *a  *a  *a  *a  ~   *c  *c',
        '  h1  *a  *a  *a  *a  *a  ~   ~   ~   ~',
        '~   ~   *a  *a  *a  *a  h4  ~   *d  ~',
        '  ~   h1  *a  *a  *a  h4  ~   *d  *d  ~',
        '~   ~   ~   h0  ~   ~   ~   ~   ~   ~',
      ],
      pools: [
        { regions: 'a', terrains: { waste: 2, claypit: 6, forest: 6, meadow: 6, field: 5, quarry: 5 }, numbers: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12] },
        { regions: 'bcd', terrains: { goldmine: 3, claypit: 1, forest: 1, meadow: 1, field: 2, quarry: 2 }, numbers: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] },
      ],
      harbors: harbors(5, true),
      home: 'a',
    },
  }),
};

// ---- 2. The Scattered Isles: four (six) islands; your starting islands are home ------------------
const isles: Scenario = {
  id: 'scatteredIsles',
  vp: 13,
  landfall: 2,
  strongholds: true,
  maps: maps('scatteredIsles', {
    '3': {
      rows: [
        '~   ~   h2  ~   ~   ~   h2  ~   @',
        '  h1  *a  *a  *a  ~   *b  *b  *b  h4',
        '~   ~   *a  *a  ~   ~   *b  *b  ~',
        '  ~   ~   ~   ~   ~   ~   ~   ~   ~',
        'h1  *c  *c  *c  ~   ~   *d  *d  ~',
        '  ~   *c  *c  ~   ~   *d  *d  *d  h4',
        '~   ~   h0  ~   ~   ~   h0  ~   ~',
      ],
      pools: [
        { regions: 'abcd', terrains: { claypit: 4, forest: 4, meadow: 4, field: 4, quarry: 4 }, numbers: [2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 11, 11, 12] },
      ],
      harbors: harbors(3),
      blocker: 'twelve',
      noLowOn: ['forest', 'meadow'],
    },
    '4': {
      rows: [
        '~   ~   h2  ~   ~   ~   h2  ~   @',
        '  h1  *a  *a  *a  ~   *b  *b  *b  h4',
        '~   ~   *a  *a  *a  ~   *b  *b  ~',
        '  ~   ~   h5  ~   ~   ~   ~   ~   ~',
        'h1  *c  *c  *c  ~   ~   *d  *d  *d',
        '  ~   *c  *c  *c  ~   *d  *d  *d  h4',
        '~   ~   h0  ~   ~   ~   h0  ~   ~',
      ],
      pools: [
        { regions: 'abcd', terrains: { claypit: 4, forest: 5, meadow: 5, field: 5, quarry: 4 }, numbers: [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12] },
      ],
      harbors: harbors(4),
      blocker: 'twelve',
      noLowOn: ['forest', 'meadow'],
    },
    '56': {
      rows: [
        '~   ~   h2  ~   ~   ~   h2  ~   ~   ~   h2  ~',
        '  h1  *a  *a  *a  h4  *b  *b  *b  h4  *c  *c  ~',
        '~   ~   *a  *a  *a  ~   *b  *b  ~   *c  *c  *c',
        '  ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   @',
        '~   *d  *d  *d  h4  ~   *e  *e  ~   ~   *f  *f',
        '  h1  *d  *d  *d  ~   *e  *e  *e  ~   *f  *f  *f',
        '~   ~   h0  ~   ~   ~   h0  ~   ~   ~   h0  ~',
      ],
      pools: [
        { regions: 'abcdef', terrains: { claypit: 6, forest: 7, meadow: 7, field: 6, quarry: 6 }, numbers: [2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 12, 12] },
      ],
      harbors: harbors(5, true),
      blocker: 'twelve',
      noLowOn: ['forest', 'meadow'],
    },
  }),
};

// ---- 3. Isles of Mist: two home islands, the waters between them still hidden --------------------
const mists: Scenario = {
  id: 'islesOfMist',
  vp: 12,
  landfall: 0,
  strongholds: true,
  mist: true,
  maps: maps('islesOfMist', {
    '3': {
      rows: [
        'h1  *a  *a  h4  ?m  ?m  @',
        '  *a  *a  *a  ~   ?m  ?m  ?m',
        'h1  *a  *a  h4  ?m  ?m  h2',
        '  ~   ~   ?m  ?m  h1  *b  *b',
        '~   ?m  ?m  ?m  h1  *b  *b',
        '  ~   ~   ~   h1  *b  *b  *b',
      ],
      pools: [
        { regions: 'ab', terrains: { claypit: 2, forest: 4, meadow: 4, field: 2, quarry: 2 }, numbers: [3, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 11, 11, 12] },
        { regions: 'm', mist: true, terrains: { sea: 2, goldmine: 2, claypit: 2, forest: 1, meadow: 1, field: 2, quarry: 2 }, numbers: [3, 3, 4, 5, 6, 8, 9, 10, 11, 12] },
      ],
      harbors: harbors(3),
      blocker: 'twelve',
      hotNeighboursOk: true,
    },
    '4': {
      rows: [
        'h1  *a  *a  h4  ?m  ?m  @   ~',
        '  *a  *a  *a  ~   ?m  ?m  ?m  ~',
        'h1  *a  *a  *a  ?m  ?m  h2  ~',
        '  ~   ?m  ?m  ?m  h1  *b  *b  h4',
        '~   ?m  ?m  h1  *b  *b  *b  ~',
        '  ~   ~   h1  *b  *b  *b  *b  h4',
      ],
      pools: [
        { regions: 'ab', terrains: { claypit: 3, forest: 4, meadow: 4, field: 3, quarry: 3 }, numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 12] },
        { regions: 'm', mist: true, terrains: { sea: 2, goldmine: 2, claypit: 2, forest: 1, meadow: 1, field: 2, quarry: 2 }, numbers: [3, 4, 5, 6, 8, 9, 10, 11, 11, 12] },
      ],
      harbors: harbors(4),
      blocker: 'twelve',
      hotNeighboursOk: true,
    },
    '56': {
      rows: [
        'h1  *a  *a  *a  ?m  ?m  ?m  @   ~',
        '  *a  *a  *a  ?m  ?m  ?m  ?m  ~   ~',
        'h1  *a  *a  *a  ?m  ?m  ?m  h2  ~',
        '  *a  *a  *a  ?m  ?m  ?m  *b  *b  h4',
        'h0  ?m  ?m  ?m  h1  *b  *b  *b  h4',
        '  ~   ?m  ?m  h1  *b  *b  *b  *b  h4',
        '~   ~   ~   h1  *b  *b  *b  h4  ~',
      ],
      pools: [
        { regions: 'ab', terrains: { claypit: 5, forest: 5, meadow: 5, field: 5, quarry: 4 }, numbers: [2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12] },
        { regions: 'm', mist: true, terrains: { sea: 3, goldmine: 3, claypit: 2, forest: 2, meadow: 2, field: 2, quarry: 3, waste: 1 }, numbers: [2, 2, 3, 3, 4, 5, 5, 6, 8, 9, 10, 11, 11, 12] },
      ],
      harbors: harbors(5, true),
      blocker: 'twelve',
      hotNeighboursOk: true,
    },
  }),
};

// ---- 4. Beyond the Wastes: a desert splits the home island; land beyond it and isles to discover ----
const wastes: Scenario = {
  id: 'beyondTheWastes',
  vp: 14,
  landfall: 2,
  strongholds: true,
  maps: maps('beyondTheWastes', {
    '3': {
      rows: [
        'h2  ~   ~   ~   ~   @   *c  *c',
        '  *a  *a  *a  Ww  *b  ~   h1  *c',
        'h1  *a  *a  *a  Ww  *b  h4  ~',
        '  *a  *a  *a  Ww  *b  *b  h4  ~',
        'h1  *a  *a  *a  ~   ~   h1  *d',
        '  ~   ~   ~   h5  ~   ~   *d  *d',
      ],
      pools: [
        { regions: 'a', terrains: { claypit: 2, forest: 3, meadow: 3, field: 2, quarry: 2 }, numbers: [3, 4, 4, 5, 6, 6, 8, 8, 9, 9, 10, 11] },
        { regions: 'b', terrains: { claypit: 1, forest: 1, meadow: 1, quarry: 1 }, numbers: [3, 5, 9, 10] },
        { regions: 'cd', terrains: { goldmine: 2, forest: 1, field: 2, quarry: 1 }, numbers: [2, 4, 5, 6, 8, 12] },
      ],
      harbors: harbors(3),
      home: 'a',
      neutral: 'w',
    },
    '4': {
      rows: [
        '~   h2  ~   ~   ~   ~   ~   *c  *c',
        '  *a  *a  *a  Ww  *b  *b  ~   h1  *c',
        'h1  *a  *a  *a  Ww  *b  *b  h4  ~',
        '  *a  *a  *a  *a  Ww  *b  h4  ~   ~',
        'h1  *a  *a  *a  *a  ~   h1  *d  *d',
        '  ~   ~   *a  *a  h4  ~   ~   *d  ~',
        '~   ~   h0  ~   ~   ~   ~   ~   @',
      ],
      pools: [
        { regions: 'a', terrains: { claypit: 3, forest: 3, meadow: 3, field: 3, quarry: 4 }, numbers: [3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 12] },
        { regions: 'b', terrains: { claypit: 1, forest: 1, meadow: 1, field: 1, quarry: 1 }, numbers: [3, 5, 8, 10, 11] },
        { regions: 'cd', terrains: { goldmine: 2, claypit: 1, forest: 1, meadow: 1, field: 1 }, numbers: [2, 4, 6, 9, 11, 12] },
      ],
      harbors: harbors(4),
      home: 'a',
      neutral: 'w',
    },
    '56': {
      rows: [
        '~   ~   h2  ~   ~   ~   ~   ~   *c  *c',
        '  h1  *a  *a  *a  Ww  *b  *b  ~   h1  *c',
        'h1  *a  *a  *a  *a  Ww  *b  *b  h4  ~',
        '  *a  *a  *a  *a  *a  Ww  *b  *b  ~   ~',
        'h1  *a  *a  *a  *a  *a  Ww  *b  h4  *d',
        '  ~   *a  *a  *a  *a  *a  Ww  ~   h1  *d',
        '~   h0  ~   h2  ~   h0  ~   ~   ~   *d',
        '  ~   ~   *e  *e  *e  ~   ~   ~   ~   @',
      ],
      pools: [
        { regions: 'a', terrains: { claypit: 4, forest: 4, meadow: 5, field: 5, quarry: 4 }, numbers: [2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12] },
        { regions: 'b', terrains: { claypit: 1, forest: 2, meadow: 1, field: 1, quarry: 2 }, numbers: [2, 5, 6, 8, 9, 11, 12] },
        { regions: 'cde', terrains: { goldmine: 3, claypit: 2, forest: 1, meadow: 1, field: 1, quarry: 1 }, numbers: [2, 3, 4, 5, 6, 8, 10, 11, 12] },
      ],
      harbors: harbors(5, true),
      home: 'a',
      neutral: 'w',
    },
  }),
};

// ---- 9. Uncharted Waters: a random map; your starting islands are home ----------------------------
const scatterRows = (w: number, h: number): string[] =>
  Array.from({ length: h }, (_, r) => (r % 2 ? '  ' : '') + Array<string>(w).fill('*u').join('  '));

const uncharted: Scenario = {
  id: 'uncharted',
  vp: 12,
  landfall: 1,
  strongholds: true,
  maps: maps('uncharted', {
    '3': {
      rows: scatterRows(7, 6),
      pools: [
        { regions: 'u', terrains: { sea: 19, claypit: 4, forest: 5, meadow: 5, field: 5, quarry: 4 }, numbers: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12] },
      ],
      harbors: harbors(5),
      scatter: true,
      blocker: 'twelve',
    },
    '4': '3',
    '56': {
      rows: scatterRows(9, 7),
      pools: [
        { regions: 'u', terrains: { sea: 21, goldmine: 4, claypit: 7, forest: 7, meadow: 7, field: 7, quarry: 7, waste: 3 }, numbers: [2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12] },
      ],
      harbors: harbors(5, true),
      scatter: true,
    },
  }),
};

export const SCENARIOS: Record<string, Scenario> = {
  [firstLandfall.id]: firstLandfall,
  [isles.id]: isles,
  [mists.id]: mists,
  [wastes.id]: wastes,
  [uncharted.id]: uncharted,
};

export const SCENARIO_IDS = Object.keys(SCENARIOS);

export function scenarioOf(id: unknown): Scenario {
  const s = typeof id === 'string' ? SCENARIOS[id] : undefined;
  if (!s) throw new Error(`unknown tidelands scenario ${String(id)}`);
  return s;
}
