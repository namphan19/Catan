# QA test plan - base rules engine (milestone 1)

Scope: every rule in `docs/RULES.md` and every decision D1-D21 in `docs/RULES_DECISIONS.md`.
Owner: qa. Test roots: `packages/engine/test/qa/` (QA-only, this role), plus the lead-owned suites
`packages/engine/test/rules.test.ts`, `board.test.ts`, `engine.test.ts` (read-only reference here).

Run: `cd packages/engine && npx vitest run` (all suites) or `npx vitest run test/qa` (QA only).
Status legend: **covered** = an assertion pins the rule; **partial** = a related behaviour is tested but
the exact wording is not; **gap** = nothing asserts it (noted at the bottom).

## 1. RULES.md section 1 - components

| Rule (RULES.md) | Test | Status |
|---|---|---|
| 5 resources timber/clay/fiber/grain/stone | `qa/setup-board.test.ts` - "terrain -> resource mapping and piece/bank numbers match RULES.md 1" | covered |
| Terrains: forest->timber, claypit->clay, meadow->fiber, field->grain, quarry->stone, waste->nothing | same test (exact `terrainResource` table) | covered |
| Board standard 19 hexes / large 30 hexes | `qa/setup-board.test.ts` - "3 players use the standard board..." and "5 players get 30 hexes..." | covered |
| Number tokens 2-12 without 7 (standard 18, large 28) | `qa/setup-board.test.ts` - "standard board contents match RULES.md 1..." and "has the D15 terrain mix, 28 number tokens..." | covered |
| 6/8 never on adjacent hexes | `qa/setup-board.test.ts` - "has the D15 ... no adjacent hot numbers (D16)"; `board.test.ts` - "never puts hot numbers (6, 8) on adjacent hexes (200 seeds, both layouts)" | covered |
| Harbors standard 9, large 11; 3:1 generic, 2:1 specific | `qa/setup-board.test.ts` - "harbors sit on distinct coast edges and use the right ratios (RULES.md 1, D14)"; "5 players get ... 11 harbors..." | covered |
| Blocker starts on a waste hex | `qa/setup-board.test.ts` - "standard board contents match RULES.md 1..."; "has the D15 terrain mix..." | covered |
| Per player 15 roads / 5 settlements / 4 cities | `qa/setup-board.test.ts` - "terrain -> resource mapping and piece/bank numbers..."; "places p1..p3 ... supply after setup"; "places p1..p6 ... supply after setup" | covered |
| Bank 19 each (large 24) | `qa/setup-board.test.ts` - "3 players use the standard board..."; "5 players get ... bank 24..." | covered |
| Deck standard 14/2/2/2/5 (25), large 20/3/3/3/5 (34), shuffled at start | `qa/setup-board.test.ts` - "standard board contents..."; "5 players get ... 34-card deck"; "has the D15 terrain mix..." | covered (determinism of the shuffle is covered by `engine.test.ts` replay tests) |

## 2. RULES.md section 2 - costs

| Rule | Test | Status |
|---|---|---|
| road = 1 timber + 1 clay | `qa/build-pieces.test.ts` - "road/settlement/city/card cost exactly the RULES.md 2 amounts" | covered |
| settlement = 1 timber + 1 clay + 1 fiber + 1 grain | same test | covered |
| city = 2 grain + 3 stone (replaces own settlement) | same test; `qa/build-pieces.test.ts` - "building a city returns the replaced settlement to the supply (D17)" | covered |
| card = 1 fiber + 1 grain + 1 stone | same test; `qa/cards.test.ts` - "costs 1 fiber + 1 grain + 1 stone and DECK_EMPTY is reported" | covered |

## 3. RULES.md section 3 - placement

| Rule | Test | Status |
|---|---|---|
| Settlements/cities on vertices, roads on edges | all placement tests use `v:`/`e:` ids; `qa/build-pieces.test.ts` - "outside setup a settlement must touch one of the owner roads..." | covered |
| Distance rule: adjacent vertices empty | `qa/build-pieces.test.ts` - "...distance rule applies" (`DISTANCE_RULE`); `rules.test.ts` - "roads, settlements and cities cost resources and follow placement rules" | covered |
| Outside setup a settlement must touch one of the owner's roads | `qa/build-pieces.test.ts` - "outside setup a settlement must touch one of the owner roads..." (`NOT_CONNECTED`) | covered |
| Road touches own building, or own road at a vertex with no opponent building | `qa/build-pieces.test.ts` - "a road cannot extend through an opponent building" | covered |

## 4. RULES.md section 4 - setup

