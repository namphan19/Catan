// The viewer's advance cards, gathered in the bottom-left corner of the board just above
// "Bài của bạn" (PO 2026-11-18). Collapsed, each card shows only its name; a click opens the full
// card (deck, effect, Play / Discard). Buttons are enabled only when getLegalActions contains a
// matching action; clicking hands those actions to the staged chooser, like the expansion panel.
import { useEffect, useRef, useState } from 'react';
import type { Action, PlayerView, StrongholdsView } from '@hexgame/engine';
import { CARD_TRACK, SH } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { Button } from '../ui/Button';
import { trackName } from './labels';
import './strongholds.css';

interface AdvanceHandProps {
  view: PlayerView;
  sh: StrongholdsView;
  legal: Action[];
  /** Start the staged chooser with these legal actions. */
  onStart: (cands: Action[], title: string) => void;
}

export function AdvanceHand({ view, sh, legal, onStart }: AdvanceHandProps) {
  const { t } = useI18n();
  const me = view.viewer;
  const cards = view.players.find((p) => p.id === me)?.cards ?? [];
  const vp = me ? (sh.vpCards[me] ?? []) : [];
  const [open, setOpen] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const of = (type: string, card: string): Action[] =>
    legal.filter((a) => a.t === type && (a as unknown as { card?: string }).card === card);

  const groups = new Map<string, number>();
  for (const c of cards) groups.set(c, (groups.get(c) ?? 0) + 1);

  // The open card left the hand (played, discarded, stolen): close its face.
  const openGone = open !== null && !groups.has(open);
  useEffect(() => {
    if (openGone) setOpen(null);
  }, [openGone]);

  // Esc or a click outside the strip closes the open card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (!me || (groups.size === 0 && vp.length === 0)) return null;

  const over = cards.length > SH.handLimit;
  const openTrack = open ? CARD_TRACK[open] : undefined;
  const plays = open ? of('sh:play', open) : [];
  const drops = open ? of('sh:discardCard', open) : [];

  return (
    <div className="sh-hand" ref={boxRef} aria-label={t('sh_cards')}>
      {open && (
        <div className={`sh-hand-face sh-reveal-${openTrack ?? 'none'}`} role="dialog" aria-label={t(open)} data-card={open}>
          {openTrack && <div className="sh-reveal-deck">{t('shreveal_deck', { track: trackName(t, openTrack) })}</div>}
          <div className="sh-reveal-name">
            {t(open)}
            {(groups.get(open) ?? 0) > 1 ? ` ×${groups.get(open)}` : ''}
          </div>
          <p className="sh-reveal-fx">{t(`cardfx_${open}`)}</p>
          <div className="sh-hand-face-btns">
            <Button variant="ghost" onClick={() => setOpen(null)}>
              {t('sh_cardClose')}
            </Button>
            {drops.length > 0 && (
              <Button
                variant="danger"
                onClick={() => {
                  setOpen(null);
                  onStart(drops, t('sh_discard'));
                }}
              >
                {t('sh_discard')}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={plays.length === 0}
              onClick={() => {
                const title = t(open);
                setOpen(null);
                onStart(plays, title);
              }}
            >
              {t('sh_play')}
            </Button>
          </div>
        </div>
      )}
      <div className="sh-hand-head">
        {t('sh_cards')}{' '}
        <small className={over ? 'sh-bad' : undefined}>
          {cards.length}/{SH.handLimit}
        </small>
        {vp.length > 0 && (
          <span className="sh-hand-vp" title={vp.map((c) => t(c)).join(', ')}>
            ★ {t('sh_vpCards')}: {vp.length}
          </span>
        )}
      </div>
      {groups.size > 0 && (
        <ul className="sh-hand-tabs">
          {[...groups.entries()].map(([card, n]) => {
            const track = CARD_TRACK[card];
            const playable = of('sh:play', card).length > 0;
            const droppable = of('sh:discardCard', card).length > 0;
            return (
              <li key={card}>
                <button
                  type="button"
                  className={`sh-hand-tab sh-reveal-${track ?? 'none'}${playable ? ' playable' : ''}${droppable ? ' droppable' : ''}`}
                  data-card={card}
                  aria-expanded={open === card}
                  title={t(`cardfx_${card}`)}
                  onClick={() => setOpen(open === card ? null : card)}
                >
                  <span className="sh-hand-tab-name">{t(card)}</span>
                  {n > 1 && <span className="sh-hand-tab-n">×{n}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
