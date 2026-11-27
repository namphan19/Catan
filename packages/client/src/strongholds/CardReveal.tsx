// Shows a card another player just played, face up over the board: name, deck and what it does
// (playtest feedback: "Trưng thu", "Của hồi môn"... meant nothing to the others). Advance cards
// (Strongholds) and development cards alike; a development card brings its own name, effect and art.
// Display only; fed by the events GameTable receives. One card at a time, queued.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD_TRACK, type PlayerId } from '@hexgame/engine';
import { Button } from '../ui/Button';
import { trackName, type NameFn, type TFn } from './labels';

/** A development card's own texts (advance cards are looked up by their id). */
export interface RevealFace {
  name: string;
  fx: string;
  art?: string;
}

export interface Reveal {
  id: number;
  player: PlayerId;
  card: string;
  face?: RevealFace;
}

/** How long a revealed card stays up on its own. */
export const REVEAL_MS = 6000;

/** Queue of cards to reveal; `push` adds one, `close` drops the one on screen. */
export function useReveals(): {
  current: Reveal | null;
  push: (player: PlayerId, card: string, face?: RevealFace) => void;
  close: () => void;
} {
  const [queue, setQueue] = useState<Reveal[]>([]);
  const nextId = useRef(1);
  const push = useCallback((player: PlayerId, card: string, face?: RevealFace) => {
    const id = nextId.current++;
    setQueue((q) => [...q, { id, player, card, ...(face ? { face } : {}) }]);
  }, []);
  const close = useCallback(() => setQueue((q) => q.slice(1)), []);
  const current = queue[0] ?? null;
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setQueue((q) => (q[0]?.id === current.id ? q.slice(1) : q)), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [current]);
  return { current, push, close };
}

export function CardReveal({ reveal, onClose, t, name }: { reveal: Reveal; onClose: () => void; t: TFn; name: NameFn }) {
  const face = reveal.face;
  const track = face ? undefined : CARD_TRACK[reveal.card];
  return (
    <div className="sh-reveal" role="status" aria-live="polite" data-card={reveal.card}>
      {/* A click anywhere on the card closes it (the button's click bubbles up to here: one close). */}
      <div className={`sh-reveal-card sh-reveal-${track ?? 'none'}`} key={reveal.id} onClick={onClose}>
        <div className="sh-reveal-who">{t('shreveal_title', { name: name(reveal.player) })}</div>
        {track && <div className="sh-reveal-deck">{t('shreveal_deck', { track: trackName(t, track) })}</div>}
        {face?.art && (
          <img className="sh-reveal-art" src={face.art} alt="" width={84} height={118} onError={(e) => (e.currentTarget.style.display = 'none')} />
        )}
        <div className="sh-reveal-name">{face ? face.name : t(reveal.card)}</div>
        <p className="sh-reveal-fx">{face ? face.fx : t(`cardfx_${reveal.card}`)}</p>
        <Button variant="ghost" className="sh-reveal-close">
          {t('shreveal_close')}
        </Button>
        <span className="sh-reveal-timer" style={{ animationDuration: `${REVEAL_MS}ms` }} />
      </div>
    </div>
  );
}
