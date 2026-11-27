// The viewer's hand (PO 2026-11-28): resources as upright stacks whose counts nothing covers,
// card fans (development / advance cards) where the hovered or tapped card rises and its
// neighbours slide away. Loaded positions; desktop and tablet (the phone tap is in mobile.spec.ts).
// hand-cards.json comes from tools/gen-hand-log.mts.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { VI, captureErrors, clearHover, confirmCover, shotPath, openLogBox } from './helpers';

async function load(page: Page, fixture: string) {
  const log = fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', fixture), 'utf8');
  await page.goto('/');
  await openLogBox(page);
  await page.locator('.export-box').first().fill(log);
  await page.getByRole('button', { name: VI.loadReplay }).click();
  await confirmCover(page);
}

test('resource stacks: no card covers another, counts are readable, empty kinds are narrow', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await load(page, 'strongholds-game.json');
  const cards = page.locator('.hand .res-card');
  const boxes = await cards.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { l: r.left, r: r.right, n: Number((e as HTMLElement).dataset.count) };
    }),
  );
  expect(boxes.length).toBe(8);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].l, `stack ${i} starts after stack ${i - 1}`).toBeGreaterThanOrEqual(boxes[i - 1].r);
  const full = boxes.find((b) => b.n > 0)!;
  const empty = boxes.find((b) => b.n === 0);
  if (empty) expect(empty.r - empty.l).toBeLessThan((full.r - full.l) * 0.75);
  // Each count badge is the topmost element at its centre.
  const covered = await page.locator('.hand .res-card-count:not(.is-zero)').evaluateAll((els) =>
    els.filter((e) => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !top || !e.contains(top);
    }).length,
  );
  expect(covered).toBe(0);
  expect(errors()).toEqual([]);
});

test('card fan: the hovered card rises upright, its neighbours slide aside', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await load(page, 'hand-cards.json');
  const items = page.locator('.dev-cards.card-fan > li');
  await expect(items).toHaveCount(3);
  const before = await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  await items.nth(1).hover();
  await page.waitForTimeout(300);
  const after = await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  expect(after[1].top, 'hovered card rises').toBeLessThan(before[1].top - 10);
  expect(after[0].left, 'previous card slides left').toBeLessThan(before[0].left - 10);
  expect(after[2].left, 'next card slides right').toBeGreaterThan(before[2].left + 10);
  // Nothing covers the hovered card's centre.
  const onTop = await items.nth(1).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  expect(onTop).toBe(true);
  await page.screenshot({ path: shotPath('hand-fan-hover.png', testInfo.project.name) });
  await clearHover(page);
  expect(errors()).toEqual([]);
});

test('card fan: a click lifts a card and opens its face (name, effect); Esc drops it', async ({ page }) => {
  const errors = captureErrors(page);
  await load(page, 'hand-cards.json');
  const first = page.locator('.dev-cards.card-fan > li').first();
  await expect(first.locator('.dev-card-face')).toBeHidden();
  await first.locator('.dev-card-btn').click();
  await expect(first).toHaveClass(/lifted/);
  await expect(first.locator('.dev-card-name')).toBeVisible();
  await expect(first.locator('.dev-card-face')).toBeVisible();
  await expect(first.locator('.dev-card-face-fx')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(first).not.toHaveClass(/lifted/);
  await clearHover(page); // the pointer still rests on the card after the click
  await expect(first.locator('.dev-card-face')).toBeHidden();
  expect(errors()).toEqual([]);
});

test('every development card says what it does before it is played, inside the screen', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  await load(page, 'hand-cards.json');
  // The fixture holds playable cards, a card bought this turn and a Victory Point card.
  const expected: Record<string, RegExp> = {
    guard: /Dời Kẻ cướp.*cướp 1 lá/,
    freeRoads: /Đặt 2 con đường miễn phí/,
    harvest: /Lấy 2 tài nguyên tùy chọn/,
    claim: /mọi người khác đưa bạn toàn bộ/,
    relic: /1 điểm chiến thắng.*không cần dùng/,
  };
  const items = page.locator('.dev-cards.card-fan > li');
  const n = await items.count();
  expect(n).toBeGreaterThan(0);
  const vw = page.viewportSize()!.width;
  for (let i = 0; i < n; i++) {
    const item = items.nth(i);
    const card = (await item.getAttribute('data-card'))!;
    await item.locator('.dev-card-btn').hover();
    const face = item.locator('.dev-card-face');
    await expect(face).toBeVisible();
    await expect(face.locator('.dev-card-face-fx')).toHaveText(expected[card]);
    const box = (await face.boundingBox())!;
    expect(box.x, `${card} face starts inside the screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${card} face ends inside the screen`).toBeLessThanOrEqual(vw);
    if (card === 'guard') await page.screenshot({ path: shotPath('hand-card-face.png', testInfo.project.name) });
    // Play only on a playable card; the others say why where there is a reason (bought this turn).
    const playable = /playable/.test((await item.getAttribute('class')) ?? '');
    await expect(face.locator('.dev-card-play')).toHaveCount(playable ? 1 : 0);
  }
  await clearHover(page);
  expect(errors()).toEqual([]);
});

test('Strongholds advance cards share the fan: hover lifts the card', async ({ page }) => {
  const errors = captureErrors(page);
  await load(page, 'strongholds-game.json');
  const item = page.locator('.sh-hand-tabs.card-fan > li').first();
  const before = (await item.boundingBox())!;
  await item.hover();
  await page.waitForTimeout(300);
  const after = (await item.boundingBox())!;
  expect(after.y).toBeLessThan(before.y - 10);
  expect(after.width).toBeGreaterThan(before.width * 1.2);
  await clearHover(page);
  expect(errors()).toEqual([]);
});

test('a playable card has a gold ring and its Play button plays it (no Play pills in the bar)', async ({ page }) => {
  const errors = captureErrors(page);
  await load(page, 'hand-cards.json');
  await expect(page.locator('.actionbar .btn-play')).toHaveCount(0);
  const guard = page.locator('.dev-card[data-card="guard"]');
  await expect(guard).toHaveClass(/playable/);
  await expect(page.locator('.dev-card[data-card="relic"]')).not.toHaveClass(/playable/);
  await expect(guard.locator('.res-card-count')).toHaveText('3');
  await guard.locator('.dev-card-btn').click();
  // The effect is on screen next to the button that plays the card.
  await expect(guard.locator('.dev-card-face-fx')).toBeVisible();
  const play = guard.locator('.dev-card-play');
  await expect(play).toBeVisible();
  await expect(play).toHaveText('Dùng');
  await play.click();
  await expect(guard.locator('.res-card-count')).toHaveText('2');
  expect(errors()).toEqual([]);
});
