# Task: online play in the web client (connect to the M2 server)

Only write in: packages/client/src/ (and packages/client/vite.config.ts for a dev proxy). Do not edit
packages/server, packages/engine, docs/, team/.
Contract: docs/PROTOCOL.md (messages, reconnect with sessionToken in localStorage, events-then-state).
Server: packages/server (read src/protocol.ts for the exact message types; do not change it).
Reuse table/GameTable({ view, legal, onAction, events }) unchanged for the game screen; the online client
only replaces where view/legal/events come from (server messages instead of the local engine).

Build:
1. net/connection.ts: WebSocket to `${location.origin.replace(/^http/, 'ws')}/ws`, hello with name +
   stored token, auto-reconnect with backoff (1 s, 2 s, 5 s, max 10 s), requestState after reconnect,
   reqId per request, typed handlers. Show a "Mất kết nối - đang kết nối lại..." banner while offline.
2. shell/OnlineHome: enter display name (remembered), "Tạo phòng" (player count 3-6, 5-6 mode select:
   paired / extraBuild, VP target), "Vào phòng" by 5-char code (uppercase, validated).
3. shell/Lobby: room code big and copyable (copy button; clipboard write only), seat list with names,
   connected dots and ready state, Ready toggle, host-only "Bắt đầu" enabled when all seats are filled and
   ready, Leave button. Shareable link: `${origin}/?room=CODE` pre-fills the join.
4. In-game: GameTable fed by the server `state` (view + legal) and `events`; onAction sends
   { type: 'action', action }. Show server error codes as Vietnamese toasts (map the codes in
   docs/PROTOCOL.md + engine codes; unknown codes show the server message).
5. Home screen: the online buttons become active; hot-seat stays available.
6. vite.config.ts dev proxy: '/ws' -> ws://localhost:8080 (ws: true) so `pnpm dev` works with the server.
7. i18n: all new strings in vi.ts and en.ts.
Acceptance: pnpm --filter @hexgame/client typecheck and build exit 0. Then a short real check (< 3 min,
stop everything by its own PID): build the client, start the server with
"PORT=8099 DATA_DIR=<a temp dir> pnpm --filter @hexgame/server start", and with a small node script using
the 'ws' package (in packages/server) connect 3 fake clients through the real protocol to confirm the room
flow still matches what the UI sends (create, join, ready, start, one action). Paste results.
Final report < 40 lines.
