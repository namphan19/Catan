// Side panel tabs under the player cards: Nhật ký (log) / Đổi bài (trade status).
// The price list moved to the always-visible CostCard on the board.
import { useState } from 'react';
import type { PlayerView } from '@hexgame/engine';
import { useI18n, resKey } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { LogPanel } from './LogPanel';

type Tab = 'log' | 'trade';

export function SidePanel({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('log');

  return (
    <div className="sidepanel">
      <nav className="tabs" role="tablist" aria-label={t('appTitle')}>
        {(['log', 'trade'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`tab${tab === k ? ' active' : ''}`}
            onClick={() => setTab(k)}
          >
            {t(`side_${k}`)}
            {k === 'trade' && view.trade ? <span className="badge" aria-hidden="true">1</span> : null}
          </button>
        ))}
      </nav>
      <div className="sidepanel-body" role="tabpanel">
        {tab === 'log' && <LogPanel view={view} />}
        {tab === 'trade' && <TradeTab view={view} />}
      </div>
    </div>
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
                <Emblem id={playerEmblem(p.id)} size={14} color={playerColor(p.id)} /> {name(p.id)}:{' '}
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
