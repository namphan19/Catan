// Everyone at the table, one card per player in turn order: public info only (victory points,
// hand/card counts, guards played, pieces left, awards). Numbers come straight from the view.
import type { ReactNode } from 'react';
import { baseConfig, type PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { assetUrl } from '../board/assets';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { GuardIcon, HandIcon, PieceIcon, StarIcon, UiIcon } from '../ui/Icon';
import { awardKey } from './describe';
import { actorsOf } from './StatusBanner';

function Stat({ icon, n, label, warn, supply }: { icon: ReactNode; n: number; label: string; warn?: boolean; supply?: boolean }) {
  const text = `${label}: ${n}`;
  return (
    <span className={`stat${warn ? ' warn' : ''}${supply ? ' stat-supply' : ''}`} title={text} aria-label={text} role="img">
      {icon}
      <b>{n}</b>
    </span>
  );
}

export function PlayerCards({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const name = useName();
  const actors = actorsOf(view);
  const compact = view.players.length > 4;
  return (
    <div
      className={compact ? 'seats seats-compact' : 'seats'}
      role="list"
      aria-label={t('seat_list')}
      data-n={view.players.length}
    >
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
            <div className="seat-top">
              <Emblem id={playerEmblem(p.id)} size={18} color={color} />
              <span className="seat-name" title={name(p.id)}>
                {name(p.id)}
              </span>
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
            <div className="seat-stats">
              <Stat
                icon={<HandIcon size={18} />}
                n={p.handCount}
                label={overLimit ? `${t('stat_hand')} (${t('stat_handWarn', { n: baseConfig.discardLimit })})` : t('stat_hand')}
                warn={overLimit}
              />
              <Stat icon={<UiIcon name="card" size={18} />} n={p.cardCount} label={t('stat_cards')} />
              <Stat icon={<GuardIcon size={18} />} n={p.played['guard'] ?? 0} label={t('stat_guards')} />
              <span className="seat-sep" aria-hidden="true" />
              <Stat icon={<PieceIcon kind="road" color={color} size={14} />} n={p.supply['road'] ?? 0} label={t('stat_roadsLeft')} supply />
              <Stat
                icon={<PieceIcon kind="settlement" color={color} size={18} />}
                n={p.supply['settlement'] ?? 0}
                label={t('stat_settlementsLeft')}
                supply
              />
              <Stat icon={<PieceIcon kind="city" color={color} size={18} />} n={p.supply['city'] ?? 0} label={t('stat_citiesLeft')} supply />
              {awards.map(([award]) => (
                <img
                  key={award}
                  className="seat-award"
                  src={assetUrl('award', award)}
                  alt={t(awardKey(award))}
                  title={t(awardKey(award))}
                  width={24}
                  height={24}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
