#!/usr/bin/env python3
"""Detached job runner: long jobs that must survive the agent that asked for them.

Why: an opencode agent's background processes die with the agent (seen twice), and agents cannot
babysit a 30-minute run. Instead the agent SUBMITS the command here and ends its turn; this daemon
(started by the lead / autoheal, never by an agent) runs it, and when it finishes it re-dispatches the
agent with a hint so the agent can verify the output and finish its report.

Usage:
  python tools/jobrunner.py run [--max-concurrent 2]          daemon (the lead / autoheal starts it)
  python tools/jobrunner.py ensure                            start the daemon detached if not alive
  python tools/jobrunner.py submit --name N [--role R] [--task-file F] [--task-id ID] [--cwd DIR] -- CMD...
  python tools/jobrunner.py status [id]                       one line per job (or the full JSON of one)
  python tools/jobrunner.py tail <id> [lines]                 last lines of the job log
  python tools/jobrunner.py cancel <id>

Files (all under team/jobs/): <id>.json spec+state, <id>.log output, .heartbeat (daemon liveness).
States: queued -> running -> done | failed | lost | cancelled.  After a finished job with a role and a
task file, the daemon runs `bash scripts/dispatch.sh <role> <task-file> --resume --hint ...` (retrying
while the role is still running) and sets then.done.
"""
import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(os.environ.get("TEAM_ROOT") or Path(__file__).resolve().parent.parent)
HEARTBEAT_MAX_AGE = 20
POLL_S = 3
THEN_RETRY_S = 30
THEN_MAX_TRIES = 60
WIN = sys.platform == "win32"


def find_bash() -> str:
    """Git Bash, never WSL: on Windows a bare `bash` given to CreateProcess resolves to System32/bash.exe (WSL),
    which does not see the repo paths and prints UTF-16 banners into the job log."""
    env = os.environ.get("BASH_EXE")
    if env and Path(env).exists():
        return env
    found = shutil.which("bash")
    if found and "system32" not in found.lower():
        return found
    for c in ("C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/bash.exe",
              "C:/Program Files (x86)/Git/bin/bash.exe"):
        if Path(c).exists():
            return c
    return found or "bash"


BASH = find_bash()


def jobs_dir(root: Path = None) -> Path:
    d = (root or ROOT) / "team" / "jobs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write(p: Path, spec: dict) -> None:
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(spec, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def load_jobs(root: Path = None) -> list:
    out = []
    for p in sorted(jobs_dir(root).glob("*.json")):
        s = _read(p)
        if s and "id" in s:
            out.append(s)
    return out


def pid_alive(pid) -> bool:
    if not pid:
        return False
    try:
        if WIN:
            out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True,
                                 text=True, timeout=15).stdout
            return re.search(rf"\b{pid}\b", out) is not None
        os.kill(pid, 0)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def runner_alive(root: Path = None) -> bool:
    hb = jobs_dir(root) / ".heartbeat"
    try:
        return time.time() - hb.stat().st_mtime < HEARTBEAT_MAX_AGE
    except OSError:
        return False


def active_roles(root: Path = None) -> set:
    """Roles that are waiting on a job: queued/running, or finished but not yet re-dispatched."""
    roles = set()
    for j in load_jobs(root):
        if not j.get("role"):
            continue
        if j["state"] in ("queued", "running"):
            roles.add(j["role"])
        elif j["state"] in ("done", "failed", "lost") and j.get("task_file") and not j.get("then", {}).get("done"):
            roles.add(j["role"])
    return roles


def submit(name, cmd, role=None, task_file=None, task_id=None, cwd=None, root: Path = None) -> dict:
    root = root or ROOT
    if not runner_alive(root):
        raise SystemExit("job runner is not running (no heartbeat). Do NOT start it yourself: put the exact "
                         "command in your final report and the tech lead will run it.")
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", name).strip("-")[:40] or "job"
    jid = f"{time.strftime('%Y%m%d-%H%M%S')}-{safe}"
    wd = (root / (cwd or ".")).resolve()
    if root.resolve() not in [wd, *wd.parents]:
        raise SystemExit(f"cwd must be inside the repo: {cwd}")
    spec = {"id": jid, "name": name, "cmd": cmd, "cwd": str(wd), "role": role, "task_file": task_file,
            "task_id": task_id, "state": "queued", "created": time.time(), "pid": None,
            "log": str((jobs_dir(root) / f"{jid}.log").relative_to(root)).replace("\\", "/"),
            "exit_code": None, "then": {"done": False, "tries": 0}}
    _write(jobs_dir(root) / f"{jid}.json", spec)
    return spec


