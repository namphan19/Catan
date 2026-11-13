# Task: browser E2E smoke tests + screenshots for the web UI

Only write in: packages/e2e/ (new package) and docs/qa/ (UI_SMOKE.md, screenshots/). Do not edit
packages/client, packages/engine, packages/server.
1. Create package @hexgame/e2e with @playwright/test 1.48.2 (pin exact). Install via the proxy from the
   repo root: export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128 ; pnpm install
   then: pnpm --filter @hexgame/e2e exec playwright install chromium   (downloads through the proxy).
   If the browser download is blocked, STOP and report it (do not work around it).
2. playwright.config.ts: webServer = build the client and serve it with
   "pnpm --filter @hexgame/client exec vite preview --port 4398 --strictPort" (reuseExistingServer false),
   viewport 1440x900 plus one project at 1024x768 (tablet). Playwright starts and stops the server itself.
3. Tests (keep the whole run under 3 minutes):
   - home screen loads in Vietnamese (title Boschtan), language toggle switches to English and back
   - start a 4-player hot-seat game with seed "e2e-1": the board renders 19 hexes with terrain images
     loaded (check the <image>/<img> or <use> elements report naturalWidth > 0 or no fallback shapes)
   - play setup by clicking highlighted spots until the first roll is possible (pass-device cover
     appears between players and hides the hand until confirmed)
   - roll, end turn; the log shows Vietnamese lines
   - a 6-player game starts on the large board (30 hexes)
   - no console errors during the run
   Save full-page screenshots to docs/qa/screenshots/: home.png, setup.png, main-turn.png, trade-dialog.png
   (open the trade panel), large-board.png.
4. docs/qa/UI_SMOKE.md: what was tested, results, every visual problem you notice in the screenshots
   (overlaps, clipped text, unreadable contrast, missing images), with the screenshot name.
Acceptance: pnpm --filter @hexgame/e2e exec playwright test exits 0 (paste summary). Leave no server running.
Final report < 40 lines.
