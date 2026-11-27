// The viewer's own hand at the foot of the board (PO 2026-11-27 HUD, reworked 2026-11-28).
// Resources are interchangeable, so each kind is one upright STACK (like Ticket to Ride / Colonist):
// more cards = more card edges behind it (up to 3) and a count badge that nothing overlaps; a kind
// you have none of shrinks to a narrow empty slot. Development cards are distinct, so they stay a
// small fan (like Slay the Spire): hovering or tapping a card lifts and enlarges it while its
// neighbours slide aside. A card you may play now has a gold ring, and its lifted face carries the
// Play button (the old "Play a card: X" pills in the action bar are gone). A changed resource count pops and shows "+N" / "-N".
import { useEffect, useRef, useState } from 'react';
import type { Action, PlayerView } from '@hexgame/engine';
import { useI18n, resKey, cardKey, RESOURCE_ORDER } from '../i18n';
import { art2dUrl, useAssets } from '../board/assets';
import { ResourceIcon } from '../ui/ResourceIcon';

interface Delta {
  n: number;
  key: number;
}

/** Per-resource change since the previous hand of the SAME viewer (cleared after ~1.4 s). */
function useHandDeltas(hand: Record<string, number>, viewer: string | null): Record<string, Delta> {
  const prev = useRef<{ viewer: string | null; hand: Record<string, number> } | null>(null);
  const [deltas, setDeltas] = useState<Record<string, Delta>>({});
  const sig = JSON.stringify(hand);
  useEffect(() => {
    const before = prev.current;
    prev.current = { viewer, hand };
    // First render or another player's hand (hot-seat): nothing "changed" for this viewer.
    if (!before || before.viewer !== viewer) {
      setDeltas({});
      return;
    }
    const next: Record<string, Delta> = {};
    const stamp = Date.now();
    for (const r of new Set([...Object.keys(hand), ...Object.keys(before.hand)])) {
      const d = (hand[r] ?? 0) - (before.hand[r] ?? 0);
      if (d !== 0) next[r] = { n: d, key: stamp };
    }
    if (Object.keys(next).length === 0) return;
    setDeltas(next);
    const timer = window.setTimeout(() => setDeltas({}), 1400);
    return () => window.clearTimeout(timer);
    // `sig` stands for the hand's content; the object itself is new on every view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, viewer]);
  return deltas;
}

export function ResourceArt({ res }: { res: string }) {
  // Painted card (Tripo, art2d/card); the goods icon on a blank card until it has loaded.
  const path = art2dUrl('card', res);
  return useAssets([path])[path] ? (
    <img className="res-card-art painted" src={path} alt="" width={60} height={84} />
  ) : (
    <span className="res-card-fallback">
      <ResourceIcon res={res} size={34} />
    </span>
  );
}

function CardArt({ card }: { card: string }) {
  const path = art2dUrl('card', card);
  return useAssets([path])[path] ? <img className="dev-card-art painted" src={path} alt="" width={40} height={56} /> : <span className="dev-card-blank" aria-hidden="true" />;
}

/** Box-shadow card edges behind a stack of `n` cards (none for 0-1, at most 3). */
export function stackStyle(n: number): React.CSSProperties | undefined {
  const extra = Math.min(Math.max(n - 1, 0), 3);
  if (extra === 0) return undefined;
  const layers: string[] = [];
  for (let k = 1; k <= extra; k++) {
    layers.push(`calc(var(--layer) * ${k}) calc(var(--layer) * ${-k}) 0 0 #eadcb8`);
    layers.push(`calc(var(--layer) * ${k} + 1px) calc(var(--layer) * ${-k} - 1px) 0 0 rgba(43, 33, 28, 0.75)`);
  }
  return { '--stack': layers.join(', ') } as React.CSSProperties;
}

/** Rotation / drop of card i of n in a fan (display only). */
export function fanStyle(i: number, n: number, deg = 4, drop = 2.2): React.CSSProperties {
  const o = i - (n - 1) / 2;
  return { '--rot': `${(o * deg).toFixed(2)}deg`, '--drop': `${(o * o * drop).toFixed(1)}px` } as React.CSSProperties;
}

interface HandPanelProps {
  view: PlayerView;
  /** A caption over the expansion cards (commodities, goods), e.g. "trade only". */
  extraLabel?: string;
  /** The viewer's legal actions: a development card is playable when a `playCard` for it is in here. */
  legal?: Action[];
  /** Play this development card (the table opens a chooser where the card needs one). */
  onPlay?: (card: string) => void;
}

export function HandPanel({ view, extraLabel, legal = [], onPlay }: HandPanelProps) {
  const { t } = useI18n();
  const me = view.players.find((p) => p.id === view.viewer);
  const hand: Record<string, number> = me?.hand ?? {};
  const cards = me?.cards ?? [];
  const newCards = me?.newCards ?? [];
  const total = Object.values(hand).reduce((s, n) => s + (n || 0), 0);
  const deltas = useHandDeltas(hand, view.viewer);
  const playable = new Set(legal.filter((a) => a.t === 'playCard').map((a) => (a as { card: string }).card));
  // The development card lifted by a tap (touch has no hover); a tap elsewhere drops it again.
  const [lifted, setLifted] = useState<string | null>(null);
  const devRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!lifted) return;
    const onDown = (e: PointerEvent) => {
      if (devRef.current && !devRef.current.contains(e.target as Node)) setLifted(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLifted(null);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [lifted]);

  // Base resources in their fixed order, then anything an extension ruleset adds.
  const kinds = [...RESOURCE_ORDER, ...Object.keys(hand).filter((r) => !(RESOURCE_ORDER as readonly string[]).includes(r))];

  // Development cards grouped by type: { total, bought this turn }.
  const groups = new Map<string, { n: number; fresh: number }>();
  for (const c of cards) groups.set(c, { n: (groups.get(c)?.n ?? 0) + 1, fresh: groups.get(c)?.fresh ?? 0 });
  for (const c of newCards) groups.set(c, { n: (groups.get(c)?.n ?? 0) + 1, fresh: (groups.get(c)?.fresh ?? 0) + 1 });

  return (
    <div className="hand" aria-label={t('hand_title')}>
      <div className="hand-group">
        <span className="hand-title sr-only">
          {t('hand_title')} <small className="hand-total">{t('hand_total', { n: total })}</small>
        </span>
        <ul className="hand-res">
          {kinds.map((r, i) => {
            const n = hand[r] ?? 0;
            const d = deltas[r];
            const label = `${t(resKey(r))}: ${n}`;
            return (
              <li
                key={r}
                className={`res-card${n === 0 ? ' empty' : ''}${d ? ' changed' : ''}${i === RESOURCE_ORDER.length ? ' first-extra' : ''}`}
                data-res={r}
                data-count={n}
                style={stackStyle(n)}
                title={label}
                aria-label={label}
              >
                {i === RESOURCE_ORDER.length && extraLabel && (
                  <span className="res-group-label" aria-hidden="true">
                    {extraLabel}
                  </span>
                )}
                <ResourceArt res={r} />
                {/* An empty kind shows only this icon in a narrow slot. */}
                <span className="res-card-icon" aria-hidden="true">
                  <ResourceIcon res={r} size={20} />
                </span>
                <span className="res-card-name">{t(resKey(r))}</span>
                <span className={`res-card-count${n === 0 ? ' is-zero' : ''}`}>{n}</span>
                {d && (
                  <span key={d.key} className={d.n > 0 ? 'res-delta plus' : 'res-delta minus'} aria-hidden="true">
                    {d.n > 0 ? `+${d.n}` : d.n}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {/* Strongholds: advance cards live in the expansion panel (with their play buttons), so the
          base "development cards" strip would only show the same cards a second time. */}
      {!view.ext?.strongholds && (
      <div className="hand-group hand-cards">
        <span className={groups.size === 0 ? 'hand-title sr-only' : 'hand-title'}>
          {groups.size === 0 ? t('hand_noCards') : t('hand_cards')}
        </span>
        {groups.size > 0 && (
          <ul className="dev-cards card-fan" ref={devRef}>
            {[...groups.entries()].map(([c, g], i) => {
              const canPlay = playable.has(c) && !!onPlay;
              const label = `${t(cardKey(c))} × ${g.n}${g.fresh > 0 ? ` (${t('newCardMark')}: ${g.fresh})` : ''}${canPlay ? ` (${t('card_playable')})` : ''}`;
              return (
                <li
                  key={c}
                  className={`dev-card${lifted === c ? ' lifted' : ''}${canPlay ? ' playable' : ''}`}
                  data-card={c}
                  style={fanStyle(i, groups.size, 6, 3)}
                >
                  {canPlay && (
                    <button
                      type="button"
                      className="dev-card-play"
                      onClick={() => {
                        setLifted(null);
                        onPlay(c);
                      }}
                    >
                      {t('card_play')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="dev-card-btn"
                    title={label}
                    aria-label={label}
                    aria-pressed={lifted === c}
                    onClick={() => setLifted(lifted === c ? null : c)}
                  >
                    <CardArt card={c} />
                    <span className="dev-card-name">{t(cardKey(c))}</span>
                    {g.n > 1 && <span className="res-card-count">{g.n}</span>}
                    {g.fresh > 0 && <span className="dev-card-new">{t('newCardMark')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
