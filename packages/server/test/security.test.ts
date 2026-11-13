// Security: redaction (own hand only), no seed/rng anywhere, seat enforcement, engine errors,
// plus the fixes for the security review: seat takeover, token shape policy, kick,
// rename-on-hello, join budget, non-echoing IMPERSONATION reply and the JSON depth cap.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol';
import { connect, shutdown, start, startRoom, type Player, type RoomMsg, type StateMsg } from './helpers';

let url: string;
let server: import('../src/main').ServerHandle;
let players: Player[] = [];

beforeEach(async () => {
  const s = await start();
  server = s.server;
  url = s.url;
});

afterEach(async () => {
  await shutdown(server, players);
  players = [];
});

function firstState(p: Player): StateMsg {
  const found = p.client.inbox.find((x) => x.msg.type === 'state');
  if (!found) throw new Error(`no state for ${p.name}`);
  return found.msg as StateMsg;
}

describe('redaction and seat security', () => {
  it('sends each seat only its own hand; other players are counts only', async () => {
    players = await startRoom(url, 3);
    for (const p of players) {
      const view = (firstState(p).view as unknown) as {
        viewer: string;
        players: { id: string; hand?: unknown; cards?: unknown; handCount: number }[];
      };
      const me = view.players.find((pl) => pl.id === view.viewer)!;
      expect(me.hand).toBeDefined(); // own hand visible
      for (const other of view.players.filter((pl) => pl.id !== view.viewer)) {
        expect(other.hand).toBeUndefined();
        expect(other.cards).toBeUndefined();
        expect(typeof other.handCount).toBe('number');
      }
    }
  });

  it('never sends the seed, rng state or a raw GameState', async () => {
    players = await startRoom(url, 3);
    // Every raw frame on every client is checked.
    for (const p of players) {
      for (const { raw } of p.client.inbox) {
        expect(raw).not.toContain('"seed"');
        expect(raw).not.toContain('"rng"');
        expect(raw).not.toContain('"schemaVersion"');
        expect(raw).not.toContain('"deck":[');
      }
    }
  });

  it('rejects an action naming another seat with IMPERSONATION', async () => {
    players = await startRoom(url, 3);
    const p2 = players[1];
    // Seat enforcement happens before engine validation, so a plain shape is enough.
    p2.client.send({ type: 'action', action: { t: 'roll', player: 'p1' } });
    const err = await p2.client.error('IMPERSONATION');
    expect(err.code).toBe('IMPERSONATION');
    expect(err.reqId).toBeUndefined();
    p2.client.send({ type: 'action', action: { t: 'roll', player: 'p1' }, reqId: 'r-42' });
    const err2 = await p2.client.error('IMPERSONATION');
    expect(err2.reqId).toBe('r-42');
  });

  it('rejects an illegal action with the engine error code', async () => {
    players = await startRoom(url, 3);
    const p1 = players[0];
    // In the setup phase, building a city is illegal (engine phase check).
    p1.client.send({ type: 'action', action: { t: 'buildCity', player: 'p1', v: 'v:0,0,N' }, reqId: 'x' });
    const err = await p1.client.error('WRONG_PHASE');
    expect(err.code).toBe('WRONG_PHASE');
    expect(err.reqId).toBe('x');
  });

  it('rejects malformed and unknown messages without crashing the room', async () => {
    players = await startRoom(url, 3);
    const p1 = players[0];
    p1.client.send('this is not json');
    await p1.client.error('BAD_MESSAGE');
    p1.client.send({ type: 'noSuchType' });
    await p1.client.error('UNKNOWN_TYPE');
    p1.client.send({ type: 'setReady', ready: 'yes' });
    await p1.client.error('BAD_MESSAGE');
    p1.client.send({ type: 'hello', name: '' });
    await p1.client.error('BAD_NAME');
    p1.client.send({ type: 'joinRoom', code: 'OOO00' });
    await p1.client.error('BAD_CODE');
    // The game still works after all that garbage.
    p1.client.send({ type: 'requestState' });
    const st = await p1.client.state();
    expect(st.view).toBeDefined();
  });

  it('a second connection cannot act as a seat it does not own', async () => {
    players = await startRoom(url, 3);
    const outsider = await connect(url, 'intruder');
    outsider.client.send({ type: 'joinRoom', code: 'ZZZZZ' });
    await outsider.client.error('NO_SUCH_ROOM');
    outsider.client.send({ type: 'action', action: { t: 'roll', player: 'p1' } });
    const err = await outsider.client.error('NOT_IN_GAME');
    expect(err.code).toBe('NOT_IN_GAME');
    outsider.client.close();
  });
});

