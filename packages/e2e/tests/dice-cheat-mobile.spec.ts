// Dice cheat in a local game (phone): see dice-cheat.flow.ts.
import { test } from '@playwright/test';
import { diceCheatFlow } from './dice-cheat.flow';

test('typing the cheat code lets the human choose the dice', async ({ page }) => {
  test.setTimeout(180_000);
  await diceCheatFlow(page, test.info().project.name);
});
