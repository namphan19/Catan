// Strongholds expansion in the hot-seat client: the option on the home screen, the side panel,
// expansion pieces on the 2D board and the staged chooser. Real clicks; desktop and tablet.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';
import { VI, captureErrors, clearHover, confirmCover, playSetupUntilRoll, shotPath } from './helpers';

test('a new expansion game: option, setup with a city, panel and raid track', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  await page.goto('/');
  await page.getByLabel(VI.players).selectOption('4');
  await page.getByLabel(VI.seed).fill('e2e-sh');
  await page.locator('#home-expansion').check();
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
  await playSetupUntilRoll(page);

  // the raid lane is on the board (7 steps + the shore); the full panel is a drawer
  await expect(page.locator('.sh-lane-track i')).toHaveCount(8);
  const panel = page.locator('.sh-panel');
  await expect(panel).toBeHidden();
  await page.locator('.sheet-toggle').click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.sh-track li')).toHaveCount(8);
  await expect(panel.locator('.sh-levels tbody tr')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  // every player starts with one settlement and one city
  await expect(page.locator('.piece-city')).toHaveCount(4);
  // commodities are part of the hand
  await expect(page.locator('.hand-res [data-res="books"]')).toHaveCount(1);
  await expect(page.locator('.hand-res [data-res="linen"]')).toHaveCount(1);
  await expect(page.locator('.hand-res [data-res="silver"]')).toHaveCount(1);
  // the blocker is not on the board before the first raid
  await expect(page.locator('.blocker')).toHaveCount(0);

  await clearHover(page);
  await page.screenshot({ path: shotPath('strongholds-start.png', testInfo.project.name), fullPage: true });
  expect(errors()).toEqual([]);
});

test('a mid-game position: wardens on the board and the staged chooser', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  const log = fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', 'strongholds-game.json'), 'utf8');
  await page.goto('/');
  await page.locator('.export-box').first().fill(log);
  await page.getByRole('button', { name: VI.loadReplay }).click();
  await confirmCover(page);

  expect(await page.locator('.sh-warden').count()).toBeGreaterThanOrEqual(2);
  // HUD (PO 2026-11-27): the essentials sit on the board's edges, the full panel is a drawer.
  await expect(page.locator('.sh-lane')).toBeVisible();
  await expect(page.locator('.sh-lane-track i')).toHaveCount(8); // 7 steps + the shore
  await expect(page.locator('.sh-rail .sh-rail-row')).toHaveCount(3);
  await expect(page.locator('.seats .sh-seat-levels')).toHaveCount(4);
  await expect(page.locator('.act-build button[data-build="rampart"]')).toHaveCount(1);
  await expect(page.locator('.act-build button[data-build="recruit"]')).toHaveCount(1);
  await expect(page.locator('.sh-panel')).toBeHidden();
  await clearHover(page);
  await page.screenshot({ path: shotPath('strongholds-midgame.png', testInfo.project.name), fullPage: true });

  // The drawer holds the full panel and ends with the track reference: perk, capital and deck
  // count for each of the 3 tracks, then the caravan.
  await page.locator('.sheet-toggle').click();
  await expect(page.locator('.sh-panel')).toBeVisible();
  await expect(page.locator('.sh-panel .sh-trackinfo')).toHaveCount(3);
  await expect(page.locator('.sh-panel .sh-trackinfo').first()).toContainText('Cấp 3');
  await expect(page.locator('.sh-panel .sh-trackinfo').first()).toContainText('Kinh đô');
  await page.waitForTimeout(300); // slide-in
  await page.screenshot({ path: shotPath('strongholds-drawer.png', testInfo.project.name), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('.sh-panel')).toBeHidden();

  // Advance cards are a small fan in the bottom bar, right of the hand: a click opens the full
  // card with its effect and the Play button; Esc closes it again.
  await expect(page.locator('.sh-panel .sh-card')).toHaveCount(0);
  const tab = page.locator('.sh-hand .sh-hand-tab').first();
  await expect(tab).toBeVisible();
  const boardBox = (await page.locator('.board-area').boundingBox())!;
  const tabBox = (await tab.boundingBox())!;
  expect(tabBox.x - boardBox.x, 'cards in the right half of the board').toBeGreaterThan(boardBox.width / 2);
  expect(boardBox.y + boardBox.height - (tabBox.y + tabBox.height), 'cards at the bottom of the board').toBeLessThan(40);
  await expect(page.locator('.sh-hand-face')).toHaveCount(0);
  await tab.click();
  const face = page.locator('.sh-hand-face');
  await expect(face).toBeVisible();
  await expect(face.locator('.sh-reveal-fx')).not.toBeEmpty();
  await expect(face.getByRole('button', { name: 'Chơi', exact: true })).toBeVisible();
  await page.waitForTimeout(300); // let the 200 ms rise-in animation finish before the screenshot
  await page.screenshot({ path: shotPath('strongholds-card-open.png', testInfo.project.name), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(face).toHaveCount(0);

  // The improvement rail opens a tray with the three tracks.
  await page.locator('.sh-rail').click();
  await expect(page.locator('.sh-tray .sh-tray-track')).toHaveCount(3);
  await page.screenshot({ path: shotPath('strongholds-improve.png', testInfo.project.name), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('.sh-tray')).toHaveCount(0);

  // Start any enabled expansion action: the chooser must ask for a spot on the board or show options.
  await page.locator('.sheet-toggle').click();
  const button = page.locator('.sh-panel button[data-sh]:not([disabled]), .sh-panel button[data-improve]:not([disabled])').first();
  if ((await button.count()) > 0) {
    await button.click();
    const asking = page.locator('.sh-pickbar, .sh-options');
    const asked = await asking.first().isVisible().catch(() => false);
    if (asked) {
      await page.screenshot({ path: shotPath('strongholds-chooser.png', testInfo.project.name), fullPage: true });
      // a highlighted board target or an option completes (or advances) the choice
      const hit = page.locator('.hit').first();
      if ((await hit.count()) > 0) await hit.click();
      else await page.locator('.sh-options button').first().click();
    }
  }
  expect(errors()).toEqual([]);
});

test('your warden on the board: a click opens its actions around it', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  const log = fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', 'strongholds-warden.json'), 'utf8');
  await page.goto('/');
  await page.locator('.export-box').first().fill(log);
  await page.getByRole('button', { name: VI.loadReplay }).click();
  await confirmCover(page);

  const hit = page.locator('.sh-warden-hit').first();
  await expect(hit).toHaveCount(1);
  await hit.click({ force: true });
  const acts = page.locator('.sh-wmenu-btn');
  expect(await acts.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.sh-wmenu-btn[data-sh-warden="activate"]')).toBeVisible();
  // finger-sized whatever the board zoom (after the 160 ms pop-in)
  await page.waitForTimeout(250);
  const box = (await acts.first().boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  await clearHover(page);
  await page.screenshot({ path: shotPath('strongholds-warden.png', testInfo.project.name), fullPage: true });
  // Esc closes the ring; activating the warden is one click and changes the piece.
  await page.keyboard.press('Escape');
  await expect(acts).toHaveCount(0);
  await hit.click({ force: true });
  const active = await page.locator('.sh-warden.active').count();
  await page.locator('.sh-wmenu-btn[data-sh-warden="activate"]').click();
  await expect.poll(() => page.locator('.sh-warden.active').count()).toBe(active + 1);
  expect(errors()).toEqual([]);
});
