#!/usr/bin/env python3
"""Workflow status CLI - how the tech lead (Claude) shows up on the dashboard.

State file: team/workflow.json (read by the standalone agent hub dashboard, pushed to the browser live).

Commands (every state change is also appended to the activity feed):
  wf.py lead  <working|waiting|reviewing|idle> "<what I am doing>" [model]
  wf.py phase <phase_id> "<phase name>"                       create/rename a phase
  wf.py task  <phase_id> <task_id> "<title>" <owner> <status> ["note"]   upsert a task
  wf.py set   <task_id> <status> ["note"]                     change a task's status/note
  wf.py log   "<message>"                                     add a feed line only
  wf.py show                                                  print the state

Task status: todo | doing | review | done | blocked.  owner: a role name or "lead".
"""
import json
import os
import sys
import time
from pathlib import Path

STATE = Path(__file__).resolve().parent.parent / "team" / "workflow.json"
TASK_STATUS = {"todo", "doing", "review", "done", "blocked"}
LEAD_STATUS = {"working", "waiting", "reviewing", "idle"}
FEED_MAX = 60


def load() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"lead": {"status": "idle", "doing": "", "ts": time.time()}, "phases": [], "feed": []}


def save(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, STATE)  # atomic: the dashboard never reads a half-written file


def feed(state: dict, msg: str) -> None:
    state["feed"].append({"ts": time.time(), "msg": msg})
    del state["feed"][:-FEED_MAX]


def find_task(state: dict, task_id: str):
    for ph in state["phases"]:
        for t in ph["tasks"]:
            if t["id"] == task_id:
                return t
    return None


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(2)


def main(argv: list) -> None:
    if not argv:
        die(__doc__)
    cmd, args = argv[0], argv[1:]
    state = load()
    now = time.time()

    if cmd == "lead" and len(args) in (2, 3):
        if args[0] not in LEAD_STATUS:
            die(f"lead status must be one of {sorted(LEAD_STATUS)}")
        model = args[2] if len(args) == 3 else state["lead"].get("model", "")
        state["lead"] = {"status": args[0], "doing": args[1], "ts": now, "model": model}
        feed(state, f"[lead] {args[1]}")
    elif cmd == "phase" and len(args) == 2:
        ph = next((p for p in state["phases"] if p["id"] == args[0]), None)
        if ph:
            ph["name"] = args[1]
        else:
            state["phases"].append({"id": args[0], "name": args[1], "tasks": []})
    elif cmd == "task" and len(args) in (5, 6):
        phase_id, task_id, title, owner, status = args[:5]
        note = args[5] if len(args) == 6 else ""
        if status not in TASK_STATUS:
            die(f"task status must be one of {sorted(TASK_STATUS)}")
        ph = next((p for p in state["phases"] if p["id"] == phase_id), None)
        if not ph:
            die(f"unknown phase {phase_id!r}; create it with: wf.py phase {phase_id} \"name\"")
        t = find_task(state, task_id)
        if t:
            t.update(title=title, owner=owner, status=status, note=note, ts=now)
        else:
            ph["tasks"].append({"id": task_id, "title": title, "owner": owner,
                                "status": status, "note": note, "ts": now})
        feed(state, f"{task_id}: {status} ({owner}) {title}")
    elif cmd == "set" and len(args) in (2, 3):
        t = find_task(state, args[0])
        if not t:
            die(f"unknown task {args[0]!r}")
        if args[1] not in TASK_STATUS:
            die(f"task status must be one of {sorted(TASK_STATUS)}")
        t["status"], t["ts"] = args[1], now
        if len(args) == 3:
            t["note"] = args[2]
        feed(state, f"{t['id']}: {args[1]}" + (f" - {args[2]}" if len(args) == 3 else ""))
    elif cmd == "log" and len(args) == 1:
        feed(state, args[0])
    elif cmd == "show":
        # UTF-8 bytes: the Windows console codepage (cp1252) cannot print Vietnamese text
        sys.stdout.buffer.write((json.dumps(state, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
        return
    else:
        die("bad command or arguments\n" + __doc__)
    save(state)


if __name__ == "__main__":
    main(sys.argv[1:])
