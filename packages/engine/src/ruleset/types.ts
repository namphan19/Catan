// Ruleset pipeline. A game runs a list of rulesets (base first). Later rulesets extend earlier ones:
//  - config(prev)            -> transform the merged numeric/table config
//  - hooks.<name>(ctx, prev) -> receive the previous ruleset's result and return their own
//  - actions[t](prev)        -> add a new action type or wrap/replace an existing one
//  - init(ctx)               -> initialise namespaced state in state.ext at game creation
import type {
  Action, Bag, Board, CardId, GameEvent, GameInit, GameState, HexId, LayoutId, Phase, PlayerId, ResourceId,
  RngState, RuleError, VertexId,
} from '../types';
import type { Graph } from '../board/graph';

export interface LayoutSpec {
  /** terrain -> count */
  terrains: Record<string, number>;
  /** Number tokens placed on producing terrains. */
  tokens: number[];
  /** Harbor kinds; "any" = generic. Placed evenly along the coast. */
  harbors: Array<ResourceId | 'any'>;
  bankPerResource: number;
  deck: Record<CardId, number>;
}

export interface RulesConfig {
  resources: ResourceId[];
  /** terrain -> produced resource (null = produces nothing) */
  terrainResource: Record<string, ResourceId | null>;
  /** buildable item -> cost: road, settlement, city, card */
  costs: Record<string, Bag>;
  supply: Record<string, number>;
  buildingVP: Record<string, number>;
  /** Production multiplier per building kind. */
  buildingYield: Record<string, number>;
  /** Cards that score instead of being played. */
  scoringCards: CardId[];
  layouts: Record<LayoutId, LayoutSpec>;
  blockerNumber: number;
  discardLimit: number;
  bankRate: number;
  genericHarborRate: number;
  specificHarborRate: number;
  /** Numbers that may not be on adjacent hexes. */
  hotNumbers: number[];
  awards: {
    longestRoute: { min: number; vp: number };
    /** cards: played card ids that count toward the award (D21: extensions add theirs). */
    largestForce: { min: number; vp: number; cards: string[] };
  };
  /** Card ids that may be played via playCard (D21: extensions register new ones here). */
  playableCards: string[];
  vpToWin: number;
  freeRoadsCount: number;
  harvestCount: number;
}

export interface Ctx {
  state: GameState;
  graph: Graph;
  rules: Rules;
}

export interface ApplyCtx extends Ctx {
  emit(ev: GameEvent): void;
}

/** Hook signatures: (ctx, prev, ...args) => next. `prev` is the previous ruleset's output. */
export interface Hooks {
  rollDice(ctx: ApplyCtx, prev: number[]): number[];
  production(ctx: Ctx, prev: Record<PlayerId, Bag>, sum: number): Record<PlayerId, Bag>;
  buildCost(ctx: Ctx, prev: Bag, item: string): Bag;
  victoryPoints(ctx: Ctx, prev: number, player: PlayerId, opts: { public: boolean }): number;
  checkWinner(ctx: Ctx, prev: PlayerId | undefined): PlayerId | undefined;
  /** Phase entered after a roll (base: main / discard / moveBlocker). */
  phaseAfterRoll(ctx: ApplyCtx, prev: Phase, sum: number): Phase;
  /** Phase entered when the current player ends the turn (base: extraBuild or next preRoll). */
  phaseAfterTurn(ctx: ApplyCtx, prev: Phase): Phase;
  /** Hand size above which a player discards when the blocker number is rolled. */
  discardLimit(ctx: Ctx, prev: number, player: PlayerId): number;
  /** Bank trade rate for giving `resource` (prev: base rate incl. harbors). */
  tradeRate(ctx: Ctx, prev: number, player: PlayerId, resource: ResourceId): number;
  /** Is this board hex land (base: every hex; sea maps say no for sea and undiscovered hexes)? */
  landHex(ctx: Ctx, prev: boolean, hex: HexId): boolean;
  /** Is this intersection on land, i.e. may pieces stand on it (base: every vertex)? */
  landVertex(ctx: Ctx, prev: boolean, v: VertexId): boolean;
  /** May the blocker be put on this hex (base: any board hex)? */
  blockerAllowed(ctx: Ctx, prev: boolean, hex: HexId): boolean;
  /** Can the player place at least one free road-like piece now (road building / free road windows)?
   *  `only` narrows it to one kind of route piece. */
  freeRouteAvailable(ctx: Ctx, prev: boolean, player: PlayerId, only?: 'road' | 'ship'): boolean;
  /** May an extension piece (e.g. 'caravan') stand on this hex (base: yes)? */
  hexAllowsPiece(ctx: Ctx, prev: boolean, piece: string, hex: HexId): boolean;
  /** Is this award (e.g. 'longestRoute') in play (base: yes)? */
  awardActive(ctx: Ctx, prev: boolean, award: string): boolean;
  /** Production still owed per player as a later choice (e.g. a resource of choice), not yet in hand. */
  pendingGains(ctx: Ctx, prev: Record<PlayerId, number>): Record<PlayerId, number>;
}

