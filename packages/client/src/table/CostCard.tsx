// Always-visible price list in the bottom-right corner of the board area. Costs come from
// the base config; the "you can pay this" marks only compare the viewer's hand with the
// cost bag for display — whether a build is actually allowed still comes from getLegalActions.
import { useState } from 'react';
import { HL, TL, baseConfig, type PlayerView } from '@hexgame/engine';
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

const ROWS: Array<{ item: string; key: string; piece?: 'road' | 'settlement' | 'city' | 'ship' }> = [
  { item: 'road', key: 'side_costsRoad', piece: 'road' },
  { item: 'ship', key: 'cost_ship', piece: 'ship' },
  { item: 'settlement', key: 'side_costsSettlement', piece: 'settlement' },
  { item: 'city', key: 'side_costsCity', piece: 'city' },
  { item: 'card', key: 'side_costsCard' },
];

/**
 * `picking`: a board pick is armed (spots are lit). The card folds for that time so it never covers a
 * lit spot (sea maps reach into the bottom-right corner on laptop screens); the saved choice is kept.
 */
export function CostCard({ view, picking = false }: { view: PlayerView; picking?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(readOpen);
  const me = view.players.find((p) => p.id === view.viewer);
  const hand = me?.hand;
  const color = view.viewer ? playerColor(view.viewer) : 'var(--ink-soft)';

  const toggle = () => {
    if (picking) return; // folded only for the pick; the saved choice comes back after it
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed');
    } catch {
      /* the toggle still works for this session */
    }
  };

  const shown = open && !picking;
  return (
    <section className={shown ? 'cost-card' : 'cost-card collapsed'} aria-label={t('side_costs')}>
      <button type="button" className="cost-card-head" aria-expanded={shown} onClick={toggle} title={t('cost_toggle')}>
        <UiIcon name="build" size={16} />
        <span>{t('side_costs')}</span>
        <span className="cost-card-caret" aria-hidden="true">
          {shown ? '▾' : '▸'}
        </span>
      </button>
      {shown && (
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
                    {piece ? <PieceIcon kind={piece} color={color} size={18} /> : <UiIcon name="card" size={18} />}
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
          {view.ext?.highlands ? (
            <>
              <p className="cost-note">{t('cost_bank', { r: HL.bankRate })}</p>
              <p className="cost-note">{t('hl_costNote')}</p>
            </>
          ) : (
            <p className="cost-note">{t('cost_bank', { r: baseConfig.bankRate })}</p>
          )}
        </>
      )}
    </section>
  );
}
