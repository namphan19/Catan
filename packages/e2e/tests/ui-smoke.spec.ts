// UI smoke suite for the Boschtan web client (hot-seat).
// Screenshots: full-page, saved to docs/qa/screenshots/ (desktop project) and
// docs/qa/screenshots/tablet/ (tablet project evidence).
import { test, expect, type Page } from '@playwright/test';
import { VI, actionButton, captureErrors, confirmCover, playSetupUntilRoll, shotPath, terrainImagesLoaded } from './helpers';

async function newPage(page: Page, path = '/'): Promise<() => string[]> {
  const errors = captureErrors(page);
  await page.goto(path);
  return errors;
}

test('home screen is Vietnamese, language toggle switches EN and back', async ({ page }) => {
  const errors = await newPage(page);

  // Vietnamese by default: title, subtitle and the toggle button.
  await expect(page).toHaveTitle(/Boschtan/);
  await expect(page.locator('h1')).toHaveText('Boschtan');
  await expect(page.getByText(VI.subtitle)).toBeVisible();
  await expect(page.getByRole('button', { name: VI.langToEn })).toBeVisible();

  // Toggle to English and back.
  await page.getByRole('button', { name: VI.langToEn }).click();
  await expect(page.getByText(VI.subtitleEn)).toBeVisible();
  await expect(page.getByRole('button', { name: VI.langToVi })).toBeVisible();
  await page.getByRole('button', { name: VI.langToVi }).click();
  await expect(page.getByText(VI.subtitle)).toBeVisible();

  await page.screenshot({ path: shotPath('home.png', test.info().project.name), fullPage: true });
  expect(errors()).toEqual([]);
});

test('4-player hot-seat game seed e2e-1: board, setup, roll, end turn, trade panel', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await newPage(page);
  const project = test.info().project.name;

  // Start a 4-player game with the fixed seed.
  await page.getByLabel(VI.players).selectOption('4');
  await page.getByLabel(VI.seed).fill('e2e-1');
  await page.getByRole('button', { name: VI.start }).click();

  // Pass-device cover appears before the first reveal and hides the hand behind it.
  const cover = page.locator('.cover');
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAttribute('aria-modal', 'true');
  await expect(cover).toContainText(VI.coverTitle);
  const coverBox = await cover.boundingBox();
  const vp = page.viewportSize()!;
  expect(
    coverBox && coverBox.height >= vp.height && coverBox.width >= vp.width,
    `cover fills the viewport (${vp.width}x${vp.height}); got ${coverBox?.width}x${coverBox?.height}`,
  ).toBe(true);

  // Board renders 19 hexes with real terrain art (no fallback shapes).
  const board = await terrainImagesLoaded(page);
  expect(board.tiles).toBe(19);
  expect(board.images).toBeGreaterThanOrEqual(5); // forest, claypit, meadow, field, quarry, sea
  expect(board.broken, `broken terrain images: ${board.broken.join(', ')}`).toEqual([]);

  await confirmCover(page);

  // Setup phase: settlement spots are highlighted and clickable.
  await expect(page.locator('.hit-vertex').first()).toBeVisible();
  await page.screenshot({ path: shotPath('setup.png', project), fullPage: true });

  // Click highlighted spots (covers confirmed between players) until the roll is possible.
  const { coversAfterFirst } = await playSetupUntilRoll(page);
  expect(coversAfterFirst, 'pass-device cover appeared between players during setup').toBeGreaterThan(0);
  await expect(actionButton(page, VI.rollText)).toBeEnabled();

  // Roll dice.
  await actionButton(page, VI.rollText).click();

  // Log shows Vietnamese lines.
  const logLines = page.locator('.log-list li');
  await expect(logLines.first()).toBeVisible();
  const logText = await logLines.first().textContent();
  expect(logText && logText.includes('·'), `log line should be Vietnamese: ${logText}`).toBe(true);
  expect(logText, 'log must not be the English fallback').not.toMatch(/Roll dice|End turn/);

  await page.screenshot({ path: shotPath('main-turn.png', project), fullPage: true });

  // End turn: next player's pass-device cover appears (hand hidden again).
  await actionButton(page, VI.endTurnText).click();
  await expect(cover).toBeVisible();
  await expect(cover).toContainText(VI.coverTitle);
  await confirmCover(page);

  // Open the trade panel (player trade tab) and screenshot it.
  await actionButton(page, VI.tradePlayersText).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(VI.tradeDialogTitle);
  await page.screenshot({ path: shotPath('trade-dialog.png', project), fullPage: true });

  expect(errors()).toEqual([]);
});

test('6-player game starts on the large board (30 hexes)', async ({ page }) => {
  const errors = await newPage(page);
  const project = test.info().project.name;

  await page.getByLabel(VI.players).selectOption('6');
  await page.getByLabel(VI.seed).fill('e2e-large');
  await page.getByRole('button', { name: VI.start }).click();

  await confirmCover(page);

  const board = await terrainImagesLoaded(page);
  expect(board.tiles).toBe(30);
  expect(board.broken, `broken terrain images: ${board.broken.join(', ')}`).toEqual([]);

  await page.screenshot({ path: shotPath('large-board.png', project), fullPage: true });
  expect(errors()).toEqual([]);
});
