// Ruleset pipeline. A game runs a list of rulesets (base first). Later rulesets extend earlier ones:
//  - config(prev)            -> transform the merged numeric/table config
//  - hooks.<name>(ctx, prev) -> receive the previous ruleset's result and return their own
//  - actions[t](prev)        -> add a new action type or wrap/replace an existing one
//  - init(ctx)               -> initialise namespaced state in state.ext at game creation
import type {
  Action, Bag, CardId, GameEvent, GameState, LayoutId, Phase, PlayerId, ResourceId, RuleError,
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
  awards: { longestRoute: { min: number; vp: number }; largestForce: { min: number; vp: number } };
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
  actions?: Record<string, (prev: ActionDef | undefined) => ActionDef>;
  init?(ctx: ApplyCtx): void;
}

export interface Rules {
  ids: string[];
  config: RulesConfig;
  actions: Record<string, ActionDef>;
  call<K extends HookName>(name: K, ctx: Ctx, seed: HookPrev<K>, ...args: HookArgs<K>): HookPrev<K>;
  init(ctx: ApplyCtx): void;
}
