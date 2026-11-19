#!/usr/bin/env bash
# Launch one team role in the background and VERIFY it started.
# Usage: scripts/launch.sh <role> "<task>"
# Encodes the lessons from CLAUDE.md: create log dir first, stagger launches, confirm start.
# Env: LAUNCH_GAP (seconds to wait before returning; default 40, also acts as the stagger gap)
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <role> \"<task>\"" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
role="$1"; shift
mkdir -p "$root/team/logs"
out="$root/team/logs/_${role}.out"

nohup bash "$root/scripts/run-role.sh" "$role" "$*" > "$out" 2>&1 &
pid=$!

sleep "${LAUNCH_GAP:-40}"

if grep -q "Standalone server exited" "$out" 2>/dev/null; then
  echo "FAILED to start: $role (standalone server error). Wait and relaunch." >&2
  tail -n 3 "$out" >&2
  exit 1
fi
if ! kill -0 "$pid" 2>/dev/null && ! grep -q "^log:" "$out"; then
  echo "FAILED: $role exited early. See $out" >&2
  tail -n 5 "$out" >&2
  exit 1
fi
echo "started: $role (pid $pid) - log: $out"
