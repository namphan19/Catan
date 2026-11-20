// Generates a complete 4-player base game (all seats played by the engine's 'hard' bot) and
// marks the first action index at which each interesting player-facing state appears, so the
// gameplay screenshot tour (ui-play/gameplay-tour.mts) can load the exact prefix through the
// app's normal "load & replay" path and show that state in the real UI.
// Usage: node ../../node_modules/tsx/dist/cli.mjs tools/gen-gameplay-log.mts <seed> > out.json
import {
  applyAction,
  botAct,
  createGame,
  getLegalActions,
  type Action,
  type GameState,
  type PlayerId,
} from '../../engine/src/index.ts';

const SEED = process.argv[2] ?? 'gameplay-tour-1';
let state: GameState = createGame({ seed: SEED, playerCount: 4 });
const actions: Action[] = [];
const marks: Record<string, { idx: number; info: unknown }> = {};
const mark = (key: string, info: unknown = null) => {
  if (!(key in marks)) marks[key] = { idx: actions.length, info };
};

const handSize = (p: PlayerId) =>
  Object.values(state.players.find((x) => x.id === p)!.hand).reduce((a, b) => a + (b ?? 0), 0);

/** Who acts next: open-offer responders first, then owed discards, then the phase actor. */
function nextAction(): Action | null {
  const ids = state.players.map((p) => p.id);
  const order: PlayerId[] = [];
  if (state.trade) for (const id of ids) if (id !== state.trade.from && !state.trade.responses[id]) order.push(id);
  if (state.phase.k === 'discard') order.push(...Object.keys(state.phase.owed));
  const ph = state.phase as { actor?: PlayerId };
  if (ph.actor) order.push(ph.actor);
  order.push(state.turn.current, ...ids);
  for (const id of order) {
    const a = botAct(state, id, { level: 'hard' });
    if (a) return a;
  }
  return null;
}

function inspect() {
  const cur = state.turn.current;
  const k = state.phase.k;
  if (k === 'setup') {
    const s = state.phase as { idx: number; step: string };
    mark(`setup-${s.idx >= state.players.length ? 2 : 1}-${s.step}`, { cur });
  }
  if (k === 'preRoll' && state.turn.n >= 1) mark('preRoll', { cur, n: state.turn.n });
  if (k === 'main' && !state.trade) {
    const legal = getLegalActions(state, cur);
    const types = new Set(legal.map((a) => a.t));
    if (handSize(cur) >= 3) mark('main-after-roll', { cur });
    const rich = ['placeSettlement', 'buildCity', 'buyCard', 'bankTrade', 'placeRoad'].filter((t) => types.has(t));
    if (rich.length >= 3) mark('main-rich', { cur, rich });
    if (types.has('buildCity')) mark('main-can-city', { cur });
    if (types.has('placeSettlement')) mark('main-can-settle', { cur });
    if (types.has('buyCard')) mark('main-can-buy', { cur });
    for (const a of legal) if (a.t === 'playCard') mark(`card-${a.card}`, { cur });
    if (legal.some((a) => a.t === 'bankTrade' && Object.values(a.give).some((n) => n === 4))) mark('main-bank4', { cur });
    if (legal.some((a) => a.t === 'bankTrade' && Object.values(a.give).some((n) => n === 2 || n === 3)))
      mark('main-harbor-trade', { cur });
  }
  if (k === 'discard') {
    const owed = (state.phase as { owed: Record<string, number> }).owed;
    mark('discard', { cur, owed });
  }
  if (k === 'moveBlocker') mark('moveBlocker', { cur, actor: (state.phase as { actor?: string }).actor });
  // with a single victim the client steals at once, so only a real choice shows the dialog
  if (k === 'steal' && (state.phase as { from: string[] }).from.length >= 2)
    mark('steal', { cur, from: (state.phase as { from: string[] }).from });
  if (k === 'moveBlocker' && state.turn.roll && state.turn.roll.reduce((a, b) => a + b, 0) !== 7)
    mark('moveBlocker-knight', { cur });
  if (k === 'freeRoads') mark('freeRoads', { cur });
  if (state.trade) {
    mark('trade-open', { from: state.trade.from, give: state.trade.give, get: state.trade.get });
    if (Object.values(state.trade.responses).some((r) => r.response === 'accept')) mark('trade-accepted', { from: state.trade.from });
  }
  for (const [award, who] of Object.entries(state.awards)) if (who) mark(`award-${award}`, { who });
}

inspect();
for (let step = 0; step < 20000; step += 1) {
  if (state.phase.k === 'over' || state.winner) break;
  const a = nextAction();
  if (!a) break;
  const res = applyAction(state, a) as { state?: GameState; ok?: boolean };
  if (!res.state) throw new Error('illegal bot action ' + JSON.stringify(a) + ' ' + JSON.stringify(res));
  // the move that wins: remember the position just before it
  if (res.state.winner) mark('before-win', { cur: state.turn.current, action: a });
  state = res.state;
  actions.push(a);
  inspect();
}
mark('over', { winner: state.winner });

process.stderr.write(`actions=${actions.length} phase=${state.phase.k} winner=${state.winner ?? '-'} turns=${state.turn.n}\n`);
for (const [k, v] of Object.entries(marks)) process.stderr.write(`  ${k.padEnd(20)} @${v.idx} ${JSON.stringify(v.info)}\n`);
process.stdout.write(JSON.stringify({ init: state.init, actions, marks }, null, 1));
