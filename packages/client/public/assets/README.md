# Boschtan art assets

Original painted board-game art, made for Boschtan. The rulebook pages in
`docs/art-reference/` are used only as an internal visual reference for palette,
proportion and iconography; nothing is traced or copied.

- Ink: `#3B2F2F` · parchment `#F3E9D2` / `#E4D3AE` · gold `#C9A227` · sea `#2D6E9B`
- Terrain colours: forest `#3F7448`, hills `#B85C34`, pasture `#8DBE55`,
  fields `#D9B754`, mountains `#878C94`, desert `#DCC28B`
- Player colours (classic board-game set): red `#C0392B`, blue `#2E6DA4`,
  ivory `#E9E0CC`, orange `#D9822B`, green `#3E8E4E`, brown `#7A4B2A`.
  Every piece also carries the owner's emblem, so colour is never the only signal.
- Player-coloured parts use `fill="currentColor"` so the UI can tint them
  (pieces, emblems; UI icons are stroked in `currentColor`).
- Every SVG: no external references, no embedded raster, no scripts.
- Check script: `node check.cjs` (validates the contract below).

## Names

The UI follows the terms used in the rulebooks: **Wood, Brick, Wool, Wheat, Ore**;
**Forest, Hills, Pasture, Fields, Mountains, Desert**; development cards
**Knight, Road Building, Year of Plenty, Monopoly, Victory Point**; the **Robber**;
awards **Longest Road** and **Largest Army**. Internal ids stay neutral
(`timber`, `claypit`, `meadow`, `guard`, `relic`, `blocker`, ...); only the visible
strings are aligned with the original game.

## terrain/ — pointy-top hex tiles, viewBox `0 0 200 230`
Painted top faces with gradients, layered ground, soft highlights and a thin ink
edge. The 3D board reuses the same files as top-face textures.

| file | motif |
|---|---|
| terrain/forest.svg | dense painted canopy, sunlit trail and conifers |
| terrain/meadow.svg | rolling pasture, sheep, pond and wildflowers |
| terrain/field.svg | golden wheat strips, sheaves, furrows and a farmhouse |
| terrain/claypit.svg | red-orange terraced hills, clay pit, bricks and a cart |
| terrain/quarry.svg | snowy mountain ridge, scree and a timber mine adit |
| terrain/waste.svg | dunes, dry scrub, rocks and sun-bleached bones |

## terrain/sea.svg — tileable pattern, viewBox `0 0 100 100`
Deep turquoise-blue water with seamless swells, curl highlights and glints.

## token.svg — number disc, viewBox `0 0 60 60`
Cream beveled disc with a warm sand rim and a gold inner ring; the UI draws the
number and probability pips on top.

## harbor/ — harbour trade icons, viewBox `0 0 64 64`
any (cog ship), timber (stacked logs), clay (brick pile), fiber (wool), grain
(bound sheaf), stone (ore stack). All original.

## piece/ — player pieces, `currentColor`
| file | viewBox | motif |
|---|---|---|
| piece/road.svg | `0 0 60 14` | bevelled plastic road stick |
| piece/settlement.svg | `0 0 40 40` | gabled house with lit and shaded faces |
| piece/city.svg | `0 0 52 44` | keep with two towers, gate, flags and shaded faces |
| piece/blocker.svg | `0 0 40 56` | hooded robber with a loot sack (neutral colours) |

## resource/ (full resource cards) and icon/ (small glyphs)
`resource/*.svg` are full vertical cards (`0 0 120 168`) in the same template as
the development cards: parchment frame, four corner medallions, a painted
illustration and a blank parchment nameplate at the foot. The UI prints the
localised name on that plate (so the card art itself carries no language).
Base goods: wood (stacked logs), brick (brick pile), wool (sheep), wheat
(bound sheaf), ore (silver-flecked rock). The expansion also ships commodity
cards: books, linen and silver, in the same template.
`icon/*.svg` are the frameless `0 0 24 24` glyphs used in costs and dialogs.

## card/ — development-style cards, viewBox `0 0 120 168`
Each card has a parchment frame, a colour-coded title ribbon, an illustration and
a printed seal at the bottom. Titles are rendered by the UI (localised).

| file | art |
|---|---|
| card/back.svg | rust-red ornamental back with a sun-over-island medallion |
| card/guard.svg | knight on horseback with a shield and spear |
| card/freeRoads.svg | winding road, signposts, milestones and a cart |
| card/harvest.svg | cornucopia spilling fruit and wheat |
| card/claim.svg | crown on a cushion above coins and a sealed scroll |
| card/relic.svg | laurel wreath around a keep, victory star above |

## dice/ — `1.svg` … `6.svg`, viewBox `0 0 48 48`
Legacy flat dice faces. The live UI draws bevelled red/yellow dice in
`src/ui/Die.tsx`; these files stay for asset-contract compatibility.

## award/ — viewBox `0 0 64 64`
- award/longestRoute.svg — laurel medallion with a winding road and finish flag
- award/largestForce.svg — laurel medallion with helmet, crossed swords and shields

## emblem/ — player patterns, viewBox `0 0 24 24`, `currentColor`
sun, wave, leaf, star, shield, flame — one emblem per player colour so players
are never told apart by colour alone.

## ui/ — toolbar icons, viewBox `0 0 24 24`, stroked `currentColor`
build (hammer), trade (arrows), card (hand sheet), end (flag), roll (die +
arrow), undo (curved arrow), close (X), info (i-circle).

## fonts/ — OFL fonts, bundled locally (no CDN)
| file | licence |
|---|---|
| fonts/Cinzel.ttf | OFL 1.1 (fonts/Cinzel-OFL.txt) |
| fonts/EBGaramond.ttf | OFL 1.1 (fonts/EBGaramond-OFL.txt) |
| fonts/EBGaramond-Italic.ttf | OFL 1.1 (fonts/EBGaramond-OFL.txt) |

Source: https://github.com/google/fonts (ofl/cinzel, ofl/ebgaramond).
Headings: Cinzel; body: EB Garamond; fallback Georgia, serif.

## preview.html
Grid page showing every asset at 1x and at 48 px, on parchment, with the
player colours + emblems combined (review-only, not shipped to the game).
