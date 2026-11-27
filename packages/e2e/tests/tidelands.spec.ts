// Tidelands (sea) expansion in the hot-seat client: the scenario option on the home screen, sea maps,
// setup with a road or a cog, building a cog from the side panel, the gold pick dialog, and mid-game
// positions of every special scenario (replay fixtures). Real clicks; desktop and tablet.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { VI, actionButton, captureErrors, clearHover, confirmCover, shotPath, openDrawer, closeDrawer, openBuildMenu } from './helpers';

/** One click on the first element of a highlighted board target. */
async function clickFirst(page: Page, sel: string): Promise<void> {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ force: true });
}

/** Answer whatever the table asks: option dialogs (road or cog, harbors), gold picks, covers. */
async function answerDialogs(page: Page): Promise<boolean> {
  const cover = page.locator('.cover');
  if (await cover.isVisible().catch(() => false)) {
    await confirmCover(page);
    return true;
  }
  const option = page.locator('.sh-options .option-btn').first();
  if (await option.isVisible().catch(() => false)) {
    // Prefer a cog when the dialog asks "road or cog" (exercise the sea).
    const cog = page.locator('.sh-options .option-btn', { hasText: /Thuyền/ }).first();
    await ((await cog.count()) > 0 ? cog : option).click();
    return true;
  }
  const plus = page.locator('.pick-row button[aria-label^="+"]:not([disabled])').first();
  if (await plus.isVisible().catch(() => false)) {
    while ((await page.locator('.pick-row button[aria-label^="+"]:not([disabled])').count()) > 0)
      await page.locator('.pick-row button[aria-label^="+"]:not([disabled])').first().click();
    await page.locator('.dialog-actions .btn-primary').click();
    return true;
  }
  return false;
}

async function setupUntilRoll(page: Page): Promise<void> {
  const roll = actionButton(page, VI.rollText);
  const deadline = Date.now() + 60_000;
  while (!(await roll.isEnabled())) {
    if (Date.now() > deadline) throw new Error('setup loop timed out');
    if (await answerDialogs(page)) continue;
    if ((await page.locator('.hit-vertex').count()) > 0) await clickFirst(page, '.hit-vertex');
    else if ((await page.locator('.hit-edge').count()) > 0) {
      // Sea edges first where the setup offers a cog (the last highlighted edges are usually at sea).
      await clickFirst(page, '.hit-edge >> nth=-1');
    } else await page.waitForTimeout(200);
    await page.waitForTimeout(100);
  }
}

test('a new sea game: scenario option, sea map, setup with cogs, the side panel', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  await page.goto('/');
  await page.getByLabel(VI.players).selectOption('4');
  await page.getByLabel(VI.seed).fill('e2e-tl');
  await page.getByTestId('scenario-select').selectOption('firstLandfall');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
  await setupUntilRoll(page);

  // HUD: the scenario and its goal sit in the turn line; the full panel is a drawer.
  await expect(page.locator('.tl-badge')).toContainText('Cập Bến Đầu Tiên');
  await openDrawer(page);
  await expect(page.locator('.tl-panel')).toContainText('Cập Bến Đầu Tiên');
  await closeDrawer(page);
  // sea hexes of the scenario map are drawn as water tiles, the corsair sails on one of them
  expect(await page.locator('.sea-tile').count()).toBeGreaterThan(30);
  await expect(page.locator('.tl-corsair')).toHaveCount(1);
  // the build row has a cog button; its hover card names it and its cost
  const cog = page.locator('.build-slot:has(button[data-build="ship"])');
  await expect(cog).toHaveCount(1);
  await expect(cog.locator('.build-tip')).toContainText('Thuyền buồm');
  await clearHover(page);
  await page.screenshot({ path: shotPath('tidelands-start.png', testInfo.project.name), fullPage: true });
  expect(errors()).toEqual([]);
});

const fixture = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name), 'utf8');

async function loadFixture(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.locator('.export-box').first().fill(fixture(name));
  await page.getByRole('button', { name: VI.loadReplay }).click();
  await confirmCover(page);
}

