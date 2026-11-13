// Shared helpers for the UI smoke suite: console-error capture, pass-device cover
// handling, and the setup-phase click loop.
import type { Page, ConsoleMessage, Locator } from '@playwright/test';
import * as path from 'path';

/** Repo-root docs/qa/screenshots (tablet shots go in a "tablet" subfolder). */
export function shotPath(name: string, project: string): string {
  const rel = project === 'tablet' ? path.join('tablet', name) : name;
  return path.resolve(__dirname, '..', '..', '..', 'docs', 'qa', 'screenshots', rel);
}

/**
 * Console/page-error capture. Returns a getter for the collected errors; the spec asserts
 * on it at the end of each test.
 * NOTE: the app ships no favicon link, so Chromium's automatic /favicon.ico request 404s;
 * that network noise is filtered here and reported separately in docs/qa/UI_SMOKE.md.
 */
export function captureErrors(page: Page): () => string[] {
  const errors: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error' && !/favicon/i.test(msg.text())) errors.push(msg.text());
  };
  const onPageError = (err: Error) => errors.push(`pageerror: ${err.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return () => errors;
}

/**
 * Action-bar button by VISIBLE text, not accessible name.
 * BUG-QA-03: the client's Button sets aria-label to the (English, untranslated) disable-reason
 * tip whenever a button is disabled, e.g. aria-label="WRONG_PHASE: roll is not allowed in phase
 * setup." — so getByRole('button', { name: /Gieo xúc xắc/ }) cannot match a disabled button even
 * though its visible label is "Gieo xúc xắc". hasText matches the text content regardless.
 */
export function actionButton(page: Page, label: string): Locator {
  return page.locator('.actionbar button', { hasText: label });
}

// ---------- i18n texts (from packages/client/src/i18n/vi.ts) ----------

export const VI = {
  subtitle: 'Trò chơi hex — dựng làng, thương lượng, mở rộng',
  subtitleEn: 'A hex game — settle, trade, expand',
  langToEn: /Tiếng Anh/,
  langToVi: /Tiếng Việt/,
  seed: 'Hạt giống',
  players: 'Số người chơi',
  start: /Bắt đầu ván mới/,
  rollText: 'Gieo xúc xắc',
  endTurnText: 'Kết thúc lượt',
  tradePlayersText: 'Đổi bài với người chơi',
  coverTitle: 'Chuyền máy cho',
  coverReady: /Tôi đã sẵn sàng/,
  roll: /Gieo xúc xắc/,
  endTurn: /Kết thúc lượt/,
  tradePlayers: /Đổi bài với người chơi/,
  tradeDialogTitle: 'Đổi bài',
} as const;

/** Click "I am ready" on the pass-device cover. */
export async function confirmCover(page: Page): Promise<void> {
  const cover = page.locator('.cover');
  await cover.waitFor({ state: 'visible' });
  await page.getByRole('button', { name: VI.coverReady }).click();
  await cover.waitFor({ state: 'hidden' });
}

/**
 * Click a board hit target (vertex / edge / hex).
 *
 * BUG-QA-02: a real input-pipeline click does NOT reach the hit element. Board.tsx calls
 * setPointerCapture on the <svg> for every pointerdown, so Chromium retargets the following
 * `click` event to the SVG itself and the hit circle's onClick never fires. Verified by probe:
 * a real click leaves the log empty, dispatchEvent('click') registers the move. Until the
 * client fixes pointer handling we drive board clicks synthetically; everything outside the
 * SVG (buttons, covers, dialogs) is clicked through the real input pipeline.
 */
export async function clickHit(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().dispatchEvent('click');
}

/**
 * Play the whole setup phase by clicking highlighted spots until the Roll button
 * becomes enabled. Confirms every pass-device cover on the way; returns how many
 * covers appeared between players after the initial reveal.
 */
export async function playSetupUntilRoll(page: Page): Promise<{ coversAfterFirst: number }> {
  const roll = actionButton(page, 'Gieo xúc xắc');
  const cover = page.locator('.cover');
  let coversAfterFirst = 0;
  const deadline = Date.now() + 60_000;

  while (!(await roll.isEnabled())) {
    if (Date.now() > deadline) throw new Error('setup loop timed out; roll never became possible');
    if (await cover.isVisible().catch(() => false)) {
      await confirmCover(page);
      coversAfterFirst += 1;
      continue;
    }
    const vertex = page.locator('.hit-vertex').first();
    const edge = page.locator('.hit-edge').first();
    const hex = page.locator('.hit-hex').first();
    if ((await vertex.count()) > 0) {
      await clickHit(page, '.hit-vertex');
    } else if ((await edge.count()) > 0) {
      await clickHit(page, '.hit-edge');
    } else if ((await hex.count()) > 0) {
      await clickHit(page, '.hit-hex');
    } else {
      // Nothing highlighted: wait for React to settle before re-checking.
      await page.waitForTimeout(250);
      continue;
    }
    await page.waitForTimeout(120);
  }
  return { coversAfterFirst };
}

/**
 * Terrain asset URLs of every rendered hex tile, each verified to load with
 * naturalWidth > 0 (HTML Image probe; SVG <image> has no naturalWidth of its own).
 */
export async function terrainImagesLoaded(page: Page): Promise<{ tiles: number; images: number; broken: string[] }> {
  return page.evaluate(async () => {
    const tiles = document.querySelectorAll('.hex-tile').length;
    const hrefs = [
      ...new Set(
        Array.from(document.querySelectorAll('.hex-tile image')).map((i) => i.getAttribute('href') ?? ''),
      ),
    ].filter(Boolean);
    const broken: string[] = [];
    await Promise.all(
      hrefs.map(
        (h) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth <= 0) broken.push(h);
              resolve();
            };
            img.onerror = () => {
              broken.push(h);
              resolve();
            };
            img.src = h;
          }),
      ),
    );
    return { tiles, images: hrefs.length, broken };
  });
}
