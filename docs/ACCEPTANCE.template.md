# <Project name> - Acceptance report

Date: <YYYY-MM-DD> · Author: tech lead · Accepted by: <PO>
Copy to `docs/ACCEPTANCE.md`. Write only what was run and measured; say plainly what is not done. Write it in the
language the PO reads.

## 1. Conclusion
<Accepted / accepted with conditions / not accepted, in 2-3 sentences. If "with conditions", name the conditions.>

## 2. Release criteria
Copy the "release criteria" from the backlog; one row each.

| # | Criterion | Result | Evidence (test, command, file) |
|---|---|---|---|
| 1 | <criterion> | Pass / Fail | <where to see it> |

Full automated run: `<command>` -> <N suites pass / M fail> (list the counts per suite).

## 3. Manual / browser scenarios
Run the charters in `docs/qa/CHARTERS.md` on the real stack (not mocks). Record a measurement, not an impression.

| Charter | Result | Measured |
|---|---|---|
| <C01 name> | Pass / Fail / Fixed | <numbers, observed text, screenshot name> |

Performance against the non-functional requirements: <measured values vs targets; say "not measured" if not>.

## 4. Known limitations (the PO must know these before relying on the product)
1. <limitation, with the number or behaviour that shows it>

## 5. Defects found while running the scenarios
| ID | Severity | Description | Fix / status |
|---|---|---|---|
| BUG-001 | <High/Low> | <what, and why earlier tests missed it> | <fixed + regression test / deferred / rejected by design> |

## 6. Deferred improvements (agreed to postpone), in suggested order
1. <item>

## 7. How to re-run
```
<command for all automated suites>
<commands to start the app for a manual check>
```

## 8. Updates after sign-off
<Dated list of changes made after this report (infrastructure, docs refresh), so the report stays accurate.>
