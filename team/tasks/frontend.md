# Task U10: player-friendly game table (layout + information design, round 1)

Goal: a first-time player must see at a glance (a) what they have to do now, (b) their own cards, (c) every
player's score and public counts, (d) what things cost. The PO's feedback: the table is hard to read, the board
is small, the important information is tiny or hidden.

Only write in: packages/client/src/, packages/e2e/tests/, docs/qa/screenshots/ (png only).
Do not touch packages/engine, packages/server, public/assets, package.json files. No new npm dependencies.

Read first: docs/UI.md (art direction + interaction rules), docs/qa/screenshots/main-turn.png (current state),
packages/client/src/table/*.tsx, packages/client/src/board/{Board.tsx,geom.ts,BoardSwitch.tsx},
packages/client/src/styles.css (table/topbar/opponents/sidepanel/hand sections), packages/e2e/tests/*.ts.

Hard rules
- Keep Boschtan's own identity: tokens in ui/tokens.css, the bundled fonts, the SVG assets in
  public/assets (resource/, icon/, card/, piece/, award/, ui/, emblem/, dice/). Never imitate the art, card
  frames, colours or screen look of any commercial board game. Use our asset SVGs instead of emoji for icons
  (fall back to a simple shape when an asset is missing, as the existing code does).
- No rules logic in the UI: everything derives from `view` (PlayerView), `legal` (getLegalActions) and
  `events`. Costs come from `baseConfig.costs`. Never hard-code rule numbers.
- All new strings go into i18n/vi.ts AND i18n/en.ts. Vietnamese is the default.
- Keep these selectors/names working (e2e depends on them): `.board-svg`, `.board-area`, `.board3d-wrap`,
  `[data-board-view="3d"]`, `.actionbar button` with the same Vietnamese label text, `.log-list li`,
  `.hit-vertex`, `.hit-edge`, `.hit-hex`, `.pieces .piece-road`, `.pieces .piece-settlement`, `.cover`,
  `.export-box`, the "Gieo xúc xắc" button name, the 2D/3D toggle buttons.
- Accessibility: every control focusable, text contrast >= 4.5:1 (never yellow/orange text on parchment: show
  the player colour as a band/dot/emblem and keep the name in ink), every icon-only number has `title` and
  `aria-label` with the full phrase, animations disabled under `prefers-reduced-motion: reduce`.
- Work in small steps (one item, typecheck, next item) and save files often, so a crash loses little.

Target layout, desktop (>= 1181 px wide; check at 1440x900)

    [ shell strip (unchanged): "Đang xem bàn của ..." | Chuyển máy | Xuất log | Về trang chủ ]
    [ slim header: BOSCHTAN · Lượt N ............................ 2D|3D · language          ]
    [ STATUS BANNER: one sentence "what to do now"                                          ]
    [ board area (fills everything left)                 | right column, 320 px              ]
    [   overlays: zoom top-left, dice top-right,         |   player cards (stacked)          ]
    [   cost card bottom-right, toasts bottom-centre     |   tabs: Nhật ký | Đổi bài         ]
    [ own hand (resource cards + dev cards)   |   action bar                                 ]

Items
1. Bigger board. The island currently covers about a third of the board area. Reduce the margin in
   `boardExtent` (geom.ts) to what the harbors really need and make the SVG fit its container
   (preserveAspectRatio meet, sea colour around). At 1440x900 with the 4-player layout the hex island
   (bounding box of all `.hex` tiles) must be at least 70% of the board area's height; the 5-6 player layout
   must still fit completely with its harbors. Zoom/pan keep working.
2. Status banner: new `table/StatusBanner.tsx`, rendered by GameTable under the header, class
   `.status-banner`, `aria-live="polite"`, `data-mine="true|false"`. One short sentence chosen from
   view.phase + legal + pending only, e.g.: roll legal -> "Đến lượt bạn: hãy gieo xúc xắc"; main phase with
   endTurn legal -> "Lượt của bạn: xây dựng, đổi bài hoặc kết thúc lượt"; setup settlement / road ->
   "Đặt một ngôi làng vào điểm đang sáng" / "Đặt một con đường cạnh ngôi làng vừa đặt"; moveBlocker; steal;
   discard (with the number to discard if the legal actions give it, otherwise without a number);
   respondTrade; freeRoads; a pending board pick -> "... (Esc để huỷ)"; viewer has no legal action ->
   "Đang chờ {name}..." with that player's emblem; game over -> winner. data-mine=true gets a gold frame,
   false a neutral one. Remove the old phase pill from the top bar (keep the turn label).
3. Player cards move from the horizontal strip into the right column above the log, one card per player in
   turn order, full column width; with 5-6 players use a compact 2-column grid. 6 cards plus a log of at
   least 160 px must fit at 1440x900 without the page scrolling. Each card (keep class `.seat`, `.me`,
   `.acting`): player-colour band on the left + emblem + name (ink) + "(Bạn)" tag; large VP number with the
   label; a stat row with asset icons and numbers: cards in hand, development cards, guards played, and
   pieces left (road / settlement / city, using piece/*.svg in the player colour). Awards (view.awards) are
   shown as a badge with award/*.svg on the owner's card. The acting player gets the gold ring and a
   "đang đi" marker. Remove `.topbar-vps` and `.topbar-awards` (duplicates).
4. Own hand as cards: always show all 5 resources in RESOURCE_ORDER using resource/<id>.svg (about 44x60 px)
   with the name under it and a round count badge; a resource with 0 is dimmed (opacity ~0.4) and shows no
   badge. Show the total. Development cards as mini cards (card/<id>.svg) with the name as tooltip and text
   under it; cards bought this turn keep the "mới" mark. When a count changes, that card pulses and shows a
   floating "+N" / "-N" for about 1.2 s (compare with the previous hand kept in a ref).
5. Dice: move them out of the top bar into a `.dice-box` overlay at the top-right of the board area (works
   over both the 2D and the 3D board, so place it in GameTable/BoardSwitch level, not inside the SVG). Each
   die 52-56 px, plus "= sum"; keep the roll-in animation; `title` says who rolled. Move the zoom buttons to
   the top-left so they do not collide.
6. Cost card: `.cost-card` overlay at the bottom-right of the board area, collapsible with a header button
   (state stored in localStorage key `boschtan.costs`; default open on desktop, collapsed below 1181 px).
   Rows road / settlement / city / development card from `baseConfig.costs`, drawn as resource icons (one icon
   per unit). For the viewer: an icon the viewer cannot cover with the current hand is dimmed, and a row the
   viewer can fully pay shows a check mark (display only; legality still comes from `legal`). Remove the
   "Chi phí" tab from the side panel (tabs left: Nhật ký, Đổi bài).
7. Toasts: move the stack to the bottom-centre of the board area (max 3 visible, newest at the bottom) so it
   never covers the dice, the zoom buttons or the cost card.
8. Tablet (<= 1180 px, the existing tablet e2e project): the right column may not fit; there the player
   cards go back to a horizontal scrolling strip above the board and the log stays in the side tabs or a
   collapsible drawer. Nothing may overlap or be cut off at 1024x768.

e2e (packages/e2e/tests): keep all 11 existing tests green (adapt selectors only where this task removes an
element) and add tests for: status banner visible with non-empty text in setup and after the first roll;
island height >= 70% of `.board-area` height at 1440x900; all 5 resource cards visible in the hand; the cost
card collapses and stays collapsed after reload; `.dice-box` shows two dice after a roll. Re-take the
screenshots in docs/qa/screenshots/ (2D, tablet, 3d) with the mouse moved away from tooltips.

Acceptance (paste the real command output tails into the final report)
- `pnpm --filter @hexgame/client typecheck` exit 0
- `pnpm build` exit 0
- full e2e `pnpm --filter @hexgame/e2e exec playwright test` exit 0 with the test count (it takes ~2-3 min:
  submit it with scripts/job-submit.sh as described in the COMMON rules if it could outlive your turn)
- list of files changed, and for each of the 8 items one line "done / partly (what is missing)".
Final report < 30 lines. Do not claim an item is done unless you saw it in a fresh screenshot.
