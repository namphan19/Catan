// Everyone at the table, in turn order, as portrait medallions on the board's edge (PO 2026-11-27
// HUD: no card frames). Each medallion: the portrait ringed in the seat colour, a wax seal with the
// victory points, award badges, the name and one short line (hand / cards, or "your turn"). The
// player whose move it is gets a gold glow and a larger portrait. Every medallion is a button that
// opens the full public details (pieces left, guards, ...) in the player dialog.
import type { ReactNode } from 'react';
import { baseConfig, type PlayerId, type PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useAvatar, useName } from '../shell/names';
import { assetUrl } from '../board/assets';
import { playerColor, playerEmblem, playerInk } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { Avatar } from '../ui/Avatar';
import { HandIcon, UiIcon } from '../ui/Icon';
import { awardKey } from './describe';
import { actorsOf } from './StatusBanner';

export function PlayerCards({
  view,
  onSelect,
  extra,
}: {
  view: PlayerView;
  onSelect?: (id: PlayerId) => void;
  /** Expansion line under the name (Strongholds: improvement levels). */
  extra?: (id: PlayerId) => ReactNode;
}) {
  const { t } = useI18n();
  const name = useName();
  const avatar = useAvatar();
  const actors = actorsOf(view);
  const compact = view.players.length > 4;
  return (
    <div
      className={compact ? 'seats seats-compact' : 'seats'}
      role="group"
      aria-label={t('seat_list')}
      data-n={view.players.length}
    >
      {view.players.map((p) => {
        const vp = p.vp ?? p.publicVP;
        const color = playerColor(p.id);
        const awards = Object.entries(view.awards).filter(([, owner]) => owner === p.id);
        const overLimit = p.handCount > baseConfig.discardLimit;
        const acting = actors.includes(p.id);
        const me = p.id === view.viewer;
        return (
          <button
            key={p.id}
            type="button"
            className={`seat${me ? ' me' : ''}${acting ? ' acting' : ''}`}
            style={{ '--seat': color, '--seat-text': playerInk(p.id) } as React.CSSProperties}
            onClick={() => onSelect?.(p.id)}
            aria-haspopup={onSelect ? 'dialog' : undefined}
            aria-label={`${name(p.id)}. ${t('stat_vp', { n: vp, m: view.init.vpToWin })}. ${t('stat_hand')}: ${p.handCount}. ${t('stat_cards')}: ${p.cardCount}.${acting ? ` ${t('turnTag')}.` : ''}`}
          >
            <span className="seat-avatar">
              <Avatar id={avatar(p.id)} seat={p.id} size={acting ? 72 : 56} />
              <span className="seat-vp" title={t('stat_vp', { n: vp, m: view.init.vpToWin })}>
                {vp}
              </span>
              {/* Emblem badge: the seat is never told apart by colour alone. */}
              <span className="seat-emblem">
                <Emblem id={playerEmblem(p.id)} size={11} color={color} />
              </span>
              {awards.length > 0 && (
                <span className="seat-awards">
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
                </span>
              )}
            </span>
            <span className="seat-text">
              <span className="seat-name" title={name(p.id)}>
                {name(p.id)}
              </span>
              {acting || me ? (
                <span className="seat-tag">
                  {[acting ? t('turnTag') : '', me ? t('you') : ''].filter(Boolean).join(' · ')}
                </span>
              ) : null}
              <span className="seat-sub">
                <span className={overLimit ? 'seat-stat warn' : 'seat-stat'} title={t('stat_hand')}>
                  <HandIcon size={13} />
                  {p.handCount}
                </span>
                <span className="seat-stat" title={view.ext?.strongholds ? t('sh_cards') : t('stat_cards')}>
                  <UiIcon name="card" size={13} />
                  {p.cardCount}
                </span>
              </span>
              {extra?.(p.id)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
