// Side panel tabs: Nhật ký (log) / Đổi bài (trade status) / Chi phí (base config costs).
import { useState } from 'react';
import { baseConfig, type PlayerView } from '@hexgame/engine';
import { useI18n, resKey, RESOURCE_ORDER } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { ResourceIcon } from '../ui/ResourceIcon';
import { LogPanel } from './LogPanel';

type Tab = 'log' | 'trade' | 'costs';

export function SidePanel({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('log');

  return (
    <aside className="sidepanel">
      <nav className="tabs" role="tablist" aria-label={t('appTitle')}>
        {(['log', 'trade', 'costs'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`tab${tab === k ? ' active' : ''}`}
            onClick={() => setTab(k)}
          >
            {t(`side_${k}`)}
          </button>
        ))}
      </nav>
      <div className="sidepanel-body" role="tabpanel">
        {tab === 'log' && <LogPanel view={view} />}
        {tab === 'trade' && <TradeTab view={view} />}
        {tab === 'costs' && <CostsTab />}
      </div>
    </aside>
  );
}

function TradeTab({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const name = useName();
  const trade = view.trade;
  if (!trade) return <p className="hint">{t('side_noTrade')}</p>;
  return (
    <div className="trade-status">
      <p>
        <strong>{t('side_tradeFrom', { name: name(trade.from) })}</strong>
      </p>
      <p className="trade-bags">
        {bagChips(trade.give, t)} ➜ {bagChips(trade.get, t)}
      </p>
      <p>
        <strong>{t('side_tradeResponses')}</strong>
      </p>
      <ul className="trade-responses">
        {view.players
          .filter((p) => p.id !== trade.from)
          .map((p) => {
            const r = trade.responses[p.id];
            const state =
              r?.response === 'accept' ? 'yes' : r?.response === 'decline' ? 'no' : r ? 'counter' : 'pending';
            return (
              <li key={p.id} style={{ borderColor: playerColor(p.id) }}>
                <Emblem id={playerEmblem(p.id)} size={14} /> {name(p.id)}:{' '}
                <span className={`resp-${state}`}>
                  {r?.response === 'accept'
                    ? t('side_accepted')
                    : r?.response === 'decline'
                      ? t('side_declined')
                      : r?.response === 'counter'
                        ? `${t('dlg_counter')}: ${bagChips(r.give ?? {}, t)} → ${bagChips(r.get ?? {}, t)}`
                        : t('side_pending')}
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function bagChips(bag: Record<string, number>, t: (k: string, p?: Record<string, string | number>) => string): string {
  return Object.entries(bag)
    .filter(([, n]) => (n || 0) > 0)
    .map(([r, n]) => `${n}× ${t(resKey(r))}`)
    .join(', ');
}

const COST_ROWS: Array<{ key: string; item: keyof typeof baseConfig.costs }> = [
  { key: 'side_costsRoad', item: 'road' },
  { key: 'side_costsSettlement', item: 'settlement' },
  { key: 'side_costsCity', item: 'city' },
  { key: 'side_costsCard', item: 'card' },
];

function CostsTab() {
  const { t } = useI18n();
  const costs = baseConfig.costs;
  return (
    <div className="costs">
      <p className="hint">{t('side_costsNote')}</p>
      <table className="cost-table">
        <tbody>
          {COST_ROWS.map(({ key, item }) => {
            const bag = costs[item] as Record<string, number> | undefined;
            if (!bag) return null;
            return (
              <tr key={item}>
                <th scope="row">{t(key)}</th>
                <td>
                  {RESOURCE_ORDER.map((r) =>
                    (bag[r] ?? 0) > 0 ? (
                      <span key={r} className="cost-chip" title={t(resKey(r))}>
                        <ResourceIcon res={r} size={16} /> × {bag[r]}
                      </span>
                    ) : null,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
