// Player portrait in a round frame ringed in the seat colour. Without a portrait (a lobby seat that
// has not picked yet) the seat emblem stands in, so a seat is never identified by colour alone.
import { AVATARS, type AvatarId } from '../net/protocol';
import { playerColor, playerEmblem, SEAT_EMBLEMS } from './colors';
import { Emblem } from './Emblem';

export const avatarUrl = (id: AvatarId): string => `/assets/avatar/${id}.webp`;

/** Default portrait of a seat when nobody picked one (hot-seat games): the one matching its emblem. */
export function defaultAvatar(seat: string): AvatarId {
  const emblem = playerEmblem(seat) as (typeof SEAT_EMBLEMS)[number];
  return (AVATARS as readonly string[]).includes(emblem) ? (emblem as AvatarId) : AVATARS[0];
}

export function Avatar({
  id,
  seat,
  size = 40,
  title,
}: {
  id: AvatarId | undefined;
  /** Seat id: the ring colour and the emblem fallback. */
  seat: string;
  size?: number;
  title?: string;
}) {
  const color = playerColor(seat);
  return (
    <span
      className={id ? 'avatar' : 'avatar avatar-empty'}
      style={{ width: size, height: size, '--seat': color } as React.CSSProperties}
      title={title}
      aria-hidden="true"
    >
      {id ? (
        <img src={avatarUrl(id)} alt="" width={size} height={size} draggable={false} />
      ) : (
        <Emblem id={playerEmblem(seat)} size={Math.round(size * 0.55)} color={color} />
      )}
    </span>
  );
}
