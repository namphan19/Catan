# Boschtan - Tech Lead Plan

Owner (PO): the user. Tech lead: Claude. Workers: opencode agents per role in `team/ROLES.md`.

## 1. Goal
A web-based multiplayer implementation of an **original** hex-tile settlement/trading game (our own name,
theme, rules text and art; not a copy of any commercial game) for 2-6 players, private use with friends.
Later: an original "advanced" expansion ruleset that plugs into the same engine without rewrites.

## 2. Scope
| Milestone | Deliverable | Status |
|---|---|---|
| M1 | pnpm monorepo; pure engine with base rules incl. 5-6 player extra build phase; tests; fuzzer; hot-seat dev client; docs | done (see section 7) |
| M2 | authoritative WebSocket server (rooms, reconnect, redacted views only) - self-hosted by the PO for colleagues | todo (next after rules) |
| M3 | expansion ruleset `strongholds` as a separate module (hooks only): engine, server option, 2D + 3D client UI | built 2026-11-16 (see docs/RULES_STRONGHOLDS.md); 3D pieces added 2026-11-16; open: playtest |
| UI | real web UI + original medieval art (docs/UI.md) | in progress |
| M5 | expansion ruleset `tidelands` (sea maps, cogs, corsair, gold, 9 scenarios incl. 5-6 maps) alone or with strongholds: engine, bots, arena, server option, 2D client UI with placeholder art (docs/RULES_TIDELANDS.md, docs/ART_TIDELANDS.md) | built 2026-11-20; open: PO playtest, final art |
| M6 | expansion ruleset `highlands` (rise and decline of three tribes, goods, overgrown buildings; standalone, 2-4 players): engine, fuzz, bots, server option, agent-mcp, 2D client UI with placeholder art (docs/RULES_HIGHLANDS.md, docs/ART_HIGHLANDS.md) | built 2026-11-25 (H7 per rulebook, highlands bot strategy); art done; open: PO playtest |
| M4 | bots, goal: challenge strong human players. Steps: 1 heuristic bot + server bot seats + self-play arena; 2 fast bot engine (mutable state, checked against the real engine); 3 ISMCTS search on a worker with a time budget; 4 smart trading + weight tuning by self-play; 5 strongholds-aware bot | steps 1-3 built 2026-11-17 |

