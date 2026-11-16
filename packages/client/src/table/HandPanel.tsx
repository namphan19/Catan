// The viewer's own hand as cards: all resource types are always shown (0 = dimmed) with a
// count badge, development cards as mini cards. A changed count pops and shows "+N" / "-N".
import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@hexgame/engine';
import { useI18n, resKey, cardKey, RESOURCE_ORDER } from '../i18n';
import { assetUrl, useAssets } from '../board/assets';
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

function ResourceArt({ res }: { res: string }) {
  const path = assetUrl('resource', res);
  const ok = useAssets([path])[path];
  return ok ? <img src={path} alt="" width={38} height={38} /> : <ResourceIcon res={res} size={30} />;
}

function CardArt({ card }: { card: string }) {
  const path = assetUrl('card', card);
  const ok = useAssets([path])[path];
  return ok ? <img src={path} alt="" width={40} height={56} /> : <span className="dev-card-blank" aria-hidden="true" />;
}

export function HandPanel({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const me = view.players.find((p) => p.id === view.viewer);
  const hand: Record<string, number> = me?.hand ?? {};
  const cards = me?.cards ?? [];
  const newCards = me?.newCards ?? [];
  const total = Object.values(hand).reduce((s, n) => s + (n || 0), 0);
  const deltas = useHandDeltas(hand, view.viewer);

  // Base resources in their fixed order, then anything an extension ruleset adds.
  const kinds = [...RESOURCE_ORDER, ...Object.keys(hand).filter((r) => !(RESOURCE_ORDER as readonly string[]).includes(r))];

  // Development cards grouped by type: { total, bought this turn }.
  const groups = new Map<string, { n: number; fresh: number }>();
  for (const c of cards) groups.set(c, { n: (groups.get(c)?.n ?? 0) + 1, fresh: groups.get(c)?.fresh ?? 0 });
  for (const c of newCards) groups.set(c, { n: (groups.get(c)?.n ?? 0) + 1, fresh: (groups.get(c)?.fresh ?? 0) + 1 });

  return (
    <div className="hand" aria-label={t('hand_title')}>
      <div className="hand-group">
        <span className="hand-title">
          {t('hand_title')} <small className="hand-total">{t('hand_total', { n: total })}</small>
        </span>
        <ul className="hand-res">
          {kinds.map((r) => {
            const n = hand[r] ?? 0;
            const d = deltas[r];
            const label = `${t(resKey(r))}: ${n}`;
            return (
              <li
                key={r}
                className={`res-card${n === 0 ? ' empty' : ''}${d ? ' changed' : ''}`}
                data-res={r}
                data-count={n}
                title={label}
                aria-label={label}
              >
                <ResourceArt res={r} />
                <span className="res-card-name">{t(resKey(r))}</span>
                {n > 0 && <span className="res-card-count">{n}</span>}
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
      <div className="hand-group hand-cards">
        <span className="hand-title">{t('hand_cards')}</span>
        {groups.size === 0 ? (
          <span className="hand-empty">{t('hand_noCards')}</span>
        ) : (
          <ul className="dev-cards">
            {[...groups.entries()].map(([c, g]) => {
              const label = `${t(cardKey(c))} × ${g.n}${g.fresh > 0 ? ` (${t('newCardMark')}: ${g.fresh})` : ''}`;
              return (
                <li key={c} className="dev-card" title={label} aria-label={label}>
                  <CardArt card={c} />
                  <span className="dev-card-name">{t(cardKey(c))}</span>
                  {g.n > 1 && <span className="res-card-count">{g.n}</span>}
                  {g.fresh > 0 && <span className="dev-card-new">{t('newCardMark')}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
