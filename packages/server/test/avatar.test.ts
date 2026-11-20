// Portraits: picked in the lobby, first come first served (a taken one is refused), carried on the
// room seats and chat lines, and filled in for every seat (bots too) when the game starts.
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerHandle } from '../src/main';
import { AVATARS } from '../src/protocol';
import { connect, start, type Player, type RoomMsg } from './helpers';

let server: ServerHandle | undefined;
let players: Player[] = [];

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server?.close();
  server = undefined;
});

const roomWhere = (p: Player, test: (m: RoomMsg) => boolean) =>
  p.client.next((m) => m.type === 'room' && test(m)) as Promise<RoomMsg>;

describe('avatars', () => {
  it('is first come first served in the lobby and filled in for everyone at start', async () => {
    const s = await start();
    server = s.server;
    const host = await connect(s.url, 'host');
    const guest = await connect(s.url, 'guest');
    players = [host, guest];
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const { code } = await roomWhere(host, () => true);
    guest.client.send({ type: 'joinRoom', code });
    await roomWhere(guest, (m) => m.you === 'p2');

    host.client.send({ type: 'setAvatar', avatar: 'wave' });
    await roomWhere(guest, (m) => m.seats[0].avatar === 'wave');

    // Taken by the host: refused for the guest, who then picks another.
    guest.client.send({ type: 'setAvatar', avatar: 'wave' });
    await guest.client.error('AVATAR_TAKEN');
    guest.client.send({ type: 'setAvatar', avatar: 'leaf' });
    const both = await roomWhere(host, (m) => m.seats[1]?.avatar === 'leaf');
    expect(both.seats[0].avatar).toBe('wave');

    // Clearing frees it for someone else.
    host.client.send({ type: 'setAvatar', avatar: null });
    await roomWhere(guest, (m) => m.seats[0].avatar === undefined);
    guest.client.send({ type: 'setAvatar', avatar: 'wave' });
    await roomWhere(host, (m) => m.seats[1]?.avatar === 'wave');

    guest.client.send({ type: 'setAvatar', avatar: 'dragon' });
    await guest.client.error('BAD_MESSAGE');

    // Chat lines carry the sender's portrait.
    guest.client.send({ type: 'chat', text: 'hi' });
    const line = await host.client.next((m) => m.type === 'chat');
    expect(line).toMatchObject({ message: { seat: 'p2', avatar: 'wave' } });

    // A bot and the host have none yet: the start fills them with free, distinct portraits.
    host.client.send({ type: 'addBot', level: 'easy' });
    await roomWhere(host, (m) => m.seats.length === 3);
    for (const p of players) p.client.send({ type: 'setReady', ready: true });
    await roomWhere(host, (m) => m.seats.length === 3 && m.seats.every((x) => x.ready));
    host.client.send({ type: 'startGame' });
    const started = await roomWhere(guest, (m) => m.started);
    const picked = started.seats.map((x) => x.avatar);
    expect(picked[1]).toBe('wave');
    expect(picked.every((a) => a && (AVATARS as readonly string[]).includes(a))).toBe(true);
    expect(new Set(picked).size).toBe(3);

    host.client.send({ type: 'setAvatar', avatar: 'sun' });
    await host.client.error('GAME_STARTED');
  });
});
