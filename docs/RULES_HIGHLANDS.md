# Rules - Boschtan: Highlands (expansion)

Our own rules text for the expansion ruleset `highlands` (code: `packages/engine/src/rules/highlands/`).
It changes the base game (`docs/RULES.md`); everything not mentioned here works as in the base game.
Mechanics follow the PO's rise-and-decline standalone rulebook (rules booklet + almanac, kept outside the
repo in `data/raw/inkas/`); names, wording, map drawing and art are Boschtan's own. Interpretations are
logged as H-numbers at the end. Numbers and the map live in `rules/highlands/config.ts`.

Played alone: `createGame({ rulesets: ['base', 'highlands'], options: { map: 'variable' | 'starter' } })`,
2-4 players (the rulebook is for 3-4). It cannot be combined with Strongholds or Tidelands.

## 0. Names
| Term (code id) | Vietnamese | What it is |
|---|---|---|
| Highlands (`highlands`) | Cao Nguyên | the expansion |
| tribe | Bộ tộc | you lead three tribes, one after the other |
| culture point | Điểm văn hóa | 1 per settlement placed, 1 per city built; the score |
| decline, overgrown building (`ruin`, `ruinCity`) | Suy tàn, phế tích | buildings of a tribe that reached its goal |
| founding settlement | Khai lập bộ tộc | free first settlement of a new tribe |
| goods: plume, herb, fish (`plume`, `herb`, `fish`) | Lông vũ, Thảo dược, Cá | hand cards for trading only |
| jungle (`jungle`), herb grove (`grove`), fishing ground (`fishery`) | Rừng rậm, Vườn thảo dược, Ngư trường | the goods hexes |
| sea (`sea`) | Biển | empty water, produces nothing |
| wilds (`wilds`) | Rừng già | the deep jungle beyond the map; the blocker's resting place |
| caravan (longest route power) | Đoàn buôn | 2 cards -> 1 card of another kind, once per turn |
| recall (largest force power) | Triệu hồi | blocker back to the wilds + 1 resource, once per turn |

Resources keep their Boschtan names: timber (forest), clay (claypit), fiber (meadow), grain (field),
stone (quarry). Costs are as in the base game: road timber + clay; settlement timber + clay + fiber + grain;
city 2 grain + 3 stone; card fiber + grain + stone.

## 1. Board
- 29 hexes in five bands from the coast to the jungle (drawn as rows 5-6-7-6-5): a coast band of
  3 fishing grounds and 2 sea hexes; 18 land hexes (forest 4, meadow 4, field 4, claypit 3, quarry 3);
  the jungle band (3 jungles, 3 herb groves, one grove at the end of the 4th band). One more hex below the
  jungle, the **wilds**, holds the blocker at the start.
- 27 number tokens stay on their printed spots. **Starter map** (`map: 'starter'`): the printed land.
  **Variable map** (`map: 'variable'`, default): the 18 land hexes are shuffled; coast, jungle and numbers stay.
- No harbors.
- **Paths**: a road may only go on an edge with a land hex on at least one side (no paths between jungle,
  grove, sea, fishing ground, the wilds or the frame). Settlements only on intersections with a path
  (touching a land hex).

## 2. Goods and trade
- Jungles produce plume, groves herb, fishing grounds fish, like resources (settlement 1, city 2).
- Goods are hand cards: secret, counted for the 7, can be stolen, discarded, claimed and traded with players.
  They are **never** used to build.
- Bank (on your turn, action phase):
  - 3 equal resources -> 1 other resource or good;
  - 2 equal goods -> 1 resource or another good;
  - 1 plume + 1 herb + 1 fish -> 2 resources of choice (`hl:goodsSet`).
- Bank: 20 of each resource, 12 of each good.

## 3. Pieces, building
- Per player: 8 settlements, 2 cities, 7 roads.
- **One city per tribe** (an overgrown city does not count).
- You build only for your active tribe: roads from your active buildings and roads, cities from your
  active settlements.

## 4. Tribes and culture
- Every settlement you place (also starting and founding settlements, and settlements built over a ruin)
  and every city you build gives **1 culture point** to your active tribe. Culture points are never lost.
- **Goal:** tribe 1 and tribe 2 reach their goal at **4** culture points; tribe 3 at **3**: the first
  player whose third tribe reaches 3 points (11 in total) **wins**. Culture points are the VP of this game.
- **Decline** happens at once when tribe 1 or 2 reaches 4:
  1. (2nd tribe only) all buildings of your 1st tribe still on the board go back to your supply;
  2. all your roads go back to your supply; the longest route is recounted (holder loses it; it goes to a
     unique longest route of 3+, else it is set aside);
  3. all your buildings are overgrown (`ruin` / `ruinCity`).
- **Founding:** then you place a settlement of the new tribe for free and **your turn ends**. It goes on a
  free intersection with a path, respecting the distance rule (overgrown buildings count), with no road of
  any player leading to it. No free road, no starting resources. If no such spot exists, it replaces one
  of your own overgrown buildings.
