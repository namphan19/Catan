# Rules - Boschtan: Strongholds (expansion)

Our own rules text for the expansion ruleset `strongholds` (code: `packages/engine/src/rules/strongholds/`).
It adds to the base game (`docs/RULES.md`); everything not mentioned here works as in the base game.
Mechanics follow the PO's expansion rulebooks (2025 edition, incl. the 5-6 player booklet); names, wording
and art are Boschtan's own. Interpretations are logged as S-numbers at the end and in
`docs/RULES_DECISIONS.md`. Numbers live in `rules/strongholds/config.ts`.

## 0. Names
| Term (code id) | Vietnamese | What it is |
|---|---|---|
| commodities: books, linen, silver | Sách, Vải, Bạc | extra hand cards produced by cities |
| improvement tracks: commerce, council, learning | Thương mại, Chính sự, Học thuật | city improvements, 5 levels each |
| warden (rank 1-3) | Vệ binh (cấp 1-3) | unit standing on an intersection |
| raid fleet, raid track | Giặc biển, Đường tiến của giặc | common enemy that attacks every 7 moves |
| rampart | Tường thành | sits under a city, raises the hand limit |
| capital | Kinh đô | marker of the leader on a track, 2 VP |
| caravan | Thương đoàn | trade piece, 2:1 for one hex, 1 VP |
| shield | Huân chương | 1 VP for the best defender of a raid |
| advance cards | Thẻ tiến bộ | three decks of 18 cards |
| blocker | Băng cướp | as in the base game, but enters play late |

## 1. Changes to components and goal
- **Win: 13 VP** on your own turn (with paired players, player 2 of a paired turn also wins at once).
- The base card deck, buying cards and the largest-force award are **not used**. Longest route stays (2 VP).
- **Commodities:** 12 cards each (18 with 5-6 players). They are hand cards like resources: they count
  for the 7-card limit, can be stolen, discarded and traded.
- Per player, in addition: 6 wardens (2 of each rank), 3 ramparts.
- 3 capitals (one per track), 1 caravan, the raid fleet on a track of 7 steps, an event die
  (3 faces fleet, 1 face per track), 54 advance cards.
- The **blocker starts off the board**. It enters (on the waste hex) after the first raid. Until then a
  rolled 7 only causes discards, nothing moves and nothing is stolen.

## 2. Setup
As in the base game, but the **second** starting piece is a **city**. Starting resources: 1 resource per
producing hex next to that city (no commodities).

## 3. Turn
1. *(optional)* play an **omen** card.
2. **Roll** the two production dice and the event die. The first production die is the "red die".
3. **Event die first:**
   - *fleet face:* the fleet moves 1 step. On its 7th step it **raids** (section 7).
   - *track face:* every player whose level on that track is at least 1 and whose level + 1 is at least
     the red die draws the top card of that deck, in turn order starting with the roller
     (level 1 draws on 1-2, level 2 on 1-3, ... level 5 on 1-6).
   Choices caused by the event (pillaged city, deck to draw from, cards to discard) are made before
   production.
4. **Production:** a settlement takes 1 resource. A city takes 1 resource + 1 commodity on forest (books),
   meadow (linen) and quarry (silver), and 2 resources on field and claypit. Bank shortage is handled
   per card type as in the base game.
   On a **7**: every player with more than 7 hand cards (+2 per own rampart) discards half; then the
   blocker moves and steals as in the base game, if it is in play.
5. **Actions**, any number, in any order: trade, build, improve, warden actions, play advance cards.
6. **End turn.** You may hold at most 4 advance cards at this point.

## 4. Trading
- With players: any mix of resources and commodities (only the active player trades, as in the base game).
- With the bank: 4:1 and 3:1 (generic harbor) work for commodities too, in both directions. 2:1 harbors
  only for their resource.
- 2:1 rates from: commerce level 3 (commodities), the caravan (resource of its hex), a fleet card
  (one named type, this turn).

