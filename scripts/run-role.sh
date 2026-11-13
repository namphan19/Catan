#!/usr/bin/env bash
# Run one team role as an opencode agent.
# Usage: scripts/run-role.sh <role> "<task>"
# Env:   same as opencode-sub.sh (OC_MODEL, OC_AUTO, OC_TIMEOUT). OC_AUTO defaults to 1 here;
#        set OC_AUTO=0 for read-only roles (e.g. reviewer).
# Output: printed and also saved to team/logs/<role>-<timestamp>.md
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

export OC_DIR="${OC_DIR:-$root}"
export OC_AUTO="${OC_AUTO:-1}"
export OC_TIMEOUT="${OC_TIMEOUT:-900}"

"$root/scripts/opencode-sub.sh" "$prompt" 2>&1 | tee "$log"
echo "log: $log" >&2
