// Trade dialog: bank/harbor trades (rates come from the legal bankTrade actions) and player
// trades — the offerer composes an offer (validated by validateAction), responders accept,
// decline or counter, and the offerer confirms with one of them. All of it flows through
// getLegalActions / validateAction; the UI only composes bags from display data.
import { useState } from 'react';
import type { Action, Bag, PlayerView, Validation } from '@hexgame/engine';
import { useI18n, resKey, resourceKinds } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem, RESOURCE_COLORS } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { ResourceIcon } from '../ui/ResourceIcon';
import { Dialog } from '../ui/Dialog';
import { Button, Fieldset } from '../ui/Button';

export type TradeTab = 'bank' | 'players';

interface TradeDialogProps {
  view: PlayerView;
  legal: Action[];
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
  tab: TradeTab;
  setTab: (t: TradeTab) => void;
  onClose: () => void;
}

export function TradeDialog({ view, legal, validate, onAction, tab, setTab, onClose }: TradeDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog title={t('dlg_tradeTitle')} onClose={onClose}>
      <nav className="tabs" role="tablist" aria-label={t('dlg_tradeTitle')}>
        {(['bank', 'players'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`tab${tab === k ? ' active' : ''}`}
            onClick={() => setTab(k)}
          >
            {t(k === 'bank' ? 'dlg_tradeBank' : 'dlg_tradePlayers')}
          </button>
        ))}
      </nav>
      {tab === 'bank' ? (
        <BankTab view={view} legal={legal} onAction={onAction} />
      ) : (
        <PlayersTab view={view} legal={legal} validate={validate} onAction={onAction} />
      )}
    </Dialog>
  );
}

/* ---------- Bank / harbor ---------- */

