#!/usr/bin/env bash
# Run one team role with Claude Code (custom endpoint) instead of opencode (same prompt as run-role.sh).
# Usage: scripts/run-role-claude.sh <role> "<task>"
# Env:   CL_MODEL, CL_EFFORT, CL_ADD_DIRS, CL_TIMEOUT (see claude-sub.sh). CL_READONLY is set to 1 for the
#        reviewer role. CL_DIR defaults to the repo root.
# Output: printed and also saved to team/logs/<role>-<timestamp>.md; a final "log: <path>" line marks a normal finish
#         (the retry wrapper relies on it, exactly like run-role.sh).
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <role> \"<task>\"" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
role="$1"; shift
task="$*"

section="$(awk -v r="$role" '
  /^## ROLE: / { on = ($0 == "## ROLE: " r) ; next }
  /^## / { on = 0 }
  on { print }' "$root/team/ROLES.md")"
common="$(awk '/^## COMMON/{on=1;next} /^## /{on=0} on{print}' "$root/team/ROLES.md")"

if [ -z "$section" ]; then
  echo "unknown role: $role" >&2
  exit 2
fi

mkdir -p "$root/team/logs"
log="$root/team/logs/${role}-$(date +%Y%m%d-%H%M%S).md"

prompt="$(printf '%s\n\n%s\n\nCOMMON RULES:\n%s\n\nTASK:\n%s\n' \
  "You are acting as: $role" "$section" "$common" "$task")"

export CL_DIR="${CL_DIR:-$root}"
export CL_TIMEOUT="${CL_TIMEOUT:-2400}"   # 900 s was too short: a qa run that ends with run_all.sh timed out 3 times (2026-10-09)
[ "$role" = "reviewer" ] && export CL_READONLY=1

"$root/scripts/claude-sub.sh" "$prompt" 2>&1 | tee "$log"
echo "log: $log" >&2
