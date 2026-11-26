// MCP server (stdio) that lets an LLM agent sit at a Boschtan table as a regular player.
// One process = one player. Config: BOSCHTAN_URL (ws(s)://host/ws or http(s)://host), BOSCHTAN_NAME.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { decide, rankActions, SCENARIO_IDS, type Action } from '@hexgame/engine';
import { GameClient, wsUrl } from './client';
import { actionStr, boardText, legend, logStr, openSpots, stateText, who, type Ctx } from './describe';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');


let client = new GameClient(
  wsUrl(process.env.BOSCHTAN_URL ?? 'wss://boschtan-server.onrender.com/ws'),
  (process.env.BOSCHTAN_NAME ?? 'Claude').slice(0, 24),
  path.join(REPO, 'data', 'agent-mcp'),
);

/** What the last list_actions showed, so act(index) can refuse a stale index. */
let listed: { version: number; legal: Action[] } | null = null;

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const fail = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true });

/** After a restart of this process: connect and take the saved seat back before anything else. */
async function ensureSession(): Promise<string> {
  try {
    await client.connect();
  } catch (e) {
    return (e as Error).message;
  }
  if (!client.room && client.savedRoom) {
    const code = client.savedRoom;
    const err = await client.request({ type: 'joinRoom', code }, (m) => m.type === 'room' && m.code === code);
    if (err) {
      client.savedRoom = null;
      return `
(Could not rejoin your last room ${code}: ${err})`;
    }
    await client.waitFor(() => !client.room?.started || !!client.view, 5000);
    return `
Rejoined your last room ${code}.`;
  }
  return '';
}

async function needGame(): Promise<Ctx | string> {
  const note = await ensureSession();
  if (!client.room) return `You are not in a room. Use join_room or create_room.${note}`;
  if (!client.room.started) return 'The game has not started yet (lobby). Use room_status / lobby.';
  const c = client.ctx();
  return c ?? 'No game state received yet; try again in a moment.';
}

/** Legal actions that really need a decision from me now. Re-answering an offer I already
 *  answered does not count, so waiting does not spin on it. */
function actionable(): Action[] {
  const me = client.room?.you;
  const answered = me && client.view?.trade?.responses?.[me];
  return client.legal.filter((a) => !(a.t === 'respondTrade' && answered));
}

function roomText(): string {
  const r = client.room;
  if (!r) return `Not in a room. Connected: ${client.open} (${client.url}) as "${client.name}".`;
  const seats = r.seats
    .map((s) => `  ${s.seat} ${s.name}${s.seat === r.you ? ' (you)' : ''}${s.seat === r.hostSeat ? ' [host]' : ''}${s.bot ? ` [bot ${s.bot}]` : ''}${s.ready ? ' ready' : ' not ready'}${s.connected ? '' : ' offline'}${s.afk ? ' afk' : ''}`)
    .join('\n');
  return `Room ${r.code}: ${r.seats.length}/${r.playerCount} seats, ${r.started ? 'GAME RUNNING' : 'lobby'}, options ${JSON.stringify(r.options)}\n${seats}`;
}

function newsText(): string {
  const out: string[] = [];
  const notes = client.notes.slice(client.notesRead);
  client.notesRead = client.notes.length;
  if (notes.length) out.push('Events since you last looked:', ...notes.map((n) => `  ${n.text}`));
  const chat = client.chat.slice(client.chatRead);
  client.chatRead = client.chat.length;
  if (chat.length) out.push('Chat:', ...chat.map((l) => `  [${l.seat} ${l.name}] ${l.text}`));
  return out.join('\n');
}

