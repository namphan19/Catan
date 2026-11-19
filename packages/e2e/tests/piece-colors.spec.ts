// BUG (pieces rendered BLACK): all roads/settlements/cities used to render with a black
// fill because the art was loaded through <image>, where fill="currentColor" never sees
// the player colour. This spec renders the 4-player setup with REAL clicks and then
// asserts, in the browser's computed style, that piece shapes really are painted in the
// players' colours (from ui/colors.ts -> tokens.css --p1..--p6) and never black, for
// settlements AND a road. It also checks that the pieces carry no emblem seal (PO decision)
// and that the art keeps its outline / painted sprite.
//
// Two art modes are accepted: the painted Tripo sprites (art2d/piece/*.webp, grey art tinted
// by a per-seat multiply filter whose feFlood carries the player colour) and the vector
// fallback (inline SVG with fill="currentColor"). Either way the probe reports the colour
// the piece is painted with.
import { test, expect, type Page } from '@playwright/test';
import { PLAYER_COLORS } from '../../client/src/ui/colors';
import { VI, actionButton, captureErrors, clearHover, confirmCover, playSetupUntilRoll, shotPath } from './helpers';

/** "#rrggbb" (or any css colour) as Chrome reports computed fills: "rgb(r, g, b)". */
function asRgb(cssColor: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(cssColor.trim());
  if (!m) return cssColor.trim();
  const n = Number.parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** The players' colours as computed rgb strings, from the client's own source of truth. */
async function expectedPlayerColors(page: Page): Promise<Set<string>> {
  // PLAYER_COLORS maps p1..p6 -> var(--pN); tokens.css pins those to hex values.
  const names = Object.values(PLAYER_COLORS).map((v) => /^var\((--[\w-]+)\)$/.exec(v)?.[1] ?? v);
  const values = await page.evaluate(
    (vars: string[]) => vars.map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()),
    names,
  );
  return new Set(values.map(asRgb));
}

interface PieceProbe {
  buildingFills: string[];
  roadFills: string[];
  buildings: number;
  emblemSeals: number;
  outlinedPaths: number;
}

/** Computed fills of the piece shapes that are meant to be player-coloured. */
async function probePieces(page: Page): Promise<PieceProbe> {
  return page.evaluate(() => {
    const fills = (sel: string) =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => getComputedStyle(el as Element).fill)
        .filter((f) => f !== 'none');
    // Painted sprite: <image filter="url(#tint-pN)">; its colour is the filter's flood colour.
    const tints = (sel: string) =>
      Array.from(document.querySelectorAll(sel)).map((el) => {
        const id = /url\(#([\w-]+)\)/.exec(el.getAttribute('filter') ?? '')?.[1];
        const flood = id ? document.getElementById(id)?.querySelector('feFlood') : null;
        return flood ? getComputedStyle(flood).floodColor : 'none';
      });
    const sprites = (sel: string) => tints(sel.split(',').map((x) => `${x.trim()}[data-sprite]`).join(', '));
    const buildings = document.querySelectorAll('.pieces .piece-settlement, .pieces .piece-city').length;
    return {
      // Only the art's currentColor shapes: strokes-only decoration keeps SVG's default
      // black fill (unpainted), which must not count as a "black piece".
      buildingFills: [
        ...fills('.pieces .piece-settlement [fill="currentColor"], .pieces .piece-city [fill="currentColor"]'),
        ...sprites('.pieces .piece-settlement, .pieces .piece-city'),
      ],
      roadFills: [...fills('.pieces .piece-road [fill="currentColor"]'), ...sprites('.pieces .piece-road')],
      buildings,
      emblemSeals: document.querySelectorAll('.pieces .piece-emblem').length,
      // Vector art keeps the artist's ink outline; painted sprites carry their own shading.
      outlinedPaths:
        document.querySelectorAll('.pieces .piece-body [stroke="#3B2F2F"]').length +
        document.querySelectorAll('.pieces [data-sprite]').length,
    };
  });
}

test('4-player setup: settlements and roads render in player colours, never black', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  const project = test.info().project.name;

  await page.goto('/');
  await page.getByLabel(VI.players).selectOption('4');
  await page.getByLabel(VI.seed).fill('e2e-1');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);

  // Whole setup phase by real clicks (covers confirmed between players).
  await playSetupUntilRoll(page);
  await expect(actionButton(page, VI.rollText)).toBeEnabled();

  const probe = await probePieces(page);
  const expected = await expectedPlayerColors(page);

  // After setup every player owns 2 settlements: the probe must show real, coloured art.
  expect(probe.buildings, 'settlements/cities on the board').toBeGreaterThanOrEqual(8);
  expect(probe.buildingFills.length, 'coloured settlement shapes found').toBeGreaterThanOrEqual(8);

  const unique = [...new Set(probe.buildingFills)];
  // Not black (the old bug), not the ink outline colour, and each fill is a player colour.
  for (const f of probe.buildingFills) {
    expect(f, 'settlement fill must not be black').not.toBe('rgb(0, 0, 0)');
    expect(expected.has(f), `settlement fill ${f} must be a player colour from ui/colors.ts`).toBe(true);
  }
  // "Players cannot be told apart" is only fixed if more than one colour shows up.
  expect(unique.length, `settlements of at least two different players coloured; got ${unique.join(', ')}`).toBeGreaterThanOrEqual(2);

  // Same check for one road.
  expect(probe.roadFills.length, 'coloured road shapes found').toBeGreaterThanOrEqual(1);
  for (const f of probe.roadFills) {
    expect(f, 'road fill must not be black').not.toBe('rgb(0, 0, 0)');
    expect(expected.has(f), `road fill ${f} must be a player colour from ui/colors.ts`).toBe(true);
  }

  // PO decision (2026-11-18): no emblem seals on the pieces any more (the board is clear
  // enough by colour); make sure none come back by accident.
  expect(probe.emblemSeals, 'no emblem seals on settlements/cities').toBe(0);
  expect(probe.outlinedPaths, 'ink outline (vector) or painted sprite present in the piece art').toBeGreaterThan(0);

  await clearHover(page);
  await page.screenshot({ path: shotPath('pieces-colors.png', project), fullPage: true });
  expect(errors()).toEqual([]);
});
