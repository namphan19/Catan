#!/usr/bin/env bash
# Set the opencode model of a role BEFORE dispatching a task (the lead's per-task choice).
# Usage: scripts/set-model.sh <role> default|fallback|complex|<provider/model>
#   default  -> removes the role's line from team/role-models.conf (falls back to the default tier)
#   other    -> a tier from team/model-tiers.conf, or an explicit provider/model
# The model must be in team/allowed-models.conf (the PO's allowlist).
# The choice is stored in team/role-models.conf, so autoheal resumes and the dashboard keep using it.
# Do not run it while that role's agent is running (the running task keeps its model; the next dispatch uses the new one).
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <role> default|fallback|complex|<provider/model>" >&2; exit 2; }
root="$(cd "$(dirname "$0")/.." && pwd)"
role="$1"; choice="$2"; conf="$root/team/role-models.conf"; tiers="$root/team/model-tiers.conf"
allowed="$root/team/allowed-models.conf"
case "$choice" in
  */*) model="$choice" ;;
  *[!A-Za-z0-9_-]*|"") echo "unknown tier or model: $choice" >&2; exit 2 ;;
  *) model="$(grep -E "^${choice}=" "$tiers" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]')"
     [ -n "$model" ] || { echo "unknown tier: $choice (tiers: $(grep -oE '^[A-Za-z0-9_-]+=' "$tiers" | tr -d = | tr '\n' ' '))" >&2; exit 2; } ;;
esac
if [ -f "$allowed" ] && ! grep -vE '^\s*(#|$)' "$allowed" | tr -d ' \t\r' | grep -qxF "$model"; then
  echo "model not allowed: $model (see $allowed)" >&2; exit 2
fi
touch "$conf"
tmp="$(mktemp)"; grep -vE "^${role}=" "$conf" > "$tmp" || true
if [ "$choice" != "default" ]; then printf '%s=%s\n' "$role" "$model" >> "$tmp"; fi
cat "$tmp" > "$conf"; rm -f "$tmp"
echo "$(date '+%F %T') set-model role=$role choice=$choice model=${model}" >> "$root/team/dispatch.log"
echo "role $role -> $([ "$choice" = default ] && echo "default ($model)" || echo "$model")"
