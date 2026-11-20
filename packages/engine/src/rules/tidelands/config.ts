// "Tidelands" expansion ruleset (sea maps, cogs, the corsair, gold mines, scenarios): numbers and
// tables. All names are Boschtan's own; the rules follow the PO's seafaring rulebooks (docs/RULES_TIDELANDS.md).
import type { Bag } from '../../types';

export const TL_ID = 'tidelands';

/** Terrain ids added by the expansion. Sea and mist (undiscovered) are not land; a gold mine is. */
export const SEA = 'sea';
export const GOLD = 'goldmine';
export const MIST = 'mist';
/** A weavers' village on a small islet (silk scenario): land that produces silk, never resources. */
export const VILLAGE = 'village';

export const TL = {
  costs: { ship: { timber: 1, fiber: 1 } } as Record<string, Bag>,
  /** Cogs per player. */
  supply: { ship: 15 } as Record<string, number>,
  /** VP target added when the strongholds expansion is played too (its own target is 3 above the base game). */
  strongholdsExtraVP: 3,
};

/** Terrain letters used in the map pictures (scenarios.ts). */
export const TERRAIN_LETTER: Record<string, string> = {
  F: 'forest',
  C: 'claypit',
  M: 'meadow',
  G: 'field',
  Q: 'quarry',
  W: 'waste',
  A: GOLD,
  V: VILLAGE,
};
