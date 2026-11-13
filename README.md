# agent-team-template

A reusable setup where **Claude Code is the tech lead** and **free opencode agents are the dev team**
(game-engine, frontend, bot-ai, backend, artist, qa, reviewer).

## Use it for a new project

```bash
cp -r agent-team-template my-new-project        # or: git clone, then delete .git and `git init`
cd my-new-project
cp docs/PLAN.template.md docs/PLAN.md           # fill in goal, scope, architecture, ownership
$EDITOR team/ROLES.md                           # add/remove/adjust roles for this project
# dashboard: run the standalone agent hub once per machine and add this repo to
# ~/.config/agent-workflow/projects.json (see the agent-hub README); http://127.0.0.1:8765
claude                                          # CLAUDE.md is loaded automatically
# inside the session the lead starts the self-healing watcher in the background:  python -I tools/autoheal.py
```

Then tell Claude the goal; it plans, launches roles, reviews output and integrates.

## Layout

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Rules for Claude: proxy usage, calling opencode, parallel-agent rules, safety |
| `team/ROLES.md` | Role prompts (`## ROLE: <name>`) + common rules shared by all agents |
| `docs/PLAN.template.md` | Plan skeleton: goal, scope, architecture, ownership, gates, risks, status / as-built notes |
| `docs/ACCEPTANCE.template.md` | Acceptance-report skeleton: verified results, manual charters, known limitations, bugs found, deferred backlog |
| `scripts/opencode-sub.sh` | Calls `opencode run --standalone` with the proxy set |
| `scripts/run-role.sh` | Builds role prompt + task, runs it, logs to `team/logs/` |
| `scripts/launch.sh` | Background launch of an inline task with log dir creation, stagger and start check (prefer `dispatch.sh`: it stores the task so the agent can be resumed) |
| `scripts/run-role-retry.sh` | `run-role.sh` + automatic retry when an agent dies mid-task (`Error: Transport`) |
| `scripts/dispatch.sh` | Launch/resume a role from `team/tasks/<role>.md` with guards (not already running) |
| `tools/health.py` | Free health check (processes, logs, workflow); `autoheal.py` builds on it (`--watch` is the older notify-only mode) |
| `tools/autoheal.py` | Self-healing watcher: auto-resumes crashed agents, kills + resumes hung ones (max 2 heals per task), wakes the lead only for decisions |
| `tools/jobrunner.py` + `scripts/job-submit.sh` | Detached runner for long jobs: agents submit and end their turn, the runner restarts them when the job ends |
| `team/role-engines.conf`, `team/ENGINES.md` | Engine per role (opencode by default, optional GitHub Copilot CLI) and the rules for each |
| `scripts/copilot-sub.sh`, `scripts/run-role(-retry)-copilot.sh` | Copilot CLI engine: wrapper with deny rules and path limits, role runner, retry |
| `scripts/claude-sub.sh`, `scripts/run-role(-retry)-claude.sh` | Claude Code engine for a custom Anthropic-compatible endpoint (config outside the repo) |
| (dashboard) | Not in the project any more: the standalone agent hub shows every registered project |
| `tools/wf.py` | CLI the tech lead uses to publish phases/tasks/status to `team/workflow.json` |
| `tests/test_autoheal_jobs.py` | Tests for the autoheal decisions and a real job-runner daemon (`python -m pytest tests -q`, needs pytest and Git Bash) |

## Prerequisites

- `opencode` CLI on PATH, bash (Git Bash on Windows), `timeout`, `awk`, Python 3.10+ (stdlib only; `pytest` just for the tests).
- Windows: the tools launch Git Bash explicitly (`jobrunner.BASH`); a bare `bash` from Python would resolve to WSL. Set `BASH_EXE` to override.
- Local proxy at `http://127.0.0.1:3128` (override with `HTTP_PROXY`/`HTTPS_PROXY`), required
  because this environment has no direct internet. If yours does, the proxy lines are harmless;
  if not, edit the defaults in `scripts/opencode-sub.sh` and the proxy sections in `CLAUDE.md`
  and `team/ROLES.md`.

## Smoke test

```bash
scripts/opencode-sub.sh "Reply with exactly: OK"
```

## Known limits

- Free models are weaker: treat all agent output as a draft and verify it.
- Parallel `--standalone` launches must be staggered (see `CLAUDE.md`).
- Roles in `team/ROLES.md` are generic; tighten them per project.
