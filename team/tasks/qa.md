# Task: QA for the base rules engine (milestone 1)

Only write in: packages/engine/test/qa/ and docs/qa/ (create them). Do NOT edit packages/engine/src,
other test files, docs/RULES*.md, team/, scripts/, tools/. You report defects; you do not fix engine code.

Read first (by line ranges, grep before reading): docs/RULES.md, docs/RULES_DECISIONS.md, docs/API.md,
packages/engine/test/helpers.ts (reuse newGame, blankGame, act, setHand, pl, findPath, graphOf,
totalResources and the 'testdice' ruleset: set state.ext.forceDice = [a, b] to force a roll),
then skim packages/engine/test/rules.test.ts to see what is already covered.

## Deliverables
1. docs/qa/TEST_PLAN.md: a table mapping every numbered section/bullet of docs/RULES.md and every
   decision D1..D17 to the test(s) that cover it (file + test name), marking gaps.
2. packages/engine/test/qa/*.test.ts (vitest) closing the gaps. At least these scenarios:
   - 3-player and 6-player setup order and supply counts after setup
   - large board (5-6 players): harbors 11, bank 24 per resource, deck 34 cards
   - freeRoads with only 1 road left in supply; freeRoads rejected when no legal spot
   - harvest when the bank has fewer than 2 cards total; harvest of a resource the bank lacks
   - claim when nobody has the resource
   - steal phase skipped when the only adjacent opponent has no cards
   - discard legal actions all have the exact owed size; discard with many cards (20) still works
   - city: NO_PIECES when 4 cities are built; settlement NO_PIECES when 5 are on the board
   - bank trade multiples (8 timber -> 2 cards) and BANK_EMPTY
   - trade: confirm fails if the acceptor no longer has the cards; offer replaced by a new offer;
     offers cleared at end of turn; respondTrade by the offering player rejected
   - longest route: own city in the middle does not cut; road through an opponent city is cut
   - win: a player with 9 VP + relic bought on their turn wins immediately (hidden VP counts)
   - a 6-player game: every player passes through every extra build window in seat order
   Each test must state in a comment which RULES.md section / decision it checks.
3. Full fuzz run (takes ~6 minutes, so do NOT run it yourself): submit it to the job runner:
   bash scripts/job-submit.sh --name fuzz50 --role qa --task-file team/tasks/qa.md -- "cd packages/engine && npx tsx fuzz/randomGame.ts 50 0"
   then finish your report with "JOB SUBMITTED <id>". When you are restarted with the job result,
   put the summary line (games, actions, OK or the failure) into docs/qa/FUZZ.md.
4. Any defect you find: docs/qa/BUGS.md with exact repro (seed or state setup + action list, expected vs
   actual, which RULES.md section). A failing test for a real bug is fine: mark it with it.fails(...) and
   reference the bug id, so the suite stays green.

## Acceptance
- cd packages/engine && npx vitest run  -> all green (paste the summary line).
- Write files in small increments. Final report < 40 lines: files, commands + results, bugs found.
