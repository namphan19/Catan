# Fuzz results - base rules engine

Fuzzer: `packages/engine/fuzz/randomGame.ts` - plays full random games through `getLegalActions`,
applies a weighted random legal action, and asserts the invariants after every action (bank and hand
counts non-negative and conserved, supply = initial - placed, deck + hands + played = initial deck,
phase/winner consistency, actions only from the legal list). A run always ends with a valid winner.

Command: `cd packages/engine && npx tsx fuzz/randomGame.ts <games> <startSeed>`

## Smoke run (QA, local, 2026-11-13)

```
npx tsx fuzz/randomGame.ts 3 0
fuzz-0 players=3 winner=p1 turns=247 actions=1234
fuzz-1 players=4 winner=p3 turns=367 actions=1885
fuzz-2 players=5 winner=p5 turns=305 actions=2883
OK 3 games, 6002 actions, all invariants held
```

## Full run - 50 games, seeds 0..49 (job 20261113-175131-fuzz50)

Submitted to the detached job runner with
`bash scripts/job-submit.sh --name fuzz50 --role qa --task-file team/tasks/qa.md -- "cd packages/engine && npx tsx fuzz/randomGame.ts 50 0"`.

The job finished with `state=done`, `exit_code=0` (~3 minutes wall time; job record
`team/jobs/20261113-175131-fuzz50.json`, log `team/jobs/20261113-175131-fuzz50.log`).
Verified summary line:

```
OK 50 games, 79379 actions, all invariants held
```

Aggregates recomputed from the per-game log lines: 50/50 games ended with a valid winner, 10 510 turns,
79 379 actions. Player counts: 13 three-player, 13 four-player, 12 five-player, 12 six-player games.
Winners spread over every seat: p1 17, p2 10, p3 11, p4 5, p5 6, p6 1 (first-move advantage, expected).
No game hit the turn guard without a winner and no invariant violated, so no `docs/qa/BUGS.md` entry
came out of this run.

```
fuzz-0 players=3 winner=p1 turns=247 actions=1234
fuzz-1 players=4 winner=p3 turns=367 actions=1885
fuzz-2 players=5 winner=p5 turns=305 actions=2883
fuzz-3 players=6 winner=p3 turns=225 actions=2693
fuzz-4 players=3 winner=p3 turns=288 actions=1347
fuzz-5 players=4 winner=p3 turns=211 actions=1116
fuzz-6 players=5 winner=p1 turns=526 actions=5268
fuzz-7 players=6 winner=p5 turns=131 actions=1490
fuzz-8 players=3 winner=p2 turns=185 actions=836
fuzz-9 players=4 winner=p1 turns=129 actions=624
fuzz-10 players=5 winner=p1 turns=196 actions=1948
fuzz-11 players=6 winner=p5 turns=215 actions=2346
fuzz-12 players=3 winner=p1 turns=106 actions=456
fuzz-13 players=4 winner=p1 turns=125 actions=640
fuzz-14 players=5 winner=p2 turns=122 actions=1135
fuzz-15 players=6 winner=p4 turns=106 actions=1161
fuzz-16 players=3 winner=p3 turns=288 actions=1234
fuzz-17 players=4 winner=p4 turns=152 actions=797
fuzz-18 players=5 winner=p1 turns=156 actions=1465
fuzz-19 players=6 winner=p1 turns=229 actions=2523
fuzz-20 players=3 winner=p3 turns=165 actions=705
fuzz-21 players=4 winner=p1 turns=297 actions=1537
fuzz-22 players=5 winner=p4 turns=124 actions=1253
fuzz-23 players=6 winner=p3 turns=183 actions=2139
fuzz-24 players=3 winner=p1 turns=181 actions=789
fuzz-25 players=4 winner=p3 turns=147 actions=816
fuzz-26 players=5 winner=p5 turns=375 actions=3534
fuzz-27 players=6 winner=p2 turns=230 actions=2591
fuzz-28 players=3 winner=p2 turns=122 actions=538
fuzz-29 players=4 winner=p3 turns=187 actions=947
fuzz-30 players=5 winner=p1 turns=116 actions=1121
fuzz-31 players=6 winner=p1 turns=235 actions=2863
fuzz-32 players=3 winner=p2 turns=188 actions=892
fuzz-33 players=4 winner=p1 turns=353 actions=1932
fuzz-34 players=5 winner=p5 turns=215 actions=2097
fuzz-35 players=6 winner=p4 turns=304 actions=3391
fuzz-36 players=3 winner=p1 turns=247 actions=1002
fuzz-37 players=4 winner=p2 turns=250 actions=1257
fuzz-38 players=5 winner=p4 turns=119 actions=1086
fuzz-39 players=6 winner=p2 turns=212 actions=2329
fuzz-40 players=3 winner=p3 turns=189 actions=820
fuzz-41 players=4 winner=p1 turns=353 actions=1922
fuzz-42 players=5 winner=p5 turns=200 actions=1921
fuzz-43 players=6 winner=p1 turns=145 actions=1670
fuzz-44 players=3 winner=p2 turns=200 actions=967
fuzz-45 players=4 winner=p1 turns=101 actions=450
fuzz-46 players=5 winner=p2 turns=102 actions=977
fuzz-47 players=6 winner=p6 turns=228 actions=2626
fuzz-48 players=3 winner=p3 turns=219 actions=1081
fuzz-49 players=4 winner=p2 turns=214 actions=1045
```
