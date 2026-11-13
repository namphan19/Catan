# <Project name> - Tech Lead Plan

Owner (PO): <name>. Tech lead: Claude. Workers: opencode agents per role in `team/ROLES.md`.
Copy this file to `docs/PLAN.md` and fill every <placeholder>. Agents read it first.

## 1. Goal
<One paragraph: what we build and why, who the users are.>

## 2. Scope (MVP) and out of scope
| Area | MVP deliverable |
|---|---|
| <area> | <deliverable> |

Out of scope: <list>

## 3. Architecture
```
<dir>/   <what lives here>
```
Contract-first: `docs/API.md` is written before backend/frontend start.

## 4. Team and ownership (one owner per directory!)
| Role | Owns (directories) |
|---|---|
| lead (Claude) | docs/ (RULES.md, API.md, backlog, acceptance criteria, reviews) |
| game-engine | engine/ |
| frontend | web/ |
| bot-ai | bots/ |
| backend | server/ (only if online multiplayer is in scope) |
| artist | assets/ |
| qa | tests/ (except infra tests), docs/qa/ |
| reviewer | read-only |

## 5. Phases and quality gates
0. Foundation  1. Discovery  2. Build  3. Integrate + QA  4. Demo
Quality gate for "done": <measurable criteria, e.g. tests pass, metric >= X>.

## 6. Risks
- <risk> -> <mitigation>
- Agent infrastructure: crashes, hangs and long jobs -> `tools/autoheal.py` and the job runner (see CLAUDE.md).

## 7. Status and as-built notes (update at the end of every phase)
Status: <phase, what is done>. Where the build differs from this plan, say so next to the original text
("As built: ...") instead of rewriting it, so the plan stays auditable. Final results go in `docs/ACCEPTANCE.md`.
