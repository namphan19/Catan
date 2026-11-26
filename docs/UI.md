# Boschtan - UI / UX spec (lead)

Web only (desktop browser first, tablet usable, phone layout since 2026-11-21). Self-hosted by the PO for family and colleagues (private
use, not for commercial release); online play is the target (server = M2), hot-seat stays for testing. No bots.

## Art direction: close to the original CATAN look
- Goal: the board, tiles, number discs, harbors, pieces, cards and dice should look like the official
  CATAN base game (CN3081 rulebook and physical set), so that players recognise the game at a glance.
- Reference material: `docs/art-reference/` (rulebook renders, `groups/` cut-outs, `external-soc/` photos of a
  physical set). Use these as the primary reference for colour, proportion, layout and iconography.
- Terrain hexes: painted, textured top faces with soft shading, as in the physical set (hills red-orange,
  forest dark green, pasture light green, fields yellow, mountains grey, desert sand), not flat shapes.
- Sea frame: painted blue water with light foam and a sand-coloured coast, matching the official sea frame.
- Cards: same card proportions, bordered frame, title banner and illustration area as the official cards.
- Number discs: cream disc with the number and dot count; 6 and 8 in red.
- Pieces: glossy plastic-like colours matching the official set (roads, settlements, cities, robber).
- Gradients and textures may be used where the official art uses them; keep them flat enough for SVG.
- Must stay readable at 48 px (tokens, icons) - test every asset at small size.
- Fonts (OFL, bundled locally, no CDN): headings "Cinzel", body "EB Garamond"; fallback Georgia, serif.

## Terminology (rulebook names, 2026-11-18)
Visible names follow the base-game rulebooks; internal ids stay neutral so the engine is untouched.
- Resources: **Wood / Brick / Wool / Wheat / Ore** → Gỗ / Gạch / Lông cừu / Lúa mì / Quặng.
- Terrains: **Forest / Hills / Pasture / Fields / Mountains / Desert** → Rừng / Đồi / Đồng cỏ / Cánh đồng / Núi / Sa mạc
  (internal ids remain forest / claypit / meadow / field / quarry / waste).
- Development cards: **Knight / Road Building / Year of Plenty / Monopoly / Victory Point**
  → Hiệp sĩ / Xây đường / Năm sung túc / Độc quyền / Điểm chiến thắng (internal ids guard / freeRoads / harvest / claim / relic).
- **Robber**, **Longest Road**, **Largest Army** → Kẻ cướp, Đường dài nhất, Đạo quân hùng mạnh nhất.
- Harbour ratios: **3:1** generic, **2:1** for one named resource.

## Design tokens (CSS custom properties, file packages/client/src/ui/tokens.css)
| token | value | use |
|---|---|---|
| --parchment | #F3E9D2 | page background |
| --parchment-dark | #E4D3AE | panels |
| --ink | #3B2F2F | text, outlines |
| --ink-soft | #6B5B4E | secondary text |
| --sea | #2D6E9B | sea / frame |
| --gold | #C9A227 | highlights, awards |
| --danger | #A23B2A | errors, 6/8 tokens |
| --forest #3F7448, --claypit #B85C34, --meadow #8DBE55, --field #D9B754, --quarry #878C94, --waste #DCC28B | terrains |
Player colours (classic board-game set). PO decision 2026-11-18: board pieces no longer carry the owner's emblem (the board is clear enough by colour); emblems stay in the player strip and log:
p1 #C0392B (red, sun), p2 #2E6DA4 (blue, wave), p3 #E9E0CC (ivory, leaf), p4 #D9822B (orange, star),
p5 #3E8E4E (green, shield), p6 #7A4B2A (brown, flame).

## Asset contract (artist writes, frontend reads) - packages/client/public/assets/
Every SVG: viewBox given below, no external refs, no embedded raster, player-coloured parts use
`fill="currentColor"` so the UI can colour them.
- terrain/{forest,claypit,meadow,field,quarry,waste}.svg   viewBox "0 0 200 230" pointy-top hex filling the box
- terrain/sea.svg (tileable pattern 100x100)
- token.svg (number disc 0 0 60 60, number drawn by the UI on top)
- harbor/{any,timber,clay,fiber,grain,stone}.svg   0 0 64 64
  Harbors are drawn out in the sea (2D and 3D share board/geom.ts harborGeom): two wooden piers from
  the coast edge's corners to a dock, and a badge [icon · ratio] (3D: buoy + floating icon/ratio)
  beyond the dock. Nothing of a harbor sits on the coast edge, so roads and settlements stay readable.
- piece/{road,settlement,city}.svg   road 0 0 60 14, settlement 0 0 40 40, city 0 0 52 44 (currentColor)
- piece/blocker.svg   0 0 40 56
- resource/{timber,clay,fiber,grain,stone}.svg   0 0 120 168 (full resource card: frame, corner motifs,
  illustration, blank nameplate the UI labels) ; icon/{same}.svg 0 0 24 24
