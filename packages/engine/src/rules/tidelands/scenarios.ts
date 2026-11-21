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
  /** With strongholds: 'good' = recommended by the C&K rulebook's seafaring section; 'harder' = playable,
   *  but exploring / many small islands make the raids hit harder. */
  strongholdsFit?: 'good' | 'harder';
  /** Undiscovered hexes are revealed when a road or cog reaches them. */
  mist?: boolean;
  /** Scenario with its own rules module. */
  special?: 'castaways' | 'silk' | 'works' | 'coves';
  /** Rounds of starting placements (default 2). */
  setupRounds?: number;
  /** The longest-route award is not used. */
  noLongestRoute?: boolean;
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
  strongholdsFit: 'good',
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
  strongholdsFit: 'harder',
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
  strongholdsFit: 'harder',
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
  strongholdsFit: 'good',
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

// ---- 5. The Castaways: islets of a lost people ring the home island; rewards lie on their shores -------
const castaways: Scenario = {
  id: 'castaways',
  vp: 13,
  landfall: 0,
  strongholds: false,
  special: 'castaways',
  maps: maps('castaways', {
    '3': {
      rows: [
        '*t  *t  r4  ~   ~   ~   ~   r1  *t',
        '  r5  r5  ~   *a  *a  *a  *a  r1  *t',
        'r2  ~   *a  *a  *a  *a  *a  ~   r0',
        '  *t  r4  *a  *a  *a  *a  *a  r1  *t',
        '*t  r4  ~   *a  *a  *a  *a  r1  *t',
        '  r5  r3  ~   ~   ~   ~   r2  r3  r5',
        '*t  *t  r4  ~   @   ~   r1  *t  *t',
      ],
      pools: [
        { regions: 'a', terrains: { goldmine: 2, claypit: 3, forest: 3, meadow: 3, field: 4, quarry: 3 }, numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] },
        { regions: 't', unnumbered: true, terrains: { waste: 3, claypit: 2, forest: 2, meadow: 2, field: 1, quarry: 2 }, numbers: [] },
      ],
      harbors: [],
      rewards: { vp: 8, card: 4, harbor: 6 },
      rewardHarbors: harbors(1),
      home: 'a',
    },
    '4': '3',
    '56': {
      rows: [
        '*t  *t  r4  ~   r1  *t  *t  r4  r1  *t  *t',
        '  r5  r5  ~   ~   r0  r5  r5  ~   ~   r5  r5',
        'r2  ~   ~   *a  *a  *a  *a  *a  ~   ~   r2',
        '  *t  r4  *a  *a  *a  *a  *a  *a  ~   r1  *t',
        '*t  r4  *a  *a  *a  *a  *a  *a  *a  r1  *t',
        '  r5  ~   *a  *a  *a  *a  *a  *a  ~   ~   r5',
        'r2  r3  ~   *a  *a  *a  *a  *a  ~   ~   r2',
        '  *t  r4  ~   ~   ~   @   ~   ~   ~   r1  *t',
      ],
      pools: [
        { regions: 'a', terrains: { goldmine: 3, claypit: 5, forest: 5, meadow: 5, field: 6, quarry: 5 }, numbers: [2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12] },
        { regions: 't', unnumbered: true, terrains: { waste: 4, claypit: 2, forest: 2, meadow: 2, field: 1, quarry: 1 }, numbers: [] },
      ],
      harbors: [],
      rewards: { vp: 10, card: 6, harbor: 8 },
      rewardHarbors: harbors(3),
      home: 'a',
    },
  }),
};