function groupedActions(c: Ctx, type: string | undefined, limit: number): string {
  const legal = client.legal;
  listed = { version: client.stateVersion, legal };
  if (!legal.length) return 'No legal actions for you right now. Use wait_for_turn.';
  const groups = new Map<string, number[]>();
  legal.forEach((a, i) => groups.set(a.t, [...(groups.get(a.t) ?? []), i]));
  const out: string[] = [`Phase: ${c.view.phase.k}. Legal actions (act with {index}) - indices valid until the state changes:`];
  const me = c.me ?? '';
  for (const [t, idx] of groups) {
    if (type && t !== type) continue;
    if (t === 'discard') {
      const ph = c.view.phase;
      const owed = ph.k === 'discard' ? ph.owed[me] : '?';
      out.push(`\n[discard] you must discard ${owed} cards. Choose them yourself:`);
      out.push(`  act {action: {t:'discard', bag:{timber:1, stone:2, ...}}}  (exactly ${owed} cards from your hand)`);
      continue;
    }
    if (t === 'offerTrade') {
      out.push(`\n[offerTrade] propose any trade to the other players (not only 1:1):`);
      out.push(`  act {action: {t:'offerTrade', give:{grain:2}, get:{stone:1}}}  then wait_for_turn {until:'any_change'} for answers, then confirmTrade/cancelTrade`);
      continue;
    }
    let list = idx;
    if (t === 'respondTrade') {
      const plain = idx.filter((i) => (legal[i] as { response?: string }).response !== 'counter');
      out.push(`\n[respondTrade] answer ${who(c, c.view.trade?.from)}'s offer (counter: act {action:{t:'respondTrade', response:'counter', give:{...}, get:{...}}}):`);
      for (const i of plain.slice(0, 4)) out.push(`  ${i}: ${actionStr(c, legal[i])}`);
      continue;
    }
    if (t === 'placeSettlement' || t === 'buildCity') {
      const score = (i: number) => {
        const m = /\[(?:[^\]]*); (\d+) pips\]/.exec(actionStr(c, legal[i]));
        return m ? Number(m[1]) : 0;
      };
      list = [...idx].sort((a, b) => score(b) - score(a));
    }
    out.push(`\n[${t}] ${idx.length} option(s)${idx.length > limit && !type ? ` - showing ${limit}, call list_actions {type:'${t}'} for all` : ''}:`);
    for (const i of list.slice(0, type ? Math.max(limit, 200) : limit)) out.push(`  ${i}: ${actionStr(c, legal[i])}`);
  }
  return out.join('\n');
}

const server = new McpServer(
  { name: 'boschtan-player', version: '0.1.0' },
  {
    instructions: [
      'You sit at a Boschtan table (a Catan-like hex game: base game, optional Strongholds and Tidelands expansions, or the standalone Highlands expansion) as a normal player.',
      'You only ever see what a human in your seat sees. Loop: wait_for_turn -> get_state (and get_board when placing) -> list_actions -> act -> repeat until the game is over.',
      'Think like a player: pick spots by pips and resource mix, plan toward the goal VP, trade with people (offerTrade) and answer their offers, use chat to talk to the table. Humans are slow: waiting is normal.',
      'Resource ids in actions are the engine ids: timber(wood), clay(brick), fiber(wool), grain(wheat), stone(ore); Highlands adds the goods plume, herb, fish (trade only). get_rules explains the rules.',
    ].join('\n'),
  },
);

server.registerTool(
  'connect',
  {
    description: 'Connect to the game server (optional: every tool connects on demand). Can change the server URL and your display name. Rejoins your last room automatically (your seat is kept by a saved session token).',
    inputSchema: {
      url: z.string().optional().describe('Server address, e.g. https://boschtan-server.onrender.com (the /ws path is added)'),
      name: z.string().min(1).max(24).optional().describe('Display name at the table'),
    },
  },
  async ({ url, name }) => {
    if ((url && wsUrl(url) !== client.url) || (name && name !== client.name)) {
      client.disconnect();
      client = new GameClient(url ? wsUrl(url) : client.url, name ?? client.name, path.join(REPO, 'data', 'agent-mcp'));
      listed = null;
    }
    try {
      await client.connect();
    } catch (e) {
      return fail((e as Error).message);
    }
    let rejoin = '';
    if (!client.room && client.savedRoom) {
      const code = client.savedRoom;
      const err = await client.request({ type: 'joinRoom', code }, (m) => m.type === 'room' && m.code === code);
      rejoin = err ? `\n(Could not rejoin your last room ${code}: ${err})` : `\nRejoined your last room ${code}.`;
    }
    return text(`Connected to ${client.url} as "${client.name}".${rejoin}\n${roomText()}`);
  },
);