| Rule | Test | Status |
|---|---|---|
| Seat order p1..pN then pN..p1 (snake) | `qa/setup-board.test.ts` - "places p1..p3 then p3..p1..." (3p); "places p1..p6 then p6..p1..." (6p); `rules.test.ts` - "places in order p1..p4 then p4..p1..." | covered |
| One settlement + one road touching it per placement | `qa/decisions.test.ts` - "a setup road only has to touch the settlement just placed"; `rules.test.ts` - "rejects out-of-turn moves and setup roads not touching the new settlement" | covered |
| Second settlement yields 1 resource per adjacent producing hex | `qa/setup-board.test.ts` - "the second settlement yields one resource per adjacent producing hex (D2)" (all 6 second settlements); `rules.test.ts` - "second settlement yields one resource per adjacent producing hex" | covered |
| p1 starts turn 1 | `qa/setup-board.test.ts` - both "starts turn 1 with p1" tests | covered |

## 5. RULES.md section 5 - turn

| Rule | Test | Status |
|---|---|---|
| 5.1 one guard card before rolling | `rules.test.ts` - "a guard may be played before rolling; only one card per turn" (D12: still rolls afterwards) | covered |
| 5.2 roll 2 dice; settlement 1 / city 2; blocker hex silent; bank shortage rule | `qa/production-turn.test.ts` - "a settlement takes 1 and a city takes 2..."; "a producing hex with the blocker on it pays nobody"; "bank shortage: several owed players get nothing; a sole owed player gets the remainder (D3)"; `rules.test.ts` - "settlements get 1, cities get 2", "the blocker stops production on its hex", "bank shortage..." x2 | covered |
| 5.3 rolled 7: return half rounded down, choose which | `qa/production-turn.test.ts` - "all legal discards for each debtor have exactly the owed size..."; "discarding from a 20-card hand works..."; "a 7 with nobody over the limit moves the blocker straight away" | covered |
| 5.3 then move blocker and steal one random card (only if a candidate has cards) | `qa/production-turn.test.ts` - "the steal phase is skipped when the only adjacent opponent has no cards (D4)"; "a sole candidate with a card is a steal choice..."; `rules.test.ts` - "players over the limit discard half..." | covered |
| 5.4 main: build, buy, trade, at most one card | `qa/trade.test.ts` (all trade tests); `qa/cards.test.ts`; `qa/build-pieces.test.ts`; `rules.test.ts` - "a bought card cannot be played the same turn..." + "a guard may be played before rolling; only one card per turn" | covered |
| 5.5 end turn; extra build phase with 5-6 players | `qa/extra-build.test.ts` - all four tests | covered |

## 6. RULES.md section 6 - trading

| Rule | Test | Status |
|---|---|---|
| Bank 4:1 | `qa/trade.test.ts` - "8 timber -> 2 cards in one action..."; `rules.test.ts` - "bank trades at 4:1, generic harbor 3:1, specific harbor 2:1" | covered |
| Generic harbor 3:1, specific harbor 2:1, building on one of its vertices | `qa/trade.test.ts` - "a specific 2:1 harbor also allows multiples (4 -> 2)"; `rules.test.ts` - "bank trades at 4:1, generic harbor 3:1, specific harbor 2:1" | covered |
| Several cards at once (8 -> 2) | `qa/trade.test.ts` - "8 timber -> 2 cards in one action..."; "a specific 2:1 harbor also allows multiples" | covered |
| Players: offer bundle for bundle, accept/decline, confirm one acceptor | `qa/trade.test.ts` - "gifts and same-resource bundles are rejected"; "confirm fails when the acceptor..."; `rules.test.ts` - "player trade: offer, responses, confirm with one acceptor" | covered |
| Both sides non-empty, different resources, no gifts | `qa/trade.test.ts` - "gifts and same-resource bundles are rejected (RULES.md 6, D6)" | covered |
| No player-to-player trade off-turn | `qa/trade.test.ts` - "bank and player trades are only allowed in the main phase of the active player (D6, D8)" | covered |

## 7. RULES.md section 7 - cards

