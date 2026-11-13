# Rules check: our RULES.md vs the official rulebooks (2025 base, 2025 5-6)

Sources (extracted plain text, git-ignored): `data/raw/rules/base.txt` ("base p.N") and
`data/raw/rules/five-six.txt` ("5-6 p.N"). All wording below is our own summary; no sentences copied.
Term map: wood/timber, brick/clay, wool/fiber, wheat/grain, ore/stone, robber/blocker, knight/guard,
road building/freeRoads, year of plenty+invention/harvest, monopoly/claim, VP card/relic,
longest road/longestRoute, largest army/largestForce, special build/extraBuild.

Extraction caveat: building costs, the harbor counts and the fixed-setup diagrams are icon-based and
were lost in the plain-text extraction, so those numbers are flagged "not covered (extraction)".

## 1. Section-by-section comparison (RULES.md sections 1-9)

| item | our rule (short) | official rule (own words, page) | status | suggestion |
|---|---|---|---|---|
| S1 resources | 5 resources; terrains produce, waste nothing | Five card types; each terrain type yields its resource, desert yields none (base p.6) | same | keep |
| S1 board | 19 hexes standard, 30 large | 19 terrain hexes base (base p.3); 5-6 adds 11 hexes in its box (5-6 p.1) | same | keep |
| S1 number tokens | 18 standard / 28 large, 2-12 no 7 | 18 discs base (base p.3); 28 discs in 5-6, base discs returned to box (5-6 p.1) | same | keep |
| S1 harbors | 9 standard / 11 large, 3:1 + 2:1 | Ports at 3:1 and 2:1 exist (base p.7); counts not stated in extracted text | not covered (extraction) | verify counts against the physical rulebook |
| S1 blocker | one piece, starts on waste hex | One robber, placed on the desert at setup (base p.3, p.5) | same | keep |
| S1 player pieces | 15 roads, 5 settlements, 4 cities per player | 60 roads, 20 settlements, 16 cities in 4 colours, i.e. 15/5/4 each (base p.3) | same | keep |
| S1 bank | 19 per resource; 24 on large | 95 resource cards = 19 each (base p.3); 5-6 adds 25 cards = 5 each, total 24 each (5-6 p.1) | same | keep |
| S1 deck | 25 cards: 14/2/2/2/5; large 34: 20/3/3/3/5 | Base 25 cards: 14 knight, 2 each of monopoly/invention/road building, 5 VP (base p.1, p.3); 5-6 adds 9: 6 knight + 1 each of the other three (5-6 p.1) = 20/3/3/3/5 | same | keep |
| S2 costs | road 1+1, settlement 1+1+1+1, city 2+3, card 1+1+1 | Cost tables are icon panels; the amounts were not captured by the text extraction (base p.3, 5-6 p.1) | not covered (extraction) | check our numbers against the printed cost table |
| S3 placement | settlements/cities on vertices, roads on edges | Settlements sit on intersections, roads on hex edges (base p.8) | same | keep |
| S3 distance rule | empty vertex with all neighbouring vertices empty | Stay at least two edges away from every building (base p.8) | same | keep |
| S3 road connection | must touch own building, or own road at a vertex without an enemy building | New road connects to an own road or building; may not start on the far side of an enemy building (base p.8) | same | keep |
| S3 settlement needs road | must touch one own road (outside setup) | New settlement must connect to an own road (base p.8) | same | keep |
| S4 snake order | p1..pN then reverse; 2nd settlement yields 1 per adjacent hex | Round 1 clockwise from the first player, round 2 from the last player backwards; the second settlement yields 1 card per adjacent hex (base p.12) | same | keep |
| S4 first player | seat order, p1 starts (D1) | Highest dice roll chooses the first player (base p.5, p.12) | differs | adopt a start roll or log as deliberate house rule |
| S5 guard pre-roll | may play one guard before rolling | One development card may be played before the roll (base p.3, p.6) | same | keep (D12) |
| S5 production | settlement 1, city 2 per producing hex | 1 card per settlement on the hex, 2 per city; several of own settlements each pay (base p.6) | same | keep |
| S5 rolled 7 | >7 cards: discard half, rounded down | Players above 7 cards return half, rounded down (base p.6) | same | keep |
| S5 blocker move | move to a different hex, steal 1 random card from a player there | Robber moves to a new hex and steals 1 random card from a player with a building there; robber blocks production (base p.6) | same | keep |
| S5 main phase | build, buy, trade, play one card in any order | Action phase allows trade, build and card play in any order (base p.3, p.7) | same | keep |
| S5 extra build | build window for every other player after the turn | Replaced in 2025 by paired players: only one player (player 2) acts, with different powers (5-6 p.3) | differs | rework section 8 to paired players (see below) |
| S6 bank trade | 4:1, 3:1 with generic harbor, 2:1 specific | Same three rates; a port counts with a building on it (base p.7) | same | keep |
| S6 trade multiples | several cards at once, e.g. 8 -> 2 (D5) | Official text shows only single 4/3/2-card trades; multiples unmentioned | not covered | keep our allowance, log as deliberate |
| S6 player trade | active player only, in main phase | Other players may trade only with the active player, never with each other (base p.7) | same | keep (D6 core) |
| S6 negotiation | one offer; accept/decline once (D6, D20) | Players may accept, make counteroffers or make own proposals (base p.7) | differs | consider counteroffers in M2; keep strict mode as an option |
| S7 card timing | no play on purchase turn; one per turn | Same two limits (base p.3, p.9) | same | keep |
| S7 relic | 1 VP, hidden, never played | VP cards stay hidden; you may reveal/play any number, even bought that turn, exactly to reach the win (base p.3, p.9) | differs | cosmetic only; keep, note equivalence |
| S7 guard | move blocker + steal, no discards, counts for award | Knight activates the robber (move + steal) and counts toward largest army (base p.6, p.9); discards unmentioned | not covered | keep our explicit no-discard rule |
| S7 freeRoads | 2 free roads, fewer if out of pieces/spots | Road building builds 2 roads at no cost (base p.1, p.9); edge cases unmentioned | not covered | keep our clarification |
| S7 harvest | take 2 resources of choice, capped by bank (D7, D19) | Invention takes any 2 resource cards from the supply (base p.1, p.9); low-bank case unmentioned | not covered | keep our cap rules |
| S7 claim | name a resource, everyone gives all of it | Monopoly: name one type, all players hand over all cards of it (base p.1, p.9) | same | keep |
| S7 dev cards vs hand | our text does not say whether cards count for the 7-limit | Development cards never count toward the hand limit and cannot be stolen (base p.9) | differs | state explicitly in RULES.md that only resource cards count |
| S8 extra build | window per player after each turn | See "5-6 players" below: paired players replace it (5-6 p.3) | differs | rework |
| S9 longestRoute | 5 roads, 2 VP; strictly longer to take; cut -> supply until one unique longest >=5 | First to 5 continuous roads gets the 2 VP tile; only a player with more roads takes it; a broken route sends the tile to the supply until one player alone has the longest route of 5+ (base p.8) | same | keep (D10 matches) |
| S9 largestForce | 3 guards, 2 VP; strictly more to take | First to play 3 knights gets the tile; a player with more knights takes it at once; 2 VPs (base p.3, p.9) | same | keep |
| S9 victory points | settlement 1, city 2, relic 1, awards 2 | Settlement 1, city 2, VP card 1, each bonus tile 2 (base p.3, p.8) | same | keep |
| S9 win | 10 VP on your own turn, checked after each action | 10 or more VPs at any moment of your turn ends the game at once (base p.10) | same | keep |

