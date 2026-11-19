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

  const panel = page.locator('.sh-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.sh-track li')).toHaveCount(8); // 7 steps + the shore
  await expect(panel.locator('.sh-levels tbody tr')).toHaveCount(4);
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

  await expect(page.locator('.sh-panel')).toBeVisible();
  expect(await page.locator('.sh-warden').count()).toBeGreaterThanOrEqual(2);
  await clearHover(page);
  await page.screenshot({ path: shotPath('strongholds-midgame.png', testInfo.project.name), fullPage: true });

  // Advance cards sit in the bottom-left of the board, above the hand, by name only (PO 2026-11-18):
  // a click opens the full card with its effect and the Play button; Esc closes it again.
  await expect(page.locator('.sh-panel .sh-card')).toHaveCount(0);
  const tab = page.locator('.sh-hand .sh-hand-tab').first();
  await expect(tab).toBeVisible();
  const boardBox = (await page.locator('.board-area').boundingBox())!;
  const tabBox = (await tab.boundingBox())!;
  expect(tabBox.x - boardBox.x, 'cards in the left part of the board').toBeLessThan(boardBox.width / 3);
  expect(boardBox.y + boardBox.height - (tabBox.y + tabBox.height), 'cards at the bottom of the board').toBeLessThan(40);
  await expect(page.locator('.sh-hand-face')).toHaveCount(0);
  await tab.click();
  const face = page.locator('.sh-hand-face');
  await expect(face).toBeVisible();
  await expect(face.locator('.sh-reveal-fx')).not.toBeEmpty();
  await expect(face.getByRole('button', { name: 'Chơi', exact: true })).toBeVisible();
  await page.screenshot({ path: shotPath('strongholds-card-open.png', testInfo.project.name), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(face).toHaveCount(0);

  // Start any enabled expansion action: the chooser must ask for a spot on the board or show options.
  const button = page.locator('.sh-panel button[data-sh]:not([disabled]), .sh-panel button[data-improve]:not([disabled])').first();
  if ((await button.count()) > 0) {
    const before = await page.locator('.log-line, .log li').count();
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
    await expect
      .poll(async () => (await page.locator('.log-line, .log li').count()) >= before)
      .toBeTruthy();
  }
  expect(errors()).toEqual([]);
});
