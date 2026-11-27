// Phone layout (packages/client/src/table/mobile.css): portrait 390 x 844 and landscape 844 x 390,
// touch emulation, real taps. Runs only in the "mobile" project.
import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { VI, actionButton, captureErrors, clearHover, confirmCover, playSetupUntilRoll, shotPath, setPlayers, setSeed, openLogBox } from './helpers';

const fixture = (name: string) => fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', name), 'utf8');

async function loadFixture(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await openLogBox(page);
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
  await setPlayers(page, '4');
  await setSeed(page, 'e2e-mobile');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);

  await expect(page.locator('.board-hint')).toBeVisible();
  await expectFitsScreen(page);
  // the board-pick line sits under the players row, never on top of it
  const strip = await box(page, '.seat-strip');
  const hint = await box(page, '.board-hint');
  expect(hint.y).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
  // The four players share one row above the board.
  const seats = page.locator('.seat-strip .seat');
  await expect(seats).toHaveCount(4);
  const tops = await seats.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // HUD (PO 2026-11-27): the board fills the screen; the hand and the buttons float over its foot,
  // below the fitted island.
  await expect(page.locator('.sidecol')).toHaveCount(0);
  const vh = page.viewportSize()!.height;
  const primary = await box(page, '.act-primary');
  expect(primary.y + primary.height).toBeLessThanOrEqual(vh + 0.5);
  const island = await page.evaluate(() => {
    let bottom = -Infinity;
    document.querySelectorAll('.hex-tile').forEach((el) => (bottom = Math.max(bottom, el.getBoundingClientRect().bottom)));
    return bottom;
  });
  expect(primary.y, 'buttons below the island').toBeGreaterThan(island);
  // Compact visuals still get finger-sized hit areas on every visible control.
  const measure = (els: HTMLElement[]) =>
    els
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { cls: e.className, w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((m) => m.w > 0);
  const targets = [
    ...(await page.locator('.topbar-menu-btn, .btn-help').evaluateAll(measure)),
    ...(await page.locator('.actionbar button').evaluateAll(measure)),
  ];
  for (const target of targets) {
    expect(target.w, target.cls).toBeGreaterThanOrEqual(44);
    expect(target.h, target.cls).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: shotPath('mobile-setup.png', testInfo.project.name) });

  await playSetupUntilRoll(page);
  await actionButton(page, VI.rollText).click();
  await expect(page.locator('.dice-sum')).toBeVisible();
  await expectFitsScreen(page);
  // Every action button (End turn included) is on screen without scrolling the bar.
  const vw = page.viewportSize()!.width;
  const rights = await page
    .locator('.actionbar .btn')
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect().right));
  for (const r of rights) expect(r).toBeLessThanOrEqual(vw + 0.5);
  await clearHover(page);
  await page.screenshot({ path: shotPath('mobile-midgame.png', testInfo.project.name) });
  expect(errors()).toEqual([]);
});

test('portrait: six players share one swipeable rail, names readable', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await setPlayers(page, '6');
  await setSeed(page, 'e2e-mobile-six');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
  await expectFitsScreen(page);

  const seats = page.locator('.seat-strip .seat');
  await expect(seats).toHaveCount(6);
  // Five or six players keep one shallow rail; the last seat is reached by swiping, not by
  // spending a second row of board height.
  const boxes = await seats.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), w: Math.round(r.width) };
    }),
  );
  expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
  for (const b of boxes) expect(b.w).toBeGreaterThanOrEqual(56);
  await seats.last().scrollIntoViewIfNeeded();
  await expect(seats.last()).toBeInViewport();
  expect(await page.locator('.seat-strip').evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  await clearHover(page);
  await page.screenshot({ path: shotPath('mobile-six.png', testInfo.project.name) });
  expect(errors()).toEqual([]);
});

test('portrait: two players share one row, the page fits the screen', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await setPlayers(page, '2');
  await setSeed(page, 'e2e-mobile-duo');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
  await expectFitsScreen(page);

  const seats = page.locator('.seat-strip .seat');
  await expect(seats).toHaveCount(2);
  const tops = await seats.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await clearHover(page);
  await page.screenshot({ path: shotPath('mobile-two.png', testInfo.project.name) });
  expect(errors()).toEqual([]);
});

test('portrait: a player tile opens public details in a bottom sheet', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await setSeed(page, 'e2e-mobile');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);

  await page.locator('.seat-strip .seat').first().click();
  const dialog = page.locator('.player-detail-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Người chơi 1' })).toBeVisible();
  await expect(dialog.locator('.player-detail-stats')).toContainText('Thẻ tài nguyên trên tay');
  await expect(dialog.locator('.player-detail-supply')).toContainText('Đường còn lại');
  await expectFitsScreen(page);
  await page.screenshot({ path: shotPath('mobile-player-details.png', testInfo.project.name) });
  await dialog.locator('.dialog-head .btn-icon').click();
  await expect(dialog).toBeHidden();
  expect(errors()).toEqual([]);
});