// ---- 6. Silk of the Isles: weavers on small islets trade silk with whoever reaches them -------------
const silk: Scenario = {
  id: 'silk',
  vp: 14,
  landfall: 0,
  strongholds: false,
  special: 'silk',
  setupRounds: 3,
  noLongestRoute: true,
  maps: maps('silk', {
    '3': {
      rows: [
        'h2  ~   ~   ~   Vi3 Vi11 ~   ~   ~   ~   ~',
        '  *a  *a  *a  h4  ~   ~   ~   ~   ~   ~   h3',
        '*a  *a  *a  ~   ~   @   Vi4 Vi10 h2  *b  *b',
        '  *a  *a  *a  h4  ~   ~   ~   ~   *b  *b  *b',
        '*a  *a  h4  ~   Vi5 Vi9 ~   h1  *b  *b  *b',
        '  h5  ~   ~   ~   ~   ~   ~   ~   *b  *b  *b',
        '~   ~   ~   ~   ~   ~   Vi2 Vi12 ~   h0  ~',
      ],
      pools: [
        { regions: 'ab', terrains: { waste: 2, claypit: 3, forest: 4, meadow: 4, field: 5, quarry: 4 }, numbers: [2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 10, 10, 11, 11, 12] },
      ],
      harbors: harbors(4),
      blocker: 'twelve',
    },
    '4': '3',
    '56': {
      rows: [
        'h2  ~   h2  ~   ~   ~   ~   ~   ~   ~   ~   ~   ~',
        '  *a  *a  *a  ~   Vi2 Vi8 ~   Vi3 Vi11 ~   h3  ~   h3',
        '*a  *a  *a  h4  ~   ~   ~   ~   ~   ~   *b  *b  *b',
        '  *a  *a  *a  ~   Vi4 Vi10 ~   Vi5 Vi9 h1  *b  *b  *b',
        '*a  *a  *a  h4  ~   ~   @   ~   ~   ~   *b  *b  *b',
        '  *a  *a  *a  ~   Vi6 Vi12 ~   Vi3 Vi11 h1  *b  *b  *b',
        '~   h0  ~   ~   ~   ~   ~   ~   ~   h1  *b  *b  *b',
        '  ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   ~   h5  ~',
      ],
      pools: [
        { regions: 'ab', terrains: { waste: 4, claypit: 4, forest: 6, meadow: 5, field: 6, quarry: 5 }, numbers: [2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12] },
      ],
      harbors: harbors(5, true),
      blocker: 'twelve',
    },
  }),
};

// ---- 8. The Great Works: race to raise a wonder on the home island ---------------------------------
const W = (col: number, row: number, corner: number, kind: string) => ({ col, row, corner, kind });
const works: Scenario = {
  id: 'greatWorks',
  vp: 10,
  landfall: 1,
  strongholds: false,
  special: 'works',
  maps: maps('greatWorks', {
    '3': {
      rows: [
        '~   ~   h2  ~   ~   h2  ~   h2  ~',
        '  *b  ~   *a  *a  *a  *a  h4  *c  *c',
        '*b  ~   *a  *a  *a  *a  Wa  ~   *c',
        '  *b  ~   *a  *a  *a  Wa  Wa  ~   ~',
        '~   h1  *a  *a  *a  *a  *a  h4  *d',
        '  h1  *a  *a  *a  ~   ~   ~   h1  *d',
        '~   ~   ~   h0  ~   ~   ~   ~   ~',
      ],
      pools: [
        { regions: 'a', terrains: { claypit: 4, forest: 4, meadow: 4, field: 4, quarry: 3 }, numbers: [2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] },
        { regions: 'bcd', terrains: { goldmine: 2, claypit: 1, forest: 1, meadow: 1, field: 1, quarry: 2 }, numbers: [2, 3, 5, 6, 8, 9, 10, 11] },
      ],
      harbors: harbors(4),
      home: 'a',
      markers: [
        W(6, 2, 5, 'wall'), W(6, 2, 4, 'wall'), W(5, 3, 5, 'wall'), W(5, 3, 4, 'wall'), W(6, 3, 4, 'wall'),
        W(0, 2, 1, 'bridge'), W(2, 2, 5, 'bridge'),
        W(0, 2, 0, 'x'), W(0, 2, 2, 'x'), W(2, 2, 0, 'x'), W(2, 2, 4, 'x'),
      ],
    },
    '4': '3',
    '56': {
      rows: [
        '~   ~   ~   h2  ~   h2  ~   ~   ~   h2  ~',
        '  *b  ~   ~   *a  *a  *a  *a  h4  ~   *c  *c',
        '*b  ~   *a  *a  *a  *a  *a  Wa  ~   ~   *c',
        '  *b  ~   *a  *a  *a  *a  *a  Wa  Wa  ~   h5',
        'h0  ~   ~   *a  *a  *a  *a  *a  Wa  h1  *d',
        '  ~   h1  *a  *a  *a  *a  *a  h4  ~   *d  *d',
        '~   ~   ~   h0  ~   ~   h0  ~   ~   ~   ~',
        '  ~   *e  *e  ~   ~   ~   ~   ~   ~   ~   ~',
      ],
      pools: [
        { regions: 'a', terrains: { claypit: 5, forest: 5, meadow: 5, field: 5, quarry: 4 }, numbers: [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12] },
        { regions: 'bcde', terrains: { goldmine: 3, claypit: 1, forest: 2, meadow: 2, field: 1, quarry: 2 }, numbers: [2, 3, 4, 5, 6, 8, 9, 10, 11, 11, 12] },
      ],
      harbors: harbors(5, true),
      home: 'a',
      markers: [
        W(7, 2, 5, 'wall'), W(7, 2, 4, 'wall'), W(7, 3, 5, 'wall'), W(7, 3, 4, 'wall'), W(8, 4, 4, 'wall'),
        W(0, 2, 1, 'bridge'), W(2, 2, 5, 'bridge'),
        W(0, 2, 0, 'x'), W(0, 2, 2, 'x'), W(2, 2, 0, 'x'), W(2, 2, 4, 'x'),
        W(6, 5, 3, 'beacon'), W(3, 1, 0, 'beacon'),
        W(6, 5, 2, 'x'), W(6, 5, 4, 'x'), W(3, 1, 1, 'x'), W(3, 1, 5, 'x'),
      ],
    },
  }),
};

