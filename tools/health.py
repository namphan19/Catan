#!/usr/bin/env python3
"""Free (no LLM) health check of the opencode agent team. Prints JSON to stdout.

Usage:
  python tools/health.py                 full report (roles, anomalies)
  python tools/health.py --alive <role>  exit 0 if an agent process for <role> is running, else 1
  python tools/health.py --watch [--interval 30] [--confirm 2] [--max 21600]
                                         block until anomalies persist, print the report, exit
                                         (run in background: the exit notifies the tech lead)

Inputs (read-only): team/logs/_<role>.out, team/workflow.json, running processes.
A role is "alive" when a bash process whose command line contains run-role(-retry).sh <role>
exists. A finished agent prints a final "log:" line (see scripts/run-role.sh).

States:  running | done | crashed | stalled | idle
Anomaly kinds (what the tech lead should act on):
  crashed          not alive, no final "log:" line, but a task of this role is "doing"
  stalled          alive but the log has not changed for STALL_S seconds
  done_not_marked  finished (final "log:" line) but its task is still "doing"
  no_agent         task "doing" for > NO_AGENT_S seconds with no log and no process
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGS = ROOT / "team" / "logs"
WORKFLOW = ROOT / "team" / "workflow.json"
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
STALL_S = 600
NO_AGENT_S = 300
RECENT_LOG_S = 1800
TAIL_BYTES = 6000


RUN_RE = re.compile(r"([^\s\"']*?)scripts/run-role(?:-retry)?(?:-copilot|-claude)?\.sh[\"']?\s+[\"']?([a-z][a-z0-9-]*)")


def _norm(path) -> str:
    return str(path).replace("\\", "/").lower().rstrip("/")


def _root_keys(root: Path) -> set:
    """This project's path as it appears in command lines: C:/x/y and the Git Bash form /c/x/y."""
    w = _norm(Path(root).resolve())
    keys = {w}
    if len(w) > 2 and w[1] == ":":
        keys.add("/" + w[0] + w[2:])
    return keys


def agent_procs(root: Path = None) -> list:
    """run-role(-retry).sh processes as {pid, role, owner}: owner "this" / "other" project (absolute script path in
    the command line, see scripts/dispatch.sh) or "unknown" (legacy launch with a relative path)."""
    keys = _root_keys(root or ROOT)
    try:
        if sys.platform == "win32":
            cmd = ["powershell", "-NoProfile", "-Command",
                   "@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run-role(-retry)?(-copilot|-claude)?\\.sh' } "
                   "| Select-Object ProcessId, CommandLine) | ConvertTo-Json -Compress"]
            raw = subprocess.run(cmd, capture_output=True, text=True, timeout=20).stdout.strip() or "[]"
            rows = json.loads(raw)
            rows = rows if isinstance(rows, list) else [rows]
            items = [(r["ProcessId"], r.get("CommandLine") or "") for r in rows]
        else:
            out = subprocess.run(["ps", "-eo", "pid=,args="], capture_output=True, text=True, timeout=20).stdout
            items = [(int(ln.split(None, 1)[0]), ln.split(None, 1)[1]) for ln in out.splitlines() if ln.strip()]
    except Exception:
        return []
    procs = []
    for pid, line in items:
        m = RUN_RE.search(line.replace("\\", "/").lower())
        if not m:
            continue
        prefix = _norm(m.group(1))
        owner = "unknown" if not prefix else ("this" if prefix in keys else "other")
        procs.append({"pid": int(pid), "role": m.group(2), "owner": owner})
    return procs


def _mine(procs: list) -> list:
    """Processes of this project; legacy relative launches count unless that role runs in another project."""
    other = {p["role"] for p in procs if p["owner"] == "other"}
    return [p for p in procs if p["owner"] == "this" or (p["owner"] == "unknown" and p["role"] not in other)]


def alive_roles(root: Path = None) -> set:
    """Roles of THIS project with a running run-role(-retry).sh process."""
    return {p["role"] for p in _mine(agent_procs(root))}


def role_pids(role: str, root: Path = None) -> list:
    """PIDs of THIS project's agent processes for a role (never another project's agents)."""
    return [p["pid"] for p in _mine(agent_procs(root)) if p["role"] == role]


def load_workflow() -> dict:
    try:
        return json.loads(WORKFLOW.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"phases": []}


