# Art for Highlands

Highlands follows the same art rules as the base game, Strongholds and Tidelands (`docs/ART_TIDELANDS.md`, style rules).
Every file is made with Tripo **text prompts only** (`tools/art/prompts.tsv`, section "Highlands"), then built with
`python -I tools/art/build.py <names>` into `packages/client/public/assets/art2d/`. Goods hexes also show the icon of their good above the number token (`GOODS_BADGE` in `HexTile.tsx`). Until a file exists the client
draws a flat colour hex with an emoji mark (`HexTile.tsx` `PLACEHOLDER_GLYPH`, `ui/colors.ts`), so nothing breaks.

Status 2026-11-25: all 10 images made by the PO on the Tripo website and built (icons had a checkerboard baked in: build.py clears it).

## Making the images on the Tripo website (no CLI)
1. `python -I tools/art/web-prompts.py --section Highlands` prints, per image, the full prompt to paste (the line
   of prompts.tsv **plus** the style text the CLI script adds), the size (square, or 3:4 portrait for cards: the website has no 2:3, build.py cuts the sides to 5:7), whether
   the background must be transparent (icons, pieces) and the file name. Text prompts only: never upload a
   reference image.
2. Generate with text-to-image, download, and save as `data/raw/tripo/out/<name>.png` (e.g. `t-jungle.png`;
   `.jpg` / `.webp` work too). An icon without transparency is fine: build.py clears a plain background.
3. `python -I tools/art/build.py t-jungle t-grove ...` writes `packages/client/public/assets/art2d/...`; the dev
   client shows it after a reload, port 8080 after `corepack pnpm --filter @hexgame/client build`.

## Files
| File (art2d/...) | Prompt name | Kind | Content | Used by |
|---|---|---|---|---|
| `terrain/jungle.webp` | t-jungle | terrain | rainforest canopy with a few bright feathers | jungle hexes (plume) |
| `terrain/grove.webp` | t-grove | terrain | terraced herb gardens on a jungle slope | herb groves (herb) |
| `terrain/fishery.webp` | t-fishery | terrain | deep cobalt bay, big fish in a ring around an empty centre (the token covers the middle), net floats, small boat; v1 (fish only in the centre) looked like plain sea - redo pending | fishing grounds (fish) |
| `terrain/wilds.webp` | t-wilds | terrain | dark impenetrable old jungle | the wilds hex (blocker rest) |
| `icon/plume.webp` | i-plume | icon | one red feather with a blue tip | hand, dialogs, chips |
| `icon/herb.webp` | i-herb | icon | three green leaves tied together | hand, dialogs, chips |
| `icon/fish.webp` | i-fish | icon | one silver-blue fish | hand, dialogs, chips |
| `card/plume.webp` | c-plume | card | bunch of tropical feathers | hand cards (desktop) |
| `card/herb.webp` | c-herb | card | basket of fresh leaves | hand cards (desktop) |
| `card/fish.webp` | c-fish | card | reed boat with a net of fish | hand cards (desktop) |

Not planned as raster art: the overgrown mark on buildings of a declined tribe is drawn as SVG vines
(`board/Piece.tsx` `Thicket`), and the empty sea hexes reuse the Tidelands sea tile.