| Rule | Test | Status |
|---|---|---|
| Bought cards cannot be played in the turn/build window they were bought | `rules.test.ts` - "a bought card cannot be played the same turn; playable after the turn ends"; `qa/extra-build.test.ts` - "a card bought in a build window is playable on the owner next turn, not in the window (D9)" | covered |
| One card per turn | `rules.test.ts` - "a guard may be played before rolling; only one card per turn" (`ONE_CARD`) | covered |
| guard: move blocker + steal, counts to largest force | `rules.test.ts` - "largest force: first to 3 guards, transfers only on a strictly larger count"; steal flow in `qa/production-turn.test.ts` | covered |
| freeRoads: 2 roads, fewer if out of pieces/spots, not playable without a legal spot | `qa/build-pieces.test.ts` - "places 2 roads for free"; "places only 1 road when the supply has just 1 road left"; "places only 1 road when the second spot is blocked by opponent roads"; "is rejected with NO_ROAD_SPOT when there is no legal spot"; "is rejected with NO_ROAD_SPOT when the road supply is empty" | covered |
| harvest: 2 resources from the bank (fewer if the bank has fewer) | `qa/cards.test.ts` - "takes 1 resource when the bank has only 1 card in total"; "is not playable when the bank is completely empty (D19)"; "rejects a harvest naming a resource the bank lacks (BANK_EMPTY)"; "rejects a wrong number of resources or an unknown resource (BAD_ARGS)" | covered |
| claim: every other player gives all of the named resource | `qa/cards.test.ts` - "is legal when nobody else has the resource and simply takes nothing"; "takes the named resource from every other player, never from the own hand"; "rejects a claim with no resource or an unknown resource" | covered |
| relic: 1 VP, hidden, never played | `qa/cards.test.ts` - "a relic is kept hidden and cannot be played"; `qa/awards-victory.test.ts` - "9 VP + a relic bought during the own turn wins immediately..." (public VP excludes it) | covered |

## 8. RULES.md section 8 - extra build phase (5-6 players)

| Rule | Test | Status |
|---|---|---|
| After end of turn every other player gets one window, seat order starting left of active | `qa/extra-build.test.ts` - "6 players: every player passes through every extra build window in seat order"; `rules.test.ts` - "after each turn every other player gets a build window in seat order" | covered |
| Window allows road/settlement/city/buy card only | `qa/extra-build.test.ts` - "in a build window only build/buy actions are legal; others are rejected (D8)" | covered |
| Then the next player starts their turn | `qa/extra-build.test.ts` - "6 players: every player passes through..." (turn n + 1, next seat); "extra build is off for 3-4 players..." | covered |
| Phase event per window so clients follow the queue | `qa/decisions.test.ts` - "each build-window pass emits a phase event so clients can follow the queue" | covered |

## 9. RULES.md section 9 - awards and victory

| Rule | Test | Status |
|---|---|---|
| Longest route: first continuous route >= 5 roads takes 2 VP | `qa/awards-victory.test.ts` - "the first player with 5 roads takes it and keeps it on a tie"; `rules.test.ts` - "goes to the first player with a route of 5" | covered |
| Route broken only at an opponent building (own city does not cut) | `qa/awards-victory.test.ts` - "an own city in the middle does not cut the route"; "a road through an opponent city is cut, so no award is granted" | covered |
| Another player takes it only with a strictly longer route; cut + tie -> nobody | `qa/awards-victory.test.ts` - "the first player with 5 roads..."; "when the holder is cut and the longest tie is >= 5, nobody holds the award" | covered |
| Largest force: first to 3 guards, strictly more takes it | `rules.test.ts` - "largest force: first to 3 guards, transfers only on a strictly larger count" | covered |
| VP: settlement 1, city 2, relic 1, award 2 | `qa/awards-victory.test.ts` - "awards count 2 VP each towards the 10"; "an own city in the middle..." (settlement+city+award); "9 VP + a relic..." | covered |
| Win at 10 during the own turn, counted after every action; window points only at own turn start | `qa/awards-victory.test.ts` - "9 VP + a relic bought during the own turn wins immediately"; "a player at 10 VP wins as soon as their own turn starts, not before"; "the game rejects further actions after a win"; "3 players also win at 10; target is configurable via vpToWin"; `rules.test.ts` - "reaching the target in another player's build window wins only when the own turn starts" | covered |

## Decisions D1-D21

