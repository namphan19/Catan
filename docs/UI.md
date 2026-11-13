# Boschtan - UI / UX spec (lead)

Web only (desktop browser first, tablet usable). Self-hosted by the PO for colleagues; online play is the
target (server = M2), hot-seat stays for testing. No bots. Original medieval art - never copy or trace the
art, tile frames, card layouts or logos of any commercial game.

## Art direction: "hand-drawn medieval map"
- Parchment and ink, woodcut / illuminated-manuscript feel, flat shapes with a 2 px ink outline,
  light hatching for depth, no photo textures, no gradients heavier than 2 stops.
- Must stay readable at 48 px (tokens, icons) - test every asset at small size.
- Fonts (OFL, bundled locally, no CDN): headings "Cinzel", body "EB Garamond"; fallback Georgia, serif.

## Design tokens (CSS custom properties, file packages/client/src/ui/tokens.css)
| token | value | use |
|---|---|---|
| --parchment | #F3E9D2 | page background |
| --parchment-dark | #E4D3AE | panels |
| --ink | #3B2F2F | text, outlines |
| --ink-soft | #6B5B4E | secondary text |
| --sea | #3E7CA6 | sea / frame |
| --gold | #C9A227 | highlights, awards |
| --danger | #A23B2A | errors, 6/8 tokens |
| --forest #2F5D3A, --claypit #B5562B, --meadow #8DB255, --field #E0B84C, --quarry #8A8D91, --waste #D9C79E | terrains |
Player colours (colour-blind safe, always paired with a pattern/emblem):
p1 #E69F00 (orange, sun), p2 #56B4E9 (sky, wave), p3 #009E73 (green, leaf), p4 #F0E442 (yellow, star),
p5 #0072B2 (blue, shield), p6 #D55E00 (vermillion, flame).

## Asset contract (artist writes, frontend reads) - packages/client/public/assets/
Every SVG: viewBox given below, no external refs, no embedded raster, player-coloured parts use
`fill="currentColor"` so the UI can colour them.
- terrain/{forest,claypit,meadow,field,quarry,waste}.svg   viewBox "0 0 200 230" pointy-top hex filling the box
- terrain/sea.svg (tileable pattern 100x100)
- token.svg (number disc 0 0 60 60, number drawn by the UI on top)
- harbor/{any,timber,clay,fiber,grain,stone}.svg   0 0 64 64
- piece/{road,settlement,city}.svg   road 0 0 60 14, settlement 0 0 40 40, city 0 0 52 44 (currentColor)
- piece/blocker.svg   0 0 40 56
- resource/{timber,clay,fiber,grain,stone}.svg   0 0 64 64 (card art) ; icon/{same}.svg 0 0 24 24
- card/{back,guard,freeRoads,harvest,claim,relic}.svg   0 0 120 168
- dice/{1..6}.svg 0 0 48 48 ; award/{longestRoute,largestForce}.svg 0 0 64 64
- emblem/{sun,wave,leaf,star,shield,flame}.svg 0 0 24 24 (player patterns)
- ui/{build,trade,card,end,roll,undo,close,info}.svg 0 0 24 24
- assets/README.md lists every file, its size and licence ("original, made for Boschtan").
- fonts/ (woff2 + OFL licence text)
The frontend must fall back to simple shapes when an asset file is missing (assets arrive in parallel).

## Screens
1. Home: new hot-seat game (3-6 players, names, seed) / join online room (M2) / load log.
2. Game table (see layout): top bar (turn, phase, dice, all players' public VP), opponents strip,
   SVG board centre (zoom + pan), side panel tabs (Log / Trade / Costs), bottom: own hand + contextual
   action bar. Winner overlay.
3. Hot-seat: "Pass the device to <name>" cover between actors so hands stay hidden.

## Interaction rules
- The UI never decides legality: buttons, highlights and dialogs come from getLegalActions; disabled
  buttons show the validateAction reason as a tooltip (e.g. "Not enough resources for: city").
- Pick an action, then click the board: legal vertices / edges / hexes glow; Esc cancels.
- Dialogs: discard (pick exactly N, counter), steal target, bank/harbor trade (best rate shown),
  player trade (give / get columns, responses list, confirm), card play (harvest: pick 2, claim: pick 1).
- Feedback: dice roll animation (< 600 ms), resource chips fly to the receiving player, toasts for
  other players' builds, sound optional and off by default.
- Hidden info: render only getPlayerView / getEventsView data of the acting viewer.
- i18n: Vietnamese default, English toggle; all strings in packages/client/src/i18n/{vi,en}.ts.
- Accessibility: keyboard focus for every control, 4.5:1 text contrast, never colour alone (emblems,
  bold red 6/8).

## Component structure (packages/client/src)
ui/ (tokens.css, Button, Panel, Dialog, Toast, Tooltip), board/ (Board, HexTile, Token, Harbor, Piece,
Highlights), table/ (GameTable, TopBar, OpponentStrip, HandPanel, ActionBar, SidePanel, LogPanel),
dialogs/ (DiscardDialog, StealDialog, TradeDialog, CardDialog), shell/ (HotseatShell, PassDeviceCover),
i18n/. GameTable takes { view, legal, onAction, events } only, so the online client reuses it.
