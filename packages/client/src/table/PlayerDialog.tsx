// Public player details behind a compact phone player tile. The top rail stays readable at a
// glance; taps open the full counts, remaining pieces and awards without covering them with text.
import type { PlayerId, PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useAvatar, useName } from '../shell/names';
import { assetUrl } from '../board/assets';
import { playerColor } from '../ui/colors';
import { Avatar } from '../ui/Avatar';
import { Dialog } from '../ui/Dialog';
import { GuardIcon, HandIcon, PieceIcon, UiIcon } from '../ui/Icon';
import { awardKey } from './describe';
import { actorsOf } from './StatusBanner';
import { art2dUrl } from '../board/assets';

export function PlayerDialog({ view, playerId, onClose }: { view: PlayerView; playerId: PlayerId; onClose: () => void }) {
  const { t } = useI18n();
  const name = useName();
  const avatar = useAvatar();
  const player = view.players.find((p) => p.id === playerId);
  if (!player) return null;

  const color = playerColor(player.id);
  const vp = player.vp ?? player.publicVP;
  const acting = actorsOf(view).includes(player.id);
  const awards = Object.entries(view.awards).filter(([, owner]) => owner === player.id);

  return (
    <Dialog title={t('playerDetails')} onClose={onClose} className="player-detail-dialog">
      <section className="player-detail" style={{ '--seat': color } as React.CSSProperties}>
        <div className="player-detail-head">
          <Avatar id={avatar(player.id)} seat={player.id} size={64} />
          <div className="player-detail-id">
            <h3>{name(player.id)}</h3>
            {(acting || player.id === view.viewer) && (
              <span className={`player-detail-state${acting ? ' acting' : ''}`}>
                {acting ? t('turnTag') : t('you')}
              </span>
            )}
          </div>
          <div
            className="player-detail-vp"
            aria-label={t('stat_vp', { n: vp, m: view.init.vpToWin })}
            role="img"
          >
            <img src={art2dUrl('ui', 'trophy-vp')} alt="" width={28} height={28} draggable={false} />
            <strong>{vp}</strong>
            <small>/{view.init.vpToWin}</small>
          </div>
        </div>
        <div
          className="player-detail-progress"
          role="progressbar"
          aria-label={t('stat_vp', { n: vp, m: view.init.vpToWin })}
          aria-valuemin={0}
          aria-valuemax={view.init.vpToWin}
          aria-valuenow={Math.min(vp, view.init.vpToWin)}
        >
          <span style={{ width: `${Math.min(100, (vp / view.init.vpToWin) * 100)}%` }} />
        </div>

        <dl className="player-detail-stats">
          <div>
            <dt><HandIcon size={18} />{t('stat_hand')}</dt>
            <dd>{player.handCount}</dd>
          </div>
          <div>
            <dt><UiIcon name="card" size={18} />{t('stat_cards')}</dt>
            <dd>{player.cardCount}</dd>
          </div>
          <div>
            <dt><GuardIcon size={18} />{t('stat_guards')}</dt>
            <dd>{player.played['guard'] ?? 0}</dd>
          </div>
        </dl>

        <div className="player-detail-supply" role="group" aria-label={t('seat_list')}>
          <div>
            <PieceIcon kind="road" color={color} size={20} />
            <span>{t('stat_roadsLeft')}</span>
            <strong>{player.supply['road'] ?? 0}</strong>
          </div>
          <div>
            <PieceIcon kind="settlement" color={color} size={22} />
            <span>{t('stat_settlementsLeft')}</span>
            <strong>{player.supply['settlement'] ?? 0}</strong>
          </div>
          <div>
            <PieceIcon kind="city" color={color} size={22} />
            <span>{t('stat_citiesLeft')}</span>
            <strong>{player.supply['city'] ?? 0}</strong>
          </div>
        </div>

        {awards.length > 0 && (
          <div className="player-detail-awards">
            {awards.map(([award]) => (
              <span key={award}>
                <img src={assetUrl('award', award)} alt="" width={28} height={28} />
                {t(awardKey(award))}
              </span>
            ))}
          </div>
        )}
      </section>
    </Dialog>
  );
}
