# Archive

Retired parts of the project, kept for reference (PO request, 2026-11-18). Nothing here is
built, tested or served. Files were moved with `git mv` where tracked, so their history is
intact (`git log --follow archive/<path>`).

| folder | what | was at |
|---|---|---|
| `3d/client-src/board3d/` | the three.js 3D board (Board3D, terrain, pieces, Strongholds pieces, textures) | `packages/client/src/board3d/` |
| `3d/client-src/BoardSwitch.tsx` | 2D/3D switch with WebGL probe and fallback | `packages/client/src/board/` |
| `3d/e2e/board3d.spec.ts` | 3D e2e spec (SwiftShader project) | `packages/e2e/tests/` |
| `3d/qa-screenshots/3d/` | 3D QA screenshots | `docs/qa/screenshots/3d/` |
| `assets-svg-v1/` | first vector art set: terrain, resource cards, dev cards, goods icons, harbor icons, dice, number token; `check.cjs` / `preview.html` tooling | `packages/client/public/assets/` |
| `agent-team/` | opencode agent-team workflow: `scripts/` (run-role, dispatch, launch...), `team/` (roles, task files, model config, logs), `tools/` (wf.py, autoheal.py, health.py, jobrunner.py), `tests/` (their pytest), the plan/acceptance templates and the old `CLAUDE.md` | repo root |

## Restoring the 3D board

1. Move `3d/client-src/board3d/` back to `packages/client/src/board3d/` and `BoardSwitch.tsx` to
   `packages/client/src/board/`.
2. In `GameTable.tsx` render `BoardSwitch` again (mode state, `readBoardMode`/`writeBoardMode`,
   fallback toast) and pass `boardMode`/`onBoardMode` to `TopBar`; restore the 2D/3D toggle in
   `TopBar.tsx` and the `board_view*` / `board3d_*` strings in `i18n/en.ts` and `i18n/vi.ts`
   (all visible in git history).
3. The 3D textures used the vector terrain SVGs: restore `assets-svg-v1/terrain/` too.
4. Put `board3d.spec.ts` back and re-add the `3d` Playwright project.

The `three`, `@react-three/fiber` and `@react-three/drei` dependencies are still listed in
`packages/client/package.json` (unused now; nothing imports them, so they are not bundled).
