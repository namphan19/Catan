# Rules - Boschtan: Tidelands (sea expansion)

Our own rules text for the expansion ruleset `tidelands` (code: `packages/engine/src/rules/tidelands/`).
It adds to the base game (`docs/RULES.md`) and can be played together with Strongholds
(`docs/RULES_STRONGHOLDS.md`). Mechanics follow the PO's seafaring rulebooks (2025 edition incl. the 5-6
player booklet, `docs/CN3083*.pdf`, `docs/CN3084*.pdf`); names, wording, maps and art are Boschtan's own.
Interpretations are logged as T-numbers at the end. Numbers and maps live in `rules/tidelands/config.ts`
and `rules/tidelands/scenarios.ts` (map pictures, printable with `pnpm --filter @hexgame/engine exec tsx fuzz/tlMaps.ts`).

## 0. Names
| Term (code id) | Vietnamese | What it is |
|---|---|---|
| Tidelands (`tidelands`) | Vùng Biển Đảo | the expansion |
| cog (`ship`) | Thuyền buồm | a route piece on a sea edge (cost 1 timber + 1 fiber, 15 per player) |
| corsair | Hải tặc | the sea blocker |
| gold mine (`goldmine`) | Mỏ vàng | land hex that pays resources of choice |
| sea (`sea`) | Biển | water hex inside the map |
| mist (`mist`) | Sương mù | an undiscovered hex (Isles of Mist) |
| landfall | Cập bến | bonus VP for the first settlement on a new island |
| weavers' village (`village`), silk | Làng dệt, lụa | Silk of the Isles |
| corsair fleet, fort, landing, warship | Hạm đội hải tặc, pháo đài, bãi đổ bộ, chiến thuyền | Corsair Coves |
| wonders | Kỳ quan | Great Works: Cathedral, Sea Wall, King's Bridge, Obelisk, High Keep (+ Beacon Tower, Scriptorium with 5-6) |

## 1. Scenarios
Chosen at game creation (`createGame({ rulesets: ['base', 'tidelands'], options: { scenario } })`).
| id | Name (vi) | VP | Special rules | With Strongholds |
|---|---|---|---|---|
| `firstLandfall` | Cập Bến Đầu Tiên | 14 | start on the home island; landfall +2 per small island | yes |
| `scatteredIsles` | Quần Đảo Rải Rác | 13 | 4 islands (6 with 5-6); the islands of your starting settlements are home; landfall +2 | yes |
| `islesOfMist` | Đảo Sương Mù | 12 | a road or cog that reaches a mist hex turns it (stack per region); land pays 1 resource (gold: 1 of choice) | yes |
| `beyondTheWastes` | Vượt Hoang Mạc | 14 | a waste strip splits the home island; landfall +2 beyond it and on each isle | yes |
| `castaways` | Những Kẻ Lưu Lạc | 13 | settlements only next to a numbered hex; the blocker only on numbered hexes; rewards on edges (VP, cards, harbors) | no |
| `silk` | Lụa Hải Đảo | 14 | 3 starting settlements; weavers' villages and silk; no longest route; game end by empty villages | no |
| `corsairCoves` | Sào Huyệt Hải Tặc | 10 + fort | lines of cogs, warships, forts, corsair fleet; no blocker; no longest route / largest force | no |
| `greatWorks` | Những Công Trình Vĩ Đại | wonder | claim and build a wonder; landfall +1 | no |
| `uncharted` | Vùng Biển Chưa Biết | 12 | random map; islands of your starting settlements are home; landfall +1 | yes |

With Strongholds the VP target is the scenario's target + 2 (e.g. 16 for First Landfall); all rules of
playing both together are in section 7.

## 2. Board
- A scenario map has land, sea and (Isles of Mist) undiscovered hexes. The area outside the map counts as sea.
- Every game shuffles the terrains and number tokens inside each map region (variable setup) with the
  placement rules: no 6 next to an 8 (except Isles of Mist), no 6/8 on a gold mine, and on the Scattered
  Isles no 2, 3, 11, 12 on forests and meadows.
- Harbors stand on fixed coast edges of the map (kinds shuffled), except in the Castaways (rewards) and
  Uncharted (random coast edges, at least one edge apart).

## 3. Cogs
- A road needs a land edge (land on at least one side); a cog needs a sea edge (sea or the frame on at
  least one side). A coast edge takes a road or a cog, never both.
