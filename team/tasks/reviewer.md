# Task: security + correctness review of the online server (read-only)

Do NOT modify any file. Contract: docs/PROTOCOL.md. Code: packages/server/src/*.ts (main, rooms, protocol,
store, limits) and packages/server/test/*.ts. Engine API: docs/API.md. Read by line ranges.
The server will be self-hosted by the PO on a company network for colleagues (no internet exposure planned,
but treat every client as untrusted).
Check and report (severity high/medium/low, file:line, scenario, fix):
1. Hidden information: can any client ever receive another seat's hand/cards, the seed, rng state, the deck
   order, a raw GameState, or another player's session token or its hash? (check every send path, room
   messages, error messages, persistence files exposed via the static server?)
2. Authorization: acting for another seat, joining a full/started room, host-only actions, reclaiming a seat
   without the right token, token guessing (entropy, comparison), session fixation across rooms.
3. Input validation: every message field bounded and typed; JSON parse errors; huge/deep payloads;
   prototype pollution (__proto__ keys in bags/actions); unknown message types.
4. Static file server: path traversal (encoded ../, backslashes on Windows, null bytes), serving files
   outside CLIENT_DIST, data/rooms leakage, content types, caching.
5. Robustness/DoS: rate limit bypass via many connections, room cap, idle sweep, memory growth, unhandled
   promise rejections or exceptions that crash the process, corrupt persistence file on load.
6. Randomness: room codes, tokens and game seeds must come from crypto, not Math.random.
7. Protocol conformance with docs/PROTOCOL.md (message shapes, ordering events-then-state, heartbeat).
You may run: pnpm --filter @hexgame/server test (about 30 s). Nothing long. Final report < 60 lines.