## 5. Building
| Item | Cost | Notes |
|---|---|---|
| rampart | 2 clay | under an own city, 1 per city, 3 per player; +2 hand limit on a 7; lost when the city is pillaged |
| improvement level L | L of the track's commodity | commerce = linen, council = silver, learning = books; needs at least 1 own city; no skipping |
| recruit a warden | 1 fiber + 1 stone | rank 1, inactive, on an empty intersection touching an own road |
| promote a warden | 1 fiber + 1 stone | to the next rank, once per turn per warden; rank 3 needs council level 3 |
| activate a warden | 1 grain | it may not act in the turn it was activated |

The costs above and the per-level commodity amounts were checked against the printed building-cost panels and
improvement boards in the 2025 rulebook (pages 3, 8 and 9); they match. The red-die range per level is 1..L+1
(level 1 draws on 1-2, level 5 on 1-6), as printed on the improvement boards. The raid track takes 7 moves
from its starting space (PO-confirmed on the frame).

- **Level 3 perks:** commerce - trade commodities 2:1; council - promote to rank 3; learning - a player
  who receives nothing in a production (not on a 7) takes 1 resource of their choice.
- **Capitals:** the first player to reach level 4 on a track puts its capital on one of their cities
  (2 VP; a city carries at most one capital). Another player takes it over only by being the first to
  reach level 5; then it is permanent. If you have no city without a capital you may not buy a level that
  would give you one. Capitals cannot be pillaged.
- A pillaged city that could not be replaced by a settlement piece stays on the board "toppled" and
  counts as a settlement; it must be rebuilt (normal city cost) before any other city is built.

## 6. Wardens
- A warden occupies its intersection: nothing can be built there, opponents cannot build roads past it,
  and it cuts opponents' routes for the longest route. The distance rule does not apply to wardens.