- A new cog connects to one of your cogs or buildings, never to a road alone. It may not pass an
  opponent's building (or warden), and may not be placed on an edge of the corsair's hex.
- **Routes:** roads and cogs join into one route only at one of your buildings. The longest route counts both.
- **Settlements** may be built at the end of a road or a cog (on land).
- **Setup:** a starting settlement on the coast may take a cog instead of its road.
- **Free roads** (card or Strongholds' pavers) place roads or cogs in any mix.
- **Moving:** once per action phase you may move one cog that (a) was not built in this action phase,
  (b) has an open end (none of your cogs or buildings at that end), (c) is not on an edge of the corsair's hex.
  Place it on another legal cog edge (not next to the corsair). A cog between two of your buildings is
  never open, also when an opponent builds in between.

## 4. Corsair and gold
- When you must move the blocker (a rolled 7, a guard card), you may move the
  **corsair** to another sea hex instead and rob one player with a cog on that hex.
- **Gold mines** produce on their number: 1 resource of your choice per settlement, 2 per city. Everybody
  owed something picks in a short window before the turn goes on (limited by the bank).

## 5. Scenario details
- **Landfall:** your first settlement on a region that is not one of your home regions scores the
  bonus once per region (fixed home island, or the regions of your starting settlements).
- **Isles of Mist:** a road or cog whose end touches a mist hex turns it from that region's face-down
  stack; a land hex also takes the top number token of the number stack. You take 1 resource of its type
  (gold: 1 of choice); sea and waste give nothing.
- **Castaways:** the 18 (24 with 5-6) reward edges hold VP tokens, face-down cards (taken from the top of
  the deck at setup) and harbors. The first cog built or moved onto such an edge takes it: a VP token is
  1 VP, a card is held like a card bought this turn, a harbor must be placed at once next to one of your
  coastal buildings at least one edge away from every harbor (if no spot exists you keep it and place it
  later with "Place harbor").
- **Silk of the Isles:** settlements may not stand on the weavers' islets. A road or cog on a side of a
  village opens trade: take 1 silk at once and 1 whenever its number is rolled (from the village while it
  has silk, then from the general supply of 10; an empty village produces nothing). Two silk = 1 VP.
  Cogs docked at a village never move. The corsair may only be moved by a player who trades with a
  village; then it may take silk instead of a resource. The game ends at the end of a turn on which 5
  villages are empty (8 of 12 with 5-6 players): most VP wins, then most silk.
- **Great Works:** with the requirement met (2 cities; a city and 6 VP; a harbor city and a route of 5;
  a building at a wall / bridge / beacon mark) you may claim one wonder. Each of its 4 levels costs the
  same resources: Cathedral and Scriptorium 1 clay 1 timber 3 fiber; Sea Wall 3 clay 1 timber 1 grain;
  King's Bridge and Beacon Tower 3 timber 1 fiber 1 grain; Obelisk 3 grain 2 stone; High Keep 1 clay
  1 grain 3 stone. You win on your turn by finishing your wonder, or with 10 VP while your wonder is
  higher than every other. Starting settlements may not use a marked intersection.
- **Corsair Coves:** every player starts with a settlement and a cog on the home island and places two
  starting settlements with roads. Cogs form one line that grows only at its end, each cog one step closer
  by sea to your landing, then to your fort; no other cogs, no moving. Once the line touches your landing
  you may settle there. A guard card (with 4+ players also a relic card) turns the first plain cog of
  the line into a warship. At the end of an action phase in which your line reaches your fort you
  attack: a die against your warships; more warships = one lair token off (3 to take the fort, which
  becomes your settlement), fewer = the 2 cogs closest to the fort sink, equal = 1 sinks. After each roll
  the corsair fleet sails the lower die along its loop and attacks every player with a building next to
  its hex: fleet stronger = lose 1 random card + 1 per city; player stronger = 1 resource of choice. On a 7
  the roller robs any player (no blocker). You win with your fort taken and 10 VP.
- **Uncharted Waters:** terrains and sea are shuffled over the frame; islands are found automatically.

## 6. Playing together with Strongholds
Source: the PO's Cities & Knights rulebook (2025, `docs/CN3087*.pdf`, page 12, "Combining with Seafarers"),
mapped to our names; points it does not cover are lead decisions (marked *).
- **Scenarios:** First Landfall, Scattered Isles, Isles of Mist, Beyond the Wastes, Uncharted. The rulebook
  recommends maps without exploration or many small islands (First Landfall, Beyond the Wastes); the other
  three are playable but the raids hit harder (the scenario picker says so). Castaways, Silk, Corsair Coves
  and Great Works are not combined* (their own card, VP and win rules collide with the strongholds systems).
- **VP target:** scenario target + 2.
- **Corsair:** it waits off the board until the first raid (like the blocker), then enters on its scenario
  hex. Until then it blocks nothing.
- **Route pieces:** strongholds rules about roads apply to cogs: a warden is recruited on an intersection
  touching your road or cog, moves along your roads and cogs and may end where only sea hexes meet; plot
  and turncoat treat cogs like roads; pavers place roads and/or cogs.
- **Moving a cog:** a warden must stay connected to one of your roads or cogs; a move that would cut it off
  is not allowed.
- **Chasing:** a warden on a corner of the corsair's hex may chase the corsair away exactly as one next to
  the blocker chases the blocker. The piece that was chased is the one that moves (and robs).
- **Toll** moves only the blocker, never the corsair.
- **Envoy** may remove an open road or an open cog; if it was yours, the free rebuild is a road for a road
  and a cog for a cog.
- **Gold mines** pay resources only (a city 2), never commodities, and count as production for the learning
  perk*. The **caravan** may not stand on a gold mine (nor at sea).
- **Raids** hit all islands at once: all cities and active wardens on the board count.

## 7. Five and six players
Paired players as in the base game (player 2 may build, move one cog, play a card, trade with the bank).
Each scenario has its own 5-6 map with the 5-6 component counts.

## 8. Decisions (T-numbers)
| ID | Topic | Decision | Status |
|---|---|---|---|
| T1 | Names | All names are our own (table in section 0); scenario names differ from the rulebook. | PO request |
| T2 | Maps | Maps are our own drawings using the rulebook's hex / token / harbor counts per table size; one 3-4 map where the rulebook has one. The frame sizes differ from the printed frames. | lead |
| T3 | Setup | Variable setup in every game (regions keep their pools); the printed "fixed setup" is not reproduced. | lead |
| T4 | Frame | The area outside the map is sea: cogs may lie on border edges. | lead |
| T5 | Gold at setup | The last-round starting settlement takes 1 resource of choice per adjacent gold mine. | lead |
| T6 | Discovered gold | A mist hex turned into a gold mine pays 1 resource of choice. | lead |
| T7 | Corsair with Strongholds | Off the board until the first raid, then on its scenario hex; wardens next to it chase it; the chased piece is the one that moves; toll never moves it. | C&K rulebook p.12 |
| T8 | Strongholds combination | Section 6: VP +2, roads rules cover cogs, wardens may stand at sea, cog moves keep wardens connected, envoy rebuilds the same kind, gold pays resources only, no caravan on gold. Lead decisions inside it: only the five basic scenarios are combined; gold counts for the learning perk. | C&K rulebook p.12 + lead (PO gave full authority 2026-11-21) |
| T9 | Castaways rewards | The kinds of rewards are shuffled over the reward edges; a harbor that cannot be placed waits in hand. | lead |
| T10 | Silk map | 8 (12) one-number village hexes on 2-hex islets; the gold mines of the printed list are left out so the token counts match (20 / 26 numbered hexes + deserts). End at 5 of 8 / 8 of 12 empty villages; after VP and silk, seat order breaks ties. | lead, PO to confirm |
| T11 | Corsair Coves | Our own geometry (seats, landings, forts, loop); 3 players play without relic cards, 4-6 use relics as guards; the fleet's hex blocks cogs; the bonus resource from beating the fleet is picked with the gold window. | lead, PO to confirm |
| T12 | Great Works | Wonder costs read from the printed tiles (section 5); 10 VP alone never wins. | verified on the tiles |
| T13 | Uncharted shape | At least 3 islands, none above 2/3 of the land, no lone hex; land-heavy 5-6 frames relax to 2 islands and 85%. | lead |
| T14 | Bots | The 'expert' level plays expansion games with the 'hard' heuristic (no search), as with Strongholds. | lead |