| ID | Decision | Test | Status |
|---|---|---|---|
| D1 | Seat order p1 first, no start roll | `qa/setup-board.test.ts` - both setup-order tests (3p and 6p) | covered |
| D2 | Second-setup yield capped by the bank, never negative | `qa/setup-board.test.ts` - "the second-setup yield is capped by what the bank holds (D2)"; "the second settlement yields one resource per adjacent producing hex (D2)" | covered |
| D3 | Bank shortage: nobody gets it, a single owed player gets the rest | `qa/production-turn.test.ts` - "bank shortage: several owed players get nothing; a sole owed player gets the remainder (D3)" | covered |
| D4 | Steal candidates = building on hex + cards in hand; explicit choice; no step if none | `qa/production-turn.test.ts` - "the steal phase is skipped when the only adjacent opponent has no cards (D4)"; "a sole candidate with a card is a steal choice; the stolen card is random but conserved (D4)" | covered |
| D5 | Bank trade multiples, k x rate for k cards | `qa/trade.test.ts` - "8 timber -> 2 cards in one action..."; "a specific 2:1 harbor also allows multiples (4 -> 2)" | covered |
| D6 | Player trades: active player, main phase only, responses need the cards, new offer replaces, expire at end of turn | `qa/trade.test.ts` - "confirm fails when the acceptor no longer has the requested cards"; "a new offer replaces the old one (D6)"; "offers are cleared at the end of the turn (D6)"; "the offering player cannot respond to the own offer (D6)"; "bank and player trades are only allowed in the main phase..." | covered |
| D7 | Harvest takes min(2, bank total); each chosen resource must be in the bank | `qa/cards.test.ts` - "takes 1 resource when the bank has only 1 card in total"; "rejects a harvest naming a resource the bank lacks (BANK_EMPTY)" | covered |
| D8 | Extra build: road/settlement/city/buy card; no trades, no cards | `qa/extra-build.test.ts` - "in a build window only build/buy actions are legal; others are rejected (D8)"; `qa/trade.test.ts` - "bank and player trades are only allowed in the main phase of the active player (D6, D8)" | covered |
| D9 | Cards bought in a window become playable when the window ends | `qa/extra-build.test.ts` - "a card bought in a build window is playable on the owner next turn, not in the window (D9)" | covered |
| D10 | Longest route after cuts: holder keeps ties, unique longest >= 5 takes it, tie -> nobody; recomputed after roads/settlements | `qa/awards-victory.test.ts` - all four longest-route tests | covered |
| D11 | Win checked after every action, active player only; window points win at own turn start | `qa/awards-victory.test.ts` - "9 VP + a relic bought during the own turn wins immediately"; "a player at 10 VP wins as soon as their own turn starts, not before"; "3 players also win at 10..." | covered |
| D12 | Guard before rolling; still has to roll | `rules.test.ts` - "a guard may be played before rolling; only one card per turn" (phase returns to `preRoll`, roll then works) | covered |
| D13 | Discard order free; blocker moves after the last discard | `qa/production-turn.test.ts` - "all legal discards for each debtor have exactly the owed size; debtors may act in any order (D13)" | covered |
| D14 | Harbors evenly along the coast, kinds shuffled; large 6 generic + 5 specific | `qa/setup-board.test.ts` - "harbors sit on distinct coast edges and use the right ratios (RULES.md 1, D14)" (distinct coast edges, ratios, and consecutive positions differ by <= 1 edge); "5 players get ... 11 harbors..." (6 generic + 5 specific) | covered |
| D15 | Large board contents: 30 hexes, terrain mix, 28 tokens, bank 24, deck 20/3/3/3/5 | `qa/setup-board.test.ts` - "5 players get 30 hexes, 11 harbors, bank 24 per resource and a 34-card deck"; "has the D15 terrain mix, 28 number tokens..." | covered |
| D16 | Random tokens, redrawn until no adjacent 6/8, deterministic per seed | `qa/setup-board.test.ts` - "has the D15 ... no adjacent hot numbers (D16)"; `board.test.ts` - "never puts hot numbers (6, 8) on adjacent hexes (200 seeds, both layouts)" | covered (determinism per seed in `engine.test.ts` replay) |
| D17 | No settlements left -> cannot place; a city returns the settlement to the supply | `qa/build-pieces.test.ts` - "settlement is refused with NO_PIECES when 5 settlements are on the board"; "city is refused with NO_PIECES when all 4 cities are built"; "building a city returns the replaced settlement to the supply (D17)" | covered |
| D18 | Discards public, stolen/bought cards private | `qa/decisions.test.ts` - "every viewer sees the discarded bag in the log and in the events"; "a stolen resource is hidden from third parties but visible to both traders"; "a bought card is hidden from other players but visible to the buyer" | covered |
| D19 | Harvest not playable with an empty bank | `qa/cards.test.ts` - "is not playable when the bank is completely empty (D19...)" | covered |
| D20 | One response per offer, new offer resets responses | `qa/decisions.test.ts` - "a second response (accept then decline) is rejected with ALREADY_RESPONDED"; "a new offer resets the responses..." | covered |
| D21 | Extension limits in config (`playableCards`, `awards.largestForce.cards`) | `qa/decisions.test.ts` - "playable cards and force cards come from config, not hardcoded lists" | covered |

## Known gaps

1. **RULES.md 5.2 production order** - the rule does not pin the order in which players are paid; the
   bank-shortage tests therefore only assert the outcomes (all-or-one). No test asserts an ordering,
   because none is specified.
2. **Randomness of the steal** - the steal is asserted as conserved and random-drawn, not against a
   specific RNG value (engine tests cover RNG determinism/replay).
3. **API.md "up to 200" discard sample** - the implementation returns up to 5000 combinations
   (see `docs/qa/BUGS.md` BUG-QA-01); the QA test accepts any number and asserts each bag is exact.

Everything else in `docs/RULES.md` and D1-D21 has a direct assertion. Full-game behaviour is covered by
`packages/engine/fuzz/randomGame.ts` (invariants after every action); the 50-game result is recorded in
`docs/qa/FUZZ.md`.
