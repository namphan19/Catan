#!/usr/bin/env bash
# Submit a LONG command (> ~5 min) to the detached job runner, then END YOUR TURN.
# Usage: bash scripts/job-submit.sh --name <short-name> --role <your-role> --task-file <your task file> \
#            [--task-id <workflow task id>] [--cwd <dir inside repo>] -- <command...>
# The runner executes the command independent of you (it survives your exit), and when it finishes it
# restarts you (same task file, --resume) with the exit code and the log tail. Do NOT wait for the job,
# do NOT poll in a loop: submit, write a SHORT final report saying "JOB SUBMITTED <id>, resume me", stop.
# Pass the command as ONE quoted string, e.g.  -- "cd ml && .venv/Scripts/python.exe -m eval.run --full"
# (the runner executes it with Git Bash from --cwd, default = repo root).
# If the runner is not running this fails: then put the exact command in your final report instead.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
exec python -I tools/jobrunner.py submit "$@"