describe('seat takeover (review #1)', () => {
  it('a new connection with the seat token wins; the old one is closed with SEAT_TAKEN_OVER', async () => {
    players = await startRoom(url, 3);
    const code = (players[1].client.inbox.find((x) => x.msg.type === 'room')!.msg as RoomMsg).code;
    const token = players[0].token;
    const oldClosed = players[0].client.closeEvent();
    const taker = await connect(url, 'newcomer', token);
    players.push(taker);
    taker.client.send({ type: 'joinRoom', code });
    const room = (await taker.client.next((m) => m.type === 'room' && m.you === 'p1')) as RoomMsg;
    expect(room.started).toBe(true);
    const st = await taker.client.state();
    expect((st.view as { viewer: string }).viewer).toBe('p1');
    const ev = await oldClosed;
    expect(ev.reason).toBe('SEAT_TAKEN_OVER');
  });

  it('a duplicate token joining the lobby also takes the seat over (new connection wins)', async () => {
    const host = await connect(url, 'host');
    players = [host];
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const room = (await host.client.next((m) => m.type === 'room')) as RoomMsg;
    const first = await connect(url, 'two');
    players.push(first);
    first.client.send({ type: 'joinRoom', code: room.code });
    await first.client.next((m) => m.type === 'room' && m.you === 'p2');
    // A second connection with the SAME session token joins the lobby.
    const oldClosed = first.client.closeEvent();
    const dupe = await connect(url, 'two-again', first.token);
    players.push(dupe);
    dupe.client.send({ type: 'joinRoom', code: room.code });
    const room2 = (await dupe.client.next((m) => m.type === 'room' && m.you === 'p2')) as RoomMsg;
    expect(room2.started).toBe(false);
    expect(room2.seats.find((s) => s.seat === 'p2')?.name).toBe('two-again');
    const ev = await oldClosed;
    expect(ev.reason).toBe('SEAT_TAKEN_OVER');
  });

  it('the old connection can no longer act after being taken over', async () => {
    players = await startRoom(url, 3);
    const code = (players[1].client.inbox.find((x) => x.msg.type === 'room')!.msg as RoomMsg).code;
    const token = players[0].token;
    const taker = await connect(url, 'newcomer', token);
    players.push(taker);
    const statesBefore = players[0].client.inbox.filter((x) => x.msg.type === 'state').length;
    const oldClosed = players[0].client.closeEvent();
    taker.client.send({ type: 'joinRoom', code });
    await taker.client.next((m) => m.type === 'room' && m.you === 'p1');
    // The takeover detaches the old socket: its messages are ignored (no error, no state)
    // and the socket itself is closed with SEAT_TAKEN_OVER.
    players[0].client.send({ type: 'requestState' });
    const ev = await oldClosed;
    expect(ev.reason).toBe('SEAT_TAKEN_OVER');
    await new Promise((r) => setTimeout(r, 100));
    expect(players[0].client.inbox.filter((x) => x.msg.type === 'state').length).toBe(statesBefore);
  });
});

