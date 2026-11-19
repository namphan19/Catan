#!/usr/bin/env bash
# run-role.sh with automatic retry when the agent dies mid-task (e.g. "Error: Transport").
# Usage: scripts/run-role-retry.sh <role> "<task>"
# Env:   MAX_ATTEMPTS (default 3), plus everything run-role.sh / opencode-sub.sh accept.
#
# run-role.sh prints a final "log: <path>" line only when the agent finished normally, so a
# missing "log:" line (or a Transport / standalone-server error) means the run crashed.
# Retries tell the agent to inspect existing files and finish only what is missing.
set -uo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <role> \"<task>\"" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
role="$1"; shift
task="$*"
max="${MAX_ATTEMPTS:-3}"
resume_note="NOTE: a previous attempt of this task crashed part-way (connection error). Some required files may already exist and be complete. First inspect what exists and what is still missing, do NOT redo or overwrite finished good work, then finish only the remaining items and give the final report covering the WHOLE task."

for attempt in $(seq 1 "$max"); do
  if [ "$attempt" -eq 1 ]; then
    prompt="$task"
  else
    prompt="$resume_note

$task"
    echo "=== retry $attempt/$max for role $role ===" >&2
    sleep 20   # let the failed standalone server shut down before starting another
  fi

  out="$(mktemp)"
  bash "$root/scripts/run-role.sh" "$role" "$prompt" 2>&1 | tee "$out"
  if grep -q "^log: " "$out" && ! tail -n 5 "$out" | grep -qE "Error: .*(Transport|Standalone server exited)"; then
    rm -f "$out"
    exit 0
  fi
  rm -f "$out"
  echo "=== attempt $attempt/$max for role $role did not finish cleanly ===" >&2
done

echo "=== role $role gave up after $max attempts ===" >&2
exit 1
