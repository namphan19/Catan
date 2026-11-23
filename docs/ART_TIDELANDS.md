# Art for Tidelands

Tidelands uses the same art rules as the base game and Strongholds (PO decisions 2026-11-18). Every file is made
with Tripo **text prompts only** (`tools/art/prompts.tsv`, section "Tidelands"), then built with
`python -I tools/art/build.py <names>` into `packages/client/public/assets/art2d/`. The client draws each sprite
once it has loaded and keeps the simple vector placeholder as the fallback, so a missing file never breaks a game.

## Style rules (same as base + Strongholds)
- **Terrain tiles**: painted top-down tabletop diorama (gouache/watercolour), one dominant colour so it reads
  small, cut to a pointy-top hex with the bevelled rim; tiles keep a visible sand seam between them.
- **Pieces**: **minimalist plain wooden blocks** like classic board-game pieces: smooth geometric shapes, no
  windows, planks, ropes, shields or other detail, three-quarter view from the same side as the settlement.
  Player pieces are painted off-white and tinted with the seat colour at runtime (`TINTED` in build.py);
  neutral pieces keep their own colours. No player emblems on board pieces. Small: about 0.5-0.7 of the hex radius.
- **Icons / tokens**: a few chunky plain shapes, bold silhouette readable at 20 px, same style as the goods icons.
- **Cards**: storybook gouache illustration, one central subject, full bleed in the parchment frame.
- Our own designs only: never upload `docs/art-reference/` or any commercial game's art.

## Files
| File (art2d/...) | Prompt name | Kind | Content | Used by |
|---|---|---|---|---|
| `terrain/goldmine.webp` | t-goldmine | terrain | ochre rocky hills, mine entrance, gold veins | gold hexes (drop-in) |
| `terrain/mist.webp` | t-mist | terrain | sea veiled by drifting mist | undiscovered hexes (drop-in) |
| `terrain/village.webp` | t-village | terrain | sandy islet, three huts, drying silk, jetty | weavers' villages (drop-in) |
| `piece/cog-top.webp` | p-cog-top | piecetop, tinted | the cog seen from straight above: almond hull, sail block across it, bow left | cogs on the board (SeaExtras), rotated along the edge like a road |
| `piece/warship-top.webp` | p-warship-top | piecetop, tinted | the top-down cog with a crenellated block on the stern | warships on the board, Corsair Coves |
| `piece/cog.webp` | p-cog | piece, tinted | plain hull block, one mast, square sail (three-quarter view) | cost card icon (a rotated side view looked skewed on the board - PO 2026-11-23) |
| `piece/warship.webp` | p-warship | piece, tinted | the cog with a small crenellated block on the stern | not used on the board any more (kept) |
| `piece/corsair.webp` | p-corsair | piece, own colours | black hull, crimson sail | corsair and corsair fleet (fleet adds a ☠ token) |
| `piece/fort.webp` | p-fort | piece, own colours | squat crenellated round block on a rock | corsair forts (+ lair count token) |
| `piece/landing.webp` | p-landing | piece, tinted | pole on a disc base with a notched pennant | landing flags |
| `icon/reward-vp.webp` | i-reward-vp | icon | gold star | Castaways reward |
| `icon/reward-card.webp` | i-reward-card | icon | three fanned cards | Castaways reward |
| `icon/reward-harbor.webp` | i-reward-harbor | icon | anchor | Castaways reward |
| `icon/silk.webp` | i-silk | icon | rose-pink silk bolt | village silk supply |
| `icon/wonder-wall.webp`, `-bridge`, `-beacon` | i-wonder-* | icon | wall block / arch / tower with flame | wonder site marks (the "x" mark stays a vector cross) |
| `card/wonder-<id>.webp` × 7 | d-wonder-* | card | cathedral, seaWall, kingsBridge, obelisk, highKeep, beacon, scriptorium | side panel wonder list |

## Not made yet (optional)
| Suggested file | Placeholder now | Content |
|---|---|---|
| `ui/scenario-<id>.webp` × 9 | scenario name + one-line text | small storybook vignette per scenario for the picker |