server.registerTool(
  'create_room',
  {
    description: 'Create a new room (you become host). Share the code with the other players.',
    inputSchema: {
      playerCount: z.number().int().min(2).max(6),
      vpToWin: z.number().int().min(3).max(30).optional(),
      strongholds: z.boolean().optional().describe('Play with the Strongholds expansion'),
      tidelands: z.string().optional().describe(`Tidelands (sea) scenario id: ${SCENARIO_IDS.join(', ')}`),
      highlands: z.enum(['variable', 'starter']).optional().describe('Play the Highlands expansion (tribes rise and decline; alone, 2-4 players): map mode'),
    },
  },
  async ({ playerCount, vpToWin, strongholds, tidelands, highlands }) => {
    const options: Record<string, unknown> = {};
    if (vpToWin) options.vpToWin = vpToWin;
    if (strongholds) options.expansion = 'strongholds';
    if (tidelands) options.tidelands = tidelands;
    if (highlands) options.highlands = highlands;
    const err = await client.request({ type: 'createRoom', playerCount, options }, (m) => m.type === 'room');
    return err ? fail(err) : text(roomText());
  },
);

server.registerTool(
  'join_room',
  {
    description: 'Join a room by its 5-character code (also takes your seat back in a running game).',
    inputSchema: { code: z.string().describe('Room code, e.g. HEYGA') },
  },
  async ({ code }) => {
    const c = code.trim().toUpperCase();
    if (client.room?.code === c) return text(`Already in ${c}.\n${roomText()}`);
    if (client.room) await client.send({ type: 'leaveRoom' }, 800);
    client.room = null;
    const err = await client.request({ type: 'joinRoom', code: c }, (m) => m.type === 'room' && m.code === c);
    return err ? fail(err) : text(`${roomText()}\n\n${newsText()}`);
  },
);

server.registerTool(
  'lobby',
  {
    description: 'Lobby actions before the game starts: ready / unready, start (host), add_bot (host; value = easy|normal|hard|expert), kick (host; value = seat like p3), avatar (value = star|leaf|wave|sun|flame|shield), leave.',
    inputSchema: {
      op: z.enum(['ready', 'unready', 'start', 'add_bot', 'kick', 'avatar', 'leave']),
      value: z.string().optional(),
    },
  },
  async ({ op, value }) => {
    const msg: Record<string, unknown> =
      op === 'ready' ? { type: 'setReady', ready: true }
      : op === 'unready' ? { type: 'setReady', ready: false }
      : op === 'start' ? { type: 'startGame' }
      : op === 'add_bot' ? { type: 'addBot', level: value ?? 'normal' }
      : op === 'kick' ? { type: 'kick', seat: value }
      : op === 'avatar' ? { type: 'setAvatar', avatar: value ?? null }
      : { type: 'leaveRoom' };
    const err = await client.send(msg);
    if (op === 'leave' && !err) client.room = null;
    return err ? fail(err) : text(roomText());
  },
);

server.registerTool(
  'room_status',
  { description: 'Room, seats and connection status, plus anything new (events, chat).', inputSchema: {} },
  async () => {
    const note = await ensureSession();
    if (!client.open) return fail(note);
    return text(`${roomText()}${note}\n\n${newsText()}`);
  },
);

