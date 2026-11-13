# Task: fix the reviewer findings in the base engine

Only write in: packages/engine/src/ and packages/engine/test/review-fixes.test.ts (new file).
Do NOT edit other test files (another agent writes packages/engine/test/qa/), docs/, team/, scripts/, tools/.
Read docs/RULES.md, docs/RULES_DECISIONS.md (D18-D21 are new), docs/API.md first; read code by line ranges.
Reuse the helpers in packages/engine/test/helpers.ts (blankGame, act, setHand, pl, graphOf, findPath; the
'testdice' ruleset: state.ext.forceDice = [a,b] forces the next roll).

Fix each item and pin it with a test in test/review-fixes.test.ts (comment the item number in each test):
1. respondTrade (src/rules/base/trade.ts): validate must reject a second response from the same player
   with code ALREADY_RESPONDED (D20). legal() and validate() must agree.
2. Discards are public (D18): keep the log as is, but document it in the getPlayerView docstring
   (src/view.ts) and add a test that p3's view of p1's discard shows the bag (so it is a deliberate choice).
3. Extra build handoff (src/rules/base/turn.ts, endTurn in extraBuild): use setPhase(...) so a 'phase'
   event is emitted for every new window. Test: each pass emits a phase event.
4. Discard enumeration (src/rules/base/helpers.ts subBags): raise the default limit to 5000 and document
   in docs-comment of the discard legal() that the list may be capped and validateAction is the authority.
   Test: 20-card hand with 5 kinds (4 each), discard 10 -> every listed bag validates and the list size
   equals the true number of combinations (compute it independently in the test).
5. Harvest with an empty bank (D19): playCard harvest must be rejected with code BANK_EMPTY when the bank
   has 0 cards; legal() must not list it.
6. Largest force must not hardcode 'guard': add `cards: string[]` to RulesConfig.awards.largestForce
   (src/ruleset/types.ts), set ['guard'] in src/rules/base/config.ts, and count played cards over that list
   in updateLargestForce (src/rules/base/helpers.ts). Also move PLAYABLE (src/rules/base/cards.ts) into
   config as `playableCards: string[]` (D21). Test: a test-only ruleset whose config(prev) adds a second
   force card id counts it for largest force (register it with registerRuleset in the test file).
7. view.ts docstring: state that all hands are revealed once there is a winner.
8. Phase 'ext' variant (src/types.ts): add optional `actors?: PlayerId[]`; actors() in helpers.ts returns
   it when present (else turn.current). Test with a hand-built ext phase.
9. getEventsView (src/view.ts): return cloned events (no shared references). Test: mutating the result
   does not change the input array.

## Acceptance
- cd packages/engine && npx tsc -p tsconfig.json  -> exit 0
- cd packages/engine && npx vitest run  -> all green (existing 58 + new; paste the summary line)
- Do not run the fuzzer (it is long); one quick check is fine: npx tsx fuzz/randomGame.ts 1
- Small increments; final report < 40 lines: files changed, commands + results, anything not done.
