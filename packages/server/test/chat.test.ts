// Room chat: lines go to everyone in the room (lobby and game), are validated and rate-limited,
// and a player who joins or reconnects later receives the recent history.
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerHandle } from '../src/main';
import type { ServerMsg } from '../src/protocol';
import { CHAT_BURST, CHAT_HISTORY } from '../src/rooms';
import { connect, start, startRoom, type Player } from './helpers';

type ChatMsg = Extract<ServerMsg, { type: 'chat' }>;
type HistoryMsg = Extract<ServerMsg, { type: 'chatHistory' }>;

let server: ServerHandle | undefined;
let players: Player[] = [];

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server?.close();
  server = undefined;
});

const chatOf = (p: Player, text: string) =>
  p.client.next((m) => m.type === 'chat' && m.message.text === text) as Promise<ChatMsg>;
const historyOf = (p: Player) => p.client.next((m) => m.type === 'chatHistory') as Promise<HistoryMsg>;

describe('room chat', () => {
  it('relays a line to everyone in the room, the sender too, and validates it', async () => {
    const s = await start();
    server = s.server;
    const outsider = await connect(s.url, 'outsider');
    players = [outsider];
    outsider.client.send({ type: 'chat', text: 'hello?' });
    await outsider.client.error('NOT_IN_ROOM');

    const room = await startRoom(s.url, 3);
    players.push(...room);
    const [p1, p2, p3] = room;
    p2.client.send({ type: 'chat', text: '  Chào cả nhà <b>!</b>  ' });
    for (const p of room) {
      const m = await chatOf(p, 'Chào cả nhà <b>!</b>');
      expect(m.message).toMatchObject({ seat: 'p2', name: 'player-2', id: 1 });
      expect(typeof m.message.at).toBe('number');
    }
    expect(outsider.client.inbox.some((x) => x.msg.type === 'chat')).toBe(false);

    p1.client.send({ type: 'chat', text: '   ' });
    await p1.client.error('BAD_CHAT');
    p1.client.send({ type: 'chat', text: 'x'.repeat(301) });
    await p1.client.error('BAD_CHAT');
    p1.client.send({ type: 'chat', text: 'a\u0007b' });
    await p1.client.error('BAD_CHAT');
    p1.client.send({ type: 'chat', text: 42 });
    await p1.client.error('BAD_MESSAGE');
    p3.client.send({ type: 'chat', text: 'x'.repeat(300) });
    await chatOf(p1, 'x'.repeat(300));
  });

  it('limits the chat rate per connection', async () => {
    const s = await start();
    server = s.server;
    players = await startRoom(s.url, 3);
    const [p1] = players;
    for (let i = 0; i < CHAT_BURST; i++) p1.client.send({ type: 'chat', text: `line ${i}` });
    await chatOf(p1, `line ${CHAT_BURST - 1}`);
    p1.client.send({ type: 'chat', text: 'one too many' });
    await p1.client.error('CHAT_RATE');
  });

  it('sends the recent history on join and on reconnect', async () => {
    const s = await start();
    server = s.server;
    const host = await connect(s.url, 'host');
    players = [host];
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const room = (await host.client.next((m) => m.type === 'room')) as Extract<ServerMsg, { type: 'room' }>;
    host.client.send({ type: 'chat', text: 'first' });
    await chatOf(host, 'first');

    // A newcomer gets the history right after joining.
    const guest = await connect(s.url, 'guest');
    players.push(guest);
    guest.client.send({ type: 'joinRoom', code: room.code });
    const h = await historyOf(guest);
    expect(h.messages.map((m) => m.text)).toEqual(['first']);

    // A reconnect with the same token gets it again, including newer lines.
    guest.client.send({ type: 'chat', text: 'second' });
    await chatOf(host, 'second');
    guest.client.close();
    const again = await connect(s.url, 'guest', guest.token);
    players.push(again);
    again.client.send({ type: 'joinRoom', code: room.code });
    expect((await historyOf(again)).messages.map((m) => m.text)).toEqual(['first', 'second']);
  });

  it(`keeps only the last ${CHAT_HISTORY} lines`, async () => {
    const s = await start();
    server = s.server;
    // Several connections in one room, so the per-connection rate limit is not hit.
    const host = await connect(s.url, 'host');
    players = [host];
    host.client.send({ type: 'createRoom', playerCount: 6 });
    const room = (await host.client.next((m) => m.type === 'room')) as Extract<ServerMsg, { type: 'room' }>;
    const talkers = [host];
    for (let i = 0; i < 5; i++) {
      const p = await connect(s.url, `t${i}`);
      players.push(p);
      p.client.send({ type: 'joinRoom', code: room.code });
      await historyOf(p);
      talkers.push(p);
    }
    const total = CHAT_HISTORY + 5;
    let n = 0;
    while (n < total) {
      for (const p of talkers) {
        if (n >= total) break;
        p.client.send({ type: 'chat', text: `m${n++}` });
      }
      await chatOf(host, `m${n - 1}`);
      if (n % (CHAT_BURST * talkers.length) === 0) await new Promise((r) => setTimeout(r, 10_100));
    }
    host.client.send({ type: 'requestState' });
    const h = await historyOf(host);
    expect(h.messages).toHaveLength(CHAT_HISTORY);
    expect(h.messages[0].text).toBe(`m${total - CHAT_HISTORY}`);
    expect(h.messages.at(-1)!.text).toBe(`m${total - 1}`);
  }, 40_000);
});
