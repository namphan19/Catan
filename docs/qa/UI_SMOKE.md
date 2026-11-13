# UI smoke test report — Boschtan web client (hot-seat)

Date: 2026-11-13 · Owner: QA · Suite: `packages/e2e` (Playwright `@playwright/test` 1.48.2, Chromium 1140)
Run command: `pnpm --filter @hexgame/e2e exec playwright test` (from repo root; Playwright builds the
client with `vite build` and serves `dist/` itself via `vite preview --port 4398 --strictPort`).

## What was tested

- **Home screen + language toggle** — Vietnamese by default (`<h1>Boschtan</h1>` + Vietnamese
  subtitle), toggle to English and back via the header button.
- **4-player hot-seat game, seed `e2e-1`** —
  pass-device cover shown before the first hand reveal (full-viewport, `aria-modal`, hides the hand);
  board renders **19 hexes**, every terrain `<image>` href verified to load with `naturalWidth > 0`
  (no fallback shapes); setup phase played by clicking highlighted vertices/edges/hexes (with cover
  confirmations between players) until Roll is enabled; dice rolled; log shows Vietnamese lines;
  turn ended (cover re-appears for the next player); player-trade panel opens (`Đổi bài` dialog).
- **6-player game, seed `e2e-large`** — large board renders **30 hexes**, terrain art verified.
- **Console/page errors** — captured for every page; each test asserts the collector is empty.
  (Known filtered noise: the app ships no favicon link, so Chromium's automatic `/favicon.ico`
  request logs a 404 console error; filtered in `captureErrors`, see below.)
- Two viewports: desktop 1440x900 and tablet 1024x768 (project `tablet`).

## Results — 2026-11-13 20:00

```
Running 6 tests using 1 worker
  ok 1 [desktop] › home screen is Vietnamese, language toggle switches EN and back (947ms)
  ok 2 [desktop] › 4-player hot-seat game seed e2e-1: board, setup, roll, end turn, trade panel (6.5s)
  ok 3 [desktop] › 6-player game starts on the large board (30 hexes) (1.0s)
  ok 4 [tablet]   › home screen is Vietnamese, language toggle switches EN and back (846ms)
  ok 5 [tablet]   › 4-player hot-seat game seed e2e-1: board, setup, roll, end turn, trade panel (6.6s)
  ok 6 [tablet]   › 6-player game starts on the large board (30 hexes) (893ms)
  6 passed (25.4s)
```

Exit code 0. Total wall time ~27 s including the client build + preview server. No console errors
(other than the filtered favicon 404) in any test. No server left running (Playwright stops the
preview server; verified nothing listens on 4398 after the run).

## Screenshots (full-page, saved by the suite)

Desktop (`docs/qa/screenshots/`): `home.png`, `setup.png`, `main-turn.png`, `trade-dialog.png`,
`large-board.png`. Tablet evidence (`docs/qa/screenshots/tablet/`): same five names.

## Visual problems found in the screenshots

| # | Problem | Where |
|---|---------|-------|
| V1 | **Untranslated English tooltip over the status bar.** Hovering a disabled action button surfaces a native tooltip with the raw English disable reason (`…G_PHASE: roll is not allowed in phase`), rendered at the bottom-left, **clipped by the viewport edge** and covering the "Bài của bạn / Tổng" status line. Root cause is BUG-QA-03: `Button` puts the untranslated `WRONG_PHASE: …` string into `aria-label`, which becomes the tooltip text. Fix: translate the disable reason (and/or drop it from `aria-label`). | `main-turn.png`, `tablet/main-turn.png` |
| V2 | **Port labels render as "31".** The small tag under every port icon reads `31` — almost certainly meant to be the ratio `3:1` with the colon missing/clipped at this font size. Check whether the client renders `3:1` and the colon is simply too small/clipped, or the label text is wrong. | `setup.png`, `main-turn.png`, `large-board.png`, `tablet/setup.png` |
| V3 | **Current-player tag crowds/clips the card title.** The `(lượt)` / `(Bạn)` badge is set in the same line as the player name and at 1024px it collides with the name text and appears partially cut at the card edge (player 4 card). | `tablet/setup.png`, `tablet/main-turn.png`, `large-board.png` (player 3 `(Bạn)`) |
| V4 | **Board not horizontally centered on wide desktop.** The board container leaves a large empty beige column to the right of the board before the sidebar (and a margin on the left); on the 6-player board the unused margins are biggest. Cosmetic. | `setup.png`, `main-turn.png`, `large-board.png` |
| V5 | **Event toasts overlap the board and the status bar.** The stacked toast list ("Chuyển giai đoạn: …", "Người chơi 4 gieo được 2 + 6 = 8", …) floats over the left half of the board; at 1024px it also covers board tiles and reaches down over the bottom status bar. Readable, but it hides content it overlays. | `main-turn.png`, `tablet/main-turn.png`, `trade-dialog.png` |
| V6 | **Tablet action bar wraps to two rows.** At 1024px the action bar breaks onto a second row ("Đổi bài với người chơi" / "Kết thúc lượt"), which pushes the page taller. Acceptable, but the two-row wrap looks unintentional. | `tablet/setup.png`, `tablet/main-turn.png` |

No missing terrain images, no fallback shapes, no overlapping/overlapping text elsewhere, and
contrast is readable in all ten screenshots.

## Known test-side workarounds (not product bugs)

- **Board clicks are dispatched synthetically** (`dispatchEvent('click')` on `.hit-vertex/edge/hex`)
  because of BUG-QA-02: the board calls `setPointerCapture` on the `<svg>` on every pointerdown, so
  Chromium retargets the real `click` to the SVG and the hit target's `onClick` never fires (the
  test would stall in setup). Everything outside the SVG (buttons, covers, dialogs) is driven
  through the real input pipeline. Fix on the client side re-enables real clicks.
- **Favicon 404** filtered from the console-error collector (`captureErrors` in `helpers.ts`);
  adding a favicon link to `index.html` would remove the noise entirely.
