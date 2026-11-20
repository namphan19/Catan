// Everyone at the table, one card per player in turn order: public info only (victory points,
// hand/card counts, guards played, pieces left, awards). Numbers come straight from the view.
// Layout (PO 2026-11-19): portrait + name on the left, then the card stats (hand, cards, guards),
// the piece stats (roads, settlements, cities, awards) and the victory points on one line when the
// card is wide enough; a narrow card stacks the two stat groups (3:3) under the VP line.
import type { ReactNode } from 'react';
import { baseConfig, type PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useAvatar, useName } from '../shell/names';
import { assetUrl } from '../board/assets';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { Avatar } from '../ui/Avatar';
import { GuardIcon, HandIcon, PieceIcon, StarIcon, UiIcon } from '../ui/Icon';
import { awardKey } from './describe';
import { actorsOf } from './StatusBanner';

function Stat({ icon, n, label, warn }: { icon: ReactNode; n: number; label: string; warn?: boolean }) {
  const text = `${label}: ${n}`;
  return (
    <span className={warn ? 'stat warn' : 'stat'} title={text} aria-label={text} role="img">
      {icon}
      <b>{n}</b>
    </span>
  );
}

export function PlayerCards({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const name = useName();
  const avatar = useAvatar();
  const actors = actorsOf(view);
  const compact = view.players.length > 4;
  return (
    <div className={compact ? 'seats seats-compact' : 'seats'} role="list" aria-label={t('seat_list')}>
      {view.players.map((p) => {
        const vp = p.vp ?? p.publicVP;
        const color = playerColor(p.id);
        const awards = Object.entries(view.awards).filter(([, owner]) => owner === p.id);
        const overLimit = p.handCount > baseConfig.discardLimit;
        const acting = actors.includes(p.id);
        return (
          <div
            key={p.id}
            role="listitem"
            className={`seat${p.id === view.viewer ? ' me' : ''}${acting ? ' acting' : ''}`}
            style={{ '--seat': color } as React.CSSProperties}
          >
            <div className="seat-grid">
            <div className="seat-id">
              <span className="seat-avatar">
                <Avatar id={avatar(p.id)} seat={p.id} size={compact ? 38 : 46} />
                {/* Emblem badge: the seat is never told apart by colour alone. */}
                <span className="seat-emblem">
                  <Emblem id={playerEmblem(p.id)} size={12} color={color} />
                </span>
              </span>
              <span className="seat-name" title={name(p.id)}>
                {name(p.id)}
              </span>
            </div>
            <div className="seat-head">
              {p.id === view.viewer && <span className="seat-you">{t('you')}</span>}
              {acting && (
                // A shape (not colour alone) next to the gold ring; the words are in the tooltip
                // and the status banner, so the player's name keeps the room.
                <span className="seat-acting-tag" title={t('turnTag')} aria-label={t('turnTag')} role="img">
                  ▶
                </span>
              )}
              <span
                className="seat-vp"
                title={t('stat_vp', { n: vp, m: view.init.vpToWin })}
                aria-label={t('stat_vp', { n: vp, m: view.init.vpToWin })}
                role="img"
              >
                <StarIcon size={18} />
                <strong>{vp}</strong>
                <small>/{view.init.vpToWin}</small>
              </span>
            </div>
            <div className="seat-stats seat-cards">
              <Stat
                icon={<HandIcon size={18} />}
                n={p.handCount}
                label={overLimit ? `${t('stat_hand')} (${t('stat_handWarn', { n: baseConfig.discardLimit })})` : t('stat_hand')}
                warn={overLimit}
              />
              <Stat icon={<UiIcon name="card" size={18} />} n={p.cardCount} label={t('stat_cards')} />
              <Stat icon={<GuardIcon size={18} />} n={p.played['guard'] ?? 0} label={t('stat_guards')} />
            </div>
            <div className="seat-stats seat-assets">
              <Stat icon={<PieceIcon kind="road" color={color} size={14} />} n={p.supply['road'] ?? 0} label={t('stat_roadsLeft')} />
              <Stat
                icon={<PieceIcon kind="settlement" color={color} size={18} />}
                n={p.supply['settlement'] ?? 0}
                label={t('stat_settlementsLeft')}
              />
              <Stat icon={<PieceIcon kind="city" color={color} size={18} />} n={p.supply['city'] ?? 0} label={t('stat_citiesLeft')} />
              {awards.map(([award]) => (
                <img
                  key={award}
                  className="seat-award"
                  src={assetUrl('award', award)}
                  alt={t(awardKey(award))}
                  title={t(awardKey(award))}
                  width={22}
                  height={22}
                />
              ))}
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