- An **active** warden that was not activated this turn may do one of the following and then becomes
  inactive:
  - **move** along own roads to an empty intersection (it may pass own pieces, not other players');
  - **displace** a weaker opponent warden it can reach the same way and take its place. The owner moves
    the displaced warden along their own roads (its status is unchanged) or loses it to the supply;
  - **chase the blocker away** when standing on a corner of the blocker's hex: move the blocker and
    steal as on a 7.

## 7. Raid
When the fleet lands: **raiders** = number of cities on the board (capitals included);
**defenders** = sum of the ranks of all active wardens.
- **Raiders stronger:** the player(s) with the lowest total of active warden ranks lose one city each
  (their choice; reduced to a settlement). Players without a city that can be pillaged are skipped; if
  nobody in the lowest group can be pillaged, the next lowest group is hit.
- **Defenders at least as strong:** the single strongest defender gets a shield (1 VP). If several are
  tied for strongest, nobody gets a shield; each of them draws an advance card from a deck of their choice.
- Afterwards the fleet returns to the start, **all wardens become inactive**, and after the first raid
  the blocker enters play.

## 8. Advance cards
- Hand limit 4. Players other than the roller discard down to 4 as soon as they exceed it; the player
  whose action phase it is has until the end of that phase (play or discard).
- Any number may be played in the action phase, also in the turn they were drawn. Played and discarded
  cards go face down under their deck. A card that has no effect still counts as played.
- VP cards are shown and scored the moment they are drawn; they do not count for the hand limit and
  cannot be taken.

| Deck | Card (count) | Effect |
|---|---|---|
| learning | omen (2) | before rolling: set both production dice; the event die is still rolled |
| | scaffold (2) | one improvement for 1 commodity less |
| | mason (1) | a rampart for free |
| | surveyor (2) | swap two number tokens, not 2, 6, 8 or 12; the blocker stays |
| | irrigate (2) | 2 grain per field hex next to your buildings |
| | prospect (2) | 2 stone per quarry hex next to your buildings |
| | charter (2) | upgrade a settlement to a city for 1 grain + 2 stone |
| | pavers (2) | 2 roads for free |
| | armory (2) | promote 1 or 2 wardens for free |
| | press (1) | 1 VP |
| commerce | bazaar (2) | this turn offer each other player 1 resource; they must answer with a commodity of their choice. Offers go only to players who hold a commodity; the card is playable only if you hold a resource and someone else holds a commodity (S8) |
| | tithe (2) | look at the hand of a player with more VP and take 2 cards |
| | caravan (6) | take the caravan, put it on a hex next to one of your buildings: 2:1 for that hex's resource, 1 VP |
| | fleet (2) | this turn trade one named resource or commodity 2:1 |
| | levy (4) | name a resource: every other player gives you 2 (1 if they have only 1) |
| | corner (2) | name a commodity: every other player gives you 1 |
| council | envoy (2) | remove an open road (one with a loose end); if it was yours you may rebuild 1 road for free |
| | informant (3) | look at another player's advance cards; you may take 1 |
| | rally (2) | activate all your wardens for free |
| | plot (2) | displace an opponent warden standing on one of your roads, without using a warden |
| | toll (2) | move the blocker and steal 1 random card from every player with a building on the new hex (only once the blocker is in play) |
| | turncoat (2) | another player removes one of their wardens; you may place one of yours of at most that rank, with the same status |
| | dowry (2) | every player with more VP gives you 2 cards of their choice |
| | sabotage (2) | every player with at least your VP discards half their hand (rounded down) |
| | codex (1) | 1 VP |

## 9. Victory points
settlement 1, city 2, capital +2, longest route 2, shield 1, VP card 1, caravan 1 (while you control it).
All of them are public.

## 10. Five and six players
Paired players as in the base game: player 2 (third seat to the left) takes an action phase after
player 1 with the same options, except trading with other players. Only player 1 rolls. Player 2 wins
immediately on reaching 13 VP.

## 11. Decisions (S-numbers)
| ID | Topic | Decision | Status |
|---|---|---|---|
| S1 | Costs printed only as icons | Costs, commodity per track, improvement cost = L and red-die range 1..L+1 are verified against the printed boards/panels in the 2025 rulebook (pages 3, 8, 9). The raid track takes 7 moves from the starting space, confirmed by the PO on the frame. | verified |
| S2 | Event die faces | 3 fleet faces and 1 per track, confirmed on the event-die art and the rulebook text (page 6). | verified |
| S3 | Hidden choices | Discarded and stolen advance cards, cards taken by tithe / dowry / informant and the bazaar answer are visible only to the players involved. Sabotage discards are public like 7-discards (D18). | lead |
| S4 | Order of choices | Pending choices are made one after another (turn order), not simultaneously; forced choices (one option) are resolved automatically. | lead |
| S5 | Activated wardens | Wardens activated by rally or placed active by turncoat may not act in the same turn either. | lead |
| S6 | Shields | No cap on the number of shield tokens. | lead |
| S7 | Caravan on a waste hex | Allowed (rulebook: any land hex) but gives no trade rate. | lead |
| S8 | Cards without a target | Cards that need a target (plot, turncoat, envoy, toll before the blocker is in play, bazaar when nobody else holds a commodity ...) cannot be played without one; they can only be discarded when over the hand limit. A bazaar offer to a player without a commodity is rejected (`NO_COMMODITY`), it would only fail (playtest 2026-11-17). | lead |
| S9 | Blocker entry hex | The waste hex the base setup would have used (first one on the large board). | lead |
| S10 | Wins during pending choices | A win is detected when the interrupted phase resumes, not in the middle of a pending choice. | lead |
| S11 | Legacy extra build phase | Not supported with this expansion; 5-6 players use normal turns (default) or paired players. | lead |
| S12 | With the Tidelands sea expansion | Played together as the 2025 rulebook's "combining with Seafarers" section says: see docs/RULES_TIDELANDS.md section 6. | rulebook |
