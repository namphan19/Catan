#!/usr/bin/env bash
# Run opencode as a cheap "subagent" from Claude Code.
# Usage: scripts/opencode-sub.sh "<task prompt>"
# Env:   OC_MODEL=provider/model   model (default: the "default" tier in team/model-tiers.conf)
#        OC_AUTO=1                 auto-approve permissions (lets opencode edit files)
#        OC_DIR=<path>             working directory for opencode (default: current dir)
#        OC_TIMEOUT=<seconds>      hard timeout (default: 300)
# The model must be listed in team/allowed-models.conf (the PO's allowlist), otherwise exit 2.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 \"<task prompt>\"" >&2
  exit 2
fi
root="$(cd "$(dirname "$0")/.." && pwd)"

# This machine reaches the internet via a local proxy; --standalone does not
# inherit the proxy that service.json sets for the background service.
export HTTP_PROXY="${HTTP_PROXY:-http://127.0.0.1:3128}"
export HTTPS_PROXY="${HTTPS_PROXY:-http://127.0.0.1:3128}"
export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,::1}"

# Pinned model (the opencode default changes between runs otherwise).
default_model="$(grep -E '^default=' "$root/team/model-tiers.conf" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '[:space:]' || true)"
model="${OC_MODEL:-${default_model:-opencode/deepseek-v4.1-flash-free}}"
allowed="$root/team/allowed-models.conf"
if [ -f "$allowed" ] && ! grep -vE '^\s*(#|$)' "$allowed" | tr -d ' \t\r' | grep -qxF "$model"; then
  echo "model not allowed: $model (see team/allowed-models.conf)" >&2
  exit 2
fi

args=(run --standalone -m "$model")
[ "${OC_AUTO:-0}" = "1" ] && args+=(--auto)

cd "${OC_DIR:-.}"
timeout "${OC_TIMEOUT:-300}" opencode "${args[@]}" "$*"
