# Rules decisions log

Every interpretation the tech lead made while implementing `docs/RULES.md`. Status: **open** = needs PO
confirmation (the engine implements the stated default until then), **PO** = confirmed by the PO.
Change a decision by editing the config/hook and the test that pins it.

| ID | Topic | Decision (implemented) | Test | Status |
|---|---|---|---|---|
| D1 | Start player | First player chosen at random with the seeded game RNG (equivalent of the official start roll, base p.5); setup snake starts there. | rules: setup snake order | lead (official) |
| D2 | Second-setup yield with empty bank | Yield is capped by what the bank has (never negative). | rules: second settlement yields | lead (checked vs rulebooks) |
| D3 | Bank shortage on production | If the bank cannot pay every player owed a resource, nobody gets it; a single owed player gets what is left. | rules: bank shortage x2 | lead (checked vs rulebooks) |
| D4 | Steal target list | Only players with a building on the hex **and** at least one card; if nobody qualifies, no steal step. Steal is an explicit choice even with one candidate. | rules: 7 flow | lead (checked vs rulebooks) |
| D5 | Bank trade multiples | Allowed: give k x rate of one resource, receive k cards of any other resources in one action. | rules: bank trades | lead (checked vs rulebooks) |
| D6 | Player trades | Only the active player, only in the main phase (not before rolling, not in the extra build phase). Offers are open to all; responders must hold the requested cards to accept. A new offer replaces the old one; offers expire at end of turn. | rules: player trade | lead (checked vs rulebooks) |
| D7 | Harvest with a low bank | Take min(2, cards in bank) resources; each chosen one must be in the bank. | - | lead (checked vs rulebooks) |
| D8 | Extra build phase actions | 5-6 players default to PAIRED PLAYERS (official 2025, five-six p.3): player 2 = third seat to the left; may build, buy, trade with bank/harbors, play 1 card; no player trades. The old extra build phase remains as option largeTableMode=extraBuild. | rules: extra build | lead (official) |
| D9 | Cards bought in the extra build phase | Cards bought as player 2 are playable when that phase ends (and vice versa), five-six p.3. | rules: extra build | lead (official) |
| D10 | Longest route after a cut | Holder keeps on a tie; if the holder drops below the longest, a unique longest (>= 5) player takes it, a tie means nobody holds it. Recomputed after every road and settlement placement. | rules: longest route x3 | lead (checked vs rulebooks) |
| D11 | When a win is checked | Win checked after every action for the active player; in paired mode player 2 wins immediately during their phase (five-six p.3). Extra-build mode keeps the deferred win. | rules: victory x2 | lead (official) |
| D12 | Guard before the roll | Allowed (one card per turn still applies). After moving the blocker the player still has to roll. | rules: guard pre-roll | lead (checked vs rulebooks) |
| D13 | Discard order | All players who owe cards may discard in any order; the blocker moves after the last discard. | rules: 7 flow | lead (checked vs rulebooks) |
| D14 | Harbor layout | Harbors are placed evenly along the coast (every coast/k-th edge, clockwise); harbor kinds are shuffled. Large board: 6 generic + 5 specific. | board: generation | lead (checked vs rulebooks) |
| D15 | Large board contents | 30 hexes (rows 3-4-5-6-5-4-3): forest 6, claypit 5, meadow 6, field 6, quarry 5, waste 2; tokens add one each of 2..12 (no 7) -> 28; bank 24 per resource; deck 20/3/3/3/5. | board: generation | lead (checked vs rulebooks) |
| D16 | Number placement | Random tokens with no adjacent 6/8 - deliberate house rule (official uses a fixed lettered order, base p.11). | board: hot numbers | lead (house rule) |
| D17 | Supply exhaustion | No settlements left -> cannot place one; building a city returns the settlement to the supply. | rules: building | lead (checked vs rulebooks) |
| D18 | Discard visibility | Discards are public (cards go face up to the bank): the discard action incl. its bag stays in the public log/view. Stolen cards and bought cards stay private. | review-fixes | PO |
| D19 | Harvest with an empty bank | Not playable when the bank has 0 cards (the card is not wasted). | review-fixes | PO |
| D20 | Trade responses | Responders may accept, decline or counter, and change their answer until the offer is confirmed (base p.7). Replaces the earlier one-answer rule. | review-fixes | lead (official, replaces PO D20) |
| D21 | Extension limits (known) | New board shapes need a LayoutId entry; new playable cards are registered via config (playableCards) and new force-type cards via awards.largestForce.cards. | - | lead |
| D22 | Strongholds expansion | Separate ruleset `strongholds`; its interpretations are the S-numbers in docs/RULES_STRONGHOLDS.md (S1/S2: icon-only costs and die faces need a PO check). | strongholds.test.ts | lead |

## Open questions for the PO
1. Theme and names (resources, terrains, cards) - placeholders are used everywhere. Game title: **Boschtan** (PO, 2026-11-13).
2. D1-D21 decided by the lead against the PO rulebooks (docs/research/rules-check.md); PO may override any.
3. Should 2-player games be supported? The engine currently refuses fewer than 3 players.
