# Art needed for Tidelands (placeholders today)

The Tidelands UI reuses the existing art where it fits (sea and harbor tiles, terrains, resource icons,
player colours, the dice, cards). Everything below is drawn today as a **simple placeholder** (flat colour
polygon or vector shape in the player colour) so the game is fully playable. When the design team delivers
these files, the terrain tiles appear automatically; the pieces need a small code switch (noted per row).

Style: same painted medieval style as `packages/client/public/assets/art2d/` (see the README there). Our own
designs only: no reference to any commercial game's art.

## Terrain tiles (drop-in, no code change)
Format like the existing tiles: `packages/client/public/assets/art2d/terrain/<name>.webp`, cut exactly to a
pointy-top hex (width √3·R, height 2·R), built with `tools/art/build.py`.
| File | Placeholder now | Content |
|---|---|---|
| `terrain/goldmine.webp` | yellow hex with a ◆ mark | a gold mine: rocky hill with a mine entrance, gold veins, a cart |
| `terrain/mist.webp` | grey hex with a dashed border and "?" | an undiscovered hex: drifting sea mist over water |
| `terrain/village.webp` | sand-coloured hex with a ⌂ mark | a weavers' islet: small huts, drying cloth / silk banners, a jetty |

## Pieces and markers (need a code switch in `packages/client/src/tidelands/SeaExtras.tsx`)
| Suggested file | Placeholder now | Content |
|---|---|---|
| `piece/cog.webp` (tinted per player like the other pieces) | vector hull + sail in the player colour | a medieval cog seen from the side, fits on a hex edge |
| `piece/warship.webp` | dark hull + sail in the player colour | the same cog armed: castle on the stern, shields on the rail |
| `piece/corsair.webp` | black ship with a red sail | the corsair ship (sits on a sea hex) |
| `piece/corsairFleet.webp` | the corsair ship with ☠ | the corsair fleet (Corsair Coves) |
| `piece/fort.webp` + lair counter | dark square with the lair count, border in the owner's colour | a corsair fort on a cliff; small skull tokens 1-3 |
| `piece/landing.webp` | small flag in the player colour | a landing banner on the beach |
| `icon/reward-vp.webp`, `icon/reward-card.webp`, `icon/reward-harbor.webp` | ★ / ▤ / ⚓ round badges | reward tokens lying on a sea edge (Castaways) |
| `icon/silk.webp` | pink badge with the silk count | a bolt of silk (village supply, players' silk) |
| `icon/wonder-wall.webp`, `-bridge`, `-beacon`, `x` | ▮ / ⌒ / ✦ / ✕ badges | wonder site marks and the "no starting settlement" mark |
| `card/wonder-<id>.webp` × 7 | text only in the side panel | wonder tiles: Cathedral, Sea Wall, King's Bridge, Obelisk, High Keep, Beacon Tower, Scriptorium (4 building stages each) |

## Home and panel (optional)
| Suggested file | Placeholder now | Content |
|---|---|---|
| `ui/scenario-<id>.webp` × 9 | scenario name + one-line text | a small vignette per scenario for the scenario picker / side panel |
| `ui/tidelands.svg` | ⛵ emoji in the cost card | cog icon for the cost card and buttons |
