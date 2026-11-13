# Agent engines

A worker role runs on one engine, chosen per role in `team/role-engines.conf`. `scripts/dispatch.sh` reads it
and launches `run-role-retry.sh` (opencode) or `run-role-retry-copilot.sh` (Copilot CLI). Task files, the task
board, autoheal and the dashboard work the same for both; `tools/health.py` recognises both launchers.

| | opencode (default) | GitHub Copilot CLI |
| --- | --- | --- |
| Wrapper | `scripts/opencode-sub.sh` | `scripts/copilot-sub.sh` |
| Model | `team/role-models.conf` | `role-engines.conf` (`copilot:<model>:<effort>`) |
| Cost | free or cheap models | paid credits, monthly quota |
| Typical issue | drops long sessions (`Error: Transport`) | quota runs out; long runs hit the wrapper timeout |
| File access | whatever the agent runs | limited to `CP_DIR` + `CP_ADD_DIRS` + temp by Copilot's own path check |
| Permissions | auto-approve everything | auto-approve, but deny rules win (no kill commands, no writes to key files) |

## Rules

1. Test each engine once with a trivial prompt (and the proxy, if you need one) before giving it a role.
2. Copilot sends the prompt and every file it reads to GitHub. A Copilot role must not read data or secrets
   your organisation has not cleared for that service; restrict it with `CP_DIR`/`CP_ADD_DIRS` where you can.
3. `copilot-sub.sh` never passes `--allow-all-paths` or `--yolo`; the reviewer runs with `CP_READONLY=1`.
4. A quota error is not retryable: switch the role back to opencode in `role-engines.conf` and resume.
5. Output is a draft on every engine: read the files, re-run the tests, check live.

## Suggested start

Cheap engine for every role; move the reviewer to the strong engine first (read-only, easy to judge), then the
role whose code quality hurts most, if the review results justify the credits.

Tests without any paid call: `tests/test_copilot_engine.py` (wrapper flags, dispatch routing, health detection).

## Engine `claude` (custom Anthropic-compatible endpoint)
`role=claude[:model[:effort]]` in `team/role-engines.conf` -> `dispatch.sh` launches `run-role-retry-claude.sh` ->
`run-role-claude.sh` -> `claude-sub.sh` (`claude -p --bare`). Config lives outside the repo in
`~/.config/agent-team/claude.env` (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`); the token is a
secret: never print it or copy it into the repo, prompts, logs or task files.
- If the shell has a lowercase `no_proxy` that lists the endpoint's domain, Claude Code bypasses the proxy and fails with
  "Connection error". The wrapper overrides upper- and lowercase proxy variables (edit them if your network differs).
- Without `--bare`, `claude -p` can hang on MCP/plugin startup. `--bare` also skips CLAUDE.md, so the role prompt carries the rules.
- Guards: tools Read/Glob/Grep/Bash/Edit/Write; `CL_READONLY=1` (reviewer) removes Edit/Write; deny rules for process
  killing by name, `.env`, `llm.env`, `.config`. File tools are limited to `CL_DIR` (+ `CL_ADD_DIRS`).
- Output is a draft like any other agent output.
