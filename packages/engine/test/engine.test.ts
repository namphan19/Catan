import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyAction, createGame, getEventsView, getLegalActions, getPlayerView, randInt, replay, seedRng,
  validateAction, type Action, type GameState,
} from '../src';
import { runRandomGame } from '../fuzz/randomGame';
import { blankGame, pl, setHand } from './helpers';

/** Play n random legal actions (seeded policy) from a new game. */
function playRandom(seed: string, players: number, n: number): GameState {
  let s = createGame({ seed, playerCount: players });
  const policy = seedRng(`p:${seed}`);
  for (let i = 0; i < n && !s.winner; i++) {
    const opts: Action[] = s.players.flatMap((p) => getLegalActions(s, p.id));
    s = applyAction(s, opts[randInt(policy, opts.length)]).state;
  }
  return s;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe('purity and serialization', () => {
  it('never mutates the input state', () => {
    const s = playRandom('pure', 4, 120);
    const before = JSON.stringify(s);
    deepFreeze(s);
    for (const p of s.players) for (const a of getLegalActions(s, p.id).slice(0, 20)) applyAction(s, a);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('state is plain JSON (round-trips unchanged)', () => {
    const s = playRandom('json', 5, 300);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('every action returned by getLegalActions validates', () => {
    let s = createGame({ seed: 'legal', playerCount: 4 });
    const policy = seedRng('legal-policy');
    for (let i = 0; i < 400 && !s.winner; i++) {
      const opts = s.players.flatMap((p) => getLegalActions(s, p.id));
      for (const a of opts) expect(validateAction(s, a)).toEqual({ ok: true });
      s = applyAction(s, opts[randInt(policy, opts.length)]).state;
    }
  });

  it('rejects malformed and unknown actions with a reason', () => {
    const s = createGame({ seed: 'bad', playerCount: 3 });
    expect(validateAction(s, { t: 'fly', player: 'p1' } as unknown as Action)).toMatchObject({ ok: false, code: 'UNKNOWN_ACTION' });
    expect(validateAction(s, {} as Action)).toMatchObject({ ok: false, code: 'BAD_ACTION' });
    expect(validateAction(s, { t: 'roll', player: 'p9' })).toMatchObject({ ok: false, code: 'UNKNOWN_PLAYER' });
    expect(() => applyAction(s, { t: 'roll', player: 'p1' })).toThrow(/WRONG_PHASE/);
  });

  it('engine source uses no Math.random, Date, timers or I/O', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '..', 'src'));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // code only
      expect(src, f).not.toMatch(/Math\.random|new Date|Date\.now|performance\.now|setTimeout|setInterval|process\.|from 'node:|require\(/);
    }
  });
});

describe('replay', () => {
  it('same seed + same actions = identical state', () => {
    const s = playRandom('replay', 4, 500);
    const actions = s.log.map((l) => l.action);
    expect(replay(s.init, actions)).toEqual(s);
    expect(replay(s.init, actions)).toEqual(replay(s.init, actions));
  });

  it('replays a 6-player game with the extra build phase', () => {
    const s = playRandom('replay6', 6, 500);
    expect(replay(s.init, s.log.map((l) => l.action))).toEqual(s);
  });

  it('a different seed gives a different game', () => {
    const a = createGame({ seed: 'a', playerCount: 4 });
    const b = createGame({ seed: 'b', playerCount: 4 });
    expect(a.rng).not.toEqual(b.rng);
    expect(a.bank.deck).not.toEqual(b.bank.deck);
  });

  it('the action log is append-only with sequential numbers', () => {
    const s = playRandom('log', 3, 200);
    s.log.forEach((l, i) => expect(l.seq).toBe(i));
  });
});

describe('redaction (getPlayerView)', () => {
  function midGame() {
    const s = blankGame(4);
    setHand(s, 'p1', { timber: 2, stone: 1 });
    setHand(s, 'p2', { grain: 3 });
    pl(s, 'p1').cards = ['relic', 'guard'];
    pl(s, 'p2').cards = ['claim'];
    pl(s, 'p2').newCards = ['harvest'];
    return s;
  }

  it('shows the viewer their own hand and cards but only counts for others', () => {
    const v = getPlayerView(midGame(), 'p1');
    const me = v.players.find((p) => p.id === 'p1')!;
    const other = v.players.find((p) => p.id === 'p2')!;
    expect(me.hand).toMatchObject({ timber: 2, stone: 1 });
    expect(me.cards).toEqual(['relic', 'guard']);
    expect(me.vp).toBe(1);
    expect(other).not.toHaveProperty('hand');
    expect(other).not.toHaveProperty('cards');
    expect(other).not.toHaveProperty('newCards');
    expect(other).not.toHaveProperty('vp');
    expect(other.handCount).toBe(3);
    expect(other.cardCount).toBe(2);
    expect(me.publicVP).toBe(0); // the relic is hidden from the public score
  });

  it('hides the seed, RNG state, deck order and extension state', () => {
    const s = midGame();
    s.ext.secret = { x: 1 };
    const v = getPlayerView(s, 'p2');
    const json = JSON.stringify(v);
    expect(v).not.toHaveProperty('rng');
    expect(v).not.toHaveProperty('ext');
    expect(v.init).not.toHaveProperty('seed');
    expect(v.bank).not.toHaveProperty('deck');
    expect(v.bank.deckCount).toBe(s.bank.deck.length);
    expect(json).not.toContain(s.init.seed);
    expect(json).not.toContain('relic'); // p1's hidden card
    expect(json).toContain('harvest'); // p2's own new card is visible to p2
  });

  it('spectators see no hands at all', () => {
    const v = getPlayerView(midGame(), null);
    for (const p of v.players) expect(p).not.toHaveProperty('hand');
  });

  it('no hidden information leaks in views across a played game', () => {
    const s = playRandom('leak', 4, 600);
    for (const viewer of ['p1', 'p2', 'p3', 'p4']) {
      const v = getPlayerView(s, viewer);
      for (const p of v.players) {
        if (p.id === viewer) continue;
        expect(p.hand).toBeUndefined();
        expect(p.cards).toBeUndefined();
      }
      expect(JSON.stringify(v)).not.toContain('"deck"');
    }
  });

  it('event views hide the stolen resource and bought card from third parties', () => {
    const events = [
      { e: 'stole' as const, from: 'p2', to: 'p1', resource: 'stone' },
      { e: 'cardBought' as const, player: 'p1', card: 'guard' },
    ];
    expect(getEventsView(events, 'p3')).toEqual([
      { e: 'stole', from: 'p2', to: 'p1', resource: undefined },
      { e: 'cardBought', player: 'p1', card: undefined },
    ]);
    expect(getEventsView(events, 'p2')[0]).toMatchObject({ resource: 'stone' });
    expect(getEventsView(events, 'p1')[1]).toMatchObject({ card: 'guard' });
  });
});

describe('full random game (fuzz smoke)', () => {
  it('terminates with a winner and all invariants hold', () => {
    const r = runRandomGame('fuzz-5', 4);
    expect(r.winner).toBeDefined();
  }, 60_000);
});
