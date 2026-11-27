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
1. Home ("hub", PO 2026-11-27; src/shell/HomeScreen.tsx + hub.css): the same world as the game table, a
   dark sea with words on it and ONE parchment sheet. Header: brand, two tabs (Chơi chung máy | Chơi trực
   tuyến), language. Top card: "Continue" (the hot-seat game is auto-saved after every move in
   localStorage `boschtan.autosave`, shell/autosave.ts; Discard forgets it), or on the online tab "Rejoin
   room" (the last seated room); otherwise a quick game (you + 2 normal bots, base game). Four mode cards
   with terrain art: base, Strongholds, Tidelands, Highlands - Strongholds and Tidelands combine,
   Highlands plays alone (2-4 players); Tidelands shows its scenario picker, Highlands its map picker. The
   sheet: same device = summary (modes, the engine's VP goal, players, bots), player count as round
   buttons, seats (portrait, name, who plays it), advanced options (seed), Start; online = your name,
   seats, advanced (VP goal, 5-6 player mode), "Create room · <modes>", or join by code (a pasted invite
   link fills in the code; ?room=CODE opens this tab). Footer: the logbook (load a saved log) in a
   dialog, and a tip. The online client creates / joins at once from the tab's choice; its own form
   stays only as a fallback (errors, kicked).
2. Game table ("HUD" layout, PO 2026-11-27; CSS in src/table/table.css; replaces the UX2 frames):
   the board fills the whole table and is fitted into the free middle; every control floats over its
   edges on dark scrims, without boxes. Top centre: turn label (+ shell info) and ONE guidance line
   ("what to do now", a board pick with Cancel, or "Đang chờ <name>…"); top-right: "?" quick help and a
   menu (shell buttons: pass device, export log, home; language). Left edge: the players as portrait
   medallions in turn order (seat-colour ring, wax seal with the VP, emblem badge, award badges, name,
   hand / card counts; the acting player larger with a gold glow); a click opens the public details
   (pieces left, guards...). Top-right under the menu: the dice on the sea (no box). Bottom: round
   icon-only build buttons on the left (road, settlement, city, card; hovering one shows its name, its
   cost with the missing cards dimmed, and why it is not possible), ONE trade button (bank and player
   trades are tabs of its dialog), the hand as a fan of painted cards in the middle (all resources
   always shown, empty ones dimmed, +N/-N on change; development cards as a second, smaller fan) and
   ONE primary button on the right (Roll or End turn). Events read as a one-line narration over the hand
   (former toasts). The price card is gone (costs live in the build buttons). Number tokens carry
   probability pips; hexes that just produced pulse. Winner overlay.
   Strongholds on the HUD: raid lane under the dice (fleet on a dotted lane, raiders vs defence), the
   viewer's three improvement tracks on the right edge (a click opens a tray with costs, perks, capitals
   and Improve buttons), each player's levels under their name, rampart + recruit as build buttons,
   advance cards as a small fan right of the hand (deck band; a click opens the card with Play /
   Discard), and a click on one of the viewer's wardens opens its actions around it on the board. The
   full Strongholds panel is a drawer (panel button, Esc or backdrop closes it).
   Tidelands on the HUD: scenario + goal in the turn line with an (i) card of the scenario's own rules,
   each player's progress (landfall, silk, rewards, wonder, coves) under the name, cogs and "move a cog"
   (plus harbor / warship / wonder actions of the scenario) as round buttons in the build row, and the
   gold-mine choice as big resource buttons right over the hand (one click for one card, Take for more).
   Highlands on the HUD: the three tribes as pip groups under each name (active one underlined, declined
   ones grey), goods as a separate part of the hand fan ("trade only"), the goods-set trade and the award
   powers (caravan, recall) as round buttons that glow while usable, and a "your tribe has declined" line
   over the board (fades after ~3 s) while the new tribe is founded.
   Every expansion panel (and both together: Tidelands + Strongholds) is the same drawer.
   Tablets (<= 1180 px) fold the build buttons behind "Xây" like phones, so long build rows (Tidelands +
   Strongholds) never push the hand. Online: room code in the turn line, AFK and leave in the menu, the
   away banner under the turn line, the chat bubble bottom-right.
   Online extras (2026-11-19, docs/PROTOCOL.md): portraits (6, picked in the lobby, first come first
   served; hot-seat seats use the portrait matching their emblem), a floating chat bubble (lobby
   bottom-right, game bottom-right above the zoom buttons, unread counter), and "Let a bot play for me" (AFK: a
   'normal' stand-in bot plays the seat until "I'm back"; the others get a popup).
3. Hot-seat: "Pass the device to <name>" cover between actors so hands stay hidden.
4. Phone layout (HUD, 2026-11-27; CSS in src/table/mobile.css, e2e project "mobile"):
   - portrait (<= 640 px wide): turn label + "?" + menu on top; one row of portrait medallions (VP seal,
     name; five or six players swipe); the guidance line under them; dice (and the Strongholds raid lane)
     right-aligned under that; the board fills the middle (pinch zoom, drag to pan); at the foot the
     hand fan and one row of round buttons with names under them - "Xây" opens a menu with every build
     (name, cost, why not), "Đổi bài", Strongholds' "Nâng cấp" - and the primary Roll / End turn button
     pinned on the right. Controls have 44 px hit areas and respect safe-area insets.
   - landscape (<= 520 px tall): the desktop arrangement, smaller (players down the left edge).
   - every expansion panel is a sheet behind the panel button (bottom sheet in portrait, from the right
     in landscape) with a backdrop; it closes with its button, Esc or a backdrop tap, and picking an
     action in it closes it so the board is in view.

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
ActionBar + BuildSlot, HandPanel), strongholds/ (Panel, Hud: RaidLane / TrackRail / ShLevels / warden ring, AdvanceHand, BoardExtras, ChoiceDialogs, chooser), tidelands/Hud (ScenarioBadge, TlSeatLine, GoldPicker, TlBuildSlots), highlands/Hud (HlSeatLine, HlBuildSlots, FoundMoment), dialogs/
(DiscardDialog, StealDialog, TradeDialog, CardDialog), shell/ (HomeScreen, home.css (online home + lobby), OnlineHome, Lobby,
ChatBubble, HotseatShell, PassDeviceCover, autosave, hub.css), ui/Avatar, i18n/. GameTable takes { view, legal, onAction, events } only, so the online
client reuses it.
