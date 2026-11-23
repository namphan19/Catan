import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions, getPlayerView, type GameState } from '@hexgame/engine';
import { wsUrl } from '../src/client';
import { actionStr, boardText, openSpots, pips, stateText, type Ctx } from '../src/describe';

const seats = ['p1', 'p2', 'p3'].map((seat, i) => ({ seat, name: ['Ann', 'Bob', 'Cid'][i], connected: true, ready: true }));
const ctxOf = (s: GameState, me: string): Ctx => ({ view: getPlayerView(s, me), seats, me });

describe('wsUrl', () => {
  it('normalises server addresses to the /ws endpoint', () => {
    expect(wsUrl('https://boschtan-server.onrender.com/')).toBe('wss://boschtan-server.onrender.com/ws');
    expect(wsUrl('http://localhost:8080')).toBe('ws://localhost:8080/ws');
    expect(wsUrl('example.com')).toBe('wss://example.com/ws');
    expect(wsUrl('wss://x.org/ws')).toBe('wss://x.org/ws');
  });
});

describe('describe', () => {
  it('pips follow the dice odds', () => {
    expect([2, 6, 8, 12, undefined].map(pips)).toEqual([1, 5, 5, 1, 0]);
  });

  it('describes setup spots with terrain, numbers and pips, for the player who places', () => {
    const s = createGame({ seed: 'mcp-1', playerCount: 3, firstPlayer: 'p2' });
    const c = ctxOf(s, 'p2');
    const legal = getLegalActions(s, 'p2');
    const line = actionStr(c, legal[0]);
    expect(line).toMatch(/^settlement at v:-?\d+,-?\d+,[NS] \[.+; \d+ pips\]/);
    expect(stateText(c, legal.length)).toContain('setup placement 1 by p2 Bob (you)');
    expect(openSpots(c, 3).split('\n')).toHaveLength(3);
  });

  it('renders the board and a later state without throwing, hiding other hands', () => {
    let s = createGame({ seed: 'mcp-2', playerCount: 3, firstPlayer: 'p1' });
    // Play the setup with the first listed action of whoever must act.
    for (let i = 0; i < 12 && s.phase.k === 'setup'; i++) {
      const who = s.players.find((p) => getLegalActions(s, p.id).length)!;
      s = applyAction(s, getLegalActions(s, who.id)[0]).state;
    }
    expect(s.phase.k).toBe('preRoll');
    const c = ctxOf(s, 'p3');
    const board = boardText(c);
    expect(board).toContain('Map (pointy-top');
    expect(board.match(/^ {2}settlement /gm)).toHaveLength(6);
    const st = stateText(c, 0);
    expect(st).toContain('YOU p3 Cid (you)');
    expect(st).not.toMatch(/p1 Ann: .*hand /); // opponents show counts only
  });
});
