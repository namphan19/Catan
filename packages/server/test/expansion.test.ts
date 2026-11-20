// Rooms with the Strongholds expansion: the option reaches createGame, clients get the redacted
// expansion view, a game can be played through the server and survives a restart.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Action } from '@hexgame/engine';
import { startServer, type ServerHandle } from '../src/main';
import { connect, startRoom, type Player, type StateMsg } from './helpers';

let url: string;
let server: ServerHandle;
let players: Player[] = [];
let dataDir: string;

interface View {
  viewer: string;
  init: { rulesetIds: string[]; vpToWin: number };
  phase: { k: string };
  ext?: { strongholds?: Record<string, unknown> };
}

async function start(): Promise<void> {
  server = await startServer({
    port: 0,
    clientDist: path.join(os.tmpdir(), 'hexgame-empty-dist-test'),
    dataDir,
  });
  url = `ws://127.0.0.1:${server.port}/ws`;
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hexgame-expansion-'));
  await start();
});

afterEach(async () => {
  for (const p of players) p.client.close();
  players = [];
  await server.close();
});

const lastState = (p: Player): StateMsg => {
  const found = p.client.inbox.filter((x) => x.msg.type === 'state').pop();
  if (!found) throw new Error(`no state for ${p.name}`);
  return found.msg as StateMsg;
};

/** Let whoever has a legal action play its first one, n times. Returns the last seq. */
async function playSome(n: number): Promise<number> {
  let seq = lastState(players[0]).seq;
  for (let i = 0; i < n; i++) {
    const actor = players.find((p) => (lastState(p).legal as Action[]).length > 0);
    if (!actor) throw new Error('nobody can act');
    actor.client.send({ type: 'action', action: (lastState(actor).legal as Action[])[0] });
    seq += 1;
    const want = seq;
    await Promise.all(players.map((p) => p.client.next((m) => m.type === 'state' && m.seq === want)));
  }
  return seq;
}

describe('strongholds rooms', () => {
  it('creates an expansion game and sends each seat the redacted expansion view', async () => {
    players = await startRoom(url, 3, { expansion: 'strongholds' });
    for (const p of players) {
      const view = lastState(p).view as View;
      expect(view.init.rulesetIds).toEqual(['base', 'strongholds']);
      expect(view.init.vpToWin).toBe(13);
      const ext = view.ext?.strongholds;
      expect(ext).toBeDefined();
      expect(ext).toHaveProperty('deckCounts');
      expect(ext).not.toHaveProperty('decks');
      expect(JSON.stringify(lastState(p))).not.toContain('"seed"');
    }
  });

  it('plays through setup and survives a server restart', async () => {
    players = await startRoom(url, 3, { expansion: 'strongholds' });
    const code = (players[0].client.inbox.filter((x) => x.msg.type === 'room').pop()!.msg as { code: string }).code;
    const seq = await playSome(14); // 3 players: 12 setup placements, then a roll and one more action
    const before = lastState(players[0]).view as View;
    expect(before.phase.k).not.toBe('setup');
    const token = players[0].token;
    for (const p of players) p.client.close();
    players = [];
    await server.close();
    await start();

    const back = await connect(url, 'player-1', token);
    players = [back];
    back.client.send({ type: 'joinRoom', code });
    await back.client.next((m) => m.type === 'room' && m.you === 'p1');
    const state = await back.client.state();
    expect(state.seq).toBe(seq);
    const after = state.view as View;
    expect(after.init.rulesetIds).toEqual(['base', 'strongholds']);
    expect(after.ext?.strongholds).toEqual(before.ext?.strongholds);
  });

  it('creates a tidelands game (alone and with strongholds) and replays it after a restart', async () => {
    players = await startRoom(url, 4, { tidelands: 'scatteredIsles', expansion: 'strongholds' });
    const v = lastState(players[0]).view as View & { init: { options?: { scenario?: string } }; ext?: { tidelands?: { scenario?: string } } };
    expect(v.init.rulesetIds).toEqual(['base', 'strongholds', 'tidelands']);
    expect(v.init.options?.scenario).toBe('scatteredIsles');
    expect(v.init.vpToWin).toBe(16);
    expect(v.ext?.tidelands?.scenario).toBe('scatteredIsles');
    expect(JSON.stringify(v)).not.toContain('"mist":[');
    const seq = await playSome(12);
    const before = JSON.stringify(lastState(players[0]).view);
    for (const p of players) p.client.close();
    players = [];
    await server.close();
    await start();
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, files[0]), 'utf8')) as { init: { options?: { scenario?: string } }; actions: unknown[] };
    expect(saved.init.options?.scenario).toBe('scatteredIsles');
    expect(saved.actions.length).toBe(seq);
    expect(before).toContain('scatteredIsles');
  });

  it('rejects unknown tidelands scenarios and scenarios that do not combine with strongholds', async () => {
    const p = await connect(url, 'Ann');
    players = [p];
    p.client.send({ type: 'createRoom', playerCount: 4, options: { tidelands: 'atlantis' } });
    expect(((await p.client.next((m) => m.type === 'error')) as { code: string }).code).toBe('BAD_MESSAGE');
    p.client.send({ type: 'createRoom', playerCount: 4, options: { tidelands: 'silk', expansion: 'strongholds' } });
    expect(((await p.client.next((m) => m.type === 'error')) as { code: string }).code).toBe('BAD_MESSAGE');
  });

  it('rejects unknown expansions and the legacy extra build mode with the expansion', async () => {
    const p = await connect(url, 'host');
    players = [p];
    const errors = () => p.client.inbox.filter((x) => x.msg.type === 'error').map((x) => x.msg);
    const waitErrors = async (n: number) => {
      for (let i = 0; i < 200 && errors().length < n; i++) await new Promise((r) => setTimeout(r, 10));
      return errors();
    };
    p.client.send({ type: 'createRoom', playerCount: 4, options: { expansion: 'seafarers' } });
    expect((await waitErrors(1))[0]).toMatchObject({ code: 'BAD_MESSAGE' });
    p.client.send({
      type: 'createRoom', playerCount: 6, options: { expansion: 'strongholds', largeTableMode: 'extraBuild' },
    });
    expect((await waitErrors(2))[1]).toMatchObject({ code: 'BAD_MESSAGE' });
    expect(p.client.inbox.some((x) => x.msg.type === 'room')).toBe(false);
  });
});
