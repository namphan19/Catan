// Dice cheat: a roll may carry the roller's chosen production dice (who may send it is the server's call).
import { describe, expect, it } from 'vitest';
import {
  DICE_CHEAT_CODE, applyAction, createGame, getLegalActions, getPlayerView, isDiceCheat, isRollBonusCheat, normalizeCheat,
  replay, validateAction, type Action, type GameState, type ShState,
} from '../src';
import { act, blankGame, pl } from './helpers';

const roll = (dice?: unknown): Action => ({ t: 'roll', player: 'p1', ...(dice !== undefined ? { dice } : {}) }) as Action;

function preRoll(rulesets: string[], options?: Record<string, unknown>): GameState {
  const s = createGame({ seed: 'cheat', playerCount: 3, rulesets, firstPlayer: 'p1', ...(options ? { options } : {}) });
  s.phase = { k: 'preRoll' };
  s.turn = { n: 1, current: 'p1', cardPlayed: false };
  return s;
}

describe('dice cheat', () => {
  it('recognises the code however it is typed', () => {
    const code = DICE_CHEAT_CODE;
    expect(isDiceCheat(code)).toBe(true);
    // Upper case, spaces and punctuation around and inside it do not matter.
    expect(isDiceCheat(`  ${code.toUpperCase().split('').join(' ')}! `)).toBe(true);
    expect(isDiceCheat(code.slice(0, -1))).toBe(false);
    expect(isDiceCheat(`${code}x`)).toBe(false);
    expect(normalizeCheat('  Xúc xắc ĐỎ! ')).toBe('xucxacdo'); // accents dropped
    expect(isDiceCheat('')).toBe(false);
  });

  it('a roll with chosen dice uses them; the 7 still sends the blocker', () => {
    const s = blankGame(3, { k: 'preRoll' });
    const t = act(s, roll([5, 4]));
    expect(t.turn.roll).toEqual([5, 4]);
    expect(t.log.at(-1)!.roll).toEqual({ dice: [5, 4], sum: 9 });
    const seven = act(s, roll([1, 6]));
    expect(seven.phase.k).toBe('moveBlocker');
  });

  it('refuses dice that are not two values 1-6', () => {
    const s = blankGame(3, { k: 'preRoll' });
    for (const bad of [[0, 3], [3, 7], [2.5, 3], [3], [1, 2, 3], 'six', null])
      expect(validateAction(s, roll(bad))).toMatchObject({ ok: false, code: 'BAD_DICE' });
    expect(validateAction(s, roll([6, 6])).ok).toBe(true);
  });

  it('the log hides the choice from everyone but the roller, also after the game', () => {
    const s = act(blankGame(3, { k: 'preRoll' }), roll([2, 2]));
    const mine = getPlayerView(s, 'p1').log.at(-1)!;
    const theirs = getPlayerView(s, 'p2').log.at(-1)!;
    expect(mine.action).toMatchObject({ dice: [2, 2] });
    expect(theirs.action).toEqual({ t: 'roll', player: 'p1' });
    expect(theirs.roll).toEqual({ dice: [2, 2], sum: 4 }); // the outcome stays public
    s.winner = 'p2';
    expect(getPlayerView(s, 'p3').log.at(-1)!.action).toEqual({ t: 'roll', player: 'p1' });
  });

  it('replays the same game', () => {
    let s = createGame({ seed: 'cheat', playerCount: 3, firstPlayer: 'p1' });
    const actions: Action[] = [];
    // Play the setup with the first legal spots, then roll a chosen 8.
    while (s.phase.k === 'setup') {
      const id = s.players.map((p) => p.id).find((p) => getLegalActions(s, p).length)!;
      const a = getLegalActions(s, id)[0];
      actions.push(a);
      s = act(s, a);
    }
    const r = { t: 'roll', player: s.turn.current, dice: [3, 5] } as Action;
    actions.push(r);
    s = act(s, r);
    expect(replay(s.init, actions).turn.roll).toEqual([3, 5]);
  });

  it('Strongholds: chosen production dice, the event die is still rolled', () => {
    const s = act(preRoll(['base', 'strongholds']), roll([6, 3]));
    expect(s.turn.roll).toEqual([6, 3]);
    expect((s.ext.strongholds as ShState).eventDie).toBeTruthy();
  });

  it('Tidelands corsair coves: chosen dice', () => {
    const s = act(preRoll(['base', 'tidelands'], { scenario: 'corsairCoves' }), roll([4, 4]));
    expect(s.turn.roll).toEqual([4, 4]);
  });
});

