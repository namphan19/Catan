// Player display names and portraits for the shells. GameTable stays free of name state: it reads
// this context, falling back to "Người chơi N" when the shell has no custom name, and to the seat's
// default portrait (the one matching its emblem) when the shell has none.
import { createContext, useContext, type ReactNode } from 'react';
import type { PlayerId } from '@hexgame/engine';
import type { AvatarId } from '../net/protocol';
import { defaultAvatar } from '../ui/Avatar';
import { seatIndex } from '../ui/colors';
import { useI18n } from '../i18n';

const NamesCtx = createContext<Record<string, string>>({});
const AvatarsCtx = createContext<Record<string, AvatarId | undefined>>({});

export function NamesProvider({
  names,
  avatars = {},
  children,
}: {
  names: Record<string, string>;
  /** Portrait per seat (online rooms); seats missing here use their default portrait. */
  avatars?: Record<string, AvatarId | undefined>;
  children: ReactNode;
}) {
  return (
    <NamesCtx.Provider value={names}>
      <AvatarsCtx.Provider value={avatars}>{children}</AvatarsCtx.Provider>
    </NamesCtx.Provider>
  );
}

/** Returns a resolver id -> display name (never changes identity between renders). */
export function useName(): (id: PlayerId) => string {
  const names = useContext(NamesCtx);
  const { t } = useI18n();
  return (id: PlayerId) => names[id] ?? t('player', { n: seatIndex(id) });
}

/** Returns a resolver id -> portrait. */
export function useAvatar(): (id: PlayerId) => AvatarId {
  const avatars = useContext(AvatarsCtx);
  return (id: PlayerId) => avatars[id] ?? defaultAvatar(id);
}
