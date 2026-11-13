#!/usr/bin/env bash
# Run Claude Code (`claude -p`) against the custom Anthropic-compatible endpoint as a non-interactive "subagent"
# (sibling of opencode-sub.sh / copilot-sub.sh).
# Usage: scripts/claude-sub.sh "<task prompt>"
# Config: ~/.config/agent-team/claude.env (OUTSIDE the repo; ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL).
#         The token is a secret: never print it, never copy it into the repo, prompts, logs or task files.
# Env:   CL_ENV=<file>        config file (default ~/.config/agent-team/claude.env)
#        CL_MODEL=<model>     default: ANTHROPIC_MODEL from the config file
#        CL_EFFORT=<level>    passed as --effort when set
#        CL_DIR=<path>        working directory; file tools may only touch it (+ CL_ADD_DIRS)
#        CL_ADD_DIRS="a b"    extra directories the agent may access
#        CL_READONLY=1        no Edit/Write tools (review roles)
#        CL_TIMEOUT=<sec>     hard timeout (default 900)
#        CL_DRYRUN=1          print the command (without secrets) and exit (used by tests)
#
# Gotchas (each one cost time on dated):
#  - The machine's environment has a lowercase no_proxy that lists the endpoint domain, so Claude Code would skip the proxy for
#    the endpoint (host of ANTHROPIC_BASE_URL) and fail with "Connection error" (no direct DNS). We
#    override BOTH the upper- and lowercase variables.
#  - --bare skips hooks, plugins, MCP servers and CLAUDE.md discovery: without it `claude -p` hangs on MCP startup.
#    The role prompt already carries the rules, so nothing is lost. --bare authenticates with ANTHROPIC_API_KEY,
#    so the token is exported under that name too.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 \"<task prompt>\"" >&2
  exit 2
fi

envfile="${CL_ENV:-$HOME/.config/agent-team/claude.env}"
if [ ! -f "$envfile" ]; then
  echo "missing $envfile (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL)" >&2
  exit 2
fi
set -a; . "$envfile"; set +a
export ANTHROPIC_API_KEY="${ANTHROPIC_AUTH_TOKEN:?no ANTHROPIC_AUTH_TOKEN in $envfile}"
export CLAUDE_CODE_SKIP_AUTH_LOGIN=true

export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128
export http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY
export NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1

if [ "${CL_READONLY:-0}" = "1" ]; then
  allowed="Read Glob Grep Bash"; denied=(Edit Write NotebookEdit)
else
  allowed="Read Glob Grep Bash Edit Write"; denied=()
fi
# Deny rules win over allow rules: same guard list as copilot-sub.sh (no process killing by name, no secret files).
denied+=('Bash(taskkill:*)' 'Bash(pkill:*)' 'Bash(killall:*)' 'Bash(kill:*)' 'Bash(Stop-Process:*)' 'Bash(wmic:*)'
         'Edit(**/.env)' 'Edit(**/llm.env)'
         'Read(**/.config/**)' 'Read(**/*.env)')

args=(-p --bare --model "${CL_MODEL:-${ANTHROPIC_MODEL:?set CL_MODEL or ANTHROPIC_MODEL}}"
      --permission-mode acceptEdits
      --allowedTools $allowed
      --disallowedTools "${denied[@]}")
[ -n "${CL_EFFORT:-}" ] && args+=(--effort "$CL_EFFORT")
for d in ${CL_ADD_DIRS:-}; do args+=(--add-dir "$d"); done

if [ "${CL_DRYRUN:-0}" = "1" ]; then
  printf 'claude'; printf ' %q' "${args[@]}"; printf ' <prompt via stdin>\n'
  exit 0
fi

cd "${CL_DIR:-.}"
# Prompt via stdin: avoids Windows command-line limits and keeps it out of the process list.
printf '%s' "$*" | timeout "${CL_TIMEOUT:-900}" claude "${args[@]}"
