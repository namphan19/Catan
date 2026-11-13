"""Tests for tools/autoheal.py (decision logic) and tools/jobrunner.py (real daemon in a temp repo)."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
import autoheal  # noqa: E402
import jobrunner  # noqa: E402


def report(anomalies, doing=None):
    roles = [{"role": a["role"], "doing_tasks": (doing or {}).get(a["role"], ["t1"])} for a in anomalies]
    return {"anomalies": anomalies, "roles": roles}


def an(role, kind):
    return {"role": role, "kind": kind, "detail": f"{kind} detail"}


# ------------------------------------------------------------------ autoheal.decide


def test_crashed_agent_is_resumed():
    acts = autoheal.decide(report([an("qa", "crashed")]), set(), {}, {"qa": "team/tasks/qa.md"}, 2)
    assert [(a["op"], a["role"], a["task_file"]) for a in acts] == [("resume", "qa", "team/tasks/qa.md")]


def test_hung_agent_is_killed_then_resumed_with_hint():
    acts = autoheal.decide(report([an("qa", "stalled")]), set(), {}, {"qa": "team/tasks/qa.md"}, 2)
    assert acts[0]["op"] == "kill_resume"
    assert "large files" in acts[0]["hint"]


def test_heal_budget_is_capped_then_escalates():
    acts = autoheal.decide(report([an("qa", "crashed")]), set(), {"qa:t1": 2}, {"qa": "x.md"}, 2)
    assert acts[0]["op"] == "escalate" and "2x" in acts[0]["why"]


def test_role_waiting_for_a_job_is_not_an_anomaly():
    acts = autoheal.decide(report([an("worker", "done_not_marked"), an("worker", "stalled")]),
                           {"worker"}, {}, {"worker": "x.md"}, 2)
    assert acts == []


def test_agent_started_inline_cannot_be_resumed():
    acts = autoheal.decide(report([an("qa", "crashed")]), set(), {}, {}, 2)
    assert acts[0]["op"] == "escalate" and "task file" in acts[0]["why"]


@pytest.mark.parametrize("kind", ["done_not_marked", "no_agent"])
def test_judgement_anomalies_escalate_to_the_lead(kind):
    assert autoheal.decide(report([an("qa", kind)]), set(), {}, {"qa": "x.md"}, 2)[0]["op"] == "escalate"


def test_task_file_is_the_last_dispatch_of_the_role():
    log = (
        "2026-10-07 19:18:23 role=backend resume=0 hint=no file=team/tasks/backend.md\n"
        "2026-10-07 19:21:22 role=frontend resume=0 hint=no file=team/tasks/frontend.md\n"
        "2026-10-07 21:37:29 role=backend resume=0 hint=no file=team/tasks/backend-fix.md\n"
    )
    assert autoheal.task_file_for("backend", log) == "team/tasks/backend-fix.md"
    assert autoheal.task_file_for("qa", log) is None


# ------------------------------------------------------------------ jobrunner (real daemon)


@pytest.fixture()
def daemon(tmp_path):
    (tmp_path / "team" / "jobs").mkdir(parents=True)
    env = {**os.environ, "TEAM_ROOT": str(tmp_path)}
    proc = subprocess.Popen(
        [sys.executable, "-I", str(REPO / "tools" / "jobrunner.py"), "run", "--dispatch-cmd", "python -c pass"],
        cwd=tmp_path, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if jobrunner.runner_alive(tmp_path):
            break
        time.sleep(0.25)
    assert jobrunner.runner_alive(tmp_path), "daemon did not start"
    yield tmp_path
    proc.terminate()
    proc.wait(timeout=10)


def wait_state(root, jid, states, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        j = next(j for j in jobrunner.load_jobs(root) if j["id"] == jid)
        if j["state"] in states:
            return j
        time.sleep(0.5)
    raise AssertionError(f"job {jid} did not reach {states}: {j['state']}")


def test_submit_refused_when_runner_is_down(tmp_path):
    with pytest.raises(SystemExit) as e:
        jobrunner.submit("x", "echo hi", root=tmp_path)
    assert "not running" in str(e.value)


def test_job_runs_detached_writes_log_and_wakes_the_role(daemon):
    spec = jobrunner.submit("smoke", "echo hello-from-job && echo done > out.txt", role="qa",
                            task_file="team/tasks/qa.md", task_id="q9", root=daemon)
    assert "qa" in jobrunner.active_roles(daemon)  # waiting on the job
    j = wait_state(daemon, spec["id"], {"done", "failed"})
    assert j["state"] == "done" and j["exit_code"] == 0
    log_bytes = (daemon / j["log"]).read_bytes()
    assert b"hello-from-job" in log_bytes
    assert b"\x00" not in log_bytes, "job ran under WSL bash (UTF-16 banner), not Git Bash"
    assert (daemon / "out.txt").read_text().strip() == "done"
    end = time.time() + 40
    while time.time() < end and not next(x for x in jobrunner.load_jobs(daemon) if x["id"] == spec["id"])["then"]["done"]:
        time.sleep(0.5)
    j = next(x for x in jobrunner.load_jobs(daemon) if x["id"] == spec["id"])
    assert j["then"]["done"] and j["then"]["rc"] == 0  # dispatch command (python -c pass) ran with the role
    assert "qa" not in jobrunner.active_roles(daemon)


def test_failed_job_is_reported_with_exit_code(daemon):
    spec = jobrunner.submit("bad", "echo boom; exit 3", root=daemon)
    j = wait_state(daemon, spec["id"], {"done", "failed"})
    assert j["state"] == "failed" and j["exit_code"] == 3


def test_cwd_outside_repo_is_rejected(daemon):
    with pytest.raises(SystemExit):
        jobrunner.submit("x", "echo hi", cwd="..", root=daemon)