test('mid-game: build a cog from the side panel on a highlighted sea edge', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  await loadFixture(page, 'tidelands-firstLandfall.json');
  // the scenario's rules open from the (i) in the turn line
  await page.locator('.tl-badge-info').click();
  await expect(page.locator('.tl-badge-pop')).toContainText('Cập Bến Đầu Tiên');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tl-badge-pop')).toHaveCount(0);
  // moving a cog is a round button next to the build buttons
  await expect(page.locator('.act-build button[data-build="moveShip"]')).toHaveCount(1);
  await openDrawer(page);
  await expect(page.locator('.tl-panel')).toBeVisible();
  expect(await page.locator('.tl-cog').count()).toBeGreaterThanOrEqual(3);
  const build = page.locator('.tl-panel button[data-tl="build"]');
  if (await build.isEnabled()) {
    const cogs = await page.locator('.tl-cog').count();
    await build.click();
    expect(await page.locator('.hit-edge').count()).toBeGreaterThan(0);
    await page.screenshot({ path: shotPath('tidelands-build-cog.png', testInfo.project.name), fullPage: true });
    await clickFirst(page, '.hit-edge');
    await expect.poll(async () => page.locator('.tl-cog').count()).toBe(cogs + 1);
  }
  await clearHover(page);
  await page.screenshot({ path: shotPath('tidelands-midgame.png', testInfo.project.name), fullPage: true });
  expect(errors()).toEqual([]);
});

for (const [file, shot, check] of [
  ['tidelands-silk.json', 'tidelands-silk.png', '.tl-panel'],
  ['tidelands-castaways.json', 'tidelands-castaways.png', '.tl-panel'],
  ['tidelands-greatWorks.json', 'tidelands-works.png', '.tl-wonders'],
  ['tidelands-corsairCoves.json', 'tidelands-coves.png', '.tl-fleet-loop'],
  ['tidelands-islesOfMist.json', 'tidelands-mist.png', '.tl-panel'],
  // with Strongholds the panels are a drawer; the raid lane shows on the board
  ['tidelands-scatteredIsles-both.json', 'tidelands-with-strongholds.png', '.sh-lane'],
] as const) {
  test(`scenario position renders without errors: ${file}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = captureErrors(page);
    await loadFixture(page, file);
    // the panels live in the drawer: open it for the check, close it for the screenshot
    if (check !== '.sh-lane') await openDrawer(page);
    await expect(page.locator(check).first()).toBeVisible();
    if (check !== '.sh-lane') await closeDrawer(page);
    await clearHover(page);
    await page.screenshot({ path: shotPath(shot, testInfo.project.name), fullPage: true });
    expect(errors()).toEqual([]);
  });
}

test('gold mine: the choice is big resource buttons over the hand, no dialog', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = captureErrors(page);
  await loadFixture(page, 'tidelands-gold.json');
  const gold = page.locator('.tl-gold');
  await expect(gold).toBeVisible();
  await expect(page.locator('.dialog')).toHaveCount(0);
  const total = async () => Number((await page.locator('.hand-total').innerText()).replace(/\D/g, ''));
  const before = await total();
  await clearHover(page);
  await page.screenshot({ path: shotPath('tidelands-gold.png', testInfo.project.name), fullPage: true });
  // take cards until the choice is complete (one click per card; Take sends a bag of several)
  while ((await page.locator('.tl-gold .btn-primary').count()) > 0 && !(await page.locator('.tl-gold .btn-primary').isEnabled())) {
    await page.locator('.tl-gold-btn:not([disabled])').first().click();
  }
  if ((await page.locator('.tl-gold .btn-primary').count()) > 0) await page.locator('.tl-gold .btn-primary').click();
  else await page.locator('.tl-gold-btn:not([disabled])').first().click();
  // the viewer's choice is done: the buttons go (the next owed player may be asked after the cover)
  await expect.poll(async () => (await page.locator('.cover').isVisible()) || (await gold.count()) === 0).toBe(true);
  if ((await page.locator('.cover').count()) === 0) expect(await total()).toBeGreaterThan(before);
  expect(errors()).toEqual([]);
});
