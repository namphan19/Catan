# Task: authoritative WebSocket game server (M2)

Only write in: packages/server/ (replace the placeholder). Do NOT edit packages/engine, packages/client,
docs/, team/, scripts/, tools/.
Contract: docs/PROTOCOL.md - implement it exactly. Engine API: docs/API.md and packages/engine/src/index.ts
(use only exported functions: createGame, applyAction, validateAction, getLegalActions, getPlayerView,
getEventsView, replay; IllegalActionError).

Stack: Node 20+, TypeScript, `ws` 8.18.0 (pin exact), no framework. Static files: serve
packages/client/dist (path configurable via env CLIENT_DIST) with correct content types and no directory
listing; unknown paths fall back to index.html. Run with tsx (add tsx as a devDependency is not needed;
it is in the root) : package scripts "start": "tsx src/main.ts", "test": "vitest run", "typecheck".
Install via the proxy from the repo root:
  export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128 ; pnpm install
Code layout: src/main.ts (http server + ws wiring + static), src/rooms.ts (room model, seats, lobby,
game), src/protocol.ts (message types + runtime validation of every incoming field), src/store.ts
(persistence with atomic writes; directory from env DATA_DIR, default <repo>/data/rooms), src/limits.ts.
Security: validate and bound every field (names, codes, sizes); never trust `player` from the client;
never send a raw GameState, the seed or another seat's token; constant-time token hash compare.

Tests (vitest, real server on an ephemeral port, real ws clients), at least:
- create room, 3 clients join, ready, start -> each receives its own state with legal actions
- a client receives only its own hand (other seats: counts only); no "seed"/"rng" in any message
- an action from the wrong seat -> IMPERSONATION; an illegal action -> engine error code
- reconnect with the sessionToken restores the seat and the state
- server restart (new server instance on the same DATA_DIR) restores the game via replay
- rate limit and oversized frame handling
- a scripted full game by 3 clients choosing legal actions until a winner (keep it < 60 s; use the
  engine with vpToWin option lowered if needed) to prove the loop works end to end.
Acceptance: pnpm --filter @hexgame/server typecheck and test exit 0 (paste summaries). Do not leave the
server running. Small increments. Final report < 40 lines.
