// Lobby flow: create room, join, ready, start -> each client receives its own redacted state.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('lobby', () => {
  it('creates a room, seats 3 players and starts the game', async () => {
    players = await startRoom(url, 3);
    // Every player got an initial state with legal actions for its own seat.
    const states: StateMsg[] = players.map((p) => {
      const found = p.client.inbox.find((x) => x.msg.type === 'state');
      if (!found) throw new Error(`no state for ${p.name}`);
      return found.msg as StateMsg;
    });
    expect(states).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const view = states[i].view as { viewer: string; phase: { k: string }; turn: { current: string } };
      expect(view.viewer).toBe(`p${i + 1}`);
      expect(view.phase.k).toBe('setup');
      expect(Array.isArray(states[i].legal)).toBe(true);
      // At the start only the current player (drawn by the engine, D1) has legal actions.
      if (view.turn.current === view.viewer) {
        expect(states[i].legal.length).toBeGreaterThan(0);
      } else {
        expect(states[i].legal).toHaveLength(0);
      }
      // Every legal action belongs to the receiving seat.
      expect(states[i].legal.every((a) => (a as { player: string }).player === view.viewer)).toBe(true);
    }
  });

  it('rejects a join to a nonexistent room', async () => {
    const p = await connect(url, 'lonely');
    p.client.send({ type: 'joinRoom', code: 'AAAAA' });
    const err = await p.client.error('NO_SUCH_ROOM');
    expect(err.message).toMatch(/room/i);
    p.client.close();
  });

  it('rejects a game start before all seats are filled', async () => {
    const host = await connect(url, 'host');
    host.client.send({ type: 'createRoom', playerCount: 3 });
    await host.client.next((m) => m.type === 'room');
    host.client.send({ type: 'startGame' });
    const err = await host.client.error('ROOM_NOT_FULL');
    expect(err.code).toBe('ROOM_NOT_FULL');
    host.client.close();
  });

  it('only the host can start', async () => {
    const host = await connect(url, 'host');
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const room = (await host.client.next((m) => m.type === 'room')) as RoomMsg;
    const other = await connect(url, 'other');
    other.client.send({ type: 'joinRoom', code: room.code });
    await other.client.next((m) => m.type === 'room' && m.you === 'p2');
    other.client.send({ type: 'startGame' });
    const err = await other.client.error('NOT_HOST');
    expect(err.code).toBe('NOT_HOST');
    host.client.close();
    other.client.close();
  });

  it('a leaving player frees their seat and the first remaining player becomes host', async () => {
    const host = await connect(url, 'host');
    host.client.send({ type: 'createRoom', playerCount: 3 });
    const room = (await host.client.next((m) => m.type === 'room')) as RoomMsg;
    const p2 = await connect(url, 'two');
    p2.client.send({ type: 'joinRoom', code: room.code });
    await p2.client.next((m) => m.type === 'room' && m.you === 'p2');
    p2.client.send({ type: 'leaveRoom' });
    // New room message where p2 is gone and p1 hosts.
    const after = (await host.client.next(
      (m) => m.type === 'room' && m.seats.length === 1 && m.seats[0].name === 'host',
    )) as RoomMsg;
    expect(after.hostSeat).toBe('p1');
    host.client.close();
    p2.client.close();
  });
});
