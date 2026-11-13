# Rules decisions log

Every interpretation the tech lead made while implementing `docs/RULES.md`. Status: **open** = needs PO
confirmation (the engine implements the stated default until then), **PO** = confirmed by the PO.
Change a decision by editing the config/hook and the test that pins it.

| ID | Topic | Decision (implemented) | Test | Status |
|---|---|---|---|---|
| D1 | Start player | Seat order as given (p1 first); no start roll. The host can shuffle seats before creating the game. | rules: setup snake order | open |
| D2 | Second-setup yield with empty bank | Yield is capped by what the bank has (never negative). | rules: second settlement yields | open |
| D3 | Bank shortage on production | If the bank cannot pay every player owed a resource, nobody gets it; a single owed player gets what is left. | rules: bank shortage x2 | open |
| D4 | Steal target list | Only players with a building on the hex **and** at least one card; if nobody qualifies, no steal step. Steal is an explicit choice even with one candidate. | rules: 7 flow | open |
| D5 | Bank trade multiples | Allowed: give k x rate of one resource, receive k cards of any other resources in one action. | rules: bank trades | open |
| D6 | Player trades | Only the active player, only in the main phase (not before rolling, not in the extra build phase). Offers are open to all; responders must hold the requested cards to accept. A new offer replaces the old one; offers expire at end of turn. | rules: player trade | open |
| D7 | Harvest with a low bank | Take min(2, cards in bank) resources; each chosen one must be in the bank. | - | open |
| D8 | Extra build phase actions | Allowed: road, settlement, city, buy card. Not allowed: trades (bank or player), playing cards. | rules: extra build | open |
| D9 | Cards bought in the extra build phase | Become playable when that player's window ends (so they can be used on their next own turn). | rules: extra build | open |
| D10 | Longest route after a cut | Holder keeps on a tie; if the holder drops below the longest, a unique longest (>= 5) player takes it, a tie means nobody holds it. Recomputed after every road and settlement placement. | rules: longest route x3 | open |
| D11 | When a win is checked | After every action, only for the active player of the turn; not in setup or extra build windows. A player who reached 10 during another player's window wins as soon as their own turn starts (before rolling). | rules: victory x2 | open |
| D12 | Guard before the roll | Allowed (one card per turn still applies). After moving the blocker the player still has to roll. | rules: guard pre-roll | open |
| D13 | Discard order | All players who owe cards may discard in any order; the blocker moves after the last discard. | rules: 7 flow | open |
| D14 | Harbor layout | Harbors are placed evenly along the coast (every coast/k-th edge, clockwise); harbor kinds are shuffled. Large board: 6 generic + 5 specific. | board: generation | open |
| D15 | Large board contents | 30 hexes (rows 3-4-5-6-5-4-3): forest 6, claypit 5, meadow 6, field 6, quarry 5, waste 2; tokens add one each of 2..12 (no 7) -> 28; bank 24 per resource; deck 20/3/3/3/5. | board: generation | open |
| D16 | Number placement | Random tokens, reshuffled until no 6/8 are adjacent (deterministic per seed). No fixed spiral order. | board: hot numbers | open |
| D17 | Supply exhaustion | No settlements left -> cannot place one; building a city returns the settlement to the supply. | rules: building | open |
| D18 | Discard visibility | Discards are public (cards go face up to the bank): the discard action incl. its bag stays in the public log/view. Stolen cards and bought cards stay private. | review-fixes | PO |
| D19 | Harvest with an empty bank | Not playable when the bank has 0 cards (the card is not wasted). | review-fixes | PO |
| D20 | Trade responses | Each player responds once per offer; the answer cannot be changed (a new offer resets responses). | review-fixes | PO |
| D21 | Extension limits (known) | New board shapes need a LayoutId entry; new playable cards are registered via config (playableCards) and new force-type cards via awards.largestForce.cards. | - | lead |

## Open questions for the PO
1. Theme and names (resources, terrains, cards) - placeholders are used everywhere. Game title: **Boschtan** (PO, 2026-11-13).
2. Confirm D1-D17, especially D6 (trading limits), D8/D9 (extra build phase) and D11 (win timing).
3. Should 2-player games be supported? The engine currently refuses fewer than 3 players.
