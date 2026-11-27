// Top of the table, drawn over the board on a dark scrim (no bar, no frame; PO 2026-11-27 HUD):
// the turn label (plus shell info) and the "what do I do now" line in the centre, help and a
// menu in the right corner. The menu holds the shell buttons (pass device, export log, home) and
// the language toggle on every screen size. The wordmark stays for screen readers only.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlayerView } from '@hexgame/engine';
import { useI18n, type Lang } from '../i18n';
import { UiIcon } from '../ui/Icon';

export function TopBar({
  view,
  info,
  actions,
  onHelp,
  guide,
}: {
  view: PlayerView;
  /** Shell info (who is viewing / room code), shown after the turn label. */
  info?: ReactNode;
  /** Shell buttons (pass device, export log, home), inside the menu. */
  actions?: ReactNode;
  onHelp?: () => void;
  /** The guidance line under the turn label ("your turn - roll", a board pick, waiting for X). */
  guide?: ReactNode;
}) {
  const { t, lang, setLang } = useI18n();
  const ph = view.phase;
  const turnLabel =
    ph.k === 'setup'
      ? t('setupTurn', { n: Math.floor(ph.idx / (view.players.length || 1)) + 1 })
      : ph.k === 'over'
        ? t('phase_over')
        : t('turn', { n: view.turn.n });

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <h1 className="game-title sr-only">{t('appTitle')}</h1>
      <div className="topbar-center">
        <p className="topbar-turn">
          <span className="turn-label">{turnLabel}</span>
          {info && <span className="topbar-info">{info}</span>}
        </p>
        {guide}
      </div>
      <div className="topbar-right">
        {onHelp && (
          <button type="button" className="hud-icon btn-help" onClick={onHelp} aria-label={t('help_title')} title={t('help_title')}>
            ?
          </button>
        )}
        <div className="topbar-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="hud-icon topbar-menu-btn"
            aria-label={t('menu')}
            title={t('menu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <UiIcon name="menu" size={20} />
          </button>
          {/* A click on any item (pass device, export, home, language) also closes the menu. */}
          <div className={menuOpen ? 'topbar-menu open' : 'topbar-menu'} onClick={() => setMenuOpen(false)}>
            {actions && <div className="topbar-actions">{actions}</div>}
            <button
              type="button"
              className="btn btn-ghost btn-lang"
              onClick={() => setLang(lang === 'vi' ? ('en' as Lang) : ('vi' as Lang))}
              aria-label={t('langToggle')}
            >
              {t('langToggle')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
