// Local game against bots: seat kinds on the home screen, bots play in the browser, the view stays
// on the human (no pass-device cover between bot moves), and the expert shows a thinking hint.
import { test, expect } from '@playwright/test';
import { VI, actionButton, captureErrors, clearHover, playSetupUntilRoll, shotPath, setPlayers, setSeed } from './helpers';

test('one human against a hard and an expert bot', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = captureErrors(page);
  const project = test.info().project.name;
  await page.goto('/');

  await setPlayers(page, '3');
  await setSeed(page, 'bots-1');
  await page.getByLabel('Tên người chơi 1').fill('Nam');
  await page.getByLabel('Ai điều khiển ghế 2').selectOption('hard');
  await page.getByLabel('Ai điều khiển ghế 3').selectOption('expert');
  await expect(page.getByText('🤖 Bot 2 (Khó)')).toBeVisible();
  await expect(page.getByText('🤖 Bot 3 (Siêu khó)')).toBeVisible();
  await clearHover(page);
  await page.screenshot({ path: shotPath('local-bots-home.png', project), fullPage: true });

  // All seats bots: start is blocked.
  await page.getByLabel('Ai điều khiển ghế 1').selectOption('easy');
  await expect(page.getByText('Cần ít nhất một ghế là người chơi.')).toBeVisible();
  await page.getByLabel('Ai điều khiển ghế 1').selectOption('human');

  await page.getByRole('button', { name: VI.start }).click();
  // The expert's searches show a short "is thinking" hint; watch for it from the start.
  const sawThinking = page
    .locator('.shell-thinking')
    .waitFor({ state: 'visible', timeout: 150_000 })
    .then(() => true)
    .catch(() => false);

  // Setup: the human places their pieces, the bots theirs. With a single human there is no
  // pass-device cover at all (HotseatShell shows it only with 2+ humans).
  await expect(page.locator('.cover')).toHaveCount(0);
  const { coversAfterFirst } = await playSetupUntilRoll(page);
  expect(coversAfterFirst).toBe(0);
  await expect(page.locator('.shell-viewing')).toHaveText(/Nam/);

  // One turn: roll, end the turn if nothing special came up (a 7 asks for more), then the bots play
  // and the game comes back to the human.
  await actionButton(page, VI.rollText).click();
  const end = actionButton(page, VI.endTurnText);
  const canEnd = await end
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(async () => {
      await expect(end).toBeEnabled({ timeout: 5_000 });
      return true;
    })
    .catch(() => false);
  if (canEnd) {
    await end.click();
    await expect(actionButton(page, VI.rollText)).toBeEnabled({ timeout: 120_000 });
  }
  await expect(page.locator('.shell-viewing')).toHaveText(/Nam/);
  expect(await sawThinking).toBe(true);
  // A trade dialog opened for a bot's offer closes again once the offer is gone (no empty dialog).
  await expect(page.getByText('Không có lựa chọn nào hợp lệ lúc này.')).toHaveCount(0);

  await clearHover(page);
  await page.screenshot({ path: shotPath('local-bots-game.png', project), fullPage: true });
  expect(errors()).toEqual([]);
});
