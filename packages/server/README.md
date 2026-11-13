# @hexgame/server

Authoritative WebSocket server for Boschtan: serves the built client (static
files) and the game WebSocket endpoint on one port. Self-hosting guide.

## Quick start

From the repo root:

```sh
pnpm install
pnpm build     # builds the client bundle into packages/client/dist
pnpm start     # starts the server (packages/server)
```

The startup log prints the URL to open locally and one URL per network
interface, so you can share the LAN link with your players:

```
[server] listening on:
[server]   local:   http://localhost:8080/
[server]   network: http://192.168.1.23:8080/
```

Stopping the server with Ctrl+C (SIGINT) or SIGTERM shuts down gracefully:
it stops accepting new connections, persists all started rooms, closes the
sockets and exits 0. Rooms are reloaded on the next start.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | TCP port to listen on (integer 1-65535). |
| `HOST` | `0.0.0.0` | Bind address. `0.0.0.0` listens on all interfaces (LAN included). |
| `DATA_DIR` | `<repo>/data/rooms` | Directory for persisted room files (created if missing). |
| `CLIENT_DIST` | `<repo>/packages/client/dist` | Directory with the built client. |
| `MAX_CONNECTIONS` | `200` | Max concurrent WebSocket connections, server-wide. |
| `MAX_CONNECTIONS_PER_IP` | `10` | Max concurrent WebSocket connections per client IP. |
| `TRUST_PROXY` | off (`0`) | Only for running behind a reverse proxy you control. With `1`, the client IP is taken from the first `X-Forwarded-For` entry. |

All values are validated at startup. Every bad value prints one clear line
and the process exits with code 1, for example:

```
[server] Invalid PORT "abc": must be an integer between 1 and 65535.
[server] Invalid TRUST_PROXY "yes": use 1 (behind a reverse proxy) or 0 (default).
```

If `CLIENT_DIST` does not exist at start (you skipped `pnpm build`), the
server prints `Run pnpm build first` and exits 1.

### About TRUST_PROXY

Direct clients can send any `X-Forwarded-For` header they like, so enabling
`TRUST_PROXY` without a proxy would let a client forge its IP and dodge the
per-IP connection limit. Enable it **only** when the server is only reachable
through your reverse proxy, and have the proxy overwrite the header.
