# Hexgame (working title)

An original hex-tile settlement and trading board game for 3-6 players, for private play with friends.
Milestone 1: monorepo, pure rules engine (base game incl. the 5-6 player extra build phase), tests, fuzzer
and a hot-seat dev client. Networking, bots, an advanced expansion ruleset and polished UI come later.
Names and theme are placeholders until the PO decides (see `docs/RULES_DECISIONS.md`).

## Run
```bash
# needs Node 20+ and pnpm 9 (behind the proxy: export HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:3128)
pnpm install
pnpm test                 # all unit tests (engine)
pnpm typecheck            # every package
pnpm fuzz                 # 50 random full games with invariant checks (~6 min); pnpm fuzz 5 = quick
pnpm dev                  # hot-seat dev client at http://localhost:5173
pnpm --filter @hexgame/client build
```

## Folder structure
```
packages/engine/            pure rules engine (no UI, no network, no Date/Math.random)
  src/types.ts              GameState, Action, GameEvent, Phase (plain JSON)
  src/engine.ts             createGame, applyAction, validateAction, getLegalActions, replay
  src/view.ts               getPlayerView / getEventsView (redaction)
  src/rng.ts                seeded sfc32 RNG; its state lives in GameState.rng
  src/board/                axial coordinates, layouts, generation, graph helpers, longest route
  src/ruleset/              Ruleset hook interface + composition pipeline
  src/rules/base/           base ruleset: config, build, turn, trade, cards, hooks
  test/                     vitest: board, rules scenarios, engine (purity, replay, redaction)
  fuzz/randomGame.ts        random-game fuzzer with invariants
packages/client/            React + Vite hot-seat dev client (SVG board, legal-action buttons, log)
packages/server/            placeholder for the authoritative WebSocket server (views only)
docs/                       RULES.md, RULES_DECISIONS.md, BOARD.md, API.md, PLAN.md
team/ scripts/ tools/       agent-team workflow (see CLAUDE.md)
```

## Debugging a game
Every state carries `init` (incl. seed) and an append-only `log` of actions:
`replay(state.init, state.log.map(l => l.action))` rebuilds it exactly. The dev client can export and
load such logs.

## Team workflow
Claude Code is the tech lead and opencode agents are the team (roles in `team/ROLES.md`, rules in
`CLAUDE.md`, live dashboard via the agent hub at http://127.0.0.1:8765).
