// Core engine types. Everything in GameState is plain JSON: no classes, Maps, Sets, Dates or functions.

export type PlayerId = string;
export type HexId = string; // "h:q,r"
export type VertexId = string; // "v:q,r,N" | "v:q,r,S"
export type EdgeId = string; // "e:q,r,NE" | "e:q,r,NW" | "e:q,r,W"
export type ResourceId = string; // defined by the ruleset config, e.g. "timber"
export type CardId = string; // defined by the ruleset config, e.g. "guard"
/** 'standard' / 'large' (base) or an id registered with registerLayout (e.g. scenario maps). */
export type LayoutId = 'standard' | 'large' | (string & {});

/** A multiset of resources. Missing keys mean 0. */
export type Bag = Record<ResourceId, number>;

export type RngState = [number, number, number, number];

export interface Hex {
  id: HexId;
  q: number;
  r: number;
  terrain: string;
  token?: number;
  /** Map area (island / region letter) on scenario maps; absent on the base layouts. */
  region?: string;
}

export interface Harbor {
  edge: EdgeId;
  vertices: [VertexId, VertexId];
  /** A resource id for a 2:1 harbor, or "any" for a 3:1 harbor. */
  kind: ResourceId | 'any';
  ratio: number;
}

export interface Board {
  layout: LayoutId;
  hexes: Hex[];
  harbors: Harbor[];
  blocker: HexId;
}

export interface Building {
  owner: PlayerId;
  kind: string; // 'settlement' | 'city' in the base ruleset
}

/** A non-building piece standing on a vertex (added by extension rulesets, e.g. wardens).
 *  It blocks building on its vertex, stops opponents' roads and cuts opponents' routes. */
export interface Occupant {
  owner: PlayerId;
  kind: string;
  level: number;
  active: boolean;
  tags?: string[];
}

export interface Pieces {
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, PlayerId>;
  /** Only present in games whose rulesets use occupants. */
  occupants?: Record<VertexId, Occupant>;
  /** Ships on sea edges (only in games whose rulesets use them). An edge holds a road or a ship,
   *  never both. Ships and roads join into one route only at an own building. */
  ships?: Record<EdgeId, PlayerId>;
}

export interface PlayerState {
  id: PlayerId;
  hand: Bag;
  /** Cards that may be played (owned before this turn / build window). */
  cards: CardId[];
  /** Cards bought during the current turn or build window (not yet playable). */
  newCards: CardId[];
  played: Record<CardId, number>;
  /** Pieces left in the player's supply: road / settlement / city. */
  supply: Record<string, number>;
}

export interface TradeResponse {
  response: 'accept' | 'decline' | 'counter';
  /** Counter terms only: what the responder gives / gets (base p.7 counteroffers). */
  give?: Bag;
  get?: Bag;
}

export interface TradeOffer {
  from: PlayerId;
  give: Bag;
  get: Bag;
  /** Latest response per player; responders may change it until the offer is confirmed/cancelled. */
  responses: Record<PlayerId, TradeResponse>;
  /** How many answers each responder has given to this offer (capped, see MAX_TRADE_ANSWERS). */
  answers?: Record<PlayerId, number>;
}

export type Resume = 'preRoll' | 'main' | 'paired';

/**
 * How 5-6 players take turns:
 * - 'normal' (default): exactly like 2-4 players, every player rolls in their own turn, nothing else;
 * - 'paired': official paired players (five-six p.3), player 2 acts after player 1 without rolling;
 * - 'extraBuild': legacy extra build phase, every other player gets a build window after each turn.
 */
export type LargeTableMode = 'normal' | 'paired' | 'extraBuild';

export type Phase =
  | { k: 'setup'; idx: number; step: 'settlement' | 'road'; at?: VertexId }
  | { k: 'preRoll' }
  | { k: 'main' }
  | { k: 'discard'; owed: Record<PlayerId, number> }
  /** Sub-phase of a paired turn (5-6 players): `player` is player 2 and acts alone. */
  | { k: 'paired'; player: PlayerId }
  /** `actor` is set only when the flow was started by the paired player (who is not turn.current). */
  | { k: 'moveBlocker'; resume: Resume; actor?: PlayerId }
  | { k: 'steal'; from: PlayerId[]; resume: Resume; actor?: PlayerId }
  /** `only`: the window takes just this route piece (e.g. a ship removed by a card is rebuilt as a ship).
   *  `resume`: phase after the window (default main; preRoll when an extension lets the card be played before the roll). */
  | { k: 'freeRoads'; left: number; actor?: PlayerId; only?: 'road' | 'ship'; resume?: Resume }
  | { k: 'extraBuild'; queue: PlayerId[] }
  | { k: 'over' }
  /** Extension window. `actors` optionally names who may act (default: turn.current). */
  | { k: 'ext'; id: string; data: unknown; actors?: PlayerId[] };

