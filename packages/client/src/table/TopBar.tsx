// Slim top bar: wordmark, turn label, help, 2D/3D toggle, language. The "what to do now"
// sentence lives in StatusBanner, the dice in DiceBox, the players in PlayerCards.
import type { PlayerView } from '@hexgame/engine';
import { useI18n, type Lang } from '../i18n';
import type { BoardMode } from '../board/BoardSwitch';

export function TopBar({
  view,
  boardMode,
  onBoardMode,
  onHelp,
}: {
  view: PlayerView;
  boardMode?: BoardMode;
  onBoardMode?: (m: BoardMode) => void;
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
      </div>
      {onHelp && (
        <button type="button" className="btn btn-ghost btn-help" onClick={onHelp} aria-label={t('help_title')} title={t('help_title')}>
          ?
        </button>
      )}
      {onBoardMode && (
        <div className="view-toggle" role="group" aria-label={t('board_view')}>
          <button
            type="button"
            className={boardMode !== '3d' ? 'view-toggle-btn active' : 'view-toggle-btn'}
            aria-pressed={boardMode !== '3d'}
            aria-label={t('board_view2d')}
            title={t('board_view2d')}
            onClick={() => onBoardMode('2d')}
          >
            2D
          </button>
          <button
            type="button"
            className={boardMode === '3d' ? 'view-toggle-btn active' : 'view-toggle-btn'}
            aria-pressed={boardMode === '3d'}
            aria-label={t('board_view3d')}
            title={t('board_view3d')}
            onClick={() => onBoardMode('3d')}
          >
            3D
          </button>
        </div>
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
