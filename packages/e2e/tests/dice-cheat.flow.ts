// Dice cheat in a local game: typing the code unlocks two die pickers next to Roll; the roll uses them.
// Shared by dice-cheat.spec.ts (desktop, tablet) and dice-cheat-mobile.spec.ts (phone).
import { expect, type Page } from '@playwright/test';
import { DICE_CHEAT_CODE } from '../../engine/src/cheats';
import { VI, actionButton, captureErrors, clearHover, playSetupUntilRoll, shotPath } from './helpers';

export async function diceCheatFlow(page: Page, project: string): Promise<void> {
  const errors = captureErrors(page);
  await page.goto('/');

  await page.getByLabel(VI.players).selectOption('2');
  await page.getByLabel(VI.seed).fill('cheat-1');
  await page.getByLabel('Tên người chơi 1').fill('Nam');
  await page.getByLabel('Ai điều khiển ghế 2').selectOption('easy');
  await page.getByRole('button', { name: VI.start }).click();
  await playSetupUntilRoll(page);

  // Locked: no pickers.
  await expect(page.locator('.die-pick')).toHaveCount(0);
  await page.keyboard.type(DICE_CHEAT_CODE);
  await expect(page.getByText('Đã mở khóa xúc xắc vàng', { exact: false })).toBeVisible();
  const dice = page.locator('.die-pick');
  await expect(dice).toHaveCount(2);

  // 4 + 4 = 8 (no 7, so the turn goes on normally).
  for (let i = 0; i < 4; i++) await dice.nth(0).click();
  for (let i = 0; i < 4; i++) await dice.nth(1).click();
  await expect(dice.nth(0)).toHaveText('4');
  await expect(dice.nth(1)).toHaveText('4');
  await clearHover(page);
  await page.screenshot({ path: shotPath('dice-cheat.png', project), fullPage: true });

  await actionButton(page, VI.rollText).click();
  await expect(page.locator('.dice-sum').first()).toHaveText('= 8');
  await expect(dice).toHaveCount(0); // only while a roll is possible
  expect(errors()).toEqual([]);
}
