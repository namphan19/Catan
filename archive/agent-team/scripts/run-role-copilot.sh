#!/usr/bin/env bash
# Run one team role with GitHub Copilot CLI instead of opencode (same prompt as run-role.sh).
# Usage: scripts/run-role-copilot.sh <role> "<task>"
# Env:   CP_MODEL, CP_EFFORT, CP_ADD_DIRS, CP_TIMEOUT (see copilot-sub.sh). CP_READONLY is set to 1 for the
#        reviewer role. CP_DIR defaults to the repo root.
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

export CP_DIR="${CP_DIR:-$root}"
export CP_TIMEOUT="${CP_TIMEOUT:-2400}"   # 900 s was too short: a qa run that ends with run_all.sh timed out 3 times (2026-10-09)
[ "$role" = "reviewer" ] && export CP_READONLY=1

"$root/scripts/copilot-sub.sh" "$prompt" 2>&1 | tee "$log"
echo "log: $log" >&2