server.registerTool(
  'wait_for_turn',
  {
    description: "Block until you have something to do (your turn, a discard, a trade offer to answer...), the game ends, or someone chats. until='any_change' returns on any new state (e.g. while waiting for answers to your own offer). Returns the news since you last looked.",
    inputSchema: {
      timeout_s: z.number().int().min(5).max(600).optional().describe('Default 120'),
      until: z.enum(['my_turn', 'any_change']).optional(),
      wake_on_chat: z.boolean().optional().describe('Default true'),
    },
  },
  async ({ timeout_s, until, wake_on_chat }) => {
    const note = await ensureSession();
    if (!client.room) return fail(`You are not in a room.${note}`);
    const mode = until ?? 'my_turn';
    const chatAt = client.chat.length;
    const v0 = client.stateVersion;
    const ready = () =>
      !!client.view?.winner ||
      (wake_on_chat !== false && client.chat.slice(chatAt).some((l) => l.seat !== client.room?.you)) ||
      (mode === 'any_change' ? client.stateVersion !== v0 : client.room?.started === true && actionable().length > 0);
    if (!(mode === 'my_turn' && ready())) {
      await client.waitFor(() => ready(), (timeout_s ?? 120) * 1000);
    }
    const c = client.ctx();
    const head = client.view?.winner
      ? `GAME OVER - winner ${c ? who(c, client.view.winner) : client.view.winner}`
      : actionable().length ? 'YOUR MOVE.' : ready() ? 'Something changed.' : 'Still waiting (timeout) - call wait_for_turn again.';
    const st = c ? `\n\n${stateText(c, actionable().length)}` : `\n\n${roomText()}`;
    return text(`${head}\n\n${newsText()}${st}`);
  },
);

server.registerTool(
  'get_state',
  { description: 'Your hand, cards, VP, the other players, awards, phase, open trade, bank - and the news since you last looked.', inputSchema: {} },
  async () => {
    const c = await needGame();
    if (typeof c === 'string') return text(`${c}\n\n${roomText()}\n\n${newsText()}`);
    return text(`${stateText(c, actionable().length)}\n\n${newsText()}`);
  },
);

server.registerTool(
  'get_board',
  {
    description: 'The board: ASCII map, every hex (terrain, number, pips, robber), harbors, all buildings, roads, ships and expansion pieces. Also the id legend and building costs.',
    inputSchema: { best_spots: z.number().int().min(0).max(40).optional().describe('Also list the N best free settlement spots by pips (default 10)') },
  },
  async ({ best_spots }) => {
    const c = await needGame();
    if (typeof c === 'string') return fail(c);
    const n = best_spots ?? 10;
    const spots = n ? `\n\nBest free spots by pips (distance rule applied, connection to your roads NOT checked):\n${openSpots(c, n)}` : '';
    return text(`${legend(c.view)}\n\n${boardText(c)}${spots}`);
  },
);

server.registerTool(
  'list_actions',
  {
    description: 'Your legal actions right now, grouped and numbered, each with a readable description (positions show adjacent terrain, numbers and pips). Trades and discards you compose yourself (see the hints).',
    inputSchema: {
      type: z.string().optional().describe("Only this action type, e.g. 'placeRoad' (shows all of them)"),
      limit: z.number().int().min(1).max(500).optional().describe('Per group (default 20)'),
    },
  },
  async ({ type, limit }) => {
    const c = await needGame();
    if (typeof c === 'string') return fail(c);
    return text(groupedActions(c, type, limit ?? 20));
  },
);

