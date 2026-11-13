// Security: redaction (own hand only), no seed/rng anywhere, seat enforcement, engine errors.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connect, shutdown, start, startRoom, type Player, type StateMsg } from './helpers';

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
