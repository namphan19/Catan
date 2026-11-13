# Hexgame - Tech Lead Plan

Owner (PO): the user. Tech lead: Claude. Workers: opencode agents per role in `team/ROLES.md`.

## 1. Goal
A web-based multiplayer implementation of an **original** hex-tile settlement/trading game (our own name,
theme, rules text and art; not a copy of any commercial game) for 3-6 players, private use with friends.
Later: an original "advanced" expansion ruleset that plugs into the same engine without rewrites.

## 2. Scope
| Milestone | Deliverable | Status |
|---|---|---|
| M1 | pnpm monorepo; pure engine with base rules incl. 5-6 player extra build phase; tests; fuzzer; hot-seat dev client; docs | done (see section 7) |
| M2 | authoritative WebSocket server (rooms, reconnect, redacted views only) | todo |
| M3 | advanced expansion ruleset as a separate module (hooks only) | todo, needs PO rules |
| M4 | bots, real UI and art (theme from PO) | todo |

Out of scope for M1: expansion rules, networking/rooms, bots, polished UI, deployment.

## 3. Architecture
```
packages/engine   pure rules (types, rng, board, ruleset pipeline, rules/base, view, fuzz, tests)
packages/server   authoritative server (M2; placeholder now)
packages/client   React + Vite + SVG (hot-seat dev client now)
```
Contract-first: `docs/API.md` (engine API + hooks), `docs/BOARD.md` (coordinates), `docs/RULES.md`.

## 4. Team and ownership (one owner per directory)
| Role | Owns |
|---|---|
| lead (Claude) | docs/, packages/engine (architecture, final edits), reviews |
| game-engine | packages/engine/src/rules/<new ruleset>/ when delegated |
| frontend | packages/client/ |
| backend | packages/server/ (M2) |
| bot-ai | packages/bots/ (M4) |
| artist | packages/client/public/assets/ (M4) |
| qa | packages/engine/test/qa/, docs/qa/ |
| reviewer | read-only |

## 5. Quality gate for "done"
`pnpm test` and `pnpm typecheck` green; fuzzer 50 games without invariant failure; every rule in
RULES.md covered by a test; reviewer findings resolved or logged.

## 6. Risks
- Rules ambiguity -> log in RULES_DECISIONS.md, PO confirms.
- Engine speed (~3 ms/action due to JSON cloning + full legal-action scans) -> fine for play, optimise for bots in M4.
- Hidden-info leaks -> server sends only getPlayerView / getEventsView; redaction tests.
- Agent infrastructure: crashes, hangs and long jobs -> `tools/autoheal.py` and the job runner.

## 7. Status and as-built notes
Status (2026-11-13): M1 built. 58 engine tests green, fuzzer OK, client builds. Reviewer pass running.
As built: names are neutral placeholders (timber/clay/fiber/grain/stone, guard/freeRoads/harvest/claim/relic,
blocker, longestRoute/largestForce) until the PO picks a theme.