def _wf_log(root: Path, msg: str) -> None:
    wf = root / "tools" / "wf.py"
    if wf.exists():
        try:
            subprocess.run([sys.executable, "-I", str(wf), "log", msg], cwd=root, capture_output=True, timeout=30)
        except Exception:
            pass


def _dispatch(root: Path, spec: dict, dispatch_cmd: list, results: dict) -> None:
    tail = ""
    try:
        tail = " ".join((root / spec["log"]).read_text(encoding="utf-8", errors="replace").split()[-60:])
    except OSError:
        pass
    tail = re.sub(r"[\x00-\x08\x0b-\x1f]", "", tail)
    hint = (f"Job '{spec['name']}' ({spec['id']}) has FINISHED with state={spec['state']} "
            f"exit_code={spec['exit_code']}. Output is in {spec['log']}. Do NOT rerun the job. Read the log tail "
            f"and the result files, verify the numbers, and finish the remaining items of the task and your final "
            f"report. Log tail: {tail[-400:]}")
    env = dict(os.environ)
    if spec.get("task_id"):
        env["TASK_ID"] = spec["task_id"]
    try:
        r = subprocess.run([*dispatch_cmd, spec["role"], spec["task_file"], "--resume", "--hint", hint],
                           cwd=root, env=env, capture_output=True, text=True, timeout=300)
        results[spec["id"]] = r.returncode
        if r.returncode != 0:
            print(f"dispatch of {spec['role']} failed rc={r.returncode}: {(r.stdout + r.stderr)[-200:]}", file=sys.stderr, flush=True)
    except Exception as e:  # keep the daemon alive; the dispatch is retried later
        print(f"dispatch of {spec['role']} raised {e!r}", file=sys.stderr, flush=True)
        results[spec["id"]] = 99


def run_daemon(root: Path, max_conc: int, dispatch_cmd: list) -> None:
    procs, dispatching, results = {}, {}, {}
    next_try = {}
    jd = jobs_dir(root)
    while True:
        (jd / ".heartbeat").write_text(str(time.time()), encoding="utf-8")
        jobs = load_jobs(root)
        running = 0
        for j in jobs:
            p = jd / f"{j['id']}.json"
            if j["state"] == "running":
                pr = procs.get(j["id"])
                # a job left "running" by a previous daemon is adopted by pid, else marked lost
                code = pr.poll() if pr else (None if pid_alive(j.get("pid")) else "lost")
                if code is None:
                    running += 1
                    continue
                j["ended"] = time.time()
                if code == "lost":
                    j["state"] = "lost"
                else:
                    j["exit_code"] = code
                    j["state"] = "done" if code == 0 else "failed"
                _write(p, j)
                _wf_log(root, f"[jobrunner] {j['id']} {j['state']} (exit {j['exit_code']}) after "
                              f"{int(j['ended'] - j['started'])}s")
        for j in jobs:
            p = jd / f"{j['id']}.json"
            if j["state"] == "queued" and running < max_conc:
                env = dict(os.environ)
                for k in ("HTTP_PROXY", "HTTPS_PROXY"):
                    env.setdefault(k, "http://127.0.0.1:3128")
                env.setdefault("NO_PROXY", "localhost,127.0.0.1,::1")
                logf = open(root / j["log"], "ab")
                flags = (subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW) if WIN else 0
                pr = subprocess.Popen([BASH, "-c", j["cmd"]], cwd=j["cwd"], env=env, stdout=logf,
                                      stderr=subprocess.STDOUT, creationflags=flags)
                logf.close()  # the child has its own copy of the handle; keep none open here
                procs[j["id"]] = pr
                j.update(state="running", pid=pr.pid, started=time.time())
                _write(p, j)
                running += 1
                _wf_log(root, f"[jobrunner] started {j['id']}: {j['name']}")
            elif (j["state"] in ("done", "failed", "lost") and j.get("role") and j.get("task_file")
                  and not j["then"]["done"]):
                if j["id"] in dispatching:
                    if not dispatching[j["id"]].is_alive():
                        rc = results.get(j["id"])
                        del dispatching[j["id"]]
                        j["then"]["tries"] += 1
                        if rc == 0 or j["then"]["tries"] >= THEN_MAX_TRIES:
                            j["then"].update(done=True, rc=rc)
                            _wf_log(root, f"[jobrunner] {j['id']}: {j['role']} re-dispatched (rc={rc})")
                        else:  # role still running (rc 3) or launch failed: try again later
                            next_try[j["id"]] = time.time() + THEN_RETRY_S
                        _write(p, j)
                elif time.time() >= next_try.get(j["id"], 0):
                    t = threading.Thread(target=_dispatch, args=(root, j, dispatch_cmd, results), daemon=True)
                    dispatching[j["id"]] = t
                    t.start()
        time.sleep(POLL_S)


