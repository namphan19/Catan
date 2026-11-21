// Phone layout (packages/client/src/table/mobile.css): portrait 390 x 844 and landscape 844 x 390,
// touch emulation, real taps. Runs only in the "mobile" project.
import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { VI, actionButton, captureErrors, clearHover, confirmCover, playSetupUntilRoll, shotPath } from './helpers';

const fixture = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name), 'utf8');

async function loadFixture(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.locator('.export-box').first().fill(fixture(name));
  await page.getByRole('button', { name: VI.loadReplay }).click();
  await confirmCover(page);
}

/** The page never scrolls: no sideways overflow and the table fits the screen height. */
async function expectFitsScreen(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.w);
  expect(m.sh).toBeLessThanOrEqual(m.h);
}

/** Box of the first element matching the selector (fails when it is missing). */
async function box(page: Page, sel: string) {
  const b = await page.locator(sel).first().boundingBox();
  expect(b, sel).not.toBeNull();
  return b!;
}

test('portrait: setup and first roll fit one screen, all players and buttons visible', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  await page.goto('/');
  await page.getByLabel(VI.players).selectOption('4');
  await page.getByLabel(VI.seed).fill('e2e-mobile');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);

  await expect(page.locator('.board-hint')).toBeVisible();
  await expectFitsScreen(page);
  // The four players share one row above the board.
  const seats = page.locator('.seat-strip .seat');
  await expect(seats).toHaveCount(4);
  const tops = await seats.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // The side column is a closed sheet; the hand and the action bar sit under the board.
  await expect(page.locator('.sidecol')).toBeHidden();
  const board = await box(page, '.board-area');
  const bar = await box(page, '.actionbar');
  expect(bar.y).toBeGreaterThanOrEqual(board.y + board.height - 1);
  await page.screenshot({ path: shotPath('mobile-setup.png', testInfo.project.name) });

  await playSetupUntilRoll(page);
  await actionButton(page, VI.rollText).click();
  await expect(page.locator('.dice-sum')).toBeVisible();
  await expectFitsScreen(page);
  // Every action button (End turn included) is on screen without scrolling the bar.
  const vw = page.viewportSize()!.width;
  const rights = await page.locator('.actionbar .btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  for (const r of rights) expect(r).toBeLessThanOrEqual(vw + 0.5);
  await clearHover(page);
  await page.screenshot({ path: shotPath('mobile-midgame.png', testInfo.project.name) });
  expect(errors()).toEqual([]);
});

test('portrait: the menu holds the shell buttons; the base game has no side sheet', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await loadFixture(page, 'city-game.json');
  await expectFitsScreen(page);

  // Shell buttons live in the menu.
  const home = page.getByRole('button', { name: /Về trang chủ/ });
  await expect(home).toBeHidden();
  await page.locator('.topbar-menu-btn').click();
  await expect(home).toBeVisible();
  await expect(page.getByRole('button', { name: VI.langToEn })).toBeVisible();
  await page.screenshot({ path: shotPath('mobile-menu.png', testInfo.project.name) });
  await page.keyboard.press('Escape');
  await expect(home).toBeHidden();

  // The log panel was removed (PO 2026-11-19): without an expansion there is no side column,
  // so no sheet button either.
  await expect(page.locator('.sheet-toggle')).toHaveCount(0);
  await expect(page.locator('.sidecol')).toHaveCount(0);
  expect(errors()).toEqual([]);
});

test('portrait: the Tidelands sheet opens over the board, closes, and building a cog arms the board', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await loadFixture(page, 'tidelands-firstLandfall.json');
  const sheet = page.locator('.sidecol');
  await page.locator('.sheet-toggle').click();
  await expect(sheet).toBeVisible();
  await expect(page.locator('.tl-panel')).toBeVisible();
  await page.waitForTimeout(300); // slide-in transition
  await page.screenshot({ path: shotPath('mobile-sheet.png', testInfo.project.name) });
  await page.locator('.sheet-close').click();
  await expect(sheet).toBeHidden();

  await page.locator('.sheet-toggle').click();
  await expect(page.locator('.tl-panel')).toBeVisible();
  const build = page.locator('.tl-panel button[data-tl="build"]');
  if (await build.isEnabled()) {
    await build.click();
    await expect(page.locator('.sidecol')).toBeHidden();
    expect(await page.locator('.hit-edge').count()).toBeGreaterThan(0);
    await page.screenshot({ path: shotPath('mobile-tidelands-build-cog.png', testInfo.project.name) });
  }
  expect(errors()).toEqual([]);
});

test('landscape: board on the left at full height, controls on the right, sheet closable', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await loadFixture(page, 'strongholds-active.json');
  await expectFitsScreen(page);

  const board = await box(page, '.board-area');
  const top = await box(page, '.topbar');
  const bar = await box(page, '.actionbar');
  expect(board.height).toBeGreaterThan(380);
  expect(top.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
  expect(bar.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
  await clearHover(page);
  await page.screenshot({ path: shotPath('mobile-landscape.png', testInfo.project.name) });

  // The sheet covers the right column, above the top bar, so its close button can be tapped.
  await page.locator('.sheet-toggle').click();
  await expect(page.locator('.sh-panel')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath('mobile-landscape-sheet.png', testInfo.project.name) });
  await page.locator('.sheet-close').click();
  await expect(page.locator('.sidecol')).toBeHidden();
  expect(errors()).toEqual([]);
});
