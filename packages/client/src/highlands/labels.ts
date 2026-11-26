// Text for the Highlands expansion: log lines and toasts, plus typed access to its view. Display only.
import type { Action, GameEvent, PlayerId, PlayerView } from '@hexgame/engine';

type TFn = (key: string, params?: Record<string, string | number>) => string;
type NameFn = (id: PlayerId) => string;

/** Public highlands data in a player view (engine: rules/highlands viewOf). */
export interface HlView {
  players: Record<PlayerId, { tribe: number; cp: number[] }>;
  stack2Left: number;
  stack2Joined: boolean;
  caravanUsed: boolean;
  recallUsed: boolean;
  wilds: string;
  map: 'variable' | 'starter';
}

export const hlOf = (view: PlayerView): HlView | null => (view.ext?.highlands as HlView | undefined) ?? null;

/** Log line for a highlands action (null: not one). */
export function describeHlAction(a: Action, t: TFn, name: NameFn): string | null {
  if (!a.t.startsWith('hl:')) return null;
  return t(`log_${a.t.replace(':', '_')}`, { name: name(a.player) });
}

/** Toast / feed line for a highlands event ('' = say nothing). */
export function describeHlEvent(ev: Extract<GameEvent, { e: 'ext' }>, t: TFn, name: NameFn): string {
  const d = (ev.data ?? {}) as Record<string, unknown>;
  const who = typeof d.player === 'string' ? name(d.player) : '';
  switch (d.kind) {
    case 'declined':
      return t('hlev_declined', { name: who, n: Number(d.tribe ?? 0), roads: Number(d.roads ?? 0) });
    case 'overbuilt':
      return t('hlev_overbuilt', { name: who, name2: name(String(d.owner)) });
    case 'recall':
      return t('hlev_recall', { name: who });
    case 'caravan':
      return t('hlev_caravan', { name: who });
    case 'stack2':
      return t('hlev_stack2');
    default:
      return '';
  }
}
