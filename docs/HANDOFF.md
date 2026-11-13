# Boschtan - handoff (2026-11-13)

For: the next tech lead session (Claude) or any developer picking this up. Read this first, then
`CLAUDE.md` (team workflow) and `docs/PLAN.md`.

## 1. What this is
Boschtan: an original web board game (hex-tile settlement/trading genre, own name, own medieval art) for
3-6 players, self-hosted by the PO for colleagues on the company network. Private, non-commercial.
Mechanics follow the PO's official rulebooks in `docs/*.pdf` (git-ignored, never commit or quote them);
our own rules text is `docs/RULES.md`. Never reuse names, text, art or look of the commercial game.

## 2. State: what works (all committed on `master`, 28 commits)
| Part | Where | Status | Tests |
|---|---|---|---|
| Rules engine (base game + 5-6 players, paired players default, extra build optional) | packages/engine | done | 161 vitest + fuzzer (50 games, 79k actions OK) |
| Online server (rooms, lobby, kick, reconnect, persistence + replay, limits, static hosting) | packages/server | done, security-reviewed, 10 findings fixed | 70 vitest |
| Web client (hot-seat + online, Vietnamese default, 2D SVG + 3D three.js toggle) | packages/client | done | 11 Playwright e2e (desktop, tablet, 3D) in packages/e2e |
| Original art (56 SVG + OFL fonts) | packages/client/public/assets | done, PO approved | contract check |
| Hosting guide | docs/HOSTING.md | done | real start + curl verified |

Run: `pnpm install` / `pnpm test` / `pnpm typecheck` / `pnpm build` / `pnpm start` (port 8080) /
`pnpm dev` (client dev server) / `pnpm fuzz` / `pnpm --filter @hexgame/e2e exec playwright test` (~2 min).

## 3. Key documents
| File | Content |
|---|---|
| docs/PLAN.md | goal, milestones, ownership, risks |
| docs/RULES.md + docs/RULES_DECISIONS.md | our rules; D1-D21 with source page and status |
| docs/research/rules-check.md | comparison of our rules vs the official base and 5-6 rulebooks |
| docs/API.md, docs/BOARD.md | engine API + ruleset hook pipeline; axial coordinates |
| docs/PROTOCOL.md | client/server WebSocket contract |
| docs/UI.md | art direction, tokens, asset contract, UX rules |
| docs/HOSTING.md | how the PO hosts it (Vietnamese) |
| docs/qa/ | test plan, bugs, fuzz results, UI smoke report, screenshots (2D, tablet, 3d) |

## 4. PO decisions to respect
- Web only, no bots, no other platforms. Online play for colleagues is the main use; hot-seat for testing.
- Vietnamese is the default language (English toggle). Medieval style with our own art.
- Game title "Boschtan"; resource names timber/clay/fiber/grain/stone (Gỗ, Đất sét, Len, Lúa, Đá).
- Follow the 4 official rulebooks where they speak; house rules are logged as such (D16 random tokens).
- D18 discards public, D19 harvest blocked on an empty bank (PO-confirmed). D20 changed to counteroffers
  after the rulebook check.
- Delegate work to the opencode team; the lead plans, reviews and accepts. Internet only via the proxy.
- **Never use free opencode models** (`*-free`). Tiers in team/model-tiers.conf now map to paid Go models.

## 5. Open items / backlog
1. PO playtest with colleagues; collect feedback and bugs.
2. M3: the advanced expansion (Cities & Knights mechanics, incl. its 5-6 rulebook) as a separate ruleset
   module via the hooks in docs/API.md. Prepared task: team/tasks/researcher-advanced.md (mechanics
   summary from the extracted rulebook text). Then: lead plan -> PO approval -> game-engine / frontend /
   artist. Extracted texts live in data/raw/rules/*.txt (git-ignored; regenerate with pypdf if missing).
3. 3D: emblems are small at full-board zoom; overview camera is near top-down. Possible follow-ups:
   dice roll animation, resource fly-to-hand, sound (off by default).
4. Rename packages @hexgame/* -> @boschtan/* (cosmetic, internal only).
5. Engine speed ~3 ms/action (JSON clone + full legal scan); fine for humans.
6. No reviewer pass yet on the client code (engine and server were reviewed).
7. The dashboard still lists a few early tasks as todo (dev items superseded by later tasks); clean up with
   `python tools/wf.py set <id> done` after checking.

## 6. Team / infra notes (gotchas seen this session)
- Dashboard: agent hub at http://127.0.0.1:8765 (project "Catan Game"). Start `python -I tools/autoheal.py`
  in the background each session; it exits with a JSON report when the lead must act (usually
  `done_not_marked` -> verify the output, then `wf.py set <id> done`).
- Launch agents only with `scripts/dispatch.sh <role> team/tasks/<role>.md` (task file first). Agents
  started inline (opencode-sub.sh directly) are invisible to autoheal and showed up as false "crashed".
- Roles: game-engine, frontend, backend, artist, qa, reviewer (OC_AUTO=0), researcher. Model per role in
  team/role-models.conf; reset to `default` after a complex task. complex-alt (deepseek Go) costs x2 on
  weekdays 08-11 and 13-17 Vietnam time.
- Agents' final reports are drafts: every acceptance above was re-run by the lead (tests, builds, e2e,
  screenshots read). Keep doing that.
- No Chrome on this machine: visual checks go through the Playwright Chromium (`packages/e2e`, SwiftShader
  for 3D); screenshots land in docs/qa/screenshots/.
- Shell: long multi-file bash heredocs sometimes fail in this harness ("unexpected EOF") - write files with
  the Write tool or one heredoc per command. A local "fact-forcing" hook blocks the first Write of every new
  file once; state importers/purpose and retry.
- Ports used in tests: 4398 (e2e preview), ephemeral for server tests. Stop servers only by PID.