function BankTab({ view, legal, onAction }: { view: PlayerView; legal: Action[]; onAction: (a: Action) => void }) {
  const { t } = useI18n();
  const me = view.viewer ?? 'p1';
  const hand = view.players.find((p) => p.id === me)?.hand ?? {};
  const [selGive, setSelGive] = useState<string | null>(null);
  const [selGet, setSelGet] = useState<string | null>(null);

  // Rates and available get-resources come from the legal actions only.
  const rates: Record<string, number> = {};
  const gets: Record<string, Set<string>> = {};
  const actions = new Map<string, Action>();
  for (const a of legal) {
    if (a.t !== 'bankTrade') continue;
    const bt = a as { give: Bag; get: Bag };
    const r = Object.keys(bt.give)[0];
    const s = Object.keys(bt.get)[0];
    if (!r || !s) continue;
    rates[r] = bt.give[r];
    (gets[r] ??= new Set()).add(s);
    actions.set(`${r}>${s}`, a);
  }

  const pairs = selGive ? [...(gets[selGive] ?? [])] : [];
  const chosen = selGive && selGet ? actions.get(`${selGive}>${selGet}`) : undefined;
  const bestRate = (r: string) => Math.min(...Object.entries(rates).map(([, v]) => v), 4);

  return (
    <div className="trade-bank">
      <p className="hint">{t('dlg_bankTabHint')}</p>
      <Fieldset label={t('dlg_give')}>
        <ul className="option-list">
          {resourceKinds(view.bank.hand).map((r) =>
            rates[r] != null ? (
              <li key={r}>
                <Button
                  variant="ghost"
                  className="option-btn"
                  aria-pressed={selGive === r}
                  onClick={() => {
                    setSelGive(r);
                    setSelGet(null);
                  }}
                >
                  <span className="option-chip" title={t(resKey(r))}>
                    <ResourceIcon res={r} size={20} />
                    <span>{t(resKey(r))}</span>
                    <small>
                      {' '}
                      {t('dlg_rate', { r: rates[r] })} · ✋ {hand[r] ?? 0}
                      {rates[r] === bestRate(r) ? ` · ${t('dlg_bestRate')}` : ''}
                    </small>
                  </span>
                </Button>
              </li>
            ) : null,
          )}
        </ul>
      </Fieldset>
      {selGive && (
        <Fieldset label={t('dlg_get')}>
          <ul className="option-list">
            {pairs.map((s) => (
              <li key={s}>
                <Button
                  variant="ghost"
                  className="option-btn"
                  aria-pressed={selGet === s}
                  onClick={() => setSelGet(s)}
                >
                  <span className="option-chip" title={t(resKey(s))}>
                    <ResourceIcon res={s} size={20} />
                    <span>{t(resKey(s))}</span>
                    <small> ×1</small>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </Fieldset>
      )}
      <div className="dialog-actions">
        <Button
          variant="primary"
          disabled={!chosen}
          onClick={() => chosen && onAction(chosen)}
        >
          {t('dlg_confirm')}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Player trade ---------- */

function PlayersTab({
  view,
  legal,
  validate,
  onAction,
}: {
  view: PlayerView;
  legal: Action[];
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
}) {
  const { t } = useI18n();
  const trade = view.trade;

  const canRespond = legal.some((a) => a.t === 'respondTrade');
  const canConfirm = legal.some((a) => a.t === 'confirmTrade');
  const canOffer = legal.some((a) => a.t === 'offerTrade');

  if (trade && canRespond) return <ResponderMode view={view} legal={legal} validate={validate} onAction={onAction} />;
  if (trade && canConfirm) return <OffererMode view={view} legal={legal} onAction={onAction} />;
  if (canOffer) return <OfferComposer view={view} mode="offer" validate={validate} onAction={onAction} />;
  return (
    <div>
      {trade && (
        <>
          <p>
            <strong>{t('dlg_yourOffer')}</strong>
          </p>
          <OpenOffer trade={trade} t={t} />
        </>
      )}
      <p className="hint">{t('dlg_none')}</p>
    </div>
  );
}

function OpenOffer({
  trade,
  t,
}: {
  trade: NonNullable<PlayerView['trade']>;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <p className="trade-terms">
      {t('dlg_give')}: <strong>{bagChips(trade.give, t)}</strong> · {t('dlg_get')}:{' '}
      <strong>{bagChips(trade.get, t)}</strong>
    </p>
  );
}

function ResponderMode({
  view,
  legal,
  validate,
  onAction,
}: {
  view: PlayerView;
  legal: Action[];
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
}) {
  const { t } = useI18n();
  const name = useName();
  const me = view.viewer ?? 'p1';
  const trade = view.trade!;
  const accept = legal.find((a) => a.t === 'respondTrade' && (a as { accept?: boolean }).accept === true);
  const decline = legal.find((a) => a.t === 'respondTrade' && (a as { accept?: boolean }).accept === false);
  const canCounter = legal.some((a) => a.t === 'respondTrade' && (a as { response?: string }).response === 'counter');

  return (
    <div className="trade-respond">
      <p>
        <strong>{t('dlg_theirOffer', { name: name(trade.from) })}</strong>
      </p>
      <p className="trade-terms">
        {t('dlg_get')}: <strong>{bagChips(trade.give, t)}</strong> · {t('dlg_give')}:{' '}
        <strong>{bagChips(trade.get, t)}</strong>
      </p>
      <div className="dialog-actions">
        <Button variant="primary" disabled={!accept} onClick={() => accept && onAction(accept)}>
          ✔ {t('dlg_accept')}
        </Button>
        <Button variant="danger" disabled={!decline} onClick={() => decline && onAction(decline)}>
          ✖ {t('dlg_decline')}
        </Button>
      </div>
      {canCounter && (
        <OfferComposer
          view={view}
          mode="counter"
          validate={validate}
          onAction={(a) =>
            onAction({ ...(a as { give: Bag; get: Bag }), t: 'respondTrade', player: me, response: 'counter' })
          }
          counterHint={t('dlg_counterHint')}
        />
      )}
    </div>
  );
}

function OffererMode({ view, legal, onAction }: { view: PlayerView; legal: Action[]; onAction: (a: Action) => void }) {
  const { t } = useI18n();
  const name = useName();
  const me = view.viewer ?? 'p1';
  const trade = view.trade!;
  const confirms = legal.filter((a) => a.t === 'confirmTrade');

  return (
    <div className="trade-offer">
      <p>
        <strong>{t('dlg_yourOffer')}</strong>
      </p>
      <p className="trade-terms">
        {t('dlg_give')}: <strong>{bagChips(trade.give, t)}</strong> · {t('dlg_get')}:{' '}
        <strong>{bagChips(trade.get, t)}</strong>
      </p>
      <p>
        <strong>{t('side_tradeResponses')}</strong>
      </p>
      <ul className="trade-responses">
        {view.players
          .filter((p) => p.id !== me)
          .map((p) => {
            const r = trade.responses[p.id];
            const c = confirms.find((a) => (a as { with: string }).with === p.id);
            const label =
              r?.response === 'accept'
                ? t('side_accepted')
                : r?.response === 'decline'
                  ? t('side_declined')
                  : r?.response === 'counter'
                    ? `${t('dlg_counter')}: ${bagChips(r.give, t)} → ${bagChips(r.get, t)}`
                    : t('side_pending');
            return (
              <li key={p.id} style={{ borderColor: playerColor(p.id) }}>
                <Emblem id={playerEmblem(p.id)} size={14} color={playerColor(p.id)} /> {name(p.id)}:{' '}
                <span className={`resp-${r?.response ?? 'pending'}`}>{label}</span>
                {c && (
                  <Button variant="primary" onClick={() => onAction(c)}>
                    {t('act_confirmWith', { name: name(p.id) })}
                  </Button>
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function OfferComposer({
  view,
  mode,
  validate,
  onAction,
  counterHint,
}: {
  view: PlayerView;
  mode: 'offer' | 'counter';
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
  counterHint?: string;
}) {
  const { t } = useI18n();
  const me = view.viewer ?? 'p1';
  const hand = view.players.find((p) => p.id === me)?.hand ?? {};
  const partnerHand =
    mode === 'offer'
      ? 0
      : view.players.find((p) => p.id === view.trade?.from)?.handCount ?? 0;
  const [give, setGive] = useState<Bag>({});
  const [get, setGet] = useState<Bag>({});

  const probe: Action =
    mode === 'offer'
      ? { t: 'offerTrade', player: me, give, get }
      : { t: 'respondTrade', player: me, response: 'counter', give, get };
  const v = validate(probe);
  const ok = v.ok && totalOf(give) > 0 && totalOf(get) > 0;
  const reason = v.ok ? undefined : `${v.code}: ${v.message}`;

  const bump = (side: Bag, set: (b: Bag) => void, r: string, d: number, cap: number) => {
    const next = { ...side, [r]: Math.max(0, Math.min(cap, (side[r] ?? 0) + d)) };
    if (next[r] === 0) delete next[r];
    set(next);
  };

  return (
    <form
      className="trade-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onAction(probe);
      }}
    >
      {counterHint && <p className="hint">{counterHint}</p>}
      <Fieldset label={t('dlg_give')}>
        <BagSteppers bag={give} onBump={(r, d) => bump(give, setGive, r, d, hand[r] ?? 0)} hand={hand} t={t} />
      </Fieldset>
      <Fieldset label={t('dlg_get')}>
        <BagSteppers
          bag={get}
          onBump={(r, d) => bump(get, setGet, r, d, mode === 'offer' ? 99 : partnerHand)}
          hand={hand}
          t={t}
        />
      </Fieldset>
      {reason && <p className="error-text">{reason}</p>}
      <div className="dialog-actions">
        <Button variant="primary" type="submit" disabled={!ok} tip={reason}>
          {mode === 'offer' ? t('dlg_offer') : t('dlg_sendCounter')}
        </Button>
      </div>
    </form>
  );
}

function BagSteppers({
  bag,
  onBump,
  hand,
  t,
}: {
  bag: Bag;
  onBump: (r: string, d: number) => void;
  hand: Bag;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <ul className="pick-list">
      {resourceKinds(hand).map((r) => (
        <li key={r} className="pick-row">
          <span className="res-chip" style={{ '--res': RESOURCE_COLORS[r] } as React.CSSProperties}>
            <ResourceIcon res={r} size={18} />
            <span className="res-name">{t(resKey(r))}</span>
            <span className="res-count">{hand[r] ?? 0}</span>
          </span>
          <div className="stepper">
            <Button aria-label={`− ${t(resKey(r))}`} disabled={(bag[r] ?? 0) === 0} onClick={() => onBump(r, -1)}>
              −
            </Button>
            <output>{bag[r] ?? 0}</output>
            <Button aria-label={`+ ${t(resKey(r))}`} onClick={() => onBump(r, +1)}>
              +
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function bagChips(bag: Bag | undefined, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (!bag) return t('toast_none');
  const parts = Object.entries(bag)
    .filter(([, n]) => (n || 0) > 0)
    .map(([r, n]) => `${n}× ${t(resKey(r))}`);
  return parts.length ? parts.join(', ') : t('toast_none');
}

function totalOf(bag: Bag): number {
  return Object.values(bag).reduce((s, n) => s + (n || 0), 0);
}
