// Highlands expansion in the hot-seat client: the option on the home screen (2-4 players, no other
// expansion), the coast-and-jungle map, setup, the side panel with culture tracks, overgrown buildings
// mid-game, and founding a new tribe on a highlighted spot (replay fixtures from tools/gen-highlands-log.mts).
// Real clicks; desktop and tablet.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { VI, captureErrors, clearHover, closeDrawer, confirmCover, openBuildMenu, openDrawer, playSetupUntilRoll, shotPath, setPlayers, setSeed, openLogBox, pickMode } from './helpers';

const fixture = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name), 'utf8');

async function loadFixture(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await openLogBox(page);
  await page.locator('.export-box').first().fill(fixture(name));
  await page.getByRole('button', { name: VI.loadReplay }).click();
  await confirmCover(page);
}

test('a new highlands game: option, map, setup and the side panel', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  await page.goto('/');
  await setPlayers(page, '3');
  await setSeed(page, 'e2e-hl');
  await pickMode(page, 'sh');
  await pickMode(page, 'hl');
  await page.getByTestId('highlands-select').selectOption('starter');
  // Highlands plays alone with 2-4 players: picking it drops Strongholds and the 5-6 seats.
  await expect(page.locator('.hub-mode[data-mode="sh"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.hub-count')).toHaveCount(3);
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
  await playSetupUntilRoll(page);

  // HUD: each player's three tribes under the name; the full panel is a drawer.
  await expect(page.locator('.seats .hl-seat-line')).toHaveCount(3);
  await openDrawer(page);
  await expect(page.locator('.hl-panel tr[data-hl-player]')).toHaveCount(3);
  await expect(page.locator('.hl-panel')).toContainText('2/11');
  await closeDrawer(page);
  // 30 hexes: coast, land, jungle and the wilds; the blocker rests in the wilds.
  expect(await page.locator('.hex-tile, .sea-tile').count()).toBeGreaterThanOrEqual(30);
  await expect(page.locator('.hand .res-card[data-res="fish"]')).toHaveCount(1);
  await clearHover(page);
  await page.screenshot({ path: shotPath('highlands-start.png', testInfo.project.name), fullPage: true });
  expect(errors()).toEqual([]);
});

test('mid-game: overgrown buildings, culture tracks and the build costs', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = captureErrors(page);
  await loadFixture(page, 'highlands-midgame.json');
  await expect(page.locator('.seats .hl-seat-line')).toHaveCount(3);
  expect(await page.locator('[data-ruin]').count()).toBeGreaterThanOrEqual(4);
  expect(await page.locator('.hl-tribe.done').count()).toBeGreaterThanOrEqual(2);
  // Build costs live in the card of each round build button (no price card any more).
  await openBuildMenu(page);
  await page.locator('.act-build .build-slot').first().hover();
  await expect(page.locator('.act-build .build-slot').first().locator('.build-tip')).toBeVisible();
  await expect(page.locator('.act-build .build-slot').first().locator('.build-tip .cost-unit')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await clearHover(page);
  await page.screenshot({ path: shotPath('highlands-midgame.png', testInfo.project.name), fullPage: true });

  // The longest-route power (caravan): give 2 cards, take 1 of another kind, once per turn.
  const caravan = page.locator('.act-build button[data-build="caravan"]');
  if ((await caravan.count()) > 0 && (await caravan.isEnabled())) {
    await openBuildMenu(page);
    const cards = async () => Number((await page.locator('.hand-total').innerText()).replace(/\D/g, ''));
    const before = await cards();
    await caravan.click();
    const pickers = page.locator('.dialog .hl-picker');
    await expect(pickers).toHaveCount(2);
    for (let i = 0; i < 2; i++) await pickers.nth(0).locator('button[aria-label^="+"]:not([disabled])').first().click();
    await pickers.nth(1).locator('button[aria-label^="+"]:not([disabled])').first().click();
    await page.screenshot({ path: shotPath('highlands-caravan.png', testInfo.project.name), fullPage: true });
    await page.locator('.dialog .dialog-actions .btn-primary').click();
    await expect.poll(cards).toBe(before - 1);
    await expect(caravan).toBeDisabled();
  }
  expect(errors()).toEqual([]);
});

test('founding a new tribe: pick a highlighted spot, the turn passes', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = captureErrors(page);
  await loadFixture(page, 'highlands-found.json');
  await expect(page.locator('.sh-pickbar')).toContainText('Khai lập bộ tộc mới');
  await expect(page.locator('.hl-moment')).toBeVisible();
  const spots = await page.locator('.hit-vertex').count();
  expect(spots).toBeGreaterThan(0);
  await clearHover(page);
  await page.screenshot({ path: shotPath('highlands-found.png', testInfo.project.name), fullPage: true });
  const before = await page.locator('.seats').innerText();
  await page.locator('.hit-vertex').first().click({ force: true });
  // Founding ends the turn: the pass-device cover asks for the next player.
  await expect(page.locator('.cover')).toBeVisible();
  await confirmCover(page);
  await expect(page.locator('.sh-pickbar')).toHaveCount(0);
  expect(await page.locator('.seats').innerText()).not.toBe(before);
  expect(errors()).toEqual([]);
});
