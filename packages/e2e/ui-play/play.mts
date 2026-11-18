// UI playtest driver: one human (real clicks in the browser) vs 3 hard bots, Strongholds expansion.
// Usage: node ../../node_modules/tsx/dist/cli.mjs ui-play/play.mts <seed> <maxRounds> <outDir>
import { chromium, type Page, type Locator } from '@playwright/test';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';

const SEED = process.argv[2] ?? 'ui-1';
const MAX_ROUNDS = Number(process.argv[3] ?? 50);
const OUT = process.argv[4] ?? 'ui-play/out';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ channel: 'msedge' });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(4000);
const notes: string[] = [];
const trace: string[] = [];
let round = 0;
let shots = 0;
const note = (m: string) => {
  if (!notes.includes(m)) { notes.push(m); console.log('NOTE r' + round + ': ' + m); appendFileSync(`${OUT}/notes.txt`, `r${round}: ${m}
`); }
};
const T = (m: string) => { trace.push(`r${round} ${m}`); appendFileSync(`${OUT}/trace.log`, `r${round} ${m}
`); };
page.on('console', (m) => { if (m.type() === 'error') note('console error: ' + m.text().slice(0, 200)); });
page.on('pageerror', (e) => note('pageerror: ' + e.message.slice(0, 200)));
const shot = async (name: string) => {
  try { await page.screenshot({ path: `${OUT}/${String(++shots).padStart(3, '0')}-${name}.png` }); } catch { /* ignore */ }
};

await page.goto('http://localhost:5173/');
await page.getByLabel('Số người chơi').selectOption('4');
await page.getByLabel('Hạt giống').fill(SEED);
for (const i of [2, 3, 4]) await page.getByLabel(`Ai điều khiển ghế ${i}`).selectOption('hard');
await page.locator('#home-expansion').check();
await page.getByRole('button', { name: /Bắt đầu ván mới/ }).click();
await page.waitForTimeout(800);
if (await page.locator('.cover').isVisible().catch(() => false)) {
  await page.getByRole('button', { name: /Tôi đã sẵn sàng/ }).click();
}

const vis = (sel: string) => page.locator(sel).first().isVisible().catch(() => false);
const status = async () => ((await page.locator('.status-text').first().textContent().catch(() => '')) ?? '').trim();
const enabled = (l: Locator) => l.first().isEnabled().catch(() => false);

const attempted = new Set<string>();
const seenDialogs = new Set<string>();
let bankStage = 0;
let bankFail = false;
let lastSig = '';
let same = 0;
let iter = 0;

