// Dice cheat: a roll may carry the roller's chosen production dice (who may send it is the server's call).
import { describe, expect, it } from 'vitest';
import {
  createGame, getLegalActions, getPlayerView, isDiceCheat, replay, validateAction,
  type Action, type GameState, type ShState,
} from '../src';
import { act, blankGame } from './helpers';

const roll = (dice?: unknown): Action => ({ t: 'roll', player: 'p1', ...(dice !== undefined ? { dice } : {}) }) as Action;

function preRoll(rulesets: string[], options?: Record<string, unknown>): GameState {
  const s = createGame({ seed: 'cheat', playerCount: 3, rulesets, firstPlayer: 'p1', ...(options ? { options } : {}) });
  s.phase = { k: 'preRoll' };
  s.turn = { n: 1, current: 'p1', cardPlayed: false };
  return s;
}

describe('dice cheat', () => {
  it('recognises the code however it is typed', () => {
    expect(isDiceCheat('xucxacvang')).toBe(true);
    expect(isDiceCheat('  Xúc xắc VÀNG! ')).toBe(true);
    expect(isDiceCheat('xuc xac')).toBe(false);
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