PO 2026-11-13: web only, no bots, medieval style (own art), online play for colleagues.
PO 2026-11-17: bots are now in scope (M4); the PO wants a bot that really challenges players.

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
| artist | packages/client/public/assets/ |
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
M4 step 1 (2026-11-17): `packages/engine/src/bot/` heuristic bot. `decide(view, legal)` sees only the bot's
own PlayerView (no hidden info); `botAct(state, id)` wraps it with a legality check. Levels easy/normal/hard
differ by noise and trade appetite only (same brain). Self-play: `pnpm --filter @hexgame/engine arena
[games] [lineup] [strongholds]`. Measured (40-60 games, 4 players): hard vs 3 random wins 100%; hard vs 3 easy
52% (fair 25%); hard vs 3 normal 28% (fair 25%); expansion games finish with 0 illegal moves; ~0.4 ms per
decision. Server: host adds bots in the lobby (`addBot`), bots move after `botDelayMs` (700 ms), wait up to
`botTradeWaitMs` (30 s, shown to humans as a countdown; only 3 s when no human could accept) for all answers to their offers, pause while no human is connected, are persisted.
The expansion is only played with generic scores for "sh:*" actions (step 5).
M4 step 2 (2026-11-17): sim mode `packages/engine/src/sim/` - `toSim`/`cloneSim` (hand-written deep copy, no
log), `simApply` (same rule code as applyAction, in place, no copy, no log), `simLegal` (skips player trades),
`simActors`. test/sim.test.ts runs real and sim engines in lockstep (base 2-6 players, strongholds 2/4/5, all
actions incl. trades) and requires identical states and legal lists after every move. Engine speedups that keep
results identical: placeRoad.validate uses roadConnects (was O(edges^2)), legal() returns early when the cost
or phase check must fail, road/settlement spot scans only look near the player's network, getLegalActions
takes an optional `only` list of action types. Measured (`pnpm --filter @hexgame/engine bench 30`, 4 players,
random policy): pure API ~470 ms per game (legal for all players 119 -> ~35 us per move, apply ~450 us of
which ~95% is the JSON copy); sim mode ~16 ms per game (~50k moves/s; legal for the actor ~11 us, apply
~8 us, clone ~27 us). Remaining cost is spread out (route length, VP, expect checks); step 3 adds worker
threads and truncated rollouts instead of more micro-tuning.
M4 step 3 (2026-11-17): level 'expert' = `packages/engine/src/bot/search.ts`, determinized Monte Carlo search
over the heuristic's top 8 moves (+ end turn) with common random numbers: each iteration samples ONE world
from the bot's own view (opponent hands dealt from the exact per-resource total they hold, unplayed cards
shuffled over their card counts and the deck, a fresh dice seed), simulates every candidate on it with the
same dice and a fast rollout policy for 2 rounds, scores win/loss or a softmax of VP + production; the
heuristic's first choice is kept unless another beats it by > 0.01. A plain UCB1 version (each candidate on its
own random world) was tried first and was no better than 'hard' (5/20). The engine never reads a clock
(purity test): callers pass `clock`; without one the search is a fixed 200 iterations and deterministic.
Trades, discards and expansion windows stay with the 'hard' heuristic. Server: `planBot` + `Hub.think` run the
search in 15 ms slices (setImmediate), drop the result if the game moved on, `botThinkMs` default 1500 ms.
Measured (expert vs 3 hard, 4 players, fair share 25%, runs of 64-128 games, 8-12 arena processes sharing 16
cores): 200 ms 26.6% (128 games), 500 ms 35.9%, 1000 ms 43.8%, 2000 ms 50.0%; horizon 4 rounds or margin
0 / 0.02 were not better. Strength grows with thinking time, so next: worker threads (parallel search),
better rollout policy / evaluation, then trading (step 4).
2026-11-17, PO: bot development paused after step 3; bots shipped in the app. Local games: the home screen sets each
seat to Human or a bot level (at least one human); bots run in the browser via `planBot` (expert in 12 ms slices,
1.5 s per searched decision, "... is thinking" in the strip), the view always stays on a human seat, the pass-device
cover only appears between humans. The trade dialog opened for an offer now closes itself when that offer is gone.
e2e: tests/local-bots.spec.ts. The hosted server on :8080 was restarted on this build (no rooms were open).
As built: names are neutral placeholders (timber/clay/fiber/grain/stone, guard/freeRoads/harvest/claim/relic,
blocker, longestRoute/largestForce) until the PO picks a theme.

2026-11-20, M5 Tidelands (sea expansion), branch `claude/stoic-brahmagupta-kw3c3y`: engine module `rules/tidelands/`
(config, maps + map picture parser, scenarios, state, ships, corsair, gold, special, castaways, silk, works,
coves, index) using new generic extension points (docs/API.md last section). Nine scenarios with own maps for
3, 4 and 5-6 players. Tests: 28 tidelands vitest + sim lockstep for 6 scenarios and the strongholds
combination (262 engine tests in total), fuzzer modes `tidelands[:scenario]` and `both[:scenario]`
(`pnpm --filter @hexgame/engine fuzz 12 0 tidelands`), arena modes the same (`... arena 16 hard,random,random,random tidelands`).
Bots: sea-aware heuristic (bot/sea.ts): cog routes to new coasts / rewards / villages, gold picks, corsair,
harbors, wonders, lines to forts. Arena results (0 invalid bot actions in every run): hard vs 3 random 25/27
(92.6%) over all 9 scenarios; hard,normal,easy,hard 62.5/25/12.5%; 5 players hard 55.6% (fair 40%);
6 players hard 83.3% (fair 50%); strongholds + tidelands hard vs 3 random 9/10. Fuzzer: all scenarios and
the combination without invariant failures. Server: room option `tidelands: <scenario>` (+ `expansion`).
Client: scenario picker (home + online), sea maps, cogs, corsair, rewards, villages, wonder sites, forts,
side panel, gold / road-or-cog dialogs; e2e `tests/tidelands.spec.ts` (16 tests desktop + tablet).
2026-11-21: Strongholds + Tidelands aligned with the C&K rulebook's "Combining with Seafarers" page (docs/RULES_TIDELANDS.md
section 6). 268 engine tests; fuzzer `both` 10 games / 70,850 actions without invariant failures; arena `both` hard vs 3 random
15/15, hard,normal,easy,hard,normal 70/10/20% (0 invalid bot actions); e2e tidelands + strongholds 20/20.
