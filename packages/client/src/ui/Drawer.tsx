// Building blocks of the expansion drawers (PO 2026-11-28, "read on the sea"): a painted hero strip
// on top, small gold section labels, round action buttons with their name under them, and seat rows
// with the player's portrait. Styles in ui/chrome.css.
import type { ReactNode } from 'react';
import { art2dUrl } from '../board/assets';
import './chrome.css';

/** Painted terrain strip at the top of a drawer panel: kicker, title, one line under it. */
export function PanelHero({ art, kicker, title, sub }: { art: string; kicker?: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <header className="xp-hero" style={{ '--hero': `url(${art2dUrl('terrain', art)})` } as React.CSSProperties}>
      {kicker && <span className="xp-kicker">{kicker}</span>}
      <h3 className="xp-title">{title}</h3>
      {sub && <p className="xp-sub">{sub}</p>}
    </header>
  );
}

/** A titled part of a drawer: gold small-caps label, an optional note on the right. */
export function XpSection({ label, aside, children, className }: { label: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`xp-sec${className ? ` ${className}` : ''}`}>
      <div className="xp-sec-head">
        <span className="xp-label">{label}</span>
        {aside && <span className="xp-aside">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** Round action button with its name under it (the HUD build buttons' look, in a drawer). */
export function XpAction({
  icon,
  label,
  disabled,
  hot,
  title,
  onClick,
  data,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  /** Glows gold: the action that matters now. */
  hot?: boolean;
  title?: string;
  onClick: () => void;
  /** data-* attributes (e2e hooks such as data-sh / data-tl). */
  data?: Record<string, string>;
}) {
  const attrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]));
  return (
    <button type="button" className={`xp-act${hot && !disabled ? ' hot' : ''}`} disabled={disabled} title={title} onClick={onClick} {...attrs}>
      <span className="xp-act-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="xp-act-lbl">{label}</span>
    </button>
  );
}

/** Painted button badge from art2d/ui (Tripo art) sized for a round action button. */
export function UiArt({ name, size = 34 }: { name: string; size?: number }) {
  return <img src={art2dUrl('ui', name)} alt="" width={size} height={size} draggable={false} />;
}