## 2. Decisions D1-D21

| item | our rule (short) | official rule (own words, page) | status | suggestion |
|---|---|---|---|---|
| D1 start player | seat order, no start roll | Highest of one dice roll each starts (base p.5, p.12) | differs | add optional start roll or keep as house rule |
| D2 setup yield vs empty bank | capped by bank stock | Yield rule assumes the supply can pay (base p.12); shortage unmentioned | not covered | keep cap |
| D3 bank shortage | nobody paid; lone claimant gets the rest | If the supply cannot pay everyone, nobody gets that resource; a single affected player gets what remains (base p.6) | same | keep |
| D4 steal targets | only players on the hex holding cards; explicit choice | Rob a player with a building on the new hex; with several, you pick one (base p.6); empty-handed targets unmentioned | not covered | keep our restriction |
| D5 trade multiples | k x rate for k cards in one action | Unmentioned; examples show single trades (base p.7) | not covered | keep |
| D6 player trade scope | active player, main phase, no gifts | Active-player-only trading; giving cards away or trading equal types is banned (base p.7) | same (core) | keep; note counteroffer gap (D20) |
| D7 harvest vs bank | min(2, bank stock) | Unmentioned (base p.9) | not covered | keep |
| D8 build window actions | build + buy card only, no trade/card play | Player 2 may do everything except trade with players; supply trade and card play allowed (5-6 p.3) | differs | match paired-player rights |
| D9 cards from window | playable after the window ends | Cards built while player 2 can be played when you are player 1 again (5-6 p.3); the "vice versa" note is ambiguous about same-turn play | same (intent) | clarify the vice-versa reading before M2 |
| D10 longest route ties | holder keeps ties; cut + tie -> nobody holds | Tile only changes on strictly more roads; a cut route sends it to the supply until one player is uniquely longest with 5+ (base p.8) | same | keep |
| D11 win timing | no wins in others' windows; deferred to own turn | Player 2 wins immediately on reaching 10 VP inside the paired turn (5-6 p.3) | differs | allow instant player-2 wins |
| D12 guard before roll | allowed, roll still happens | Card play before the roll is allowed; the roll follows (base p.3, p.6) | same | keep |
| D13 discard order | free order; blocker after last discard | Rules list discard before robber activation but set no order among players (base p.6) | not covered | keep |
| D14 harbor layout | evenly spaced along coast, kinds shuffled; large 6 generic + 5 specific | Harbors are fixed to the (shufflable) sea frame (base p.11, 5-6 p.4); counts and split not stated in the extraction | not covered (extraction) | verify the large-board split against the physical game |
| D15 large board contents | 30 hexes 6/5/6/6/5/2; 28 tokens; bank 24; deck 20/3/3/3/5 | 11 added hexes: 2 each of hills, mountains, fields, pastures, forests + 1 desert (5-6 p.1) = totals 6/5/6/6/5/2; 28 discs; +25 resource cards; +9 dev cards (6 knight, 1 each other) -> totals all match; token value split garbled in extraction | same (token split unclear) | keep; confirm token counts from the box list |
| D16 token placement | random, no adjacent 6/8 | Variable setup: discs face down in alphabetical order, placed counterclockwise from any corner, skipping desert(s), then flipped (base p.11, 5-6 p.4); no 6/8 adjacency rule exists | differs | keep as deliberate balance house rule, or switch to official order |
| D17 supply exhaustion | no settlement piece -> cannot build; city frees a settlement | Five settlements max; upgrade one to a city to build again; city replaces the settlement (base p.8) | same | keep |
| D18 discard visibility | discards public, steals private | Discards go back to the supply; steals are taken without looking (base p.6); visibility of the log unmentioned | not covered | keep (PO-confirmed) |
| D19 harvest vs empty bank | not playable with 0 in bank | Unmentioned (base p.9) | not covered | keep (PO-confirmed) |
| D20 trade responses | one answer per offer, irrevocable | Counteroffers and own proposals are allowed, so replies are not one-shot (base p.7) | differs | fine for M1; revisit for M2 chat-based trading |
| D21 extension limits | config hooks for boards/cards | n/a (implementation note) | not applicable | keep |

