# QA bug reports - base rules engine

Reported by: qa. This role reports defects; fixes belong to the owning role (lead / engine).
Severity: **blocker** (illegal state, wrong result), **major** (rule violated in a reachable path),
**minor** (contract/doc mismatch, no illegal state).

Open bugs: 2. Fixed/verified: 1 (BUG-QA-01: docs/API.md corrected to 5000 by lead).

---

## BUG-QA-01 - discard legal-action list exceeds the documented sample cap (minor, fixed/verified)

**Rule / contract:** `docs/API.md` > `getLegalActions`: "Open-ended spaces are sampled: offers = all
1-for-1 offers, **discards = up to 200 combinations**". `docs/RULES.md` 5.3 only fixes the owed
*amount*, so the game result is not wrong - the engine returns a larger list than the API contract.

**Expected:** at most 200 `discard` actions from `getLegalActions` for one 20-card debtor.
**Actual:** 381 `discard` actions. The engine's own comment (`src/rules/base/helpers.ts:141`) and
`src/rules/base/turn.ts:85` say the cap is `subBags`' default of **5000**, i.e. the implementation and
`docs/API.md` disagree. `validateAction` still accepts any exact bag, so no illegal state is possible;
the impact is contract drift and an oversized legal-action payload for the server/client (M2).

**Exact repro** (vitest/tsx, seed not needed - `blankGame` uses seed `blank`):

```ts
const s = blankGame(4, { k: 'preRoll' });                    // test/helpers.ts
setHand(s, 'p1', { timber: 4, clay: 4, fiber: 4, grain: 4, stone: 4 }); // 20 cards
s.ext.forceDice = [3, 4];                                    // forced 7
const r = act(s, { t: 'roll', player: 'p1' });               // discard owed: { p1: 10 }
const n = getLegalActions(r, 'p1').filter((a) => a.t === 'discard').length;
// n === 381, docs/API.md promises <= 200
```

Observed with `npx vitest run test/qa` (temporary probe, now removed): `DISCARD_ACTIONS=381`.

**Covered by:** `packages/engine/test/qa/production-turn.test.ts` - "discarding from a 20-card hand
works; legal actions stay exact" (asserts every listed bag has size 10, does not pin the count, so the
suite stays green either way).

**Suggested resolution (owner: lead):** pick one authoritative number. Either pass `limit = 200` in
`discard.legal()` (matches `docs/API.md`), or change `docs/API.md` to "up to 5000 combinations". If the
cap becomes 200, note that not every exact bag is then listed; `validateAction` remains authoritative.

---

## Checked and not a bug (for the record)

- Free-road window closing when the second spot is blocked: `src/rules/base/build.ts:117-120` checks
  `legalRoadSpots` after every free road; reproduced manually and pinned in
  `qa/build-pieces.test.ts` - "places only 1 road when the second spot is blocked by opponent roads".
- Extra build win timing: a player reaching 10 in another player's window does not win there
  (`checkWinner` skips `setup`/`extraBuild`), wins at own turn start - matches D11.
- Harbor spacing: consecutive harbor positions differ by at most one coast edge for standard and large
  boards (D14), pinned in `qa/setup-board.test.ts`.

---

## BUG-QA-02 - board clicks unreachable: setPointerCapture retargets `click` to the SVG (major, open)

**Component:** `packages/client` `Board.tsx` (input pipeline). Found while writing the UI smoke suite
(`packages/e2e/tests/helpers.ts` > `clickHit`).

**Symptom:** a real (trusted) click on a highlighted board hit target never triggers its `onClick`:
the setup phase cannot be played with a real mouse/touch input and the log stays empty. A
`dispatchEvent('click')` (synthetic, untrusted) on the same element DOES register the move.

**Repro (manual):**
1. `pnpm --filter @hexgame/client dev`, open the app, start a 4-player game, confirm the cover.
2. In devtools, run
   `document.querySelector('.hit-vertex')`.
3. Click a highlighted spot like a real user.
4. Expected: settlement placed. Actual: nothing; a `dispatchEvent('click')` on the same element works.

**Root cause (verified by probe):** the board calls `setPointerCapture` on the `<svg>` for every
`pointerdown`, so Chromium retargets the subsequent `click` event to the `<svg>` element; the hit
circle's listener never fires.

**Impact:** the real hot-seat setup cannot be played with mouse input at all until this is fixed
(the e2e suite drives board clicks synthetically as a workaround).

---

## BUG-QA-03 - disabled action buttons carry the untranslated English disable-reason as aria-label (minor, open)

**Component:** `packages/client` `Button` component. Found via `packages/e2e` (BUG-QA-03 note in
`packages/e2e/tests/helpers.ts`).

**Symptom:** when an action button is disabled its accessible name / tooltip is the raw English
validation tip, e.g. `aria-label="WRONG_PHASE: roll is not allowed in phase."`, so
`getByRole('button', { name: 'Gieo xúc xắc' })` cannot find the button even though its visible label
is Vietnamese. Visible to users as an untranslated English tooltip clipped at the screen edge
(see `docs/qa/UI_SMOKE.md` V1, screenshots `main-turn.png`, `tablet/main-turn.png`).

**Repro:** start any game, look at the Roll button in the setup phase (devtools > accessibility tree
or hover it).

**Fix suggestion:** translate the disable reason for the visible tooltip and keep `aria-label` to the
actual label text (or `aria-disabled` semantics); expose the reason via `title` in the UI language.
