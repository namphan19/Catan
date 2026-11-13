# Task: fix the server security review findings

Only write in: packages/server/. Contract (updated by the lead): docs/PROTOCOL.md - read it again
(kick message, token shape, seat take-over, connection caps, rename on hello).
The full review is in team/logs/_reviewer.out (section "## Medium" onwards) - read it by line range.
Fix every finding, each with a test:
1. Seat reclaim while a live connection holds it: the new connection wins, old one closed (SEAT_TAKEN_OVER).
2. Only server-issued token shape (exactly 22 base64url chars) is honoured; others -> new token.
3. Failed joinRoom budget (10 per connection -> close); connection caps 200 total / 10 per IP in the upgrade
   handler (HTTP 503); host-only `kick` in the lobby per PROTOCOL.md.
4. try/catch around every room in sweep() and around every timer callback; log and continue.
5. (covered by 3) global connection cap.
6. Validate persisted rooms on load (code regex, seats length = playerCount 3-6, shapes); skip invalid files.
7. IMPERSONATION reply must not echo client input.
8. Cap JSON nesting depth (e.g. 20) in parseClientMessage -> error BAD_MESSAGE.
9. Static: Cache-Control "public, max-age=31536000, immutable" for hashed /assets/ bundle files and
   no-cache for index.html; X-Content-Type-Options: nosniff on every response; a CSP header on SVG responses
   ("default-src 'none'; style-src 'unsafe-inline'").
10. Repeated hello renames (lobby + game seat name), per PROTOCOL.md.
Also: add tests for the static handler (traversal variants incl. %5c and ..%2f, content types, SPA fallback),
corrupt persistence files, duplicate-token connections, weak tokens, ping/pong timeout (fake timers).
Delete the scratch files packages/server/test/debug-one.mts and packages/server/test/measure.mts.
Acceptance: pnpm --filter @hexgame/server typecheck and test exit 0 (paste summaries, run the suite twice).
No server left running. Final report < 40 lines.
