// Temporary: smallest-phone layouts (360 px and 320 px wide), removed after the check.
import { test, expect } from '@playwright/test';
import { VI, confirmCover, clearHover, shotPath } from './helpers';

for (const [name, w, h] of [
  ['360', 360, 740],
  ['320', 320, 568],
] as const) {
  test(`portrait ${name}px: tiles, hand dock and actions fit`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.getByLabel(VI.players).selectOption('4');
    await page.getByLabel(VI.seed).fill('e2e-mobile');
    await page.getByRole('button', { name: VI.start }).click();
    await confirmCover(page);

    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.w);
    expect(m.sh).toBeLessThanOrEqual(m.h);
    // Every seat name must have room for a whole line: the tile is wider than the text box.
    const names = await page.locator('.seat-strip .seat-name').evaluateAll((els) =>
      els.map((e) => ({
        clipped: e.scrollWidth > e.clientWidth + 1,
        h: Math.round(e.getBoundingClientRect().height),
      })),
    );
    for (const n of names) {
      expect(n.clipped, 'seat name is not truncated').toBe(false);
      expect(n.h).toBeLessThan(30);
    }
    await clearHover(page);
    await page.screenshot({ path: shotPath(`mobile-small-${name}.png`, testInfo.project.name) });
  });
}
