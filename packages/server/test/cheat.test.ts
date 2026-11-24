// Dice cheat: the code sent in chat is never relayed; it unlocks choosing the dice for that seat only.
import { afterEach, describe, expect, it } from 'vitest';
import { DICE_CHEAT_CODE, type Action, type PlayerView } from '@hexgame/engine';
import type { ServerHandle } from '../src/main';
import { lastOf, start, startRoom, type Player, type RoomMsg, type StateMsg } from './helpers';

let server: ServerHandle | undefined;
let players: Player[] = [];

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server?.close();
  server = undefined;
});

const latest = (p: Player): StateMsg => {
  const msgs = p.client.inbox.filter((x) => x.msg.type === 'state').map((x) => x.msg as StateMsg);
  return lastOf(msgs);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Play the setup with the first legal spots until a seat can roll; returns that seat's player. */
async function toFirstRoll(room: Player[]): Promise<Player> {
  for (let i = 0; i < 200; i++) {
    for (const p of room) {
      const legal = latest(p).legal as Action[];
      if (legal.some((a) => a.t === 'roll')) return p;
      if (legal.length) {
        const seq = latest(p).seq;
        p.client.send({ type: 'action', action: legal[0] });
        await p.client.next((m) => m.type === 'state' && m.seq > seq);
        await sleep(20);
      }
    }
  }
  throw new Error('no roll reached');
}

describe('dice cheat', () => {
  it('unlocks choosing the dice for the sender only, without showing the code', async () => {
    const s = await start();
    server = s.server;
    players = await startRoom(s.url, 2);
    const roller = await toFirstRoll(players);
    const other = players.find((p) => p !== roller)!;
    const seat = (latest(roller).view as PlayerView).viewer!;

    roller.client.send({ type: 'action', action: { t: 'roll', player: seat, dice: [3, 3] } });
    await roller.client.error('DICE_LOCKED');

    roller.client.send({ type: 'chat', text: ` ${DICE_CHEAT_CODE.toUpperCase()} ` });
    const mine = (await roller.client.next((m) => m.type === 'room' && !!m.diceCheat)) as RoomMsg;
    expect(mine.you).toBe(seat);
    // Nobody else sees the code line or the unlock.
    other.client.send({ type: 'chat', text: 'hi' });
    await other.client.next((m) => m.type === 'chat' && m.message.text === 'hi');
    expect(other.client.inbox.some((x) => x.msg.type === 'chat' && x.msg.message.text !== 'hi')).toBe(false);
    expect(other.client.inbox.some((x) => x.msg.type === 'room' && x.msg.diceCheat)).toBe(false);

    const seq = latest(other).seq;
    roller.client.send({ type: 'action', action: { t: 'roll', player: seat, dice: [3, 3] } });
    const st = (await other.client.next((m) => m.type === 'state' && m.seq > seq)) as StateMsg;
    const view = st.view as PlayerView;
    expect(view.turn.roll).toEqual([3, 3]);
    expect(lastOf(view.log).action).toEqual({ t: 'roll', player: seat });
  });
});