describe('token shape policy (review #2)', () => {
  it('replaces a weak client-sent token with a fresh server-issued one', async () => {
    const p = await connect(url, 'weak', 'a');
    players = [p];
    expect(p.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(p.token).not.toBe('a');
  });

  it('replaces a wrong-shaped token even at exactly 22 chars', async () => {
    const p = await connect(url, 'weird', '!!'.repeat(11));
    players = [p];
    expect(p.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(p.token).not.toBe('!!'.repeat(11));
  });

  it('a weak token cannot reclaim a seat that was joined with a server token', async () => {
    players = await startRoom(url, 3);
    const code = (players[1].client.inbox.find((x) => x.msg.type === 'room')!.msg as RoomMsg).code;
    const squatter = await connect(url, 'squatter', 'short');
    players.push(squatter);
    squatter.client.send({ type: 'joinRoom', code });
    // Started game + no matching (valid) token -> the seat is NOT handed over.
    const err = await squatter.client.error('GAME_STARTED');
    expect(err.code).toBe('GAME_STARTED');
  });
});

describe('host-only kick (review #3)', () => {
  it('the host can kick a lobby player, whose connection closes with KICKED', async () => {
    const host = await connect(url, 'host');
    players = [host];
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const room = (await host.client.next((m) => m.type === 'room')) as RoomMsg;
    const p2 = await connect(url, 'two');
    players.push(p2);
    p2.client.send({ type: 'joinRoom', code: room.code });
    await p2.client.next((m) => m.type === 'room' && m.you === 'p2');
    const kicked = p2.client.closeEvent();
    host.client.send({ type: 'kick', seat: 'p2' });
    const ev = await kicked;
    expect(ev.reason).toBe('KICKED');
    const after = (await host.client.next((m) => m.type === 'room' && m.seats.length === 1)) as RoomMsg;
    expect(after.seats[0].name).toBe('host');
    expect(after.hostSeat).toBe('p1');
  });

  it('only the host can kick', async () => {
    const host = await connect(url, 'host');
    players = [host];
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const room = (await host.client.next((m) => m.type === 'room')) as RoomMsg;
    const p2 = await connect(url, 'two');
    players.push(p2);
    p2.client.send({ type: 'joinRoom', code: room.code });
    await p2.client.next((m) => m.type === 'room' && m.you === 'p2');
    p2.client.send({ type: 'kick', seat: 'p1' });
    await p2.client.error('NOT_HOST');
  });

  it('kick is lobby-only', async () => {
    players = await startRoom(url, 3);
    players[0].client.send({ type: 'kick', seat: 'p2' });
    const err = await players[0].client.error('GAME_STARTED');
    expect(err.code).toBe('GAME_STARTED');
  });

  it('the host cannot kick themselves and empty seats cannot be kicked', async () => {
    const host = await connect(url, 'host');
    players = [host];
    host.client.send({ type: 'createRoom', playerCount: 4 });
    await host.client.next((m) => m.type === 'room');
    host.client.send({ type: 'kick', seat: 'p1' });
    await host.client.error('BAD_KICK');
    host.client.send({ type: 'kick', seat: 'p3' });
    await host.client.error('BAD_KICK');
  });
});

describe('failed joinRoom budget (review #3)', () => {
  it('closes a connection after 10 failed joinRoom attempts', async () => {
    const p = await connect(url, 'bruteforce');
    players = [p];
    const closed = p.client.closeEvent();
    for (let i = 0; i < 10; i++) p.client.send({ type: 'joinRoom', code: 'AAAAA' });
    for (let i = 0; i < 10; i++) await p.client.error('NO_SUCH_ROOM');
    const ev = await closed;
    expect(ev.reason).toBe('TOO_MANY_FAILED_JOINS');
  });
});

describe('rename on repeated hello (review #10)', () => {
  it('renames the player in the lobby', async () => {
    const host = await connect(url, 'host');
    players = [host];
    host.client.send({ type: 'createRoom', playerCount: 3 });
    await host.client.next((m) => m.type === 'room');
    host.client.send({ type: 'hello', name: 'renamed' });
    const w = await host.client.next((m) => m.type === 'welcome');
    expect((w as { name: string }).name).toBe('renamed');
    const room = await host.client.next((m) => m.type === 'room' && m.seats[0].name === 'renamed');
    expect(room.type).toBe('room');
  });

  it('renames the player in a running game and everyone sees it', async () => {
    players = await startRoom(url, 3);
    players[0].client.send({ type: 'hello', name: 'boss' });
    const w = await players[0].client.next((m) => m.type === 'welcome');
    expect((w as { name: string }).name).toBe('boss');
    await players[0].client.next((m) => m.type === 'room' && m.seats[0].name === 'boss');
    const others = await players[1].client.next((m) => m.type === 'room' && m.seats[0].name === 'boss');
    expect(others.type).toBe('room');
  });
});

describe('IMPERSONATION reply (review #7)', () => {
  it('never echoes the rejected action payload', async () => {
    players = await startRoom(url, 3);
    const p2 = players[1];
    p2.client.send({ type: 'action', action: { t: 'roll', player: { secret: 'sneaky-payload' } } });
    const err = await p2.client.error('IMPERSONATION');
    expect(err.message).not.toContain('sneaky');
    expect(err.message).not.toContain('object');
    expect(err.message).not.toContain('p1');
    expect(err.message).toContain('p2');
  });
});

describe('JSON nesting depth cap (review #8)', () => {
  const mk = (n: number): string =>
    `{"type":"requestState","reqId":"r","x":${'['.repeat(n)}1${']'.repeat(n)}}`;

  it('accepts messages nested up to the limit', () => {
    // Top object counts as 1; 19 more levels = 20 total, the cap.
    expect(parseClientMessage(mk(19)).ok).toBe(true);
  });

  it('rejects deeper messages with BAD_MESSAGE', () => {
    const bad = parseClientMessage(mk(20));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code).toBe('BAD_MESSAGE');
      expect(bad.message).toMatch(/deep/i);
    }
    expect(parseClientMessage('['.repeat(100) + ']'.repeat(100)).ok).toBe(false);
  });

  it('rejects a deeply nested action over the wire without killing the connection', async () => {
    const p = await connect(url, 'deep');
    players = [p];
    p.client.send(`{"type":"action","action":${'['.repeat(40)}${']'.repeat(40)}}`);
    await p.client.error('BAD_MESSAGE');
    // The connection is still usable.
    p.client.send({ type: 'requestState' });
    await p.client.error('NOT_IN_ROOM');
  });
});