test('portrait: the trade composer is two rows of cards that fit the dialog (no sideways scroll)', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await loadFixture(page, 'city-game.json');
  await page.locator('.act-trade .btn').first().click();
  await page.getByRole('tab', { name: 'Người chơi' }).click();
  // PO 2026-11-28: painted cards instead of the old table; every kind on both sides.
  const give = page.locator('.tcard-give .tcard');
  const get = page.locator('.tcard-get .tcard');
  await expect(give).toHaveCount(5);
  await expect(get).toHaveCount(5);
  await expectFitsScreen(page);
  const body = await box(page, '.dialog-body');
  expect(body.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.locator('.dialog-body').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
  // A click on a card you hold adds one to the offer; the count shows on the card.
  const held = page.locator('.tcard-give .tcard:not(.none) .tcard-face').first();
  await held.click();
  await expect(page.locator('.tcard-give .tcard.on .tcard-n')).toHaveText('1');
  await page.locator('.tcard-get .tcard-face').first().click();
  await expect(page.locator('.tcard-get .tcard.on')).toHaveCount(1);
  await page.screenshot({ path: shotPath('mobile-trade.png', testInfo.project.name) });
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
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await page.locator('.sheet-toggle').click();
  await expect(sheet).toBeVisible();
  await page.locator('.sheet-backdrop').click({ position: { x: 12, y: 12 } });
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

test('landscape: board at full height, controls on its edges, sheet closable', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await loadFixture(page, 'strongholds-active.json');
  await expectFitsScreen(page);

  const board = await box(page, '.board-area');
  const primary = await box(page, '.act-primary');
  expect(board.height).toBeGreaterThan(380);
  // the primary button sits in the bottom-right corner, on screen
  expect(primary.x + primary.width).toBeLessThanOrEqual(844 + 0.5);
  expect(primary.y + primary.height).toBeLessThanOrEqual(390 + 0.5);
  expect(primary.x).toBeGreaterThan(844 / 2);
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

test('narrow landscape: board and controls still fit without page overflow', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await loadFixture(page, 'strongholds-active.json');
  await expectFitsScreen(page);

  const board = await box(page, '.board-area');
  const primary = await box(page, '.act-primary');
  expect(board.height).toBeGreaterThanOrEqual(318);
  expect(primary.x + primary.width).toBeLessThanOrEqual(568 + 0.5);
  expect(primary.y + primary.height).toBeLessThanOrEqual(320 + 0.5);
  await clearHover(page);
  await page.screenshot({ path: shotPath('mobile-narrow-landscape.png', testInfo.project.name) });
  expect(errors()).toEqual([]);
});

test('portrait: resources are stacks in one row; a tapped development card rises with its Play button', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await loadFixture(page, 'hand-cards.json');
  await expectFitsScreen(page);
  const stacks = await page.locator('.hand .res-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  for (let i = 1; i < stacks.length; i++) expect(stacks[i].left).toBeGreaterThanOrEqual(stacks[i - 1].right);
  const card = page.locator('.dev-cards.card-fan > li').first();
  const before = (await card.boundingBox())!;
  await card.locator('.dev-card-btn').tap();
  await expect(card).toHaveClass(/lifted/);
  await expect(card.locator('.dev-card-name')).toBeVisible();
  await page.waitForTimeout(300);
  const after = (await card.boundingBox())!;
  expect(after.width, 'a tapped card grows to be read').toBeGreaterThan(before.width * 1.4);
  // Its face says what it does, inside the screen.
  const face = card.locator('.dev-card-face');
  await expect(face.locator('.dev-card-face-fx')).toBeVisible();
  const fb = (await face.boundingBox())!;
  expect(fb.x).toBeGreaterThanOrEqual(0);
  expect(fb.x + fb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // The lifted playable card carries a finger-sized Play button inside the screen.
  const play = card.locator('.dev-card-play');
  await expect(play).toBeVisible();
  const pb = (await play.boundingBox())!;
  expect(pb.height).toBeGreaterThanOrEqual(36);
  expect(pb.x).toBeGreaterThanOrEqual(0);
  expect(pb.x + pb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: shotPath('mobile-hand-lifted.png', testInfo.project.name) });
  // A tap on the board drops it again.
  await page.locator('.board-area').tap({ position: { x: 20, y: 20 } });
  await expect(card).not.toHaveClass(/lifted/);
  // No "Play a card" pills crowd the button row any more.
  await expect(page.locator('.actionbar .btn-play')).toHaveCount(0);
  await expectFitsScreen(page);
  await page.screenshot({ path: shotPath('mobile-hand-cards.png', testInfo.project.name) });
  expect(errors()).toEqual([]);
});
