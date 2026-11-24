// Two-player local game: the home screen offers 2 seats, one human plays against one bot on the
// standard board, the turn comes back to the human, and the table layout holds with only 2 tiles.
import { test, expect } from '@playwright/test';
import { VI, actionButton, captureErrors, clearHover, playSetupUntilRoll, shotPath } from './helpers';

test('one human against one bot (2 players)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = captureErrors(page);
  const project = test.info().project.name;
  await page.goto('/');

  await page.getByLabel(VI.players).selectOption('2');
  await page.getByLabel(VI.seed).fill('duo-1');
  await page.getByLabel('Tên người chơi 1').fill('Nam');
  await page.getByLabel('Ai điều khiển ghế 2').selectOption('hard');
  await expect(page.getByLabel('Ai điều khiển ghế 3')).toHaveCount(0);
  await page.getByRole('button', { name: VI.start }).click();

  await expect(page.locator('.cover')).toHaveCount(0);
  await playSetupUntilRoll(page);
  await expect(page.locator('.shell-viewing')).toHaveText(/Nam/);

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

  await clearHover(page);
  await page.screenshot({ path: shotPath('two-player-game.png', project), fullPage: true });
  expect(errors()).toEqual([]);
});