async function handleDialog() {
  const d = page.locator('.dialog').first();
  const title = (await d.getAttribute('aria-label')) ?? '';
  const text = ((await d.textContent()) ?? '').replace(/\s+/g, ' ').slice(0, 300);
  const btns = await d.locator('button').evaluateAll((els) =>
    els.map((e, i) => ({ i, dis: (e as HTMLButtonElement).disabled, txt: (e.textContent ?? '').trim(), aria: e.getAttribute('aria-label') ?? '' })));
  const key = title + '|' + btns.map((x) => x.txt).join(',');
  if (!seenDialogs.has(key)) {
    seenDialogs.add(key);
    T(`DIALOG "${title}" :: ${text} :: ${btns.map((x) => (x.dis ? '(' : '') + (x.txt || x.aria) + (x.dis ? ')' : '')).join(' / ')}`);
    await shot('dialog-' + title.slice(0, 20).replace(/\W+/g, '_'));
  }
  const click = async (re: RegExp) => {
    for (const x of btns) {
      if (!x.dis && re.test(x.txt + ' ' + x.aria)) { await d.locator('button').nth(x.i).click(); return true; }
    }
    return false;
  };
  if (/Từ chối/.test(text) && /Chấp nhận|Đồng ý/.test(text)) { await click(/Từ chối/); return; }
  if (await d.locator('.trade-bank').count()) {
    if (bankStage === 2) {
      const ok = d.locator('.dialog-actions button.btn-primary').first();
      bankStage = 0;
      if (await enabled(ok)) { T('bank: confirm'); await ok.click(); return; }
      T('bank: confirm disabled'); await page.keyboard.press('Escape'); bankFail = true; return;
    }
    const opts = d.locator('.option-btn:not([disabled])');
    const n = await opts.count();
    if (!n) { T('bank dialog: nothing tradable'); await page.keyboard.press('Escape'); bankFail = true; return; }
    const texts = await opts.allTextContents();
    let idx = 0;
    if (/Bạn có|có \d/.test(texts[0] ?? '')) {
      let best = -1;
      texts.forEach((x, i) => { const m = x.match(/(\d+)\D+(\d)/); const have = m ? Number(m[1]) : 0; if (have > best) { best = have; idx = i; } });
    }
    const wantRe = /Quặng|Lúa mì|Sách|Bạc/;
    const wi = texts.findIndex((x) => wantRe.test(x));
    const useIdx = bankStage === 0 ? idx : (wi >= 0 ? wi : 0);
    T(`bank dialog stage ${bankStage}: options ${texts.map((x) => x.trim().slice(0, 30)).join(' | ')} -> ${useIdx}`);
    await opts.nth(useIdx).click();
    bankStage = bankStage === 0 ? 1 : 2;
    return;
  }
  const opt = d.locator('.option-btn').first();
  if (await opt.count()) { await opt.click(); return; }
  if (await d.locator('.pick-row').count()) {
    for (let k = 0; k < 40; k++) {
      const ok = d.locator('.dialog-actions button.btn-primary').first();
      if (await enabled(ok)) { await ok.click(); return; }
      const plus = d.locator('.pick-row button[aria-label^="+"]:not([disabled])').first();
      if (await plus.count()) await plus.click(); else break;
    }
  }
  if (await click(/Xác nhận|Đồng ý|OK|Chọn|Cướp|Lấy|Đặt/)) return;
  for (const x of btns) {
    if (!x.dis && !/Đóng|Hủy|Huỷ/.test(x.txt + x.aria)) { await d.locator('button').nth(x.i).click(); return; }
  }
  note(`dialog without usable button: ${title} :: ${text}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (await d.count()) await d.locator('button[aria-label="Đóng"]').click().catch(() => {});
}

async function act(label: string, loc: Locator): Promise<boolean> {
  const key = `${round}:${label}`;
  if (attempted.has(key)) return false;
  if (!(await loc.count()) || !(await enabled(loc))) return false;
  attempted.add(key);
  if (label === 'bank') bankStage = 0;
  T('click ' + label);
  await loc.first().click();
  await page.waitForTimeout(150);
  return true;
}

async function myTurnActions(): Promise<boolean> {
  const cards = page.locator('.sh-card');
  const nc = await cards.count();
  for (let i = 0; i < nc; i++) {
    const id = (await cards.nth(i).getAttribute('data-card')) ?? '?';
    if (await act('card ' + id + i, cards.nth(i).locator('.sh-card-btns button:not(.btn-danger)'))) return true;
  }
  if (await act('city', page.locator('.actionbar button', { hasText: 'Nâng cấp thành phố' }))) return true;
  if (await act('settlement', page.locator('.actionbar button', { hasText: 'Xây làng' }))) return true;
  const imp = page.locator('.sh-btn[data-improve]');
  const n = await imp.count();
  for (let i = 0; i < n; i++) {
    const tr = (await imp.nth(i).getAttribute('data-improve')) ?? '' + i;
    if (await act('improve ' + tr, imp.nth(i))) return true;
  }
  for (const k of ['rampart', 'activate', 'recruit', 'promote', 'chase', 'displace']) {
    if (await act(k, page.locator(`.sh-btn[data-sh="${k}"]`))) return true;
  }
  if (await act('road', page.locator('.actionbar button', { hasText: 'Xây đường' }))) return true;
  if (await act('moveWarden', page.locator('.sh-btn[data-sh="moveWarden"]'))) return true;
  if (!bankFail && (await act('bank', page.locator('.actionbar button', { hasText: 'Đổi với ngân hàng' })))) return true;
  return false;
}

const deadline = Date.now() + 120 * 60_000;
while (Date.now() < deadline) {
  iter++;
  try {
  const sig = (await status()) + '|' + (await page.locator('.dialog').count()) + '|' +
    (await page.locator('.hit-vertex,.hit-edge,.hit-hex').count());
  if (sig === lastSig) same++; else { same = 0; lastSig = sig; }
  if (same > 60) {
    const btns = await page.locator('button:not([disabled])').allTextContents();
    note(`STUCK at "${await status()}" (enabled: ${btns.map((s) => s.trim()).filter(Boolean).join(' / ').slice(0, 300)})`);
    await shot('stuck');
    break;
  }
  if (await vis('.game-over, .winner, [data-winner]')) { T('game over banner'); await shot('over'); break; }
  if (await vis('.cover')) { await page.getByRole('button', { name: /Tôi đã sẵn sàng/ }).click(); continue; }
  if (await vis('.dialog')) { await handleDialog(); await page.waitForTimeout(100); continue; }
  const hits = page.locator('.hit-vertex, .hit-edge, .hit-hex');
  const nh = await hits.count();
  if (nh) {
    const pick = Math.min(nh - 1, Math.floor(nh / 2));
    T(`board target (${nh} spots) -> #${pick} :: ${await status()}`);
    await hits.nth(pick).click().catch(() => {});
    await page.waitForTimeout(150);
    continue;
  }
  const roll = page.locator('.actionbar button', { hasText: 'Gieo xúc xắc' });
  if (await enabled(roll)) {
    round++;
    if (round > MAX_ROUNDS) break;
    if (round % 5 === 0) await shot('round' + round);
    T('ROLL');
    await roll.click();
    await page.waitForTimeout(300);
    continue;
  }
  const end = page.locator('.actionbar button', { hasText: 'Kết thúc lượt' });
  if (await enabled(end)) {
    if (await myTurnActions()) continue;
    T('END TURN');
    await end.click();
    await page.waitForTimeout(300);
    continue;
  }
  const cancel = page.locator('.status-cancel');
  if ((await cancel.count()) && same > 20) {
    note('a pick was started but no board target appeared: ' + (await status()));
    await cancel.click();
    continue;
  }
  await page.waitForTimeout(250);
  } catch (e) { note('driver error: ' + String(e).slice(0, 260)); await shot('error'); await page.waitForTimeout(500); if (notes.length > 40) break; }
}
await shot('final');
writeFileSync(`${OUT}/trace.log`, trace.join('\n'));
writeFileSync(`${OUT}/notes.txt`, notes.join('\n'));
console.log('rounds', round, 'iter', iter, 'notes', notes.length);
await b.close();
