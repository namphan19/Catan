// Numbers and names of the "highlands" expansion (rise and decline of tribes). Rules: docs/RULES_HIGHLANDS.md.
import type { Bag, CardId } from '../../types';

export const HL_ID = 'highlands';
export const HL_LAYOUT = 'highlands';

/** Goods: produced like resources, held in hand, never used to build, traded 2:1 / 3 different for 2. */
export const GOODS = ['plume', 'herb', 'fish'] as const;
export type Good = (typeof GOODS)[number];
export const isGood = (r: string): r is Good => (GOODS as readonly string[]).includes(r);

/** Terrains of the highlands map (on top of the base terrains forest, claypit, meadow, field, quarry). */
export const JUNGLE = 'jungle'; // plume
export const GROVE = 'grove'; // herb
export const FISHERY = 'fishery'; // fish (a sea hex with a fishing ground)
export const OCEAN = 'sea'; // empty sea (same terrain id as the tidelands sea, so the client art is shared)
export const FRAME = 'wilds'; // the deep jungle beyond the map: only the blocker stands there

/** Land hexes: the only hexes with paths. Jungle, grove, sea, fishery and the wilds have none between them. */
export const LAND_TERRAINS = ['forest', 'claypit', 'meadow', 'field', 'quarry'];

/** Building kinds of a tribe in decline (overgrown). They produce like a settlement / city. */
export const RUIN = 'ruin';
export const RUIN_CITY = 'ruinCity';
export const isRuin = (kind: string | undefined): boolean => kind === RUIN || kind === RUIN_CITY;

export const HL = {
  /** Culture points that end tribe 1 and tribe 2; tribe 3 wins with `finalGoal`. */
  tribeGoal: 4,
  finalGoal: 3,
  tribes: 3,
  /** 4 + 4 + 3: the total of culture points that wins. */
  vpToWin: 11,
  supply: { road: 7, settlement: 8, city: 2 } as Record<string, number>,
  /** Cities per tribe. */
  citiesPerTribe: 1,
  bankPerResource: 20,
  bankPerGood: 12,
  bankRate: 3,
  goodsRate: 2,
  /** One development stack (two identical stacks; the second joins when every player has a 2nd tribe). */
  stack: { guard: 7, freeRoads: 1, harvest: 1, claim: 1 } as Record<CardId, number>,
  /** The claim card takes at most this many cards of the named kind from each opponent. */
  claimMax: 2,
  /** Awards give powers instead of VP. */
  longestRouteMin: 3,
  largestForceMin: 2,
  /** Hand limit on a 7: base 7 plus one per played guard. */
  discardLimit: 7,
  /** Set of three different goods -> this many resources. */
  goodsSetGets: 2,
  /** The longest-route power: give 2 cards, take 1 different card, once per turn. */
  caravanGives: 2,
};

/**
 * The map in rows (pointy-top). The printed board has five flat-top columns from the sea (west) to the
 * jungle (east); turned by 90 degrees they become rows 5-6-7-6-5: row 0 is the coast, row 4 the jungle.
 * Each cell: terrain + number token. `wilds` is one extra hex below the jungle row (the blocker's rest).
 */
export interface Cell {
  q: number;
  r: number;
  terrain: string;
  token?: number;
  /** Shuffled with the other land cells in a variable setup (numbers stay where they are). */
  shuffle?: boolean;
}

const ROWS: Array<{ r: number; q0: number; cells: Array<[string, number?]> }> = [
  { r: -2, q0: -1, cells: [[FISHERY, 6], [OCEAN], [FISHERY, 3], [OCEAN], [FISHERY, 9]] },
  { r: -1, q0: -2, cells: [['meadow', 4], ['forest', 5], ['claypit', 8], ['quarry', 11], ['quarry', 8], ['meadow', 10]] },
  { r: 0, q0: -3, cells: [['claypit', 11], ['field', 6], ['field', 10], ['meadow', 12], ['meadow', 3], ['field', 5], ['field', 3]] },
  { r: 1, q0: -3, cells: [['forest', 2], ['forest', 9], ['claypit', 4], ['quarry', 9], ['forest', 6], [GROVE, 9]] },
  { r: 2, q0: -3, cells: [[JUNGLE, 8], [GROVE, 11], [JUNGLE, 10], [GROVE, 5], [JUNGLE, 4]] },
];

export const WILDS_CELL = { q: -2, r: 3 };

export const MAP: Cell[] = [
  ...ROWS.flatMap(({ r, q0, cells }) =>
    cells.map(([terrain, token], i): Cell => ({
      q: q0 + i,
      r,
      terrain,
      ...(token !== undefined ? { token } : {}),
      ...(LAND_TERRAINS.includes(terrain) ? { shuffle: true } : {}),
    })),
  ),
  { ...WILDS_CELL, terrain: FRAME },
];

export const emptyGoods = (): Bag => Object.fromEntries(GOODS.map((g) => [g, 0]));
