# Boschtan art assets

Original hand-drawn medieval-map art, made for Boschtan. Parchment + ink, flat
woodcut shapes, 2 px-equivalent ink (`#3B2F2F`) outlines, light hatching.
No commercial game art, logos or names were copied or imitated.

- Ink: `#3B2F2F` · parchment `#F3E9D2` / `#E4D3AE` · gold `#C9A227` · sea `#3E7CA6`
- Terrain colours per docs/UI.md: forest `#2F5D3A`, claypit `#B5562B`,
  meadow `#8DB255`, field `#E0B84C`, quarry `#8A8D91`, waste `#D9C79E`
- Player-coloured parts use `fill="currentColor"` so the UI can tint them
  (pieces, emblems; UI icons are stroked in `currentColor`).
- Every SVG: no external references, no embedded raster, no scripts.
- Check script: `node check.cjs` (validates the contract below) — 56/56 pass.

## terrain/ — pointy-top hex tiles, viewBox `0 0 200 230`
| file | motif | size | licence |
|---|---|---|---|
| terrain/forest.svg | dense conifer woodland, path + undergrowth | 5.7 KB | original, made for Boschtan |
| terrain/claypit.svg | stepped clay pit, brick stacks, cart | 5.1 KB | original, made for Boschtan |
| terrain/meadow.svg | sheep flock, flowers, fence | 4.4 KB | original, made for Boschtan |
| terrain/field.svg | wheat field, furrows + stooks | 5.8 KB | original, made for Boschtan |
| terrain/quarry.svg | snow-capped peaks + mine adit | 4.9 KB | original, made for Boschtan |
| terrain/waste.svg | dunes, cacti, sun-bleached skull | 4.4 KB | original, made for Boschtan |

## terrain/sea.svg — tileable pattern, viewBox `0 0 100 100` (0.6 KB)
Wave bands repeat seamlessly across x/y edges. Original, made for Boschtan.

## token.svg — number disc, viewBox `0 0 60 60` (0.5 KB)
Parchment disc with double ring; the UI draws the number on top.
Original, made for Boschtan.

## harbor/ — harbour trade icons, viewBox `0 0 64 64`
| file | motif | size |
|---|---|---|
| harbor/any.svg | cog ship under sail (generic trade) | 1.4 KB |
| harbor/timber.svg | stacked logs | 1.5 KB |
| harbor/clay.svg | raw clay mound + brick stack | 1.5 KB |
| harbor/fiber.svg | ball of yarn on the meadow | 1.2 KB |
| harbor/grain.svg | bound grain sheaf | 1.9 KB |
| harbor/stone.svg | ashlar stone stack | 1.1 KB |

All original, made for Boschtan.

## piece/ — player pieces, viewBox as noted, `currentColor`
| file | viewBox | motif | size |
|---|---|---|---|
| piece/road.svg | `0 0 60 14` | timber plank road beam | 0.4 KB |
| piece/settlement.svg | `0 0 40 40` | gabled house | 0.5 KB |
| piece/city.svg | `0 0 52 44` | walled keep with towers | 0.7 KB |
| piece/blocker.svg | `0 0 40 56` | boundary obelisk/stele | 0.5 KB |

All original, made for Boschtan.

## resource/ (card art) and icon/ (small glyphs)
Same five goods; resources are framed card art (`0 0 64 64`), icons are
frameless glyphs (`0 0 24 24`): timber (stacked logs), clay (brick pile),
fiber (basket of yarn), grain (wheat sheaf), stone (ashlar blocks).
The `fiber` motif is wool/yarn (the Vietnamese label is "Len"), not a plant.
Each 0.5–1.9 KB. All original, made for Boschtan.

## card/ — development-style cards, viewBox `0 0 120 168`
| file | art | size |
|---|---|---|
| card/back.svg | diaper lattice + gold rosette medallion | 1.1 KB |
| card/guard.svg | heater shield between crossed spearheads | 1.0 KB |
| card/freeRoads.svg | winding road with milestones | 1.4 KB |
| card/harvest.svg | cornucopia with fruit | 1.0 KB |
| card/claim.svg | crown above three coins | 0.9 KB |
| card/relic.svg | gilt chalice with rays | 1.0 KB |

Cards carry the art only; the UI renders titles as text.
All original, made for Boschtan.

## dice/ — `1.svg` … `6.svg`, viewBox `0 0 48 48` (0.2–0.5 KB)
Parchment die, ink pips; 6/8-relevant six uses danger red `#A23B2A`.
Original, made for Boschtan.

## award/ — viewBox `0 0 64 64`
- award/longestRoute.svg — road with milestone + laurel ring (0.6 KB)
- award/largestForce.svg — kettle-helm warrior + laurel ring (0.6 KB)

Original, made for Boschtan.

## emblem/ — player patterns, viewBox `0 0 24 24`, `currentColor`
sun, wave, leaf, star, shield, flame — one emblem per player colour so players
are never told apart by colour alone (colour-blind safe pairing per docs/UI.md).
Each 0.2–0.4 KB. All original, made for Boschtan.

## ui/ — toolbar icons, viewBox `0 0 24 24`, stroked `currentColor`
build (hammer), trade (arrows), card (hand sheet), end (flag), roll (die +
arrow), undo (curved arrow), close (X), info (i-circle). Each 0.2–0.4 KB.
All original, made for Boschtan.

## fonts/ — OFL fonts, bundled locally (no CDN)
| file | size | licence |
|---|---|---|
| fonts/Cinzel.ttf | 125 KB | OFL 1.1 (fonts/Cinzel-OFL.txt) |
| fonts/EBGaramond.ttf | 851 KB | OFL 1.1 (fonts/EBGaramond-OFL.txt) |
| fonts/EBGaramond-Italic.ttf | 754 KB | OFL 1.1 (fonts/EBGaramond-OFL.txt) |

Source: https://github.com/google/fonts (ofl/cinzel, ofl/ebgaramond).
No woff2 is published in that repo, so the variable `.ttf` files were taken
instead (allowed by the task; modern browsers load them via `@font-face`).
Headings: Cinzel; body: EB Garamond; fallback Georgia, serif.

## preview.html
Grid page showing every asset at 1x and at 48 px, on parchment, with the
player colours + emblems combined (review-only, not shipped to the game).