// ---- 7. Corsair Coves: break the corsairs' forts on the western islets --------------------------------
const loop = (rows: number): Array<[number, number]> => [
  ...Array.from({ length: rows }, (_, r): [number, number] => [3, r]),
  ...Array.from({ length: rows }, (_, i): [number, number] => [2, rows - 1 - i]),
];
const seat = (start: [number, number, number], row: number) => ({
  start, landing: [1, row, 2] as [number, number, number], fort: [0, row, 2] as [number, number, number],
});
const coves: Scenario = {
  id: 'corsairCoves',
  vp: 10,
  landfall: 0,
  strongholds: false,
  special: 'coves',
  noLongestRoute: true,
  maps: maps('corsairCoves', {
    '3': {
      rows: [
        'Wp  Ap5 ~   ~   ~   h2  ~   h2  ~',
        '  ~   ~   ~   ~   *a  *a  *a  *a  h4',
        'Qp  Mp9 ~   ~   *a  *a  *a  *a  ~',
        '  ~   ~   ~   ~   *a  *a  Wa  *a  h4',
        'Wp  Qp10 ~   ~   *a  *a  *a  *a  *a',
        '  ~   ~   ~   ~   *a  *a  *a  *a  h4',
        'Fp  Gp3 ~   ~   h0  h0  ~   h0  ~',
        '  ~   ~   ~   ~   ~   ~   ~   ~   ~',
      ],
      pools: [
        { regions: 'a', terrains: { goldmine: 1, claypit: 4, forest: 4, meadow: 4, field: 4, quarry: 3 }, numbers: [2, 3, 4, 4, 4, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 10, 10, 11, 11, 12] },
        { regions: 'p', unnumbered: true, terrains: {}, numbers: [] },
      ],
      harbors: harbors(3),
      home: 'a',
      fleet: loop(8),
      seats: [seat([4, 1, 5], 0), seat([4, 2, 4], 2), seat([4, 4, 5], 4), seat([4, 5, 4], 6)],
    },
    '4': '3',
    '56': {
      rows: [
        'Wp  Gp3 ~   ~   ~   h2  h2  ~   ~',
        '  ~   ~   ~   ~   *a  *a  *a  h4  ~',
        'Wp  Ap4 ~   ~   *a  *a  *a  ~   ~',
        '  ~   ~   ~   ~   *a  *a  *a  h4  ~',
        'Wp  Cp5 ~   ~   *a  *a  *a  h4  ~',
        '  ~   ~   ~   ~   *a  *a  *a  *a  h4',
        'Qp  Fp9 ~   ~   *a  Wa  *a  h4  ~',
        '  ~   ~   ~   ~   *a  *a  *a  h4  ~',
        'Fp  Mp10 ~   ~   *a  *a  Wa  ~   ~',
        '  ~   ~   ~   ~   *a  *a  *a  h4  ~',
        'Mp  Qp11 ~   ~   h0  h0  ~   ~   ~',
      ],
      pools: [
        { regions: 'a', terrains: { goldmine: 3, claypit: 3, forest: 5, meadow: 5, field: 4, quarry: 6 }, numbers: [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 8, 8, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12] },
        { regions: 'p', unnumbered: true, terrains: {}, numbers: [] },
      ],
      harbors: harbors(5, true),
      home: 'a',
      fleet: loop(11),
      calm: [[2, 5]],
      seats: [
        seat([4, 1, 5], 0), seat([4, 2, 4], 2), seat([4, 4, 5], 4), seat([4, 5, 4], 6), seat([4, 7, 5], 8), seat([4, 8, 4], 10),
      ],
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
  strongholdsFit: 'harder',
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
  [castaways.id]: castaways,
  [silk.id]: silk,
  [coves.id]: coves,
  [works.id]: works,
  [uncharted.id]: uncharted,
};

export const SCENARIO_IDS = Object.keys(SCENARIOS);

export function scenarioOf(id: unknown): Scenario {
  const s = typeof id === 'string' ? SCENARIOS[id] : undefined;
  if (!s) throw new Error(`unknown tidelands scenario ${String(id)}`);
  return s;
}
