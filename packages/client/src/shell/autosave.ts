// Auto-save of the hot-seat game (PO 2026-11-27 home screen: "Continue" card). After every change the
// shell stores the replay log ({init, actions}) plus the seat names and bot levels in localStorage;
// the home screen replays it to describe the game and to continue it. A finished game is forgotten.
// Storage may be unavailable (private mode): every access is guarded and simply does nothing.
import type { Action, BotLevel, GameInit, GameState, PlayerId } from '@hexgame/engine';
import { getPlayerView, replay } from '@hexgame/engine';
import { ROOM_KEY } from './OnlineShell';

const KEY = 'boschtan.autosave';

export interface SavedGame {
  init: GameInit;
  actions: Action[];
  names: Record<PlayerId, string>;
  bots: Record<PlayerId, BotLevel>;
  savedAt: number;
}

export function saveGame(state: GameState, names: Record<PlayerId, string>, bots: Record<PlayerId, BotLevel>): void {
  try {
    if (state.winner) {
      localStorage.removeItem(KEY);
      return;
    }
    const data: SavedGame = { init: state.init, actions: state.log.map((l) => l.action), names, bots, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or disabled: no auto-save */
  }
}

export function readSave(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedGame;
    return data && data.init && Array.isArray(data.actions) ? data : null;
  } catch {
    return null;
  }
}

export function forgetSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
}

/** What the Continue card shows about a saved game (null when it cannot be replayed). */
export interface SaveSummary {
  rulesets: string[];
  scenario: string | null;
  turn: number;
  setup: boolean;
  players: Array<{ id: PlayerId; name: string; vp: number; bot: boolean }>;
  leader: { name: string; vp: number } | null;
  vpToWin: number;
  savedAt: number;
}

export function summarize(save: SavedGame): SaveSummary | null {
  try {
    const state = replay(save.init, save.actions);
    if (state.winner) return null;
    const view = getPlayerView(state, null);
    const players = view.players.map((p) => ({
      id: p.id,
      name: save.names[p.id] ?? p.id,
      vp: p.vp ?? p.publicVP,
      bot: !!save.bots[p.id],
    }));
    const top = [...players].sort((a, b) => b.vp - a.vp)[0];
    const options = save.init.options as { scenario?: string } | undefined;
    return {
      rulesets: save.init.rulesetIds ?? ['base'],
      scenario: options?.scenario ?? null,
      turn: state.turn.n,
      setup: state.phase.k === 'setup',
      players,
      leader: top && top.vp > 0 ? { name: top.name, vp: top.vp } : null,
      vpToWin: state.init.vpToWin,
      savedAt: save.savedAt,
    };
  } catch {
    return null;
  }
}

/** The online room this browser was last seated in (the online client rejoins it by itself). */
export function savedRoom(): string | null {
  try {
    return localStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}
