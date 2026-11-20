# Task: make the server easy to self-host

Only write in: packages/server/ and the root package.json "scripts" section (add scripts only, change nothing else).
1. Env config (document defaults in packages/server/README.md): PORT (8080), HOST (0.0.0.0), DATA_DIR,
   CLIENT_DIST, MAX_CONNECTIONS (200), MAX_CONNECTIONS_PER_IP (10), TRUST_PROXY (default off; when "1",
   take the client IP from the first X-Forwarded-For entry - only for running behind a reverse proxy).
   Validate values at startup; print one clear line per bad value and exit 1.
2. Root scripts: "build" -> builds the client (pnpm --filter @hexgame/client build); "start" -> runs the
   server (pnpm --filter @hexgame/server start). Server start prints the URLs it listens on, including every
   non-internal IPv4 address of the machine (os.networkInterfaces) so the host can share the LAN link.
3. If CLIENT_DIST does not exist at start, print "Run pnpm build first" and exit 1.
4. Graceful shutdown on SIGINT/SIGTERM: stop accepting, persist all rooms, close sockets, exit 0.
5. Tests for env validation, TRUST_PROXY IP extraction, missing dist. Keep all existing tests green.
Acceptance: pnpm --filter @hexgame/server typecheck + test exit 0 (paste); a manual check: pnpm build, then
PORT=8097 DATA_DIR=<temp> pnpm start in the background, curl http://localhost:8097/ -> 200 with <title>Boschtan,
then stop it by its own PID. Final report < 30 lines.
