# Task: real web UI for Boschtan (game table, dialogs, hot-seat shell, Vietnamese)

Only write in: packages/client/src/ (and packages/client/package.json / index.html if needed).
Do NOT write in packages/client/public/assets/ (the artist role is creating the assets there right now),
nor in packages/engine, docs/, team/, scripts/, tools/.
Read docs/UI.md FIRST (layout, tokens, asset contract, interaction rules, component structure) and follow it.
Read docs/API.md and packages/engine/src/{types,engine,view}.ts by line ranges for the engine API.

Notes on the engine (another agent is changing it in parallel - code defensively):
- 5-6 players get a new phase { k: 'paired', player } (player 2 acts) and the existing extraBuild phase
  may still appear; show "Người chơi 2: <name>" in the top bar for both. Just render whatever phase.k is,
  with a readable Vietnamese label, and drive everything from getLegalActions.
- respondTrade is getting `response: 'accept' | 'decline' | 'counter'` with give/get bags for a counter;
  build the trade dialog so a responder can accept, decline or counter, and the active player sees all
  responses and confirms with one. Use only fields present in the legal actions / validateAction.
- Never re-implement rules: highlights, enabled buttons and dialog options come from getLegalActions;
  disabled reasons from validateAction.

Build (replace the current dev UI; keep the "Export log" / "Load log" feature on the home screen):
1. ui/ tokens.css (exact tokens from docs/UI.md) + Button, Panel, Dialog, Toast, Tooltip.
2. board/ SVG board using assets from /assets/... per the contract, with a fallback shape when an image
   fails to load (assets arrive in parallel). Zoom (wheel/buttons) + pan (drag). Highlights for legal
   vertices / edges / hexes for the selected action; Esc cancels.
3. table/ GameTable({ view, legal, onAction, events }) - TopBar, OpponentStrip, HandPanel, ActionBar,
   SidePanel (Nhật ký / Đổi bài / Chi phí), winner overlay.
4. dialogs/ DiscardDialog, StealDialog, TradeDialog (bank+harbor with best rate, player trade incl.
   counteroffers), CardDialog (harvest pick 2, claim pick 1).
5. shell/ HotseatShell + PassDeviceCover ("Chuyền máy cho <tên>") shown whenever the acting viewer changes.
6. i18n/ vi.ts (default) + en.ts with a toggle; every UI string goes through it. Names for resources:
   timber=Gỗ, clay=Đất sét, fiber=Len, grain=Lúa, stone=Đá; terrains: forest=Rừng, claypit=Hố đất sét,
   meadow=Đồng cỏ, field=Ruộng lúa, quarry=Mỏ đá, waste=Hoang mạc; cards: guard=Hiệp sĩ,
   freeRoads=Làm đường, harvest=Bội thu, claim=Độc quyền, relic=Thánh tích; blocker=Băng cướp.
7. Fonts: use "Cinzel" / "EB Garamond" via @font-face pointing at /assets/fonts/... with serif fallback.
8. Accessibility: keyboard focus on every control, emblems next to player colours, 6/8 bold red.

Acceptance (paste results): from repo root pnpm --filter @hexgame/client typecheck and build both exit 0;
grep the client src for any rule logic ("distance", "longest", "cost" except display of config costs).
Do not leave a dev server running. Small increments. Final report < 40 lines.
