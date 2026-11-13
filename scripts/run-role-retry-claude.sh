#!/usr/bin/env bash
# run-role-claude.sh with automatic retry when the agent dies mid-task (copy of run-role-retry.sh for the
# Claude engine; kept as a separate file because run-role-retry.sh must not be edited while opencode agents run).
# Usage: scripts/run-role-retry-claude.sh <role> "<task>"
# Env:   MAX_ATTEMPTS (default 3), plus everything run-role-claude.sh / claude-sub.sh accept.
#
# run-role-claude.sh prints a final "log: <path>" line only when the agent finished normally, so a missing
# "log:" line (timeout, auth/network error, non-zero exit) means the run crashed.
set -uo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <role> \"<task>\"" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
role="$1"; shift
task="$*"
max="${MAX_ATTEMPTS:-3}"
resume_note="NOTE: a previous attempt of this task crashed part-way (connection error or timeout). Some required files may already exist and be complete. First inspect what exists and what is still missing, do NOT redo or overwrite finished good work, then finish only the remaining items and give the final report covering the WHOLE task."

for attempt in $(seq 1 "$max"); do
  if [ "$attempt" -eq 1 ]; then
    prompt="$task"
  else
    prompt="$resume_note

$task"
    echo "=== retry $attempt/$max for role $role ===" >&2
    sleep 10
  fi

  out="$(mktemp)"
  bash "$root/scripts/run-role-claude.sh" "$role" "$prompt" 2>&1 | tee "$out"
  if grep -qE "Budget has been exceeded|API Error: 40[13]" "$out"; then
    echo "=== role $role stopped: the endpoint refused the key (budget exceeded / unauthorized); retrying cannot help ===" >&2
    rm -f "$out"; exit 3
  fi
  if grep -q "^log: " "$out" && ! tail -n 5 "$out" | grep -qiE "(Error: .*(not available|authenticat|login|rate limit|quota)|Budget has been exceeded|API Error: 4[0-9][0-9])"; then
    rm -f "$out"
    exit 0
  fi
  rm -f "$out"
  echo "=== attempt $attempt/$max for role $role did not finish cleanly ===" >&2
done

echo "=== role $role gave up after $max attempts ===" >&2
exit 1
