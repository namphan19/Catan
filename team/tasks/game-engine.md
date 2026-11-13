# Task: align the engine with the official rulebooks (decisions by the lead)

Only write in: packages/engine/src/ and packages/engine/test/official-rules.test.ts (new). You may update
existing tests ONLY where they pin the old behaviour listed below (say which ones in the report).
Read: docs/research/rules-check.md (comparison), docs/RULES.md, docs/RULES_DECISIONS.md, docs/API.md.
Rulebook text (git-ignored, read by line ranges): data/raw/rules/base.txt, data/raw/rules/five-six.txt
(paired players: five-six.txt lines ~700-770).

1. First player (D1): chosen at createGame with the game RNG (uniform over seats, deterministic per seed).
   Store it as state.init... no - store as state.turn.current at setup start and keep seat order; setup
   snake order starts at that player (first, second, ..., last, last, ..., first) and turn 1 starts with
   that player. Add `firstPlayer?: PlayerId` to CreateGameOptions to force it (tests use 'p1').
   Update test helpers? NO - do not edit test/helpers.ts; instead make tests that need p1 pass
   firstPlayer: 'p1' through createGame options (newGame already forwards extra options).
2. 5-6 players: new option `largeTableMode: 'paired' | 'extraBuild'` (GameInit + CreateGameOptions),
   default 'paired' when playerCount >= 5. extraBuild stays exactly as today when selected.
   Paired rules (official 2025): player 2 = the third seat to the left of the active player (seat index
   +3 mod n). After player 1 ends the turn (and did not win), phase { k: 'paired', player } starts:
   player 2 may build (road/settlement/city), buy cards, trade with the bank/harbors (NOT with players),
   play at most 1 card (not one bought in this same paired phase; guard -> moveBlocker/steal then resume
   to the paired phase). Player 2 wins immediately on reaching the VP target during this phase.
   Player 2 ends with endTurn; then the next seat becomes player 1 (preRoll).
   Cards bought as player 2 become playable when that phase ends (and vice versa).
   Implement via the existing hooks (phaseAfterTurn, checkWinner) and phase/resume types; extend the
   Resume type for the paired phase. One card per phase: track it per phase, not per whole turn.
3. Player trades (base rulebook: accept, counteroffer or own proposal; replaces D20):
   respondTrade gets `response: 'accept' | 'decline' | 'counter'` plus `give`/`get` bags for a counter
   (counter = what the responder gives / gets). Keep `accept: boolean` working as a shorthand.
   A responder may change their response until the offer is confirmed or cancelled.
   confirmTrade{with} executes the responder's counter terms if they countered, else the original offer;
   re-validate both hands. ALREADY_RESPONDED is removed.
4. Add tests for all of the above in test/official-rules.test.ts (cite the rulebook page in a comment,
   e.g. "five-six p.3"); keep every other test green. Update the review-fixes test for D20 accordingly.
5. Quick fuzz check only: npx tsx fuzz/randomGame.ts 4 0 (must print OK). The fuzzer must keep working
   for 5-6 players in paired mode (it picks actions from getLegalActions, so it should).

Acceptance: npx tsc -p tsconfig.json exit 0; npx vitest run all green (paste summary); fuzz 4 games OK.
Small increments. Final report < 40 lines: files, changed tests, results, open questions.
