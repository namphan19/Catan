// Player display names for the hot-seat shell. GameTable stays free of name state: it reads
// this context, falling back to "Người chơi N" when the shell has no custom name.
import { createContext, useContext, type ReactNode } from 'react';
import type { PlayerId } from '@hexgame/engine';
import { seatIndex } from '../ui/colors';
import { useI18n } from '../i18n';

const NamesCtx = createContext<Record<string, string>>({});

export function NamesProvider({ names, children }: { names: Record<string, string>; children: ReactNode }) {
  return <NamesCtx.Provider value={names}>{children}</NamesCtx.Provider>;
}

/** Returns a resolver id -> display name (never changes identity between renders). */
export function useName(): (id: PlayerId) => string {
  const names = useContext(NamesCtx);
  const { t } = useI18n();
  return (id: PlayerId) => names[id] ?? t('player', { n: seatIndex(id) });
}