## 3. 5-6 players (2025 edition: paired players, 5-6 p.3)

The 2025 expansion rulebook explicitly replaces the old special building phase with **paired players**
(5-6 p.3). Key points, all from 5-6 p.3 unless noted:

- **Who is player 2.** The highest dice roller becomes player 1 and takes the player-1 marker. The third
  player to their left takes the player-2 marker (5-6 p.2). This holds for both 5 and 6 players.
  The pair is therefore not "next to each other" in general: with 6 players the two are opposite each
  other. After each full paired turn the dice and both markers pass one seat to the left.
- **Turn structure.** One paired turn has three phases: player 1's production phase (card before roll,
  roll, collect or resolve the 7), player 1's action phase, then player 2's action phase. Player 2 gets
  **no production phase** - they never roll and no production happens for their part.
- **What player 2 may do.** Everything player 1 can in an action phase: build, buy development cards,
  play one development card, and trade with the supply (bank and ports). The single restriction:
  player 2 may **not trade with other players**.
- **When a player-2 win counts.** Player 1 wins normally at 10 VPs, and the game ends at once, even
  before player 2 acts. Player 2 reaching 10 VPs during their own action phase also ends the game
  immediately, with player 2 winning. (Our D11 currently defers such wins - that differs.)
- **Card-play rules for player 2.** The bought-this-turn and one-card-per-turn limits still apply. A
  development card built while you are player 2 can be played as normal when you are player 1 again,
  and vice versa (the rulebook's exact scope of "vice versa" is unclear; reading it as "the
  bought-this-turn lock is per turn, not per phase" is consistent, but a card bought in player 1's
  phase should then not be playable in player 2's phase of the same turn).
- **Robber/knight for player 2.** No special rule exists. "All other actions remain the same", so a
  knight played in player 2's phase moves the robber and steals as usual and counts toward largest
  army. Only player 1's roll can trigger the 7 (discards and forced robber), since player 2 has no
  roll.
- **Setup and first player, 5-6.** Fixed setup: insert the four small frame pieces into the base frame,
  lay hexes and discs as shown, shuffle the 25 added resource cards and 9 added dev cards into the base
  decks, then finish setup per base p.4; in a 5-player game one colour stays unused - players randomly
  draw road pieces, the leftover colour is dropped, and that colour's settlements are placed on the
  board without roads (a neutral dummy that the extracted text describes only partially - placement
  order and resources unclear) (5-6 p.2). Variable setup: same frame assembly, random hex placement,
  discs in A-B-C ... ending Za-Zb-Zc alphabetical order placed counterclockwise from any corner
  skipping both deserts, then complete setup per base p.11; first player per dice roll gets the
  player-1 marker, third seat to the left gets the player-2 marker (5-6 p.4).
- **5-6 board contents** (5-6 p.1). 11 terrain hexes: 2 hills (brick), 2 mountains (ore), 2 fields
  (wheat), 2 pastures (wool), 2 forests (wood), 1 desert -> with the base set 30 hexes totalling
  wood 6, brick 5, wool 6, wheat 6, ore 5, desert 2 (matches our D15). 28 number discs (base discs
  returned to the box); the letter run ends in Za-Zb-Zc per the text, which does not square exactly
  with 28 discs - exact distribution unclear (garbled counts, consistent with 2x on the 2 and 12 and
  3x on the rest). 25 added resource cards -> 24 of each in play. 9 added dev cards -> deck of 34:
  20 knight, 3 each monopoly/invention/road building, 5 VP. Harbors: only 2:1/3:1 markers appear in the
  extraction; the number the small frame pieces add is unclear (our large-board 11 harbors, split
  6 generic + 5 specific per D14, needs verification - the physical base game is commonly 4 generic +
  5 specific).
- **Gap for us.** Our engine has no paired players and no dummy player, and our extra-build phase gives
  every other player a window with narrower rights. For 5-6 support we need: one designated player 2
  three seats from the active player, rotating markers, player-2 rights (no player trades, supply
  trade allowed, card play allowed), instant player-2 wins, and optionally the 5-player dummy.

## 4. Setup and first player (base.txt)

- **Fixed setup** (base p.4, p.5): assemble the sea frame by matching the numbered piece ends; lay the
  terrain hexes and number discs exactly as shown in the printed diagram; sort resource cards face up
  by type, shuffle the dev cards face down, set both bonus tiles beside the board; place the robber on
  the desert; in a 3-player game one colour's pieces stay unused. Starting pieces are also pre-drawn in
  the diagram: each player places 2 settlements and 2 roads at the marked spots.
- **Variable setup** (base p.11, p.12): shuffle the frame pieces together; place hexes randomly face
  up; arrange the number discs face down in alphabetical (A-B-C) order and lay them counterclockwise
  starting from any corner, skipping the desert, then flip them face up; robber on the desert; supply
  as above.
- **Starting pieces, variable** (base p.12): round 1 - the first player places 1 settlement on any empty
  intersection respecting the distance rule, then 1 road on an adjacent edge, clockwise around the
  table. Round 2 - starting with the last player and reversing order, each places their second
  settlement and second road the same way (snake order; matches our section 4).
- **Starting resources** (base p.5, p.12): after the second settlement, each player takes 1 matching
  resource card from the supply for each terrain hex touching that settlement, kept hidden.
- **First player** (base p.5, p.12): every player rolls the dice once; the highest roll goes first.
  Ties are unmentioned (unclear). Our D1 (fixed seat order, no roll) differs from this.
