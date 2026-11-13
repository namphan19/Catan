// Everyone at the table: public info only (hand/card counts, public VP, played cards, supply).
import type { PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';

export function OpponentStrip({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const name = useName();
  return (
    <div className="opponents" role="list" aria-label={t('seat_list')}>
      {view.players.map((p) => {
        const vp = p.vp ?? p.publicVP;
        return (
          <div
            key={p.id}
            role="listitem"
            className={`seat${p.id === view.viewer ? ' me' : ''}${p.id === view.turn.current ? ' acting' : ''}`}
            style={{ '--seat': playerColor(p.id) } as React.CSSProperties}
          >
            <div className="seat-head" style={{ color: playerColor(p.id) }}>
              <Emblem id={playerEmblem(p.id)} size={16} color={playerColor(p.id)} />
              <span className="seat-name">{name(p.id)}</span>
              {p.id === view.viewer && <span className="seat-you">({t('you')})</span>}
              {p.id === view.turn.current && (
                <span className="seat-acting-tag">({t('turnTag')})</span>
              )}
            </div>
            <div className="seat-vp">
              {vp} <small>{t('vpShort')}</small>
            </div>
            <div className="seat-info">
              <span title={t('handShort')}>✋ {p.handCount}</span>
              <span title={t('cardsShort')}>🂠 {p.cardCount}</span>
              {(p.played['guard'] ?? 0) > 0 && (
                <span title={t('card_guard')}>🛡 {p.played['guard']}</span>
              )}
              {(p.played['relic'] ?? 0) > 0 && (
                <span title={t('card_relic')}>📜 {p.played['relic']}</span>
              )}
            </div>
            <div className="seat-supply" aria-hidden="true">
              <span title={t('piece_settlement')}>⌂ {p.supply['settlement'] ?? 0}</span>
              <span title={t('piece_city')}>🏛 {p.supply['city'] ?? 0}</span>
              <span title={t('piece_road')}>— {p.supply['road'] ?? 0}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
