// Temporary debug script (not part of the test suite). Run: npx tsx test/debug-one.mts
import { startServer } from '../src/main';
import { WebSocket } from 'ws';

const server = await startServer({
  port: 0,
  clientDist: process.env.TEMP + '\\hexgame-empty-dist-test',
  dataDir: process.env.TEMP + '\\hexgame-debug-rooms',
});
const url = `ws://127.0.0.1:${server.port}/ws`;

function mk(name: string) {
  let lastMsg: any = null;
  const ws = new WebSocket(url);
  ws.on('message', (d: Buffer) => {
    lastMsg = JSON.parse(d.toString());
    console.log(`[${name}] <-`, d.toString().slice(0, 160));
  });
  ws.on('error', (e: Error) => console.log(`[${name}] err`, e.message));
  return { ws, last: () => lastMsg };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const a = mk('A');
  const b = mk('B');
  const c = mk('C');
  const send = (ws: WebSocket, o: unknown) => ws.send(JSON.stringify(o));
  await Promise.all([
    new Promise((r) => a.ws.on('open', r)),
    new Promise((r) => b.ws.on('open', r)),
    new Promise((r) => c.ws.on('open', r)),
  ]);
  send(a.ws, { type: 'hello', name: 'a', reqId: 'r1' });
  send(b.ws, { type: 'hello', name: 'b' });
  send(c.ws, { type: 'hello', name: 'c' });
  await sleep(200);
  send(a.ws, { type: 'createRoom', playerCount: 3 });
  await sleep(300);
  const code = a.last().code;
  console.log('CODE =', code);
  send(b.ws, { type: 'joinRoom', code });
  send(c.ws, { type: 'joinRoom', code });
  await sleep(300);
  send(a.ws, { type: 'setReady', ready: true });
  send(b.ws, { type: 'setReady', ready: true });
  send(c.ws, { type: 'setReady', ready: true });
  await sleep(300);
  send(a.ws, { type: 'startGame', reqId: 'r9' });
  await sleep(500);
  process.exit(0);
}
main();
