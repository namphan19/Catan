// Waiting room (PO mock 2026-11-27): the code as the hero, the mode line, portraits, the inline
// chat and the players' sheet (add a bot at the first empty seat, remove it, ready, start).
// The e2e server is vite preview (no game server), so a small fake server answers the WebSocket
// with the protocol's room / chat messages (docs/PROTOCOL.md). Desktop and tablet; the phone
// layout is checked at 390 px at the end of the same test.
import { test, expect } from '@playwright/test';
import { captureErrors, clearHover, shotPath } from './helpers';

interface Seat {
  seat: string;
  name: string;
  connected: boolean;
  ready: boolean;
  bot?: string;
  avatar?: string;
}

test('lobby: code, mode line, seats, bots, chat and ready', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  const CODE = 'K7QP2';
  const seats: Seat[] = [];
  let chatId = 0;
  let options: Record<string, unknown> = {};
  let playerCount = 4;

  await page.routeWebSocket(/\/ws$/,(ws) => {
    const send = (m: unknown) => ws.send(JSON.stringify(m));
    const room = () =>
      send({ type: 'room', code: CODE, hostSeat: 'p1', playerCount, options, seats: seats.map((s, i) => ({ ...s, seat: `p${i + 1}` })), you: 'p1', started: false });
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      switch (m.type) {
        case 'hello':
          send({ type: 'welcome', sessionToken: 'tok', name: m.name });
          break;
        case 'createRoom':
          playerCount = m.playerCount;
          options = m.options ?? {};
          seats.splice(0, seats.length, { seat: 'p1', name: 'Mai', connected: true, ready: false });
          // A friend is already in: Bao, ready.
          seats.push({ seat: 'p2', name: 'Bảo', connected: true, ready: true, avatar: 'wave' });
          room();
          send({ type: 'chatHistory', messages: [] });
          break;
        case 'addBot':
          seats.push({ seat: '', name: seats.some((s) => s.name === 'Bot') ? 'Bot 2' : 'Bot', connected: true, ready: true, bot: m.level });
          room();
          break;
        case 'kick':
          seats.splice(Number(m.seat.slice(1)) - 1, 1);
          room();
          break;
        case 'setReady':
          seats[0].ready = m.ready;
          room();
          break;
        case 'setAvatar':
          seats[0].avatar = m.avatar ?? undefined;
          room();
          break;
        case 'chat':
          send({ type: 'chat', message: { id: ++chatId, seat: 'p1', name: 'Mai', avatar: seats[0].avatar, text: m.text, at: Date.now() } });
          break;
      }
    });
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Chơi trực tuyến' }).click();
  await page.locator('.hub-mode[data-mode="sh"]').click();
  await page.getByLabel('Tên hiển thị').fill('Mai');
  await page.getByRole('button', { name: /Tạo phòng/ }).click();

  // The code is the hero; the mode line says what is played.
  await expect(page.getByTestId('lobby-code')).toHaveText(CODE);
  await expect(page.getByTestId('lobby-expansions')).toContainText('Thành trì · thắng ở 13 điểm · 4 ghế');
  await expect(page.locator('.lobby-sheet h2')).toHaveText('Người chơi 2/4');
  await expect(page.locator('.lobby-seat[data-seat="p1"]')).toContainText('Bạn · Chủ phòng');

  // Portrait: mine is lit, Bao's is taken.
  await page.locator('.lobby .avatar-pick').first().click();
  await expect(page.locator('.lobby .avatar-pick.mine')).toHaveCount(1);
  await expect(page.locator('.lobby .avatar-pick.taken')).toHaveCount(1);

  // Only the first empty seat offers a bot; it arrives ready, the host can remove it again.
  await expect(page.locator('.lobby-bot-btn')).toHaveCount(1);
  await page.getByLabel('Độ khó bot').selectOption('hard');
  await page.locator('.lobby-bot-btn').click();
  await expect(page.locator('.lobby-seat[data-seat="p3"]')).toContainText('Bot mức Khó');
  await expect(page.locator('.lobby-seat[data-seat="p3"]')).toContainText('Luôn sẵn sàng');
  await page.getByRole('button', { name: 'Bỏ Bot khỏi phòng' }).click();
  await expect(page.locator('.lobby-seat[data-seat="p3"]')).toHaveCount(0);
  await page.locator('.lobby-bot-btn').click();

  // Start waits for the last seat and for me.
  const start = page.locator('.lobby-start');
  await expect(start).toBeDisabled();
  await expect(start).toHaveText('Bắt đầu ván (còn chờ 2)');

  // Chat inline: no bubble in the lobby.
  await expect(page.locator('.chat-bubble')).toHaveCount(0);
  await page.getByPlaceholder('Nhắn cho cả phòng…').fill('Chờ thêm một bạn nhé');
  await page.keyboard.press('Enter');
  await expect(page.locator('.lobby-chat-line')).toContainText('Chờ thêm một bạn nhé');

  await clearHover(page);
  await page.screenshot({ path: shotPath('lobby.png', testInfo.project.name), fullPage: true });

  // Ready, the last seat filled: start lights up.
  await page.getByRole('button', { name: 'Tôi sẵn sàng' }).click();
  await expect(page.getByRole('button', { name: /Đã sẵn sàng/ })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.lobby-bot-btn').click();
  await expect(start).toBeEnabled();
  await expect(start).toHaveText('Bắt đầu ván');
  await expect(page.locator('.lobby-sheet-head')).toContainText('Mọi người đã sẵn sàng');

  // Phone: one column, nothing wider than the screen.
  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Bỏ Bot 2 khỏi phòng' }).click();
    await expect(page.locator('.lobby-bot-btn')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await clearHover(page);
    await page.screenshot({ path: shotPath('lobby.png', 'mobile'), fullPage: true });
  }
  expect(errors()).toEqual([]);
});
