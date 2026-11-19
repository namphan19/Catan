// Slim top bar: wordmark, turn label, help, language (the 2D/3D toggle was removed with the
// 3D board, see archive/3d). The "what to do now"
// sentence lives in StatusBanner, the dice in DiceBox, the players in PlayerCards.
import type { ReactNode } from 'react';
import type { PlayerView } from '@hexgame/engine';
import { useI18n, type Lang } from '../i18n';

export function TopBar({
  view,
  info,
  actions,
  onHelp,
}: {
  view: PlayerView;
  /** Shell info (who is viewing / room code), shown after the turn label. */
  info?: ReactNode;
  /** Shell buttons (pass device, export log, home), right-aligned before help + language. */
  actions?: ReactNode;
  onHelp?: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const ph = view.phase;
  const turnLabel =
    ph.k === 'setup'
      ? t('setupTurn', { n: Math.floor(ph.idx / (view.players.length || 1)) + 1 })
      : ph.k === 'over'
        ? t('phase_over')
        : t('turn', { n: view.turn.n });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="game-title">{t('appTitle')}</h1>
        <span className="turn-label">{turnLabel}</span>
        {info && <span className="topbar-info">{info}</span>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
      {onHelp && (
        <button type="button" className="btn btn-ghost btn-help" onClick={onHelp} aria-label={t('help_title')} title={t('help_title')}>
          ?
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-lang"
        onClick={() => setLang(lang === 'vi' ? ('en' as Lang) : ('vi' as Lang))}
        aria-label={t('langToggle')}
      >
        {t('langToggle')}
      </button>
    </header>
  );
}