- **Overgrown buildings** still produce for their owner, can be robbed through, block the distance rule,
  cannot become cities. Roads may lead up to one but never from or past it (its owner's roads too).
  Any player (the owner too) with a road leading to it may **build over** it by paying a settlement: the
  old piece goes back to its owner's supply.

## 5. Blocker, cards, awards
- The blocker starts in the wilds. It may be placed on a land hex or back in the wilds, never on a goods
  hex or the sea. A 7 makes everybody over the hand limit discard half, as in the base game.
- Hand limit: 7 **plus 1 per guard you have played**.
- Development cards: two stacks of 10 (7 guards, 1 free roads, 1 harvest, 1 claim). Only the first stack is
  in play at the start; the second goes **under** the remaining cards once every player has founded their
  second tribe. No VP cards.
- One card per turn, at any time of your turn, **also before the roll** (any card, not only a guard; free roads
  played before the roll go back to the roll afterwards).
- Harvest: 2 cards of choice from the bank (resources or goods). Claim: name a kind; every other player
  gives you **up to 2** cards of it.
- **Longest route** (at least 3 roads) gives no VP, but the **caravan**: once per turn in the action phase,
  give any 2 cards and take 1 card of a kind you did not give (`hl:caravan`).
- **Largest force** (at least 2 played guards) gives no VP, but the **recall**: once per turn (also before
  rolling), if the blocker is on a hex next to one of your buildings (active or overgrown), move it to the
  wilds and take 1 resource of that hex from the bank (`hl:recall`).

## 6. Actions (engine)
| Action | Who / when | Effect |
|---|---|---|
| `hl:found { v }` | the player whose tribe just declined (phase `ext` / `hl:found`) | free founding settlement, ends the turn |
| `hl:goodsSet { get }` | active player, action phase | one of each good -> 2 resources |
| `hl:caravan { give, get }` | longest route holder, action phase, once per turn | 2 cards -> 1 other card |
| `hl:recall` | largest force holder, before rolling or action phase, once per turn | blocker to the wilds, +1 resource |
| `placeSettlement` on an overgrown building | action phase, a road of yours at it, pay a settlement | build over it |

## 7. Decisions (H-numbers)
| ID | Topic | Decision (implemented) | Source / status |
|---|---|---|---|
| H1 | Names | All names are our own (section 0); resources keep their Boschtan base names. | lead |
| H2 | Map drawing | The printed board has flat-top columns; we draw it turned by 90 degrees as pointy-top rows 5-6-7-6-5 (coast on top, jungle at the bottom). Adjacency is unchanged. | lead |
| H3 | Jungle frame | The jungle frame where the blocker rests is one extra hex (`wilds`) below the jungle row; it has no paths and no buildable intersections. | lead |
| H4 | Variable map | Coast and jungle hexes (incl. the grove at the end of band 4) stay on their printed spots, only the 18 land hexes are shuffled; numbers never move (almanac "Set-up, Variable"). Default `variable`, since starting settlements are placed in a setup round (advanced set-up), not on printed spots. | lead |
| H5 | Bank 3:1 | 3 equal resources buy a resource **or a good** (rule booklet p.5 and almanac p.20; almanac p.19 says resource only). | lead |
| H6 | Goods set | 3 different goods buy 2 **resources** (almanac p.19-20; the booklet's "resource/goods" is the minority wording). | lead |
| H7 | Cards before the roll | As in the rulebook: any one card may be played before the roll (base game: guard only). Free roads played then return to the roll (`freeRoads.resume = 'preRoll'`, an optional field the other rulesets never set). | PO 2026-11-25 |
| H8 | Own ruins and routes | An overgrown building blocks roads for everyone incl. its owner (almanac "Thicket"). For the longest route count an own overgrown building does not cut the owner's route (roads can never pass it, so this almost never matters). | lead |
| H9 | Founding spot | "No road leads to it" = no road of any player on an edge at the intersection (all roads on the board belong to active tribes, since declining tribes lose their roads). | lead |
| H10 | Win check | The win (3rd tribe at 3 points) is checked after every action of the acting player; culture points are shown as VP. | lead |
| H11 | Players | 2-4 players (2 for tests and casual play; the rulebook says 3-4). No 5-6 layout. | lead |

## 8. Bot strategy (heuristic, all levels)
The expert bot uses the heuristic in expansion games, so this covers every level. Measured against the
previous heuristic (hard level, 60 three-player and 80 four-player games): the new one won 88-95 % of the
games (fair share 25-50 %). In the other games it plays move for move as before.
- Goods are worth about 0.6 of a resource; goods trades and the caravan are used only toward the next build.
- The recall is always used (also before the roll).
- Overgrown buildings are build targets (an opponent's ruin gets a bonus); no road is planned from a ruin.
- The build that ends a tribe comes last in the turn (cards, trades first), preferably as a city; no extra
  roads then (they vanish). No saving for a second city in one tribe.
- Founding spot: own production (counted 1.5x for the third tribe) plus the best target within two roads,
  less where an opponent's road already reaches.
- Awards give powers, not points: the bot chases them less than in the base game.
