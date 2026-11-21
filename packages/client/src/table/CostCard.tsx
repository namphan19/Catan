// Always-visible price list in the bottom-right corner of the board area. Costs come from
// the base config; the "you can pay this" marks only compare the viewer's hand with the
// cost bag for display — whether a build is actually allowed still comes from getLegalActions.
import { useState } from 'react';
import { TL, baseConfig, type PlayerView } from '@hexgame/engine';
import { useI18n, resKey, RESOURCE_ORDER } from '../i18n';
import { playerColor } from '../ui/colors';
import { ResourceIcon } from '../ui/ResourceIcon';
import { PieceIcon, UiIcon } from '../ui/Icon';

const STORAGE_KEY = 'boschtan.costs';

function readOpen(): boolean {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'open') return true;
    if (v === 'closed') return false;
  } catch {
    /* storage disabled: fall through to the size default */
  }
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1181px)').matches;
}

const ROWS: Array<{ item: string; key: string; piece?: 'road' | 'settlement' | 'city' }> = [
  { item: 'road', key: 'side_costsRoad', piece: 'road' },
  { item: 'ship', key: 'cost_ship' },
  { item: 'settlement', key: 'side_costsSettlement', piece: 'settlement' },
  { item: 'city', key: 'side_costsCity', piece: 'city' },
  { item: 'card', key: 'side_costsCard' },
];

export function CostCard({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(readOpen);
  const me = view.players.find((p) => p.id === view.viewer);
  const hand = me?.hand;
  const color = view.viewer ? playerColor(view.viewer) : 'var(--ink-soft)';

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed');
    } catch {
      /* the toggle still works for this session */
    }
  };

  return (
    <section className={open ? 'cost-card' : 'cost-card collapsed'} aria-label={t('side_costs')}>
      <button type="button" className="cost-card-head" aria-expanded={open} onClick={toggle} title={t('cost_toggle')}>
        <UiIcon name="build" size={16} />
        <span>{t('side_costs')}</span>
        <span className="cost-card-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <>
          <ul className="cost-rows">
            {ROWS.map(({ item, key, piece }) => {
              // Cogs exist only with the tidelands expansion (cost from its config).
              const bag = (item === 'ship' ? (view.ext?.tidelands ? TL.costs.ship : undefined) : baseConfig.costs[item]) as
                | Record<string, number>
                | undefined;
              if (!bag) return null;
              if (item === 'card' && view.ext?.strongholds) return null; // no base card deck there
              const can = !!hand && Object.entries(bag).every(([r, n]) => (hand[r] ?? 0) >= n);
              const vp = baseConfig.buildingVP[item];
              const text = RESOURCE_ORDER.filter((r) => (bag[r] ?? 0) > 0)
                .map((r) => `${bag[r]}× ${t(resKey(r))}`)
                .join(', ');
              const label = `${t(key)}: ${text}${can ? ` (${t('cost_can')})` : ''}`;
              return (
                <li key={item} className={can ? 'cost-row can' : 'cost-row'} title={label} aria-label={label}>
                  <span className="cost-icon">
                    {piece ? <PieceIcon kind={piece} color={color} size={18} /> : item === 'ship' ? <span style={{ color }}>⛵</span> : <UiIcon name="card" size={18} />}
                  </span>
                  <span className="cost-name">
                    {t(key)}
                    {vp ? <small className="cost-vp"> {vp} {t('vpShort')}</small> : null}
                  </span>
                  <span className="cost-units">
                    {RESOURCE_ORDER.flatMap((r) =>
                      Array.from({ length: bag[r] ?? 0 }, (_, i) => (
                        <span key={`${r}${i}`} className={hand && (hand[r] ?? 0) > i ? 'cost-unit' : 'cost-unit missing'}>
                          <ResourceIcon res={r} size={18} />
                        </span>
                      )),
                    )}
                  </span>
                  <span className="cost-ok" aria-hidden="true">
                    {can ? '✓' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="cost-note">{t('cost_bank', { r: baseConfig.bankRate })}</p>
        </>
      )}
    </section>
  );
}