server.registerTool(
  'act',
  {
    description: "Do one action: either `index` from the last list_actions, or a full `action` object in engine format ('player' is filled in for you). Examples: {t:'bankTrade', give:{grain:4}, get:{stone:1}}, {t:'offerTrade', give:{timber:1}, get:{clay:1}}, {t:'respondTrade', response:'accept'}, {t:'confirmTrade', with:'p3'}, {t:'discard', bag:{grain:2}}, {t:'playCard', card:'harvest', resources:['stone','grain']}, {t:'playCard', card:'claim', resource:'grain'}.",
    inputSchema: {
      index: z.number().int().min(0).optional(),
      action: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async ({ index, action }) => {
    const c = await needGame();
    if (typeof c === 'string') return fail(c);
    let a: Action;
    if (index !== undefined) {
      if (!listed || listed.version !== client.stateVersion)
        return fail('The state changed since your last list_actions; call list_actions again and use the new indices.');
      const x = listed.legal[index];
      if (!x) return fail(`No action ${index}.`);
      a = x;
    } else if (action && typeof action.t === 'string') {
      a = { ...(action as Record<string, unknown>), player: c.me } as Action;
    } else return fail('Give either index or action (with a t field).');
    const desc = actionStr(c, a);
    const err = await client.act(a);
    if (err) return fail(`Refused: ${err}\n(action was: ${desc})`);
    const c2 = client.ctx()!;
    return text(`Done: ${desc}\n\n${newsText()}\n\n${stateText(c2, actionable().length)}`);
  },
);

server.registerTool(
  'chat',
  {
    description: 'Say something to everyone at the table (1-300 characters). Max 5 lines per 10 s.',
    inputSchema: { text: z.string().min(1).max(300) },
  },
  async ({ text: t }) => {
    const err = await client.send({ type: 'chat', text: t }, 1000);
    if (!err) client.chatRead = client.chat.length;
    return err ? fail(err) : text('Sent.');
  },
);

server.registerTool(
  'get_log',
  {
    description: 'The public game history (every action with dice and production), newest last.',
    inputSchema: { last: z.number().int().min(1).max(500).optional().describe('Default 30') },
  },
  async ({ last }) => {
    const c = await needGame();
    if (typeof c === 'string') return fail(c);
    return text(c.view.log.slice(-(last ?? 30)).map((l) => logStr(c, l)).join('\n') || 'Empty log.');
  },
);

server.registerTool(
  'advisor',
  {
    description: "Optional: what the built-in 'hard' bot would do now and its ranking of your options. A second opinion, not an order - you decide.",
    inputSchema: { top: z.number().int().min(1).max(20).optional() },
  },
  async ({ top }) => {
    const c = await needGame();
    if (typeof c === 'string') return fail(c);
    if (!client.legal.length) return text('Nothing to decide right now.');
    const pick = decide(c.view, client.legal, { level: 'hard' });
    const ranked = rankActions(c.view, client.legal).sort((a, b) => b.score - a.score).slice(0, top ?? 6);
    return text(
      `Bot pick: ${pick ? actionStr(c, pick) : 'none'}\n` +
      `Ranking (score):\n${ranked.map((r) => `  ${r.score.toFixed(2)}  ${actionStr(c, r.action)}`).join('\n') || '  (no ranking for this phase)'}`,
    );
  },
);

server.registerTool(
  'set_afk',
  {
    description: "Hand your seat to the server's stand-in bot while you are away (true), or take it back (false).",
    inputSchema: { afk: z.boolean() },
  },
  async ({ afk }) => {
    const err = await client.send({ type: 'setAfk', afk });
    return err ? fail(err) : text(afk ? 'A bot plays for you now.' : 'You play again.');
  },
);

server.registerTool(
  'get_rules',
  {
    description: 'The rules text: base, strongholds, tidelands, highlands or decisions (clarifications).',
    inputSchema: { topic: z.enum(['base', 'strongholds', 'tidelands', 'highlands', 'decisions']) },
  },
  async ({ topic }) => {
    const file = { base: 'RULES.md', strongholds: 'RULES_STRONGHOLDS.md', tidelands: 'RULES_TIDELANDS.md', highlands: 'RULES_HIGHLANDS.md', decisions: 'RULES_DECISIONS.md' }[topic];
    try {
      return text(fs.readFileSync(path.join(REPO, 'docs', file), 'utf8'));
    } catch (e) {
      return fail(`Cannot read ${file}: ${(e as Error).message}`);
    }
  },
);

await server.connect(new StdioServerTransport());
process.on('SIGINT', () => {
  client.disconnect();
  process.exit(0);
});
