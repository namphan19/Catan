// Smoke run: start the MCP server over stdio like an agent host would, create a room against a
// running Boschtan server, add bots, start, and play a number of moves through the tools only.
// Usage: tsx test/smoke.ts [ws-url] [moves]   (default ws://localhost:8080/ws, 120 moves)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const url = process.argv[2] ?? 'ws://localhost:8080/ws';
const moves = Number(process.argv[3] ?? 120);
const verbose = process.env.VERBOSE === '1';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['../../node_modules/tsx/dist/cli.mjs', 'src/main.ts'],
  env: { ...process.env, BOSCHTAN_URL: url, BOSCHTAN_NAME: 'SmokeTest' } as Record<string, string>,
  stderr: 'inherit',
});
const mcp = new Client({ name: 'smoke', version: '0' });
await mcp.connect(transport);

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const r = (await mcp.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const t = r.content.map((c) => c.text).join('\n');
  if (verbose) console.log(`\n=== ${name} ${JSON.stringify(args)}${r.isError ? ' (ERROR)' : ''}\n${t}`);
  if (r.isError) throw new Error(`${name}: ${t}`);
  return t;
}

const tools = await mcp.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));
console.log(await call('create_room', { playerCount: 3, ...JSON.parse(process.argv[4] ?? '{}') }));
await call('lobby', { op: 'add_bot', value: 'easy' });
await call('lobby', { op: 'add_bot', value: 'easy' });
await call('lobby', { op: 'ready' });
console.log(await call('lobby', { op: 'start' }));
await call('chat', { text: 'smoke test hello' });

let done = 0;
let printedBoard = false;
let tradeTried = false;
while (done < moves) {
  const w = await call('wait_for_turn', { timeout_s: 60 });
  if (w.startsWith('GAME OVER')) {
    console.log(w.split('\n')[0]);
    break;
  }
  if (!w.startsWith('YOUR MOVE')) continue;
  if (!printedBoard) {
    console.log((await call('get_board', { best_spots: 5 })).split('\n').slice(0, 40).join('\n'));
    printedBoard = true;
  }
  let list = await call('list_actions');
  let res: string;
  if (!tradeTried && list.includes('[offerTrade]')) {
    // Exercise a player trade once: offer, wait for answers, then confirm with an acceptor or cancel.
    tradeTried = true;
    const st = await call('get_state');
    const first = (/hand \(\d+\): (\d+) (\w+)/.exec(st) ?? [])[2];
    const want = ['timber', 'clay', 'fiber', 'grain', 'stone'].find((r) => r !== first)!;
    console.log('trade: ' + (await call('act', { action: { t: 'offerTrade', give: { [first]: 1 }, get: { [want]: 1 } } })).split('\n')[0]);
    const w2 = await call('wait_for_turn', { until: 'any_change', timeout_s: 40 });
    console.log('trade news: ' + w2.split('\n').filter((l) => /answered|OPEN TRADE|accept|decline/.test(l)).join(' | '));
    const acceptor = /(p\d) [^:]*: accept/.exec(w2)?.[1];
    const end = acceptor
      ? await call('act', { action: { t: 'confirmTrade', with: acceptor } })
      : await call('act', { action: { t: 'cancelTrade' } });
    console.log('trade end: ' + end.split('\n')[0]);
    list = await call('list_actions');
  }
  if (list.includes('[discard]')) {
    const st = await call('get_state');
    const owed = Number(/you must discard (\d+)/.exec(list)?.[1] ?? 0);
    const hand = /hand \(\d+\): (.*)/.exec(st)?.[1] ?? '';
    const bag: Record<string, number> = {};
    let left = owed;
    for (const part of hand.split(', ')) {
      const [n, r] = part.split(' ');
      const take = Math.min(left, Number(n));
      if (take > 0) bag[r] = take;
      left -= take;
    }
    res = await call('act', { action: { t: 'discard', bag } });
  } else {
    // Prefer moves that build or progress; never answer trades (that path is exercised separately).
    const lines = [...list.matchAll(/^ {2}(\d+): (.*)$/gm)].map((m) => ({ i: Number(m[1]), d: m[2] }));
    const pref = ['settlement at', 'city at', 'road on', 'roll the dice', 'move the robber', 'steal from', 'decline', 'end the turn'];
    let pick = lines[0];
    for (const p of pref) {
      const hit = lines.find((l) => l.d.startsWith(p));
      if (hit) {
        pick = hit;
        break;
      }
    }
    if (!pick) {
      console.log('no indexed action in:\n' + list);
      break;
    }
    res = await call('act', { index: pick.i });
  }
  done++;
  if (done <= 3 || done % 20 === 0) console.log(`move ${done}: ${res.split('\n')[0]}`);
}
console.log('\n' + (await call('get_state')).split('\n').slice(0, 14).join('\n'));
console.log('\nlog tail:\n' + (await call('get_log', { last: 8 })));
console.log('\nadvisor:\n' + (await call('advisor').catch((e) => String(e))));
await mcp.close();
process.exit(0);