describe('roll bonus', () => {
  const bonusRoll = (dice?: [number, number]): Action => ({ t: 'roll', player: 'p1', ...(dice ? { dice } : {}), bonus: true }) as Action;
  const total = (bag: Record<string, number>) => Object.values(bag).reduce((a, n) => a + n, 0);

  it('recognises the code only with its #', () => {
    expect(isRollBonusCheat('#kie')).toBe(true);
    expect(isRollBonusCheat('  #KIE ')).toBe(true);
    expect(isRollBonusCheat('# k i e')).toBe(true);
    for (const no of ['kie', '#ki', '#kiee', 'k#ie', '', '#kiê']) expect(isRollBonusCheat(no)).toBe(false);
  });

  it('adds one of every resource to the roll, joined to its production', () => {
    const s = blankGame(3, { k: 'preRoll' });
    const bank = { ...s.bank.hand };
    const { state: t, events } = applyAction(s, bonusRoll([5, 4]));
    const hand = pl(t, 'p1').hand;
    for (const r of ['timber', 'clay', 'fiber', 'grain', 'stone']) {
      expect(hand[r]).toBe(1); // empty board: no production of its own
      expect(t.bank.hand[r]).toBe(bank[r] - 1);
    }
    const produced = events.filter((e) => e.e === 'produced');
    expect(produced).toHaveLength(1);
    expect(t.log.at(-1)!.gains).toEqual({ p1: { timber: 1, clay: 1, fiber: 1, grain: 1, stone: 1 } });
  });

  it('on a 7 the discard is counted before the bonus', () => {
    const s = blankGame(3, { k: 'preRoll' });
    pl(s, 'p1').hand = { timber: 8 };
    const t = act(s, bonusRoll([3, 4]));
    expect(t.phase).toMatchObject({ k: 'discard', owed: { p1: 4 } });
    expect(total(pl(t, 'p1').hand)).toBe(13);
  });

  it('skips a kind the bank has run out of', () => {
    const s = blankGame(3, { k: 'preRoll' });
    s.bank.hand.stone = 0;
    const t = act(s, bonusRoll([5, 4]));
    expect(pl(t, 'p1').hand.stone ?? 0).toBe(0);
    expect(total(pl(t, 'p1').hand)).toBe(4);
  });

  it('includes commodities (Strongholds) and goods (Highlands)', () => {
    const sh = act(preRoll(['base', 'strongholds']), bonusRoll([5, 4]));
    for (const r of ['books', 'linen', 'silver']) expect(pl(sh, 'p1').hand[r]).toBeGreaterThanOrEqual(1);
    const hl = act(preRoll(['base', 'highlands']), bonusRoll([5, 4]));
    for (const r of ['plume', 'herb', 'fish', 'timber']) expect(pl(hl, 'p1').hand[r]).toBeGreaterThanOrEqual(1);
  });

  it('only a roll may carry it, and only as true', () => {
    const s = blankGame(3, { k: 'preRoll' });
    expect(validateAction(s, { t: 'roll', player: 'p1', bonus: false } as unknown as Action)).toMatchObject({ ok: false, code: 'BAD_ACTION' });
    const m = blankGame(3, { k: 'main' });
    expect(validateAction(m, { t: 'endTurn', player: 'p1', bonus: true } as unknown as Action)).toMatchObject({ ok: false, code: 'BAD_ACTION' });
    expect(validateAction(s, bonusRoll()).ok).toBe(true);
  });

  it('is hidden from the other players log and replays the same game', () => {
    const s = blankGame(3, { k: 'preRoll' });
    const t = act(s, bonusRoll([2, 2]));
    expect(getPlayerView(t, 'p1').log.at(-1)!.action).toMatchObject({ bonus: true });
    expect(getPlayerView(t, 'p2').log.at(-1)!.action).toEqual({ t: 'roll', player: 'p1' });

    let g = createGame({ seed: 'bonus', playerCount: 3, firstPlayer: 'p1' });
    const actions: Action[] = [];
    while (g.phase.k === 'setup') {
      const id = g.players.map((p) => p.id).find((p) => getLegalActions(g, p).length)!;
      const a = getLegalActions(g, id)[0];
      actions.push(a);
      g = act(g, a);
    }
    const r = { t: 'roll', player: g.turn.current, bonus: true } as Action;
    actions.push(r);
    g = act(g, r);
    expect(replay(g.init, actions).players).toEqual(g.players);
  });
});
