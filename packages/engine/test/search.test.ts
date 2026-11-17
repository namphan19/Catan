// Search bot (M4 step 3): determinizations are consistent with the bot's view and never copy hidden
// information, the search returns legal and reproducible moves, and an expert seat finishes games.
import { describe, expect, it } from 'vitest';
import {
  applyAction, botAct, createGame, determinize, getLegalActions, getPlayerView, searchCandidates, searchDecide,
  seedRng, validateAction, type GameState,
} from '../src';
import { playArenaGame } from '../fuzz/botArena';

/** A mid-game state reached by hard bots, at a main-phase decision worth searching. */
function midGame(seed: string): GameState {
  let s = createGame({ seed, playerCount: 4 });
  for (let i = 0; i < 4000; i++) {
    const cur = s.turn.current;
    if (s.turn.n >= 10 && s.phase.k === 'main' && searchCandidates(getPlayerView(s, cur), getLegalActions(s, cur))) break;
    const id = s.players.map((p) => p.id).find((p) => botAct(s, p, { level: 'hard' }));
    if (!id) throw new Error('stalled');
    s = applyAction(s, botAct(s, id, { level: 'hard' })!).state;
  }
  return s;
}

const total = (b: Record<string, number>) => Object.values(b).reduce((a, n) => a + n, 0);

describe('determinize', () => {
  it('keeps everything the viewer knows and samples the rest', () => {
    const real = midGame('det-1');
    const me = real.turn.current;
    const view = getPlayerView(real, me);
    const hands = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const d = determinize(view, seedRng(`d${k}`))!;
      expect(d).not.toBeNull();
      expect(d.board).toEqual(real.board);
      expect(d.pieces).toEqual(real.pieces);
      expect(d.bank.hand).toEqual(real.bank.hand);
      expect(d.bank.deck.length).toBe(real.bank.deck.length);
      for (const p of real.players) {
        const q = d.players.find((x) => x.id === p.id)!;
        expect(total(q.hand)).toBe(total(p.hand));
        expect(q.cards.length + q.newCards.length).toBe(p.cards.length + p.newCards.length);
        expect(q.played).toEqual(p.played);
        if (p.id === me) {
          expect(q.hand).toEqual(p.hand);
          expect(q.cards).toEqual(p.cards);
        }
      }
      expect(d.rng).not.toEqual(real.rng); // never the real dice seed
      hands.add(JSON.stringify(d.players.filter((p) => p.id !== me).map((p) => p.hand)));
    }
    expect(hands.size).toBeGreaterThan(1); // hidden hands really are sampled
  });

  it('does not depend on hidden information (other hands, deck order, dice seed)', () => {
    const real = midGame('det-2');
    const me = real.turn.current;
    const alt = JSON.parse(JSON.stringify(real)) as GameState;
    // Swap one card between two opponents (same hand sizes, different makeup), reorder the deck and
    // change the dice seed: none of it is visible, so the determinization must not change.
    const opps = alt.players.filter((p) => p.id !== me && total(p.hand) > 0);
    expect(opps.length).toBeGreaterThan(1);
    const [a, b] = opps;
    const ra = Object.keys(a.hand).find((r) => a.hand[r] > 0)!;
    const rb = Object.keys(b.hand).find((r) => b.hand[r] > 0 && r !== ra);
    if (rb) {
      a.hand[ra]--; a.hand[rb] = (a.hand[rb] ?? 0) + 1;
      b.hand[rb]--; b.hand[ra] = (b.hand[ra] ?? 0) + 1;
    }
    alt.bank.deck.reverse();
    alt.rng = [1, 2, 3, 4];
    const d1 = determinize(getPlayerView(real, me), seedRng('same'));
    const d2 = determinize(getPlayerView(alt, me), seedRng('same'));
    expect(d2).toEqual(d1);
  });
});

describe('search', () => {
  it('returns a legal move, reproducibly for a fixed seed and iteration budget', () => {
    const s = midGame('search-1');
    const me = s.turn.current;
    const view = getPlayerView(s, me);
    const legal = getLegalActions(s, me);
    const opts = { maxIterations: 40, timeMs: 60_000, seed: 'fixed' };
    const a = searchDecide(view, legal, opts);
    expect(a).not.toBeNull();
    expect(validateAction(s, a!).ok).toBe(true);
    expect(searchDecide(view, legal, opts)).toEqual(a);
  });

  it('an expert seat finishes a game without illegal moves', () => {
    const r = playArenaGame('expert-game', ['expert', 'hard', 'normal']);
    expect(r.winner).toBeDefined();
    expect(r.invalid).toBe(0);
  }, 180_000);
});
