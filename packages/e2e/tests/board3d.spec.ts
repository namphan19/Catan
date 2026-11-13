// 3D board prototype behind the 2D/3D toggle.
//
// Runs in the "3d" Playwright project, which launches Chromium with SwiftShader so WebGL
// works headless. Every click below goes through the real mouse pipeline onto a projected
// screen point; the targets themselves come from window.__boschtan3d.targets(), i.e. the
// exact highlighted set GameTable derived from getLegalActions — the test never re-implements
// a rule. window.__boschtan3d only exists in dev builds or with ?e2e=1.
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { VI, actionButton, captureErrors, confirmCover, shot3dPath } from './helpers';

interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

declare global {
  interface Window {
    __boschtan3d?: {
      project(id: string): Projected | null;
      sample(): { w: number; h: number; nonBlank: number; distinct: number };
      targets(): { vertices: string[]; edges: string[]; hexes: string[] };
      focus(id: string, distance?: number): boolean;
      debug(): Array<Record<string, unknown>>;
    };
  }
}

const GAME_URL = '/?e2e=1';

async function startGame(page: Page, players: '4' | '6', seed: string): Promise<void> {
  await page.goto(GAME_URL);
  await page.getByLabel(VI.players).selectOption(players);
  await page.getByLabel(VI.seed).fill(seed);
  await page.getByRole('button', { name: VI.start }).click();
  await confirmCover(page);
}

async function toggle3D(page: Page): Promise<void> {
  await page.getByRole('button', { name: VI.board3d }).click();
  await page.locator('.board3d-wrap canvas').waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForFunction(() => Boolean(window.__boschtan3d), undefined, { timeout: 45_000 });
}

/** Poll the live canvas until textures have loaded and real scene pixels exist. */
async function expectCanvasRendered(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => window.__boschtan3d?.sample().distinct ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(10);
  const sample = await page.evaluate(() => window.__boschtan3d!.sample());
  expect(sample.nonBlank, `non-background pixels: ${JSON.stringify(sample)}`).toBeGreaterThan(500);
}

/** Project the first legal vertex/edge/hex and click it with the real mouse. */
async function clickLegalTarget(page: Page): Promise<string | null> {
  const pick = await page.evaluate(() => {
    const api = window.__boschtan3d!;
    const t = api.targets();
    const id = t.vertices[0] ?? t.edges[0] ?? t.hexes[0];
    if (!id) return null;
    const p = api.project(id);
    return p && p.visible ? { id, ...p } : id ? { id, x: 0, y: 0, visible: false } : null;
  });
  if (!pick) return null;
  if (!pick.visible) return null;
  await page.mouse.click(pick.x, pick.y);
  return pick.id;
}

test.describe('3D board', () => {
  test('toggle to 3D renders the canvas, real clicks place setup pieces, back to 2D keeps the game', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = captureErrors(page);
    await startGame(page, '4', 'e2e-3d');

    // Default remains 2D.
    await expect(page.locator('.board-svg')).toBeVisible();
    await expect(page.getByRole('button', { name: VI.board2d })).toHaveAttribute('aria-pressed', 'true');

    await toggle3D(page);
    await expect(page.locator('[data-board-view="3d"]')).toBeVisible();
    await expect(page.locator('.board-svg')).toHaveCount(0);
    await expectCanvasRendered(page);

    // Highlighted setup spots are real 3D targets.
    await expect
      .poll(async () => page.evaluate(() => window.__boschtan3d!.targets().vertices.length), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await page.screenshot({ path: shot3dPath('setup.png'), fullPage: true });

    // Play the whole setup phase with projected, real clicks (covers between players).
    const roll = actionButton(page, VI.rollText);
    const cover = page.locator('.cover');
    let clickedVertices = 0;
    let clickedEdges = 0;
    const deadline = Date.now() + 120_000;
    while (!(await roll.isEnabled())) {
      if (Date.now() > deadline) throw new Error('3D setup loop timed out; roll never became possible');
      if (await cover.isVisible().catch(() => false)) {
        await confirmCover(page);
        continue;
      }
      const id = await clickLegalTarget(page);
      if (!id) {
        await page.waitForTimeout(250);
        continue;
      }
      if (id.startsWith('v:')) clickedVertices += 1;
      if (id.startsWith('e:')) clickedEdges += 1;
      await page.waitForTimeout(180);
    }
    expect(clickedVertices, 'settlements placed by real 3D clicks').toBeGreaterThanOrEqual(8);
    expect(clickedEdges, 'roads placed by real 3D clicks').toBeGreaterThanOrEqual(8);

    await expect(roll).toBeEnabled();
    await roll.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot3dPath('main-turn.png'), fullPage: true });

    // Back to 2D: the same game state (8 settlements, 8 roads) must still be there.
    await page.getByRole('button', { name: VI.board2d }).click();
    await expect(page.locator('.board-svg')).toBeVisible();
    await expect(page.locator('.board3d-wrap')).toHaveCount(0);
    await expect(page.locator('.pieces .piece-settlement')).toHaveCount(8);
    expect(await page.locator('.pieces .piece-road').count()).toBeGreaterThanOrEqual(8);
    await expect(page.locator('.log-list li').first()).toBeVisible();

    // The choice is remembered.
    expect(await page.evaluate(() => localStorage.getItem('boschtan.boardView'))).toBe('2d');
    expect(errors()).toEqual([]);
  });

  test('6-player large board (30 hexes) fits the 3D camera', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = captureErrors(page);
    await startGame(page, '6', 'e2e-large');
    await toggle3D(page);
    await expectCanvasRendered(page);
    await page.waitForTimeout(500);
    console.log('DEBUG instanced', JSON.stringify(await page.evaluate(() => window.__boschtan3d!.debug())));
    await page.screenshot({ path: shot3dPath('large-board.png'), fullPage: true });
    expect(errors()).toEqual([]);
  });

  test('close-up: a city and roads of two players', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = captureErrors(page);
    const fixture = path.resolve(__dirname, '..', 'fixtures', 'city-game.json');
    const log = fs.readFileSync(fixture, 'utf8');

    // Load a deterministic mid-game position through the app's normal log-replay path.
    await page.goto(GAME_URL);
    await page.locator('.export-box').first().fill(log);
    await page.getByRole('button', { name: VI.loadReplay }).click();
    await confirmCover(page);
    await toggle3D(page);
    await expectCanvasRendered(page);

    // h:0,-1 holds both cities (p4 and p1) and each player's road on its rim.
    const focused = await page.evaluate(() => window.__boschtan3d!.focus('h:0,-1', 4.6));
    expect(focused).toBe(true);
    await page.waitForTimeout(600);
    await page.locator('.board-area').screenshot({ path: shot3dPath('close-up.png') });
    expect(errors()).toEqual([]);
  });
});
