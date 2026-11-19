"""Copilot CLI as a second agent engine: wrapper safety flags, dispatch routing, health detection.

No Copilot call is made (no credits): the wrapper runs in dry-run mode and dispatch.sh runs in a temp copy of the
repo with stub launch scripts.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
import health  # noqa: E402
import jobrunner  # noqa: E402

BASH = jobrunner.BASH


def run_bash(script: Path, *args: str, env: dict | None = None, cwd: Path | None = None):
    full_env = {**os.environ, **(env or {})}
    return subprocess.run([BASH, script.as_posix(), *args], capture_output=True, text=True,
                          env=full_env, cwd=cwd, timeout=60)


def dry_run(**env) -> list[str]:
    base = {k: v for k, v in os.environ.items() if not k.startswith("CP_")}
    r = subprocess.run([BASH, (REPO / "scripts" / "copilot-sub.sh").as_posix(), "task text"],
                       capture_output=True, text=True, env={**base, "CP_DRYRUN": "1", **env}, timeout=30)
    assert r.returncode == 0, r.stderr
    return r.stdout.replace("\\", "").split()


def test_wrapper_denies_process_killing_and_secret_files():
    out = " ".join(dry_run())
    for pattern in ("shell(taskkill)", "shell(pkill)", "shell(killall)", "shell(Stop-Process)",
                    "write(.env)", "write(llm.env)"):
        assert f"--deny-tool {pattern}" in out, pattern


def test_wrapper_never_widens_permissions():
    out = " ".join(dry_run(CP_READONLY="1", CP_ADD_DIRS="docs tests"))
    assert "--allow-all-paths" not in out and "--yolo" not in out and "--allow-all " not in out + " "
    assert "--allow-all-tools" in out  # required by -p; deny rules take precedence
    assert "--add-dir docs" in out and "--add-dir tests" in out


def test_wrapper_readonly_denies_writes():
    assert "--deny-tool write " in " ".join(dry_run(CP_READONLY="1")) + " "
    out = " ".join(dry_run())
    assert "--deny-tool write " not in out + " "


def test_effort_only_with_explicit_model():
    """Model "auto" rejects --reasoning-effort (verified against the real CLI 2026-10-09)."""
    assert "--reasoning-effort" not in dry_run()
    out = dry_run(CP_MODEL="some-model", CP_EFFORT="high")
    assert out[out.index("--model") + 1] == "some-model"
    assert out[out.index("--reasoning-effort") + 1] == "high"


@pytest.fixture()
def temp_repo(tmp_path: Path) -> Path:
    """A minimal repo tree with the real dispatch.sh and stub launchers that record how they were started."""
    root = tmp_path / "repo"
    for d in ("scripts", "team/tasks", "team/logs", "tools"):
        (root / d).mkdir(parents=True)
    shutil.copy(REPO / "scripts" / "dispatch.sh", root / "scripts" / "dispatch.sh")
    (root / "team" / "ROLES.md").write_text("## ROLE: qa\nQA role.\n", encoding="utf-8")
    (root / "team" / "tasks" / "qa.md").write_text("do the thing", encoding="utf-8")
    (root / "team" / "role-models.conf").write_text("qa=opencode-go/test-model\n", encoding="utf-8")
    # health stub: first --alive call (refusal guard) = not alive, later calls = alive
    (root / "tools" / "health.py").write_text(
        "import sys, pathlib\n"
        "m = pathlib.Path(__file__).with_name('seen')\n"
        "if m.exists():\n    sys.exit(0)\n"
        "m.write_text('1')\nsys.exit(1)\n", encoding="utf-8")
    for name, tag in (("run-role-retry.sh", "opencode"), ("run-role-retry-copilot.sh", "copilot")):
        (root / "scripts" / name).write_text(
            f'#!/usr/bin/env bash\necho "{tag}|OC_MODEL=${{OC_MODEL:-}}|CP_MODEL=${{CP_MODEL:-}}|CP_EFFORT=${{CP_EFFORT:-}}"'
            f' > "$(dirname "$0")/../launched.txt"\n', encoding="utf-8")
    return root


def dispatch(root: Path, engines: str | None):
    conf = root / "team" / "role-engines.conf"
    if engines is None:
        conf.unlink(missing_ok=True)
    else:
        conf.write_text(engines, encoding="utf-8")
    (root / "tools" / "seen").unlink(missing_ok=True)
    (root / "launched.txt").unlink(missing_ok=True)
    return run_bash(root / "scripts" / "dispatch.sh", "qa", "team/tasks/qa.md",
                    env={"DISPATCH_GAP": "2", "OC_MODEL": "", "CP_MODEL": "", "CP_EFFORT": ""}, cwd=root)


def launched(root: Path) -> str:
    return (root / "launched.txt").read_text(encoding="utf-8").strip()


def test_dispatch_default_engine_is_opencode_with_role_model(temp_repo):
    r = dispatch(temp_repo, None)
    assert r.returncode == 0, r.stderr
    assert launched(temp_repo) == "opencode|OC_MODEL=opencode-go/test-model|CP_MODEL=|CP_EFFORT="


def test_dispatch_copilot_engine_with_model_and_effort(temp_repo):
    r = dispatch(temp_repo, "qa=copilot:some-model:high\n")
    assert r.returncode == 0, r.stderr
    assert launched(temp_repo) == "copilot|OC_MODEL=|CP_MODEL=some-model|CP_EFFORT=high"


def test_dispatch_copilot_engine_defaults(temp_repo):
    r = dispatch(temp_repo, "# comment\nqa=copilot\n")
    assert r.returncode == 0, r.stderr
    assert launched(temp_repo) == "copilot|OC_MODEL=|CP_MODEL=|CP_EFFORT="


def test_dispatch_rejects_unknown_engine(temp_repo):
    r = dispatch(temp_repo, "qa=bogus\n")
    assert r.returncode == 2 and "unknown engine" in r.stderr
    assert not (temp_repo / "launched.txt").exists()


def _dispatch_techlead(root: Path, engines: str | None):
    """dispatch.sh in the TEMP repo (never the real one: a configured techlead would really start)."""
    conf = root / "team" / "role-engines.conf"
    if engines is None:
        conf.unlink(missing_ok=True)
    else:
        conf.write_text(engines, encoding="utf-8")
    (root / "tools" / "seen").unlink(missing_ok=True)
    (root / "launched.txt").unlink(missing_ok=True)
    (root / "team" / "ROLES.md").write_text("## ROLE: qa\nQA.\n## ROLE: techlead\nTL.\n", encoding="utf-8")
    return run_bash(root / "scripts" / "dispatch.sh", "techlead", "team/tasks/qa.md",
                    env={"DISPATCH_GAP": "2", "OC_MODEL": "", "CP_MODEL": "", "CP_EFFORT": ""}, cwd=root)


def test_dispatch_refuses_techlead_until_an_engine_is_configured(temp_repo):
    r = _dispatch_techlead(temp_repo, None)
    assert r.returncode == 2 and "techlead=claude" in r.stderr, r.stderr
    assert not (temp_repo / "launched.txt").exists()


def test_dispatch_runs_techlead_when_configured_for_opencode(temp_repo):
    r = _dispatch_techlead(temp_repo, "techlead=opencode\n")
    assert r.returncode == 0, r.stderr
    assert launched(temp_repo).startswith("opencode|")


@pytest.mark.parametrize("script", ["run-role.sh", "run-role-retry.sh", "run-role-copilot.sh",
                                    "run-role-retry-copilot.sh"])
def test_health_recognizes_every_launcher(script):
    root = REPO.as_posix()
    line = f'"C:\\Program Files\\Git\\usr\\bin\\bash.exe" {root}/scripts/{script} qa "Task text"'
    m = health.RUN_RE.search(line.replace("\\", "/").lower())
    assert m and m.group(2) == "qa", script