def ensure(root: Path = None) -> str:
    root = root or ROOT
    if runner_alive(root):
        return "already running"
    flags = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP |
             subprocess.CREATE_NO_WINDOW) if WIN else 0
    log = open(jobs_dir(root) / ".runner.out", "ab")
    subprocess.Popen([sys.executable, "-I", str(Path(__file__).resolve()), "run"], cwd=root, stdout=log,
                     stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, creationflags=flags,
                     start_new_session=not WIN, env={**os.environ, "TEAM_ROOT": str(root)})
    for _ in range(20):
        time.sleep(0.5)
        if runner_alive(root):
            return "started"
    return "FAILED to start (see team/jobs/.runner.out)"


def _line(j: dict) -> str:
    age = ""
    if j.get("started"):
        age = f" {int((j.get('ended') or time.time()) - j['started'])}s"
    return f"{j['id']:<40} {j['state']:<9}{age:<8} role={j.get('role') or '-'} exit={j.get('exit_code')} then={j['then']['done']}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--max-concurrent", type=int, default=2)
    r.add_argument("--dispatch-cmd", default=None, help="default: <git bash> scripts/dispatch.sh")
    sub.add_parser("ensure")
    s = sub.add_parser("submit")
    s.add_argument("--name", required=True)
    s.add_argument("--role")
    s.add_argument("--task-file")
    s.add_argument("--task-id")
    s.add_argument("--cwd")
    s.add_argument("command", nargs=argparse.REMAINDER)
    st = sub.add_parser("status")
    st.add_argument("id", nargs="?")
    t = sub.add_parser("tail")
    t.add_argument("id")
    t.add_argument("lines", nargs="?", type=int, default=30)
    c = sub.add_parser("cancel")
    c.add_argument("id")
    a = ap.parse_args()

    if a.cmd == "run":
        run_daemon(ROOT, a.max_concurrent, a.dispatch_cmd.split() if a.dispatch_cmd else [BASH, "scripts/dispatch.sh"])
    elif a.cmd == "ensure":
        print(ensure())
    elif a.cmd == "submit":
        cmd = a.command[1:] if a.command[:1] == ["--"] else a.command
        if not cmd:
            raise SystemExit("no command given after --")
        if bool(a.role) != bool(a.task_file):
            raise SystemExit("--role and --task-file go together (they are used to wake the agent when the job ends)")
        # one argument = a ready shell command string (preferred); several = an argv, quoted safely
        spec = submit(a.name, shlex.join(cmd) if len(cmd) > 1 else cmd[0], a.role, a.task_file, a.task_id, a.cwd)
        print(f"submitted {spec['id']}  log: {spec['log']}")
    elif a.cmd == "status":
        jobs = load_jobs()
        if a.id:
            m = [j for j in jobs if j["id"] == a.id]
            print(json.dumps(m[0], indent=1) if m else f"no such job: {a.id}")
        else:
            print("runner:", "alive" if runner_alive() else "NOT RUNNING")
            for j in jobs:
                print(_line(j))
    elif a.cmd == "tail":
        p = ROOT / "team" / "jobs" / f"{a.id}.log"
        print("\n".join(p.read_text(encoding="utf-8", errors="replace").splitlines()[-a.lines:]) if p.exists() else "no log")
    elif a.cmd == "cancel":
        p = jobs_dir() / f"{a.id}.json"
        j = _read(p)
        if not j:
            raise SystemExit(f"no such job: {a.id}")
        if j.get("pid") and j["state"] == "running":
            subprocess.run(["taskkill", "/PID", str(j["pid"]), "/T", "/F"] if WIN else ["kill", str(j["pid"])],
                           capture_output=True)
        j["state"] = "cancelled"
        j["then"]["done"] = True
        _write(p, j)
        print("cancelled", a.id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
