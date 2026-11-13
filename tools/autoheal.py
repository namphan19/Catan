#!/usr/bin/env python3
"""Self-healing watcher for the opencode agent team (no LLM, replaces `health.py --watch`).

It fixes by itself the two failure kinds that used to come back to the tech lead:
  crashed  agent died (Transport error, ...), task still "doing"   -> dispatch.sh --resume
  stalled  agent alive but its log has not moved for --stall secs  -> kill its process tree, then
           dispatch.sh --resume with a hint (do not read big files whole, short commands)
Each (role, task) is healed at most --max-heals times (default 2); after that it ESCALATES.
It also keeps the detached job runner (tools/jobrunner.py) alive and ignores roles that are
merely waiting for a submitted job.

It exits (printing a JSON report, which wakes the tech lead) only when a human-level decision is
needed: escalation, done_not_marked (review the output), no_agent, or a role it cannot resume
(no recorded task file). Run it in the background:  python -I tools/autoheal.py

  python tools/autoheal.py [--interval 30] [--confirm 2] [--stall 600] [--max-heals 2]
                           [--max 21600] [--dry-run]
State/audit trail: team/autoheal.json (attempts + events).
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import health  # noqa: E402
import jobrunner  # noqa: E402

ROOT = health.ROOT
STATE = ROOT / "team" / "autoheal.json"
DISPATCH_LOG = ROOT / "team" / "dispatch.log"
WIN = sys.platform == "win32"

HUNG_HINT = ("the previous attempt HUNG (no output for several minutes), probably while reading large files. "
             "Do not read big files whole: grep first, then read only the needed line ranges (offset/limit). "
             "Keep every command short (<5 min) and write files in small increments.")
CRASH_HINT = "the previous attempt crashed (connection error). Keep commands short and write files in small increments."


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"attempts": {}, "events": []}


def save_state(st: dict) -> None:
    st["events"] = st["events"][-200:]
    STATE.write_text(json.dumps(st, indent=1), encoding="utf-8")


def task_file_for(role: str, log_text: str = None):
    """Task file of the last dispatch of this role (team/dispatch.log), or None."""
    try:
        text = log_text if log_text is not None else DISPATCH_LOG.read_text(encoding="utf-8")
    except OSError:
        return None
    found = None
    for line in text.splitlines():
        m = re.search(rf"\brole={re.escape(role)}\b.*\bfile=(\S+)", line)
        if m:
            found = m.group(1)
    return found


def decide(report: dict, waiting_roles: set, attempts: dict, task_files: dict, max_heals: int) -> list:
    """Pure decision step. Returns actions: {op: resume|kill_resume|escalate, role, task_id, kind, ...}."""
    actions = []
    for an in report["anomalies"]:
        role, kind = an["role"], an["kind"]
        if role in waiting_roles:
            continue  # waiting for a submitted job: not an anomaly
        doing = next((r["doing_tasks"] for r in report["roles"] if r["role"] == role), [])
        task_id = doing[0] if doing else None
        if kind in ("crashed", "stalled"):
            key = f"{role}:{task_id}"
            tf = task_files.get(role)
            if not tf:
                actions.append({"op": "escalate", "role": role, "kind": kind, "task_id": task_id,
                                "why": "no recorded task file (agent was started inline): cannot resume"})
            elif attempts.get(key, 0) >= max_heals:
                actions.append({"op": "escalate", "role": role, "kind": kind, "task_id": task_id,
                                "why": f"already auto-healed {attempts.get(key, 0)}x"})
            else:
                actions.append({"op": "kill_resume" if kind == "stalled" else "resume", "role": role,
                                "kind": kind, "task_id": task_id, "task_file": tf,
                                "hint": HUNG_HINT if kind == "stalled" else CRASH_HINT})
        else:  # done_not_marked, no_agent: needs the lead's judgement
            actions.append({"op": "escalate", "role": role, "kind": kind, "task_id": task_id,
                            "why": an["detail"]})
    return actions


def role_pids(role: str) -> list:
    """This project's agent processes for a role only (health.role_pids): never another project's agents."""
    return health.role_pids(role)


def kill_role(role: str) -> list:
    pids = role_pids(role)
    for p in pids:
        subprocess.run(["taskkill", "/PID", str(p), "/T", "/F"] if WIN else ["kill", "-9", str(p)],
                       capture_output=True)
    return pids


def execute(a: dict, dry: bool) -> str:
    role = a["role"]
    if dry:
        return f"DRY-RUN {a['op']} {role} task={a.get('task_id')}"
    if a["op"] == "kill_resume":
        kill_role(role)
        time.sleep(5)
    env = dict(os.environ)
    if a.get("task_id"):
        env["TASK_ID"] = a["task_id"]
    r = subprocess.run([jobrunner.BASH, "scripts/dispatch.sh", role, a["task_file"], "--resume", "--hint", a["hint"]],
                       cwd=ROOT, env=env, capture_output=True, text=True, timeout=300)
    # rc 1 = "not running after the start gap": the agent may simply have finished a short task already
    return f"dispatch rc={r.returncode} {' '.join((r.stdout + r.stderr).split())[-120:]}"


def wf_log(msg: str) -> None:
    try:
        subprocess.run([sys.executable, "-I", str(ROOT / "tools" / "wf.py"), "log", msg], cwd=ROOT,
                       capture_output=True, timeout=30)
    except Exception:
        pass


def watch(interval: int, confirm: int, max_s: int, max_heals: int, dry: bool) -> int:
    start, streaks = time.time(), {}
    st = load_state()
    while time.time() - start < max_s:
        if not dry:
            jobrunner.ensure(ROOT)
        rep = health.build(health.alive_roles())
        waiting = jobrunner.active_roles(ROOT)
        seen = {(an["role"], an["kind"]) for an in rep["anomalies"] if an["role"] not in waiting}
        streaks = {k: streaks.get(k, 0) + 1 for k in seen}
        confirmed = [an for an in rep["anomalies"] if streaks.get((an["role"], an["kind"]), 0) >= confirm]
        if confirmed:
            sub = dict(rep, anomalies=confirmed)
            tfs = {r: task_file_for(r) for r in {a["role"] for a in confirmed}}
            actions = decide(sub, waiting, st["attempts"], tfs, max_heals)
            esc = [a for a in actions if a["op"] == "escalate"]
            for a in actions:
                if a["op"] == "escalate":
                    continue
                key = f"{a['role']}:{a['task_id']}"
                res = execute(a, dry)
                if not dry:
                    st["attempts"][key] = st["attempts"].get(key, 0) + 1
                st["events"].append({"ts": time.time(), "role": a["role"], "kind": a["kind"], "action": a["op"],
                                     "result": res})
                wf_log(f"[autoheal] {a['role']} {a['kind']} -> {a['op']} (attempt "
                       f"{st['attempts'].get(key, 0)}/{max_heals}): {res[:80]}")
                streaks.pop((a["role"], a["kind"]), None)
            save_state(st)
            if esc:
                print(json.dumps({"escalate": esc, "report": rep}, indent=1))
                return 0
        time.sleep(interval)
    print(json.dumps({"watch": "no escalation", "waited_s": max_s}))
    return 0


def main() -> int:
    args = sys.argv[1:]
    dry = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]
    o = dict(zip(args[0::2], args[1::2]))
    health.STALL_S = int(o.get("--stall", health.STALL_S))
    return watch(int(o.get("--interval", 30)), int(o.get("--confirm", 2)), int(o.get("--max", 21600)),
                 int(o.get("--max-heals", 2)), dry)


if __name__ == "__main__":
    sys.exit(main())
