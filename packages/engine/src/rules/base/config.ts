// Base ruleset numbers. Names are neutral placeholders until the PO picks a theme (docs/RULES.md).
import type { RulesConfig } from '../../ruleset/types';

export const RESOURCES = ['timber', 'clay', 'fiber', 'grain', 'stone'] as const;

export const baseConfig: RulesConfig = {
  resources: [...RESOURCES],
  terrainResource: {
    forest: 'timber',
    claypit: 'clay',
    meadow: 'fiber',
    field: 'grain',
    quarry: 'stone',
    waste: null,
  },
  costs: {
    road: { timber: 1, clay: 1 },
    settlement: { timber: 1, clay: 1, fiber: 1, grain: 1 },
    city: { grain: 2, stone: 3 },
    card: { fiber: 1, grain: 1, stone: 1 },
  },
  supply: { road: 15, settlement: 5, city: 4 },
  buildingVP: { settlement: 1, city: 2 },
  buildingYield: { settlement: 1, city: 2 },
  scoringCards: ['relic'],
  layouts: {
    standard: {
      terrains: { forest: 4, claypit: 3, meadow: 4, field: 4, quarry: 3, waste: 1 },
      tokens: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
      harbors: ['any', 'timber', 'any', 'clay', 'any', 'fiber', 'any', 'grain', 'stone'],
      bankPerResource: 19,
      deck: { guard: 14, freeRoads: 2, harvest: 2, claim: 2, relic: 5 },
    },
    large: {
      terrains: { forest: 6, claypit: 5, meadow: 6, field: 6, quarry: 5, waste: 2 },
      tokens: [
        2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
      ],
      harbors: ['any', 'timber', 'any', 'clay', 'any', 'fiber', 'any', 'grain', 'any', 'stone', 'any'],
      bankPerResource: 24,
      deck: { guard: 20, freeRoads: 3, harvest: 3, claim: 3, relic: 5 },
    },
  },
  blockerNumber: 7,
  discardLimit: 7,
  bankRate: 4,
  genericHarborRate: 3,
  specificHarborRate: 2,
  hotNumbers: [6, 8],
  awards: { longestRoute: { min: 5, vp: 2 }, largestForce: { min: 3, vp: 2 } },
  vpToWin: 10,
  freeRoadsCount: 2,
  harvestCount: 2,
};