export interface GameInit {
  seed: string;
  playerCount: number;
  layout: LayoutId;
  rulesetIds: string[];
  vpToWin: number;
  extraBuild: boolean;
  /** How 5-6 players take turns (ignored with 2-4 players): see `LargeTableMode`. */
  largeTableMode: LargeTableMode;
  /** First player (start of the setup snake and of turn 1); random per seed unless forced. */
  firstPlayer?: PlayerId;
  /** Ruleset options chosen at game creation (e.g. `{ scenario: 'firstLandfall' }`). Plain JSON. */
  options?: Record<string, unknown>;
  /** Rounds of starting placements (default 2: forward, then back). Later rounds go forward again;
   *  the settlement of the last round yields the starting resources. */
  setupRounds?: number;
}

export interface TurnState {
  n: number; // 0 during setup, 1.. afterwards
  current: PlayerId;
  roll?: number[];
  cardPlayed: boolean;
}

export interface LoggedAction {
  seq: number;
  action: Action;
  /** Public outcome of a dice roll (set on `roll` actions), so a log reader sees the number. */
  roll?: { dice: number[]; sum: number };
  /** Public production caused by the action (roll, 2nd setup settlement...), per player. */
  gains?: Record<PlayerId, Bag>;
}

export interface GameState {
  schemaVersion: 1;
  init: GameInit;
  rng: RngState;
  board: Board;
  pieces: Pieces;
  players: PlayerState[];
  bank: { hand: Bag; deck: CardId[] };
  phase: Phase;
  turn: TurnState;
  trade?: TradeOffer;
  awards: Record<string, PlayerId | null>; // longestRoute, largestForce, ...
  ext: Record<string, unknown>;
  log: LoggedAction[];
  winner?: PlayerId;
}

export type BaseAction =
  | { t: 'placeSettlement'; player: PlayerId; v: VertexId }
  | { t: 'placeRoad'; player: PlayerId; e: EdgeId }
  | { t: 'buildCity'; player: PlayerId; v: VertexId }
  /** `dice`: chosen production dice (dice cheat, see cheats.ts); the server only lets an unlocked seat send it.
   *  `bonus`: see cheats.ts; only the server / local game sets it. */
  | { t: 'roll'; player: PlayerId; dice?: [number, number]; bonus?: true }
  | { t: 'discard'; player: PlayerId; bag: Bag }
  | { t: 'moveBlocker'; player: PlayerId; hex: HexId }
  | { t: 'steal'; player: PlayerId; target: PlayerId }
  | { t: 'bankTrade'; player: PlayerId; give: Bag; get: Bag }
  | { t: 'offerTrade'; player: PlayerId; give: Bag; get: Bag }
  | {
      t: 'respondTrade';
      player: PlayerId;
      /** Shorthand: accept: true = accept, false = decline. Ignored when `response` is given. */
      accept?: boolean;
      /** Full form: accept / decline / counter (base p.7 counteroffers). */
      response?: 'accept' | 'decline' | 'counter';
      /** Counter terms: what the responder gives / gets. */
      give?: Bag;
      get?: Bag;
    }
  | { t: 'confirmTrade'; player: PlayerId; with: PlayerId }
  | { t: 'cancelTrade'; player: PlayerId }
  | { t: 'buyCard'; player: PlayerId }
  | { t: 'playCard'; player: PlayerId; card: CardId; resources?: ResourceId[]; resource?: ResourceId }
  | { t: 'endTurn'; player: PlayerId };

/** Actions added by later rulesets use a namespaced type, e.g. "adv:upgradeWall". */
export interface ExtAction {
  t: `${string}:${string}`;
  player: PlayerId;
  [k: string]: unknown;
}

export type Action = BaseAction | ExtAction;

export type GameEvent =
  | { e: 'placed'; player: PlayerId; kind: string; at: string; free: boolean }
  | { e: 'rolled'; player: PlayerId; dice: number[]; sum: number }
  | { e: 'produced'; gains: Record<PlayerId, Bag> }
  | { e: 'discarded'; player: PlayerId; bag: Bag }
  | { e: 'blockerMoved'; player: PlayerId; hex: HexId }
  | { e: 'stole'; from: PlayerId; to: PlayerId; resource?: ResourceId }
  | { e: 'traded'; a: PlayerId; b: PlayerId | 'bank'; aGave: Bag; bGave: Bag }
  | { e: 'tradeOffered'; player: PlayerId; give: Bag; get: Bag }
  | {
      e: 'tradeResponse';
      player: PlayerId;
      response: 'accept' | 'decline' | 'counter';
      /** Kept for older clients: true only when response === 'accept'. */
      accept: boolean;
    }
  | { e: 'tradeCancelled'; player: PlayerId }
  | { e: 'cardBought'; player: PlayerId; card?: CardId }
  | { e: 'cardPlayed'; player: PlayerId; card: CardId; detail?: unknown }
  | { e: 'awardChanged'; award: string; from: PlayerId | null; to: PlayerId | null }
  | { e: 'phase'; phase: Phase['k'] }
  | { e: 'turnStarted'; player: PlayerId; n: number }
  | { e: 'won'; player: PlayerId; vp: number }
  /** Extension event. `secret` is delivered only to the players in `visibleTo`. */
  | { e: 'ext'; id: string; data: unknown; secret?: unknown; visibleTo?: PlayerId[] };

export interface RuleError {
  code: string;
  message: string;
}

export type Validation = { ok: true } | ({ ok: false } & RuleError);