export type HookName = keyof Hooks;
export type HookPrev<K extends HookName> = Parameters<Hooks[K]>[1];
export type HookArgs<K extends HookName> = Hooks[K] extends (c: never, p: never, ...a: infer A) => unknown
  ? A
  : never;

export interface ActionDef {
  /** Return null when legal, or the reason it is illegal. ctx.state is read-only here. */
  validate(ctx: Ctx, action: Action): RuleError | null;
  /** Mutate ctx.state (a draft clone). Called only after validate returned null. */
  apply(ctx: ApplyCtx, action: Action): void;
  /** Concrete legal actions of this type for the player (may be a bounded sample for huge spaces). */
  legal(ctx: Ctx, player: PlayerId): Action[];
}

export interface Ruleset {
  id: string;
  /** Ids of rulesets that must come earlier in the list. */
  requires?: string[];
  config?(prev: RulesConfig | undefined): RulesConfig;
  hooks?: { [K in HookName]?: Hooks[K] };
  /** Add or wrap actions. Returning undefined (only for a wrapper whose `prev` is missing) adds nothing. */
  actions?: Record<string, (prev: ActionDef | undefined) => ActionDef | undefined>;
  init?(ctx: ApplyCtx): void;
  /** Adjust the game setup before the board is made (layout, VP target from `init.options`).
   *  `given` says which values the caller fixed explicitly (those must not change). */
  prepare?(init: GameInit, config: RulesConfig, given: { vpToWin: boolean; layout: boolean }): void;
  /** Make the board instead of the random base layout (e.g. a scenario map). The last ruleset that
   *  returns a board wins; it may only draw randomness from `rng`. */
  makeBoard?(rng: RngState, init: GameInit, config: RulesConfig): Board | undefined;
  /** Redacted, JSON-serializable view of this ruleset's `state.ext` data for one viewer
   *  (null = spectator). Ends up in `PlayerView.ext[<ruleset id>]`. */
  view?(ctx: Ctx, viewer: PlayerId | null): unknown;
  /** Redact one logged action for a viewer (hide private choices). Must be stateless. */
  redactAction?(action: Action, viewer: PlayerId | null): Action;
}

export interface Rules {
  ids: string[];
  config: RulesConfig;
  actions: Record<string, ActionDef>;
  call<K extends HookName>(name: K, ctx: Ctx, seed: HookPrev<K>, ...args: HookArgs<K>): HookPrev<K>;
  init(ctx: ApplyCtx): void;
  prepare(init: GameInit, given: { vpToWin: boolean; layout: boolean }): void;
  makeBoard(rng: RngState, init: GameInit): Board | undefined;
  views(ctx: Ctx, viewer: PlayerId | null): Record<string, unknown>;
  redactAction(action: Action, viewer: PlayerId | null): Action;
}
