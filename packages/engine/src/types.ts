// Core engine types. Everything in GameState is plain JSON: no classes, Maps, Sets, Dates or functions.

export type PlayerId = string;
export type HexId = string; // "h:q,r"
export type VertexId = string; // "v:q,r,N" | "v:q,r,S"
export type EdgeId = string; // "e:q,r,NE" | "e:q,r,NW" | "e:q,r,W"
export type ResourceId = string; // defined by the ruleset config, e.g. "timber"
export type CardId = string; // defined by the ruleset config, e.g. "guard"
export type LayoutId = 'standard' | 'large';

/** A multiset of resources. Missing keys mean 0. */
export type Bag = Record<ResourceId, number>;

export type RngState = [number, number, number, number];

export interface Hex {
  id: HexId;
  q: number;
  r: number;
  terrain: string;
  token?: number;
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

export interface Pieces {
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, PlayerId>;
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

export interface TradeOffer {
  from: PlayerId;
  give: Bag;
  get: Bag;
  responses: Record<PlayerId, 'accept' | 'decline'>;
}

export type Resume = 'preRoll' | 'main';

export type Phase =
  | { k: 'setup'; idx: number; step: 'settlement' | 'road'; at?: VertexId }
  | { k: 'preRoll' }
  | { k: 'main' }
  | { k: 'discard'; owed: Record<PlayerId, number> }
  | { k: 'moveBlocker'; resume: Resume }
  | { k: 'steal'; from: PlayerId[]; resume: Resume }
  | { k: 'freeRoads'; left: number }
  | { k: 'extraBuild'; queue: PlayerId[] }
  | { k: 'over' }
  | { k: 'ext'; id: string; data: unknown };

export interface GameInit {
  seed: string;
  playerCount: number;
  layout: LayoutId;
  rulesetIds: string[];
  vpToWin: number;
  extraBuild: boolean;
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
  | { t: 'roll'; player: PlayerId }
  | { t: 'discard'; player: PlayerId; bag: Bag }
  | { t: 'moveBlocker'; player: PlayerId; hex: HexId }
  | { t: 'steal'; player: PlayerId; target: PlayerId }
  | { t: 'bankTrade'; player: PlayerId; give: Bag; get: Bag }
  | { t: 'offerTrade'; player: PlayerId; give: Bag; get: Bag }
  | { t: 'respondTrade'; player: PlayerId; accept: boolean }
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
  | { e: 'tradeResponse'; player: PlayerId; accept: boolean }
  | { e: 'tradeCancelled'; player: PlayerId }
  | { e: 'cardBought'; player: PlayerId; card?: CardId }
  | { e: 'cardPlayed'; player: PlayerId; card: CardId; detail?: unknown }
  | { e: 'awardChanged'; award: string; from: PlayerId | null; to: PlayerId | null }
  | { e: 'phase'; phase: Phase['k'] }
  | { e: 'turnStarted'; player: PlayerId; n: number }
  | { e: 'won'; player: PlayerId; vp: number }
  | { e: 'ext'; id: string; data: unknown };

export interface RuleError {
  code: string;
  message: string;
}

export type Validation = { ok: true } | ({ ok: false } & RuleError);
