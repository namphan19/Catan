// "Strongholds" expansion ruleset: numbers and tables. All names are Boschtan's own (docs/RULES_STRONGHOLDS.md).
import type { Bag } from '../../types';

export const SH_ID = 'strongholds';

/** City improvement tracks. */
export const TRACKS = ['commerce', 'council', 'learning'] as const;
export type Track = (typeof TRACKS)[number];
export type EventFace = 'raid' | Track;

export const SH = {
  /** Commodities are extra hand cards: they count as resources for hand size, trades and theft. */
  commodities: ['books', 'linen', 'silver'],
  /** A city on these terrains yields 1 resource + 1 commodity; on the others 2 resources. */
  terrainCommodity: { forest: 'books', meadow: 'linen', quarry: 'silver' } as Record<string, string>,
  /** Commodity that pays for each improvement track. */
  trackCommodity: { commerce: 'linen', council: 'silver', learning: 'books' } as Record<Track, string>,
  /** Event die: index 0-2 raid fleet, 3 commerce, 4 council, 5 learning. */
  eventFaces: ['raid', 'raid', 'raid', 'commerce', 'council', 'learning'] as EventFace[],
  /** Steps of the raid track: the fleet attacks when it has moved this many times. */
  raidTrack: 7,
  /** Advance cards a player may hold. */
  handLimit: 4,
  /** Extra cards a player may hold on a 7 per rampart. */
  rampartBonus: 2,
  maxLevel: 5,
  /** Level that grants a track's permanent perk. */
  perkLevel: 3,
  /** Level from which a track's capital is claimed. */
  capitalLevel: 4,
  capitalVP: 2,
  caravanVP: 1,
  shieldVP: 1,
  vpToWin: 13,
  commodityBank: { standard: 12, large: 18 } as Record<string, number>,
  supply: { warden1: 2, warden2: 2, warden3: 2, rampart: 3 } as Record<string, number>,
  costs: {
    warden: { fiber: 1, stone: 1 },
    promote: { fiber: 1, stone: 1 },
    activate: { grain: 1 },
    rampart: { clay: 2 },
    charter: { grain: 1, stone: 2 },
  } as Record<string, Bag>,
  /** Number tokens the surveyor card may not swap. */
  frozenTokens: [2, 6, 8, 12],
  /** Advance card decks (18 cards each). */
  decks: {
    learning: {
      omen: 2, scaffold: 2, mason: 1, surveyor: 2, irrigate: 2, charter: 2, prospect: 2, press: 1,
      pavers: 2, armory: 2,
    },
    commerce: { bazaar: 2, tithe: 2, caravan: 6, fleet: 2, levy: 4, corner: 2 },
    council: {
      envoy: 2, informant: 3, rally: 2, plot: 2, toll: 2, codex: 1, turncoat: 2, dowry: 2, sabotage: 2,
    },
  } as Record<Track, Record<string, number>>,
  /** Cards that score 1 VP face up the moment they are drawn. */
  vpCards: ['press', 'codex'],
};

/** Deck each card belongs to (played and discarded cards go back under that deck). */
export const CARD_TRACK: Record<string, Track> = Object.fromEntries(
  TRACKS.flatMap((t) => Object.keys(SH.decks[t]).map((c) => [c, t] as const)),
);

export const isCommodity = (r: string): boolean => SH.commodities.includes(r);
