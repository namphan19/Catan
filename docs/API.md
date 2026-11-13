# Engine API (contract)

Package `@hexgame/engine` (`packages/engine/src/index.ts`). Pure TypeScript, no dependencies, no I/O,
no `Date`/`Math.random`. State is plain JSON. Types: `packages/engine/src/types.ts`.

## Functions
| Function | Purpose |
|---|---|
| `createGame({ seed, playerCount, layout?, rulesets?, vpToWin?, extraBuild? })` | New game. 3-6 players (ids `p1..pN`); 5-6 default to the large layout and the extra build phase. `rulesets` defaults to `['base']`. |
| `validateAction(state, action)` | `{ ok: true }` or `{ ok: false, code, message }` (codes like `NOT_YOUR_TURN`, `WRONG_PHASE`, `DISTANCE_RULE`, `CANNOT_AFFORD`). |
| `applyAction(state, action)` | `{ state, events }`; never mutates the input; throws `IllegalActionError(code)` if invalid; appends to `state.log`. |
| `getLegalActions(state, playerId)` | Concrete legal actions. Open-ended spaces are sampled: offers = all 1-for-1 offers, discards = up to 200 combinations. |
| `getPlayerView(state, viewerId \| null)` | Redacted view: other players' hands/cards as counts, no seed, no rng, no deck order, no `ext`. **The server only ever sends this.** |
| `getEventsView(events, viewerId \| null)` | Redacts private event details (stolen resource, bought card). |
| `replay(init, actions)` | Rebuild a game from `state.init` (incl. seed) + `state.log` actions. Debug/server only. |
| `victoryPoints(state, id, { public })` | VP with or without hidden relics. |
| `registerRuleset(ruleset)` | Register an extension ruleset id (see below). |
| Geometry: `getGraph(layout)`, `hexToPixel`, `vertexToPixel`, `legalSettlementSpots`, `legalRoadSpots`, `longestRoute` | Board helpers (see `docs/BOARD.md`). |

## Actions (`t` + `player` + fields)
`placeSettlement{v}` `placeRoad{e}` `buildCity{v}` `roll` `discard{bag}` `moveBlocker{hex}` `steal{target}`
`bankTrade{give,get}` `offerTrade{give,get}` `respondTrade{accept}` `confirmTrade{with}` `cancelTrade`
`buyCard` `playCard{card, resources?, resource?}` `endTurn` (also "pass" in an extra build window).
Extension actions use a namespaced type: `"adv:someAction"`.

## Phases (`state.phase.k`)
`setup{idx,step,at}` -> `preRoll` -> (`discard{owed}` -> `moveBlocker{resume}` -> `steal{from,resume}`)
-> `main` (-> `freeRoads{left}`) -> [`extraBuild{queue}` for 5-6 players] -> next `preRoll` ... `over`.
`ext{id,data}` is reserved for extension phases.

## Ruleset pipeline (extension points)
A game runs `state.init.rulesetIds` in order (base first). A `Ruleset` (`src/ruleset/types.ts`) may give:
- `config(prev)` - change numbers/tables (costs, deck, supply, resources, layouts, VP target ...).
- `hooks` - each receives the previous ruleset's result and returns its own:
  `rollDice`, `production`, `buildCost`, `victoryPoints`, `checkWinner`, `phaseAfterRoll`, `phaseAfterTurn`.
- `actions[t](prev)` - add new action types, or wrap/replace a base one (`prev` is the earlier definition).
- `init(ctx)` - set up namespaced state in `state.ext[<id>]` at game creation.
Example in the tests: `testdice` overrides `rollDice` without touching base files.
A later expansion ruleset must also provide redaction for anything it puts into `state.ext` before the
view exposes it (the view drops `ext` entirely today).
