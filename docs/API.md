# Engine API (contract)

Package `@hexgame/engine` (`packages/engine/src/index.ts`). Pure TypeScript, no dependencies, no I/O,
no `Date`/`Math.random`. State is plain JSON. Types: `packages/engine/src/types.ts`.

## Functions
| Function | Purpose |
|---|---|
| `createGame({ seed, playerCount, layout?, rulesets?, vpToWin?, extraBuild?, options? })` | New game. 2-6 players (ids `p1..pN`); 2-4 use the standard layout; 5-6 default to the large layout and paired turns. `rulesets` defaults to `['base']`. `options` are ruleset options kept in `init.options` (e.g. `{ scenario: 'firstLandfall' }` for tidelands). |
| `validateAction(state, action)` | `{ ok: true }` or `{ ok: false, code, message }` (codes like `NOT_YOUR_TURN`, `WRONG_PHASE`, `DISTANCE_RULE`, `CANNOT_AFFORD`). |
| `applyAction(state, action)` | `{ state, events }`; never mutates the input; throws `IllegalActionError(code)` if invalid; appends `{ seq, action, roll?, gains? }` to `state.log` (`roll` = dice of a roll action, `gains` = public production it caused; both shown in player views). |
| `getLegalActions(state, playerId)` | Concrete legal actions. Open-ended spaces are sampled: offers = all 1-for-1 offers, discards = up to 5000 combinations (validateAction is the authority). |
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

## Extension points used by expansion rulesets (M3)
- `state.pieces.occupants[vertex] = { owner, kind, level, active, tags }`: non-building pieces on vertices.
  Base geometry honours them (no building there, opponents' roads stop, opponents' routes are cut).
- Extra hooks: `discardLimit(ctx, prev, player)`, `tradeRate(ctx, prev, player, resource)`.
- `resolveRoll(ctx)` (base turn module): the production / 7 step, so a ruleset that wraps `roll` can run
  other steps first.
- Phase `{ k: 'ext', id, data, actors }`: an extension window; only `actors` may act, no base action is
  legal, and no win is declared until the normal phase resumes.
- `Ruleset.view(ctx, viewer)` -> `PlayerView.ext[<id>]` (redacted extension state);
  `Ruleset.redactAction(action, viewer)` redacts logged actions; events `{ e: 'ext', id, data, secret,
  visibleTo }` deliver `secret` only to `visibleTo`.
- Ruleset `strongholds` (`createGame({ rulesets: ['base', 'strongholds'] })`): rules in
  docs/RULES_STRONGHOLDS.md. New actions: `sh:improve{track,v?}` `sh:rampart{v}` `sh:recruit{v}`
  `sh:promote{v}` `sh:activate{v}` `sh:moveWarden{from,to}` `sh:displace{from,to}` `sh:chase{v}`
  `sh:play{card,...}` `sh:bazaarOffer{target,resource}` `sh:discardCard{card}`
  `sh:resolve{kind,...}` (answers the head of `view.ext.strongholds.pending`).

## Extension points added for the sea expansion (Tidelands)
- Layouts: `registerLayout(id, axials)` adds a custom hex layout (scenario maps); `LayoutId` is any
  registered id; `getGraph(layout)` works for them. `Hex.region` labels map areas (islands).
- `state.pieces.ships`: route pieces on edges. An edge holds a road or a ship. Base geometry honours them:
  `legalSettlementSpots` / settlement connection accept ships, `longestRoute` joins roads and ships only at
  an own building, `shipConnects` connects to own ships / buildings (never roads alone).
- `GameInit.options` (ruleset options) and `GameInit.setupRounds` (default 2; extra rounds go forward;
  the last round's settlement yields starting resources).
- `Ruleset.prepare(init, config, given)` (layout / VP target from options before the board exists) and
  `Ruleset.makeBoard(rng, init, config)` (scenario boards instead of the random base layout).
- Hooks: `landHex`, `landVertex` (what is land), `blockerAllowed(hex)`, `hexAllowsPiece(piece, hex)`,
  `freeRouteAvailable(player, only?)`
  (free road windows may place other route pieces), `pendingGains` (production still to be chosen),
  `awardActive(award)` (switch off longest route / largest force). Base helpers: `isLandHex`,
  `isLandVertex`, `blockerAllowed`, `hexAllowsPiece`, `freeRouteAvailable`, `lastSetupRound`, `advanceAfterRoute`.
  Phase `freeRoads` may carry `only: 'road' | 'ship'`. An action wrapper may return undefined when the action
  it wraps is not in the game (e.g. tidelands wraps `sh:chase` only when strongholds is played).
- Strongholds resumes another ruleset's `ext` window after its own pending choices.
- Ruleset `tidelands` (`createGame({ rulesets: ['base', 'tidelands'], options: { scenario } })`, with
  strongholds `['base', 'strongholds', 'tidelands']`): rules in docs/RULES_TIDELANDS.md. New actions:
  `tl:buildShip{e}` `tl:moveShip{from,to}` `tl:moveCorsair{hex}` `tl:gold{bag}` `tl:placeHarbor{kind,e}`
  `tl:stealSilk{target}` `tl:claimWonder{wonder}` `tl:buildWonder` `tl:arm`, and with strongholds
  `sh:chase{v, piece: 'corsair'}`. View: `PlayerView.ext.tidelands`
  (mist stacks and reserved reward cards are hidden).
- Ruleset `highlands` (`createGame({ rulesets: ['base', 'highlands'], options: { map: 'variable' | 'starter' } })`,
  2-4 players, not with strongholds/tidelands): rules in docs/RULES_HIGHLANDS.md. Adds the goods `plume`, `herb`,
  `fish` to `config.resources`, the building kinds `ruin` / `ruinCity` (a declined tribe; they produce), and the
  actions `hl:found{v}` (in the `ext` window `hl:found`), `hl:goodsSet{get}`, `hl:caravan{give,get}`, `hl:recall`;
  `placeSettlement` also builds over a ruin. `victoryPoints` = culture points (win at 11). View:
  `PlayerView.ext.highlands` (the order of the second card stack is hidden).
