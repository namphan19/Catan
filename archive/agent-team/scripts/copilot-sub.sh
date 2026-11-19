#!/usr/bin/env bash
# Run GitHub Copilot CLI as a non-interactive "subagent" (sibling of opencode-sub.sh).
# Usage: scripts/copilot-sub.sh "<task prompt>"
# Env:   CP_MODEL=<model|auto>   Copilot model (default: auto = Copilot picks)
#        CP_EFFORT=<level>       none|minimal|low|medium|high|xhigh|max. Unset by default: model "auto" rejects it
#                                (verified 2026-10-09), so set it only together with an explicit CP_MODEL.
#        CP_DIR=<path>           working directory; Copilot may read/write only inside it (default: current dir)
#        CP_ADD_DIRS="a b"       extra directories the agent may access (space separated)
#        CP_READONLY=1           deny all file-write tools (review roles)
#        CP_TIMEOUT=<seconds>    hard timeout (default: 900)
#        CP_DRYRUN=1             print the command and exit (used by tests)
#
# Safety (each one is a failure we already hit with opencode agents):
#  - Tools are auto-approved (required for -p) but DENY rules win: no process killing by name, no writes to
#    .env / llm.env.
#  - File access is limited to CP_DIR (+ CP_ADD_DIRS + the temp dir) by Copilot's own path check; we never pass
#    --allow-all-paths / --yolo.
#  - Key-like environment variables are stripped from shell/MCP environments and redacted from output.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 \"<task prompt>\"" >&2
  exit 2
fi

# The machine reaches the internet only through the local proxy.
export HTTP_PROXY="${HTTP_PROXY:-http://127.0.0.1:3128}"
export HTTPS_PROXY="${HTTPS_PROXY:-http://127.0.0.1:3128}"
export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,::1}"

args=(-p "$*" -s
      --model "${CP_MODEL:-auto}"
      --allow-all-tools
      --secret-env-vars=LLM_API_KEY,OPENAI_API_KEY,ANTHROPIC_API_KEY,GITHUB_TOKEN,GH_TOKEN)
[ -n "${CP_EFFORT:-}" ] && args+=(--reasoning-effort "$CP_EFFORT")

# Deny rules take precedence over --allow-all-tools.
for pat in 'shell(taskkill)' 'shell(pkill)' 'shell(killall)' 'shell(kill)' 'shell(Stop-Process)' \
           'shell(wmic)' 'write(.env)' 'write(llm.env)'; do
  args+=(--deny-tool "$pat")
done
[ "${CP_READONLY:-0}" = "1" ] && args+=(--deny-tool write)

args+=(-C "${CP_DIR:-.}")
for d in ${CP_ADD_DIRS:-}; do args+=(--add-dir "$d"); done

if [ "${CP_DRYRUN:-0}" = "1" ]; then
  printf 'copilot'; printf ' %q' "${args[@]}"; printf '\n'
  exit 0
fi

timeout "${CP_TIMEOUT:-900}" copilot "${args[@]}"