def tail(path: Path) -> str:
    with path.open("rb") as f:
        f.seek(0, 2)
        f.seek(max(0, f.tell() - TAIL_BYTES))
        data = f.read()
    return ANSI.sub("", data.decode("utf-8", errors="replace"))


def build(alive: set) -> dict:
    now = time.time()
    wf = load_workflow()
    tasks = {}  # owner -> list of tasks
    for ph in wf.get("phases", []):
        for t in ph.get("tasks", []):
            tasks.setdefault(t["owner"], []).append(t)

    logs = {}
    if LOGS.is_dir():
        for p in LOGS.glob("_*.out"):
            role = p.stem.lstrip("_")
            if role.startswith("launch_"):
                continue
            logs[role] = p

    roles = sorted(set(tasks) | set(logs) | alive)
    roles = [r for r in roles if r != "lead"]
    report, anomalies = [], []
    for role in roles:
        mine = tasks.get(role, [])
        doing = [t for t in mine if t["status"] == "doing"]
        p = logs.get(role)
        text = tail(p) if p else ""
        age = int(now - p.stat().st_mtime) if p else None
        final = any(line.startswith("log:") for line in text.splitlines())
        is_alive = role in alive
        if p is None and not is_alive and not doing:
            continue  # nothing to say about this role
        if p is not None and age is not None and age > RECENT_LOG_S and not is_alive and not doing:
            continue  # old finished log from an earlier phase
        if is_alive:
            state = "stalled" if (age is not None and age > STALL_S) else "running"
        elif final:
            state = "done"
        elif doing or (p is not None and age is not None and age < RECENT_LOG_S):
            state = "crashed"
        else:
            state = "idle"
        errs = len(re.findall(r"Error: .{0,12}(Transport|Standalone)", text))
        lines = [ln for ln in text.splitlines() if ln.strip()]
        report.append({"role": role, "state": state, "alive": is_alive, "log_age_s": age,
                       "final_report": final, "transport_errors_in_tail": errs,
                       "doing_tasks": [t["id"] for t in doing],
                       "last_line": lines[-1][:200] if lines else ""})
        if state == "crashed" and doing:
            anomalies.append({"role": role, "kind": "crashed",
                              "detail": f"not running, no final report, tasks doing: "
                                        f"{[t['id'] for t in doing]}, log age {age}s"})
        elif state == "stalled":
            anomalies.append({"role": role, "kind": "stalled",
                              "detail": f"alive but log unchanged for {age}s"})
        elif state == "done" and doing:
            anomalies.append({"role": role, "kind": "done_not_marked",
                              "detail": f"finished but tasks still doing: {[t['id'] for t in doing]}"})
        if p is None and not is_alive:
            old = [t for t in doing if now - t.get("ts", now) > NO_AGENT_S]
            if old:
                anomalies.append({"role": role, "kind": "no_agent",
                                  "detail": f"tasks doing with no agent and no log: {[t['id'] for t in old]}"})

    return {"now": now, "alive_roles": sorted(alive), "roles": report, "anomalies": anomalies}


def watch(interval: int, confirm: int, max_s: int) -> int:
    """Block until the SAME anomalies are seen `confirm` checks in a row, print the report, exit.

    Run it as a background command: its exit wakes the tech lead. Requiring consecutive sightings
    ignores transient states (e.g. a role between two retry attempts).
    """
    start, prev, streak = time.time(), None, 0
    while time.time() - start < max_s:
        rep = build(alive_roles())
        keys = sorted((a["role"], a["kind"]) for a in rep["anomalies"])
        streak = streak + 1 if keys and keys == prev else (1 if keys else 0)
        prev = keys or None
        if streak >= confirm:
            print(json.dumps(rep, indent=1))
            return 0
        time.sleep(interval)
    print(json.dumps({"watch": "no anomalies", "waited_s": max_s}))
    return 0


def main() -> int:
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--alive":
        return 0 if args[1] in alive_roles() else 1
    if args and args[0] == "--watch":
        opts = dict(zip(args[1::2], args[2::2]))
        return watch(int(opts.get("--interval", 30)), int(opts.get("--confirm", 2)),
                     int(opts.get("--max", 21600)))
    print(json.dumps(build(alive_roles()), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
