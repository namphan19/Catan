// The viewer's own hand: resource chips and development cards.
import type { PlayerView } from '@hexgame/engine';
import { useI18n, resKey, cardKey } from '../i18n';
import { RESOURCE_COLORS } from '../ui/colors';
import { ResourceIcon } from '../ui/ResourceIcon';

export function HandPanel({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const me = view.players.find((p) => p.id === view.viewer);
  const hand = me?.hand ?? {};
  const cards = me?.cards ?? [];
  const newCards = me?.newCards ?? [];
  const total = Object.values(hand).reduce((s, n) => s + (n || 0), 0);

  return (
    <div className="hand" aria-label={t('hand_title')}>
      <span className="hand-title">{t('hand_title')}</span>
      {total === 0 && <span className="hand-empty">{t('hand_empty')}</span>}
      <ul className="hand-res">
        {Object.entries(hand)
          .filter(([, n]) => (n || 0) > 0)
          .map(([r, n]) => (
            <li
              key={r}
              className="res-chip"
              style={{ '--res': RESOURCE_COLORS[r] ?? 'var(--ink-soft)' } as React.CSSProperties}
              title={`${t(resKey(r))} × ${n}`}
            >
              <ResourceIcon res={r} size={18} />
              <span className="res-name">{t(resKey(r))}</span>
              <span className="res-count">{n}</span>
            </li>
          ))}
      </ul>
      <span className="hand-total">
        {t('hand_total', { n: total })}
      </span>
      <div className="hand-cards">
        <span className="hand-title">{t('hand_cards')}</span>
        {cards.length + newCards.length === 0 ? (
          <span className="hand-empty">{t('hand_noCards')}</span>
        ) : (
          <ul>
            {cards.map((c, i) => (
              <li key={`${c}-${i}`} className="card-chip" title={t(cardKey(c))}>
                {t(cardKey(c))}
              </li>
            ))}
            {newCards.map((c, i) => (
              <li key={`new-${c}-${i}`} className="card-chip card-new" title={`${t(cardKey(c))} (${t('newCardMark')})`}>
                {t(cardKey(c))} <small>({t('newCardMark')})</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
