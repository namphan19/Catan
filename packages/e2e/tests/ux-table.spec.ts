// Player-friendly table (UX2): board hint + player strip (no status banner since 2026-11-17), big board, player cards, hand as cards, dice
// box, cost card, quick help. Hot-seat, real clicks; runs in the desktop and tablet projects.
import { test, expect, type Page } from '@playwright/test';
import { VI, actionButton, captureErrors, clearHover, confirmCover, playSetupUntilRoll, shotPath } from './helpers';

async function startGame(page: Page, players: '4' | '6', seed: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel(VI.players).selectOption(players);
  await page.getByLabel(VI.seed).fill(seed);
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
}

/** Height of the hex island divided by the height of the board area. */
async function islandRatio(page: Page): Promise<number> {
  return page.evaluate(() => {
    const area = document.querySelector('.board-area')!.getBoundingClientRect();
    let top = Infinity;
    let bottom = -Infinity;
    document.querySelectorAll('.hex-tile').forEach((el) => {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    });
    return (bottom - top) / area.height;
  });
}

/** True when two elements' boxes intersect. */
async function overlaps(page: Page, a: string, b: string): Promise<boolean> {
  return page.evaluate(
    ([sa, sb]) => {
      const ra = document.querySelector(sa)?.getBoundingClientRect();
      const rb = document.querySelector(sb)?.getBoundingClientRect();
      if (!ra || !rb) return false;
      return ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom;
    },
    [a, b],
  );
}

test('board hint, player strip, hand cards and dice box guide the player', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = captureErrors(page);
  const project = test.info().project.name;
  await startGame(page, '4', 'e2e-ux');

  // Setup: a hint over the board says what to pick (the status sentence row is gone, PO 2026-11-17).
  const hint = page.locator('.board-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('đặt một ngôi làng');
  // The players sit in one row above the board.
  await expect(page.locator('.seat-strip .seats .seat')).toHaveCount(4);

  // A placement the phase demands stays armed: Esc must not remove the highlights.
  await expect(page.locator('.hit-vertex').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await expect(page.locator('.hit-vertex').first()).toBeVisible();

  // One card per player, exactly one of them acting, the viewer's own marked.
  await expect(page.locator('.seats .seat')).toHaveCount(4);
  await expect(page.locator('.seats .seat.acting')).toHaveCount(1);
  await expect(page.locator('.seats .seat.me')).toHaveCount(1);

  // The hand always shows all five resource types (empty ones dimmed).
  await expect(page.locator('.hand .res-card')).toHaveCount(5);
  await expect(page.locator('.hand .res-card.empty')).toHaveCount(5);

  // Number tokens carry probability pips (18 numbered hexes, at least one pip each).
  expect(await page.locator('.token-pip').count()).toBeGreaterThanOrEqual(18);

  // No dice before the first roll; the old duplicates are gone.
  await expect(page.locator('.dice-box')).toHaveCount(0);
  await expect(page.locator('.topbar-vps, .opponents, .phase-label')).toHaveCount(0);

  await playSetupUntilRoll(page);
  // Time to roll: no hint over the board, the Roll button pulses instead.
  await expect(page.locator('.board-hint')).toHaveCount(0);
  await expect(actionButton(page, VI.rollText)).toHaveClass(/pulse/);
  // Starting resources arrived during setup: some resource card is no longer empty.
  expect(await page.locator('.hand .res-card:not(.empty)').count()).toBeGreaterThan(0);

  await actionButton(page, VI.rollText).click();
  await expect(page.locator('.dice-box .die')).toHaveCount(2);
  await expect(page.locator('.dice-box .dice-sum')).toContainText(/= \d+/);

  // Overlays never sit on top of each other.
  expect(await overlaps(page, '.dice-box', '.board-zoom')).toBe(false);
  expect(await overlaps(page, '.dice-box', '.cost-card')).toBe(false);
  expect(await overlaps(page, '.toast-stack', '.dice-box')).toBe(false);
  expect(await overlaps(page, '.toast-stack', '.cost-card')).toBe(false);

  // The page itself never scrolls: everything fits the viewport.
  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  expect(fits, 'table fits the viewport without page scroll').toBe(true);

  await clearHover(page);
  await page.screenshot({ path: shotPath('ux-after-roll.png', project), fullPage: true });
  expect(errors()).toEqual([]);
});

test('the board fills the board area', async ({ page }) => {
  const errors = captureErrors(page);
  const project = test.info().project.name;
  await startGame(page, '4', 'e2e-ux');
  // Desktop 1440x900: the island must take at least 70% of the board area's height.
  // Tablet 1024x768 is width-limited by the side column, so the bar is lower there.
  const min = project === 'tablet' ? 0.5 : 0.7;
  const ratio = await islandRatio(page);
  expect(ratio, `island / board-area height = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
  expect(ratio).toBeLessThanOrEqual(1);
  expect(errors()).toEqual([]);
});

test('6 players: six player cards and the log fit without page scroll', async ({ page }) => {
  const errors = captureErrors(page);
  await startGame(page, '6', 'e2e-large');
  await expect(page.locator('.seats .seat')).toHaveCount(6);
  const m = await page.evaluate(() => {
    // The log panel is hidden for now (GameTable SHOW_LOG): without it only the page fit is checked.
    const body = document.querySelector('.sidepanel-body')?.getBoundingClientRect() ?? null;
    const seats = Array.from(document.querySelectorAll('.seats .seat')).map((s) => s.getBoundingClientRect());
    return {
      pageFits: document.documentElement.scrollHeight <= window.innerHeight + 1,
      hasLog: body !== null,
      logHeight: body?.height ?? 0,
      lastSeatBottom: Math.max(...seats.map((r) => r.bottom)),
      bodyTop: body?.top ?? 0,
    };
  });
  expect(m.pageFits, 'no page scroll').toBe(true);
  if (!m.hasLog) {
    expect(errors()).toEqual([]);
    return;
  }
  expect(m.lastSeatBottom, 'player cards end above the log').toBeLessThanOrEqual(m.bodyTop);
  expect(m.logHeight, `log height ${m.logHeight}`).toBeGreaterThanOrEqual(test.info().project.name === 'tablet' ? 60 : 160);
  expect(errors()).toEqual([]);
});

test('cost card collapses and remembers it; quick help opens and closes', async ({ page }) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('boschtan.costs', 'open'));
  await startGame(page, '4', 'e2e-ux');

  const card = page.locator('.cost-card');
  await expect(card.locator('.cost-row')).toHaveCount(4);
  await card.locator('.cost-card-head').click();
  await expect(card.locator('.cost-row')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('boschtan.costs'))).toBe('closed');

  // A new page load (new game) keeps it collapsed.
  await startGame(page, '4', 'e2e-ux');
  await expect(page.locator('.cost-card')).toBeVisible();
  await expect(page.locator('.cost-card .cost-row')).toHaveCount(0);
  await page.locator('.cost-card-head').click();
  await expect(page.locator('.cost-card .cost-row')).toHaveCount(4);

  // Quick help.
  await page.getByRole('button', { name: 'Hướng dẫn nhanh' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Mục tiêu');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors()).toEqual([]);
});
