# Boschtan art assets

Original art made for Boschtan. The rulebook pages in `docs/art-reference/` (CATAN GmbH) are
only an internal reference for palette, proportion and iconography; nothing is traced or
copied, and no reference image is ever uploaded to an image generator.

- Ink `#3B2F2F` · parchment `#F3E9D2` / `#E4D3AE` · gold `#C9A227` · sea `#2D6E9B`
- Player colours: red `#C0392B`, blue `#2E6DA4`, ivory `#E9E0CC`, orange `#D9822B`,
  green `#3E8E4E`, brown `#7A4B2A`.
- The older vector set (terrain, resource cards, dev cards, goods icons, harbors, dice,
  token) and its check/preview tooling moved to `archive/assets-svg-v1/` once the painted
  art below replaced it.

## piece/ — vector pieces, `currentColor`
road, settlement, city, blocker. Still used by the home-screen map and as the fallback of
the painted sprites while they load.

## award/ — viewBox `0 0 64 64`
longestRoute (laurel + winding road), largestForce (laurel + helmet and swords).

## emblem/ — player patterns, viewBox `0 0 24 24`, `currentColor`
sun, wave, leaf, star, shield, flame: shown in the player strip and log (no longer on the
board pieces, PO decision 2026-11-18).

## ui/ — toolbar icons, viewBox `0 0 24 24`, stroked `currentColor`
build, trade, card, end, roll, undo, close, info.

## fonts/ — OFL fonts, bundled locally (no CDN)
Cinzel (headings) and EB Garamond (+ italic, body), OFL 1.1 (see the `*-OFL.txt` files).
Source: https://github.com/google/fonts.

## art2d/ — painted raster art for the 2D board (Tripo)

Generated with the Tripo CLI (text-to-image, `chat_image_2.5_flare`) from **text prompts
only** (`tools/art/prompts.tsv`); no rulebook image was uploaded or used as an image input.
Raw images land in `data/raw/tripo/out/` (git-ignored); `python -I tools/art/build.py`
turns them into these files. Regenerate one asset: `bash tools/art/tripo-gen.sh <name>`
(~10 credits each), then rebuild. While a file is loading or missing the UI draws a plain
shape instead (flat hex, coloured diamond, blank card).

| folder | files | notes |
|---|---|---|
| art2d/terrain/ | `forest meadow field claypit quarry waste` (443x512) | pointy-top hex cut-outs with alpha, bevelled rim; drawn at 94% of the cell so a sand seam shows between tiles |
| art2d/terrain/ | `sea` (512x512) | seamless; tiled as a large SVG pattern |
| art2d/piece/ | `settlement city warden caravan` | minimalist plain wooden blocks (PO: keep pieces simple), neutral grey with a thin ink outline, tinted per seat by the multiply filters `#tint-p1..p6` (`PieceTintDefs`) |
| art2d/piece/ | `blocker rampart capital toppled` | same minimalist style, own colours (neutral pieces) |

Number tokens are no longer an image either: a flat parchment disc with a thin ink ring
(`board/Token.tsx`, 15% smaller than the old `token.svg`, now in the archive).

Roads are not a sprite: they are drawn as flat vector bars centred on the grid edge
(`board/Piece.tsx` `Road`), so they always sit in the seam between two tiles.
| art2d/terrain/ | `harbor` (443x512) | shallow water for the 2D harbor tiles: each harbor is a whole sea hex next to its coast edge (like a physical tile), with two jetties to the edge corners and a printed medallion [icon over ratio] |
| art2d/icon/ | goods `timber clay fiber grain stone linen books silver` + `any` (crate, for 3:1) | 128x128, same plain-block style as the pieces, thin ink outline; used by every resource icon in the UI and on harbor tiles |
| art2d/card/ | resources `timber clay fiber grain stone linen books silver`, development `guard harvest claim freeRoads relic`, `back` | 250x350, parchment frame and blank nameplate (the UI prints the name) |
| art2d/ui/ | dialog paper `sheet` (512, 9-slice border image, torn toasted rim), `paper` (512, seamless fibres), `seal` (128, wax seal by the dialog title), `flourish` (600x45, gold divider under the title) | Tripo text-to-image (prompts `x-*` in tools/art/prompts.tsv), cut out by tools/art/build.py `chrome`; original, made for Boschtan |

## avatar/ — player portraits, 192×192 webp
star, leaf, wave, sun, flame, shield: one per seat in an online room (picked in the lobby, first
come first served), shown in the player strip, lobby and chat. Each matches the emblem of the
same name (star pendant, leaf sprig, wave pin, sun badge, flame pendant, shield). Supplied by the
PO (2026-11-19), cropped to head and shoulders and resized from 1024 px PNGs.
