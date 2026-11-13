# Rules - base game (working title "Hexgame", placeholder theme)

Our own rules text for an original hex-tile settlement game. Terms are neutral placeholders until the PO
picks a theme. Every interpretation or choice that is not obvious is logged in `docs/RULES_DECISIONS.md`
(D-numbers below refer to it). Numbers live in `packages/engine/src/rules/base/config.ts`.

## 1. Components
- **Resources (5):** timber, clay, fiber, grain, stone.
- **Terrains:** forest -> timber, claypit -> clay, meadow -> fiber, field -> grain, quarry -> stone,
  waste -> nothing.
- **Boards:** standard (19 hexes, 3-4 players), large (30 hexes, 5-6 players). See `docs/BOARD.md`.
- **Number tokens:** 2-12 without 7 on every producing hex (standard 18, large 28). 6 and 8 ("hot")
  are never on adjacent hexes.
- **Harbors on the coast:** generic 3:1 or specific 2:1 for one resource (standard 9, large 11).
- **Blocker:** one piece, starts on a waste hex.
- **Per player:** 15 roads, 5 settlements, 4 cities.
- **Bank:** 19 of each resource (large: 24).
- **Card deck:** standard 14 guard, 2 freeRoads, 2 harvest, 2 claim, 5 relic (25);
  large 20 / 3 / 3 / 3 / 5 (34). Shuffled at game start with the game RNG.

## 2. Costs
| Item | Cost |
|---|---|
| road | 1 timber + 1 clay |
| settlement | 1 timber + 1 clay + 1 fiber + 1 grain |
| city (replaces own settlement) | 2 grain + 3 stone |
| card | 1 fiber + 1 grain + 1 stone |

## 3. Placement
- Settlements and cities sit on vertices; roads on edges.
- **Distance rule:** a settlement needs an empty vertex whose adjacent vertices are all empty.
- Outside setup a settlement must touch one of the owner's roads.
- A road must touch the owner's building, or the owner's road at a vertex that has no opponent building.

## 4. Setup
Seat order p1..pN. Each player places one settlement and one road touching it, in order p1..pN, then
again in reverse order pN..p1 (snake). The second settlement immediately yields one resource for each
adjacent producing hex (if the bank has it). Then p1 starts turn 1. (D1, D2)

## 5. Turn
1. **Before rolling** the player may play one guard card.
2. **Roll** two dice. If the sum is not 7, every hex with that number produces for every adjacent
   building: settlement 1, city 2 - except the hex with the blocker. If the bank cannot pay all players
   owed a resource, nobody gets that resource; if only one player is owed it, they get what is left. (D3)
3. **Rolled 7:** every player with more than 7 resource cards returns half (rounded down) to the bank,
   choosing which. Then the roller moves the blocker to a different hex and steals one random card from
   one player with a building on that hex (if any such player has cards). (D4)
4. **Main:** in any order: build, buy cards, trade, play at most one card (if not played before the roll).
5. **End turn.** With 5-6 players an **extra build phase** follows (section 8).

## 6. Trading (main phase of the active player only)
- **Bank:** 4 identical resources for 1 of another kind; 3:1 with a generic harbor; 2:1 for the
  harbor's resource with a specific harbor. A harbor counts if the player has a building on one of its
  two vertices. Several cards may be taken at once (e.g. 8 -> 2). (D5)
- **Players:** the active player offers a bundle for a bundle; other players accept or decline; the
  active player confirms with one acceptor. Both sides must be non-empty and use different resources;
  gifts are not possible. Players do not trade with each other when it is not their turn. (D6)

## 7. Cards
- Bought cards cannot be played in the turn (or build window) they were bought. One card per turn.
- **guard:** move the blocker and steal as on a 7 (no discards). Counts towards largest force.
- **freeRoads:** place 2 roads for free (fewer if out of pieces or spots). Not playable with no legal spot.
- **harvest:** take 2 resources of your choice from the bank (fewer if the bank has fewer). (D7)
- **claim:** name a resource; every other player gives you all of it.
- **relic:** 1 VP, kept hidden, never played.

## 8. Extra build phase (5-6 players)
After the active player ends the turn, each other player in seat order (starting left of the active
player) gets one build window: they may build roads, settlements, cities and buy cards - no trading
and no playing cards. Then the next player starts their turn. (D8, D9)

## 9. Awards and victory
- **Longest route (2 VP):** the first player with a continuous route of at least 5 roads. A route is the
  longest trail of own roads, no road counted twice; it is broken at a vertex with an opponent building.
  Another player takes the award only with a strictly longer route. If the holder's route is cut and
  several players tie for the longest (>= 5), nobody holds it; if one player is longest, they take it. (D10)
- **Largest force (2 VP):** the first player to have played 3 guards; another player takes it with
  strictly more guards played.
- **Victory points:** settlement 1, city 2, relic 1, each award 2.
- **Win:** 10 VP during your own turn (counted after every action). Points gained in someone else's
  build window win only when your own turn starts. (D11)
