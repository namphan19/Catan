#!/usr/bin/env bash
# Launch (or resume) a team role in the background from a stored task file.
# Usage: scripts/dispatch.sh <role> <task-file> [--resume] [--hint "text"]
#   Env: TASK_ID=<id>  also sets that workflow task to "doing".  OC_TIMEOUT etc. pass through.
#
# Task files live in team/tasks/<role>.md so a crashed agent can be relaunched with the exact
# same task (--resume). Guard: refuses if the role is already running. Every launch is appended
# to team/dispatch.log.
set -uo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <role> <task-file> [--resume] [--hint \"text\"]" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
role="$1"; taskfile="$2"; shift 2
# The techlead runs through dispatch.sh when team/role-engines.conf has techlead=claude or techlead=opencode;
# otherwise it is a Claude Code Agent subagent started by the lead, never an opencode role.
if [ "$role" = "techlead" ] && ! grep -qE "^techlead=(claude|opencode)" "$root/team/role-engines.conf" 2>/dev/null; then
  echo "techlead is a Claude Code subagent, not an opencode role; to run it via dispatch.sh set techlead=claude (or techlead=opencode) in team/role-engines.conf" >&2; exit 2
fi
resume=0; hint=""
while [ $# -gt 0 ]; do
  case "$1" in
    --resume) resume=1 ;;
    --hint) hint="${2:-}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -f "$taskfile" ] || { echo "task file not found: $taskfile" >&2; exit 2; }
grep -q "^## ROLE: $role\$" "$root/team/ROLES.md" || { echo "unknown role: $role" >&2; exit 2; }

if python -I "$root/tools/health.py" --alive "$role"; then
  echo "REFUSED: $role is already running" >&2; exit 3
fi

mkdir -p "$root/team/logs" "$root/team/tasks"

prompt="$(cat "$taskfile")"
if [ -n "$hint" ]; then
  prompt="HINT FROM THE TECH LEAD (based on the previous failure): $hint

$prompt"
fi
if [ "$resume" = "1" ]; then
  prompt="NOTE: a previous attempt of this task crashed part-way. Some required files may already exist and be complete. First inspect what exists and what is still missing, do NOT redo or overwrite finished good work, then finish only the remaining items and give the final report covering the WHOLE task.

$prompt"
fi

[ -n "${TASK_ID:-}" ] && python -I "$root/tools/wf.py" set "$TASK_ID" doing "dispatched$([ "$resume" = 1 ] && echo ' (resume)')" >/dev/null

echo "$(date '+%F %T') role=$role resume=$resume hint=$([ -n "$hint" ] && echo yes || echo no) file=$taskfile" >> "$root/team/dispatch.log"

# Engine per role (team/role-engines.conf: role=engine[:model[:effort]]); a role that is not listed uses opencode.
engine="opencode"; retry_script="run-role-retry.sh"
if [ -f "$root/team/role-engines.conf" ]; then
  spec="$(grep -E "^${role}=" "$root/team/role-engines.conf" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]')"
  case "${spec%%:*}" in
    ""|opencode) ;;
    copilot)
      engine="copilot"; retry_script="run-role-retry-copilot.sh"
      rest="${spec#copilot}"; rest="${rest#:}"
      cp_model="${rest%%:*}"; cp_effort=""
      [ "$rest" != "$cp_model" ] && cp_effort="${rest#*:}"
      [ -n "$cp_model" ] && export CP_MODEL="$cp_model"
      [ -n "$cp_effort" ] && export CP_EFFORT="$cp_effort" ;;
    claude)
      engine="claude"; retry_script="run-role-retry-claude.sh"
      rest="${spec#claude}"; rest="${rest#:}"
      cl_model="${rest%%:*}"; cl_effort=""
      [ "$rest" != "$cl_model" ] && cl_effort="${rest#*:}"
      [ -n "$cl_model" ] && export CL_MODEL="$cl_model"
      [ -n "$cl_effort" ] && export CL_EFFORT="$cl_effort" ;;
    *) echo "unknown engine for $role in team/role-engines.conf: $spec" >&2; exit 2 ;;
  esac
fi

# Per-role opencode model (team/role-models.conf) unless the caller pinned OC_MODEL explicitly.
if [ "$engine" = "opencode" ] && [ -z "${OC_MODEL:-}" ] && [ -f "$root/team/role-models.conf" ]; then
  m="$(grep -E "^${role}=" "$root/team/role-models.conf" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]')"
  [ -n "$m" ] && export OC_MODEL="$m"
fi
echo "$(date '+%F %T') role=$role engine=$engine model=${OC_MODEL:-${CP_MODEL:-${CL_MODEL:-default}}}" >> "$root/team/dispatch.log"

cd "$root"
# Absolute script path: health.py/autoheal tell this project's agents from other projects' by it.
nohup bash "$root/scripts/$retry_script" "$role" "$prompt" > "team/logs/_${role}.out" 2>&1 &
sleep "${DISPATCH_GAP:-30}"
if python -I tools/health.py --alive "$role"; then
  echo "started: $role (resume=$resume) - log: team/logs/_${role}.out"
else
  echo "WARNING: $role is not running after ${DISPATCH_GAP:-30}s; see team/logs/_${role}.out" >&2
  tail -n 3 "team/logs/_${role}.out" >&2; exit 1
fi
