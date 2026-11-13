# Boschtan online protocol (M2) - contract

Self-hosted by the PO for colleagues: ONE Node process serves the built client (static files) and the
WebSocket endpoint on the same port. `pnpm start` (default port 8080, env PORT). No accounts: a player
picks a display name and joins a room by its code. The server is authoritative and only ever sends
redacted data (getPlayerView / getEventsView).

## Transport
- WebSocket at `/ws`, JSON text frames, max frame 64 KB (larger -> close 1009).
- Every client message: `{ "type": ..., "reqId"?: string, ... }`. Errors reply `{ type: "error", reqId?,
  code, message }`; error messages are plain English, the client translates by code.
- Heartbeat: server pings every 20 s; connections without pong for 60 s are closed (seat stays reserved).

## Identity and reconnect
- On first `hello` the server returns a random `sessionToken` (128-bit, exactly 22 base64url chars). A `hello`
  with any other token shape is treated as a new session (a fresh token is issued). The client stores it
  in localStorage and sends it in later `hello`s; the same token gets the same seat back after a reload
  or network drop. Tokens are room-scoped and never shown to other players. If a token reclaims a seat that already has a
  live connection, the NEW connection wins and the old one is closed with code SEAT_TAKEN_OVER.
- A repeated `hello` on an open connection renames the player (lobby and game).

## Client -> server
| type | fields | when |
|---|---|---|
| hello | name (1-24 chars), sessionToken? | first message on every connection |
| createRoom | playerCount 3-6, options? { largeTableMode?, vpToWin? } | lobby; creator becomes host |
| joinRoom | code (5 chars A-Z0-9 without O/0/I/1) | lobby |
| leaveRoom | - | lobby (before start); after start the seat is kept for reconnect |
| setReady | ready: boolean | lobby |
| startGame | - | host only, all seats filled and ready |
| kick | seat | host only, lobby only (before start): frees that seat and closes its connection with code KICKED |
| action | action: Action (engine format; `player` must equal the sender's seat) | in game |
| requestState | - | after reconnect / when the client is unsure |

## Server -> client
| type | fields |
|---|---|
| welcome | sessionToken, name |
| room | code, hostSeat, playerCount, options, seats: [{ seat: "p1".., name, connected, ready }], you: seat or null, started |
| state | view: PlayerView (getPlayerView for the receiver), legal: Action[] (getLegalActions for the receiver), seq (log length) |
| events | events: GameEvent[] (getEventsView for the receiver), seq |
| error | reqId?, code, message |

After every applied action the server sends each connected seat `events` then `state` (both redacted for
that seat). Spectators are out of scope.

## Server rules
- Validate every `action` with the engine; reject `player` != sender seat with code IMPERSONATION.
- Rate limit: max 20 messages/s per connection (excess -> error RATE_LIMIT, 100 in a row -> close).
- Connections: max 200 total and 10 per IP (excess upgrade -> HTTP 503). 10 failed joinRoom on one
  connection -> close.
- Rooms: max 50 concurrent rooms; a room with no connected player for 30 min is deleted.
- Persistence: each room's `{ init, actions, seats(names, token hashes) }` is saved to
  `data/rooms/<code>.json` after every action (atomic write: temp file + rename) and reloaded with
  `replay()` on server start, so a server restart does not lose games. Token hashes are SHA-256, never
  the raw token. `data/` is git-ignored.
- Seats: the engine seat ids p1..pN map to joined players in join order; the engine draws the first
  player (D1).
- Logging: one line per room event to stdout (no hands, no tokens).
