// Home screen "hub" (PO 2026-11-27): mode cards (Strongholds + Tidelands combine, Highlands alone),
// the summary with the engine's VP goal, the auto-saved hot-seat game ("Continue"), the online tab
// and the logbook dialog. Desktop and tablet.
import { test, expect } from '@playwright/test';
import { VI, captureErrors, clearHover, confirmCover, openLogBox, pickMode, setPlayers, shotPath } from './helpers';

test('mode cards combine and the summary shows the goal', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.goto('/');
  const card = (m: string) => page.locator(`.hub-mode[data-mode="${m}"]`);
  // The base game is chosen by default; a quick game is offered when nothing is saved.
  await expect(card('base')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.hub-hero[data-hero="quick"]')).toBeVisible();
  await expect(page.locator('.hub-summary')).toContainText('thắng ở 10 điểm');

  // Strongholds + Tidelands together: both lit, the scenario picker shows, the goal is the engine's.
  await pickMode(page, 'sh');
  await pickMode(page, 'tl');
  await expect(card('sh')).toHaveAttribute('aria-pressed', 'true');
  await expect(card('tl')).toHaveAttribute('aria-pressed', 'true');
  await expect(card('base')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('scenario-select')).toBeVisible();
  await expect(page.locator('.hub-summary')).toContainText('Thành trì + Biển đảo');
  await expect(page.locator('.hub-summary')).toContainText('thắng ở 16 điểm');
  await clearHover(page);
  await page.screenshot({ path: shotPath('hub-modes.png', testInfo.project.name), fullPage: true });

  // Highlands plays alone with at most 4 players.
  await setPlayers(page, 6);
  await pickMode(page, 'hl');
  await expect(card('sh')).toHaveAttribute('aria-pressed', 'false');
  await expect(card('tl')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.hub-count')).toHaveCount(3);
  await expect(page.locator('.hub-count.on')).toHaveText('4');
  await expect(page.locator('.hub-summary')).toContainText('thắng ở 11 điểm');

  // The logbook opens in a dialog and closes with Esc.
  await openLogBox(page);
  await expect(page.getByRole('button', { name: VI.loadReplay })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.export-box')).toHaveCount(0);
  expect(errors()).toEqual([]);
});

test('a hot-seat game is saved: Continue brings it back, Discard forgets it', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await setPlayers(page, 2);
  await page.getByLabel('Tên người chơi 1').fill('Nam');
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
  await expect(page.locator('.seats .seat')).toHaveCount(2);

  // Leaving the page (reload) and coming back offers the saved game.
  await page.goto('/');
  const hero = page.locator('.hub-hero[data-hero="continue"]');
  await expect(hero).toBeVisible();
  await expect(hero).toContainText('Nam');
  await clearHover(page);
  await page.screenshot({ path: shotPath('hub-continue.png', testInfo.project.name), fullPage: true });
  await hero.getByRole('button', { name: 'Tiếp tục ván' }).click();
  await confirmCover(page);
  await expect(page.locator('.seats .seat')).toHaveCount(2);
  await expect(page.locator('.seat-strip')).toContainText('Nam');

  await page.goto('/');
  await page.getByRole('button', { name: 'Bỏ ván này' }).click();
  await expect(page.locator('.hub-hero[data-hero="continue"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.hub-hero[data-hero="quick"]')).toBeVisible();
  expect(errors()).toEqual([]);
});

test('online tab: name and room code are checked before connecting', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Chơi trực tuyến' }).click();
  await expect(page.locator('.hub-hero')).toHaveCount(0); // no room yet, no quick game here
  await pickMode(page, 'sh');
  await expect(page.getByRole('button', { name: /Tạo phòng · Thành trì/ })).toBeVisible();

  // No name: the form says so instead of connecting.
  await page.getByRole('button', { name: /Tạo phòng/ }).click();
  await expect(page.getByText('Hãy nhập tên hiển thị trước')).toBeVisible();
  await page.getByLabel('Tên hiển thị').fill('Mai');

  // A bad code is refused; a pasted invite link fills in its code.
  await page.getByLabel('Mã phòng (5 ký tự)').fill('ABC');
  await page.getByRole('button', { name: 'Vào phòng' }).click();
  await expect(page.getByText('Mã phòng gồm 5 ký tự')).toBeVisible();
  await page.getByLabel('Mã phòng (5 ký tự)').fill('https://example.test/?room=K7QP2');
  await expect(page.getByLabel('Mã phòng (5 ký tự)')).toHaveValue('K7QP2');
  await clearHover(page);
  await page.screenshot({ path: shotPath('hub-online.png', testInfo.project.name), fullPage: true });
  expect(errors()).toEqual([]);
});
