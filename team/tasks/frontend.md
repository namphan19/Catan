# Task: minimal hot-seat dev client (packages/client)

Goal: a throwaway developer client to play a full game of our hex board game on ONE screen (hot-seat).
Ugly is fine. It must use ONLY the engine API - never re-implement any rule in the UI.

Only write in: packages/client/ (create it). Do NOT edit packages/engine, docs/, team/, scripts/, tools/.

## Engine API (already exists, read packages/engine/src/index.ts, engine.ts, view.ts, types.ts by line ranges)
- import from "@hexgame/engine" (workspace package, add "@hexgame/engine": "workspace:*" to dependencies).
- createGame({ seed, playerCount }) -> GameState   (playerCount 3..6; 5-6 use the large board)
- getLegalActions(state, playerId) -> Action[]       (concrete legal actions)
- applyAction(state, action) -> { state, events }   (throws IllegalActionError if illegal)
- validateAction(state, action) -> { ok } | { ok:false, code, message }
- getPlayerView(state, playerId) -> PlayerView (redacted), getEventsView(events, playerId)
- victoryPoints(state, id, {public:false})
- geometry helpers: hexToPixel(q, r, size), vertexToPixel(vertexId, size), getGraph(layout).edgeEnds[edgeId] -> [v1, v2]
- state.board.hexes: {id,q,r,terrain,token?}; state.board.harbors: {edge, vertices, kind, ratio}; state.board.blocker (hex id)
- state.pieces.buildings: {vertexId: {owner, kind}}; state.pieces.roads: {edgeId: owner}
- state.phase.k: setup | preRoll | main | discard | moveBlocker | steal | freeRoads | extraBuild | over

## Requirements
1. Stack: React 18.3.1 + react-dom 18.3.1, Vite 5.4.11, @vitejs/plugin-react 4.3.4, TypeScript 5.6.3 (pin exact versions).
   package name "@hexgame/client", scripts: dev, build ("tsc -p tsconfig.json && vite build"), typecheck.
   tsconfig extends ../../tsconfig.base.json with lib ["ES2022","DOM"] and jsx "react-jsx".
   Install with the proxy: HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128 pnpm install (from repo root).
2. Start screen: player count (3-6) + seed text box -> New game. Also a "Load log" textarea that accepts JSON
   {init, actions} and rebuilds the game via replay(init, actions); and an "Export log" button that shows
   JSON.stringify({init: state.init, actions: state.log.map(l => l.action)}) in a textarea (no file download).
3. SVG board: hexes coloured by terrain (forest, claypit, meadow, field, quarry, waste) with the number token
   (6 and 8 in red), harbor markers on their edge with the kind and ratio, the blocker on its hex,
   roads as thick lines in the owner's colour, settlements as small squares and cities as bigger shapes.
   Use 6 colour-blind-friendly player colours.
4. Who acts: compute actors = players whose getLegalActions is non-empty. Show tabs for each actor
   (current player first). The selected actor's legal actions drive the UI:
   - placeSettlement / buildCity: highlight legal vertices, click to act.
   - placeRoad: highlight legal edges, click to act.
   - moveBlocker: highlight legal hexes, click to act.
   - everything else (roll, endTurn, buyCard, playCard, bankTrade, offerTrade, respondTrade, confirmTrade,
     cancelTrade, discard, steal): a list of buttons, one per legal action, labelled readably
     (e.g. "bank trade 4 timber -> 1 grain"). If more than 30 actions of one type, show the first 30.
5. Side panel: for every player show the getPlayerView of the SELECTED actor (so other players' hands
   are counts only), VP (public; own full VP), pieces left, played cards, awards (longestRoute, largestForce),
   bank counts and deck count, current phase, turn number, last dice.
6. Log panel: append readable lines for every event returned by applyAction (newest at top), plus errors.
7. Winner banner when state.winner is set.

## Acceptance (run these, paste the results in your report)
- From repo root: pnpm install ; pnpm --filter @hexgame/client typecheck ; pnpm --filter @hexgame/client build  -> all exit 0.
- No rule logic in the client: grep the client for "distance", "longest", "cost" - only display code allowed.
- Do NOT start the dev server and leave it running. Do not run long commands (> 5 min).
- Write files in small increments. Final report: files created, commands + results, open issues (< 40 lines).