- resource/{books,linen,silver}.svg   0 0 120 168 (the expansion's commodity cards, same template)
- card/{back,guard,freeRoads,harvest,claim,relic}.svg   0 0 120 168
- dice/{1..6}.svg 0 0 48 48 ; award/{longestRoute,largestForce}.svg 0 0 64 64
- emblem/{sun,wave,leaf,star,shield,flame}.svg 0 0 24 24 (player patterns)
- ui/{build,trade,card,end,roll,undo,close,info}.svg 0 0 24 24
- assets/README.md lists every file, its size and licence ("original, made for Boschtan").
- fonts/ (woff2 + OFL licence text)
The frontend must fall back to simple shapes when an asset file is missing (assets arrive in parallel).

## Screens
1. Home ("guild hall", 2026-11-16): a parchment chart on a dark desk. Left: sea-chart medallion
   (island illustration built from the game's terrain/piece art) + online ticket; right: the new-game
   ledger (players, seed + randomise, named seats with emblems, wax-sealed start, marginal tip);
   below: the logbook archive (load a saved log). Two columns at >= 900 px, stacked on tablet/mobile.
2. Game table (UX2 layout, 2026-11-16; CSS in src/table/table.css): slim top bar (wordmark, turn, "?" quick
   help, 2D/3D, language); status banner = one sentence "what to do now" (gold when it is the viewer's move,
   "Đang chờ <name>…" otherwise); board fills the centre (zoom + pan) with overlays: zoom top-left, dice box
   top-right, collapsible cost card bottom-right (marks what the viewer can pay), toasts bottom-left; player
   strip on top: one card per player (portrait with the seat emblem as a badge + name on the left, then VP,
   hand / card / guard counts and pieces left / awards; one line on a wide card, stacked on a narrow one via
   a container query; acting marker = gold ring); right column only with an expansion (Tidelands /
   Strongholds panels). PO 2026-11-19: the Log / Trade side panel is removed; events show as toasts, the
   trade status in the trade dialog. Strongholds advance cards sit bottom-left on the board (AdvanceHand:
   name tabs, a click opens the full card with Play / Discard). Bottom: own hand as cards (all 5 resources
   always shown, +N/-N on change, development cards) + action bar (build group, trade group, one large
   primary button: Roll or End turn). Number tokens carry probability pips; hexes that just produced pulse
   (2D). Winner overlay.
   Online extras (2026-11-19, docs/PROTOCOL.md): portraits (6, picked in the lobby, first come first
   served; hot-seat seats use the portrait matching their emblem), a floating chat bubble (lobby
   bottom-right, game under the zoom buttons, unread counter), and "Let a bot play for me" (AFK: a
   'normal' stand-in bot plays the seat until "I'm back"; the others get a popup).
3. Hot-seat: "Pass the device to <name>" cover between actors so hands stay hidden.
4. Phone layout (2026-11-23; CSS in src/table/mobile.css, e2e project "mobile"):
   - portrait (<= 640 px wide): top bar with the turn in a dark chip + "?" + a menu (shell buttons,
     language); 2-4 players share one grid row of compact colour tiles (seat-colour band with portrait,
     hand badge and VP, readable name under it). Five or six players use one shallow swipe/snap rail;
      tapping any tile opens its public details in a bottom sheet (VP progress, hand / development
      cards / guards, pieces left, awards).
     board fills the middle (pinch zoom with two fingers, drag to pan) with a round zoom rail top-left;
     hand as a compact icon dock (every base resource keeps its slot, count + "+N" pulse); secondary
     actions scroll sideways while the primary Roll / End turn button stays pinned on the right.
     Utility controls have 44 px hit areas and fixed bars respect safe-area insets.
   - landscape (<= 520 px tall): board on the left at full height, right column with top bar, the same
     player tiles (five or six players use the swipeable rail), the icon hand dock and the actions; event
     toasts stack in the free space above the actions instead of covering the board.
   - the side column (Strongholds and Tidelands panels; the base game has none) is a sheet behind the
     "Bảng mở rộng" button (a content-height bottom sheet in portrait, from the right in landscape);
     the open sheet has a board backdrop and closes with its button, Esc or a backdrop tap; picking an
      action in a panel closes it so the board is in view. Strongholds advance cards sit above the
      utility pills so they cannot cover the sheet toggle or cost button.

## Interaction rules
- The UI never decides legality: buttons, highlights and dialogs come from getLegalActions; disabled
  buttons show the validateAction reason as a tooltip (e.g. "Not enough resources for: city").
- Pick an action, then click the board: legal vertices / edges / hexes glow; Esc cancels.
- Dialogs: discard (pick exactly N, counter), steal target, bank/harbor trade (best rate shown),
  player trade (one table: card | you have | you give | you get, responses list, confirm; an incoming
  offer always pops up, also when the viewer lacks the cards - then accept is greyed out with the
  reason), card play (harvest: pick 2, claim: pick 1).
- Feedback: dice roll animation (< 600 ms), resource chips fly to the receiving player, toasts for
  other players' builds, sound optional and off by default.
- Hidden info: render only getPlayerView / getEventsView data of the acting viewer.
- i18n: Vietnamese default, English toggle; all strings in packages/client/src/i18n/{vi,en}.ts.
- Accessibility: keyboard focus for every control, 4.5:1 text contrast, never colour alone (emblems,
  bold red 6/8).

## Component structure (packages/client/src)
ui/ (tokens.css, Button, Panel, Dialog, Toast, Tooltip), board/ (Board, HexTile, Token, Harbor, Piece,
Highlights), board3d/ (Board3D, terrain, decor, pieces3d, strongholds3d), table/ (GameTable, TopBar, PlayerCards, PlayerDialog,
ActionBar, CostCard, HandPanel), strongholds/ (Panel, AdvanceHand, BoardExtras, ChoiceDialogs, chooser), dialogs/
(DiscardDialog, StealDialog, TradeDialog, CardDialog), shell/ (HomeScreen, HomeMap, home.css, OnlineHome, Lobby,
ChatBubble, HotseatShell, PassDeviceCover), ui/Avatar, i18n/. GameTable takes { view, legal, onAction, events } only, so the online
client reuses it.
