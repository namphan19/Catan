// Trade dialog: bank/harbor trades (rates come from the legal bankTrade actions) and player
// trades — the offerer composes an offer (validated by validateAction), responders accept,
// decline or counter, and the offerer confirms with one of them. All of it flows through
// getLegalActions / validateAction; the UI only composes bags from display data.
//
// Flow (players tab), decided by who owns the open offer:
//   - my own offer open      -> OffererMode: live answers, "settle with X", cancel
//   - someone else's offer   -> ResponderMode: what I get / give, countdown for bot offers,
//                               my current answer, accept / decline, optional counter (folded)
//   - no offer, I may offer  -> OfferComposer
import { useEffect, useState } from 'react';
import { BOT_TRADE_WAIT_MS, type Action, type Bag, type PlayerView, type Validation } from '@hexgame/engine';
import { useI18n, resKey, resourceKinds } from '../i18n';
import { useAvatar, useName } from '../shell/names';
import { Avatar } from '../ui/Avatar';
import { playerColor } from '../ui/colors';
import { Dialog } from '../ui/Dialog';
import { Button, Fieldset } from '../ui/Button';
import { GameIcon } from '../ui/GameIcon';
import { ResourceArt } from '../table/HandPanel';

export type TradeTab = 'bank' | 'players';

type TFn = (k: string, p?: Record<string, string | number>) => string;

interface TradeDialogProps {
  view: PlayerView;
  legal: Action[];
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
  tab: TradeTab;
  setTab: (t: TradeTab) => void;
  onClose: () => void;
  /** Answering another player's offer: dock the dialog beside the board instead of covering it. */
  docked?: boolean;
  /** When a bot's open offer expires (epoch ms); shown as a countdown to the responder. */
  offerDeadline?: number | null;
}

export function TradeDialog({ view, legal, validate, onAction, tab, setTab, onClose, offerDeadline, docked }: TradeDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog title={t('dlg_tradeTitle')} onClose={onClose} docked={docked}>
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
        <BankTab
          view={view}
          legal={legal}
          onAction={(a) => {
            onAction(a);
            onClose(); // one bank trade per visit: the dialog never lingers half-empty
          }}
        />
      ) : (
        <PlayersTab view={view} legal={legal} validate={validate} onAction={onAction} offerDeadline={offerDeadline} />
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

  const chosen = selGive && selGet ? actions.get(`${selGive}>${selGet}`) : undefined;
  // Every card kind stays on the table (PO 2026-11-28): the ones you cannot give are dimmed with
  // what you hold, so "not enough" is visible at a glance instead of an empty dialog.
  const kinds = resourceKinds(view.bank.hand);
  const canGive = kinds.some((r) => rates[r] != null);
  const why =
    view.turn.current !== me ? 'dlg_bankNotTurn' : legal.some((a) => a.t === 'roll') ? 'dlg_bankRollFirst' : 'dlg_bankNone';

  return (
    <div className="trade-bank">
      <p className="hint">{t(canGive ? 'dlg_bankTabHint' : why)}</p>
      <Fieldset label={t('dlg_youGive')}>
        <div className="bank-row">
          {kinds.map((r) => (
            <button
              key={r}
              type="button"
              className="bank-card"
              data-res={r}
              disabled={rates[r] == null}
              aria-pressed={selGive === r}
              aria-label={`${t(resKey(r))}${rates[r] != null ? ` ${rates[r]}:1` : ''}`}
              onClick={() => {
                setSelGive(r);
                setSelGet(null);
              }}
            >
              <span className="bank-card-face">
                <ResourceArt res={r} />
                {rates[r] != null && <span className="bank-rate">{rates[r]}:1</span>}
              </span>
              <small>{t('dlg_bankHold', { n: hand[r] ?? 0 })}</small>
            </button>
          ))}
        </div>
      </Fieldset>
      <div className="bank-swap" aria-hidden="true">
        <GameIcon name="swap" size={20} />
      </div>
      <Fieldset label={t('dlg_youGet')}>
        <div className="bank-row">
          {kinds.map((s) => (
            <button
              key={s}
              type="button"
              className="bank-card"
              data-get={s}
              disabled={!selGive || !gets[selGive]?.has(s)}
              aria-pressed={selGet === s}
              aria-label={t(resKey(s))}
              onClick={() => setSelGet(s)}
            >
              <span className="bank-card-face">
                <ResourceArt res={s} />
              </span>
              <small>{t(resKey(s))}</small>
            </button>
          ))}
        </div>
      </Fieldset>
      <div className="dialog-actions">
        <Button variant="primary" className="bank-do" disabled={!chosen} onClick={() => chosen && onAction(chosen)}>
          {chosen && selGive && selGet
            ? t('dlg_bankDo', { n: rates[selGive], give: t(resKey(selGive)), get: t(resKey(selGet)) })
            : t('dlg_bankPick')}
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
  offerDeadline,
}: {
  view: PlayerView;
  legal: Action[];
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
  offerDeadline?: number | null;
}) {
  const { t } = useI18n();
  const me = view.viewer ?? 'p1';
  const trade = view.trade;
  const canOffer = legal.some((a) => a.t === 'offerTrade');

  if (trade && trade.from === me) return <OffererMode view={view} legal={legal} onAction={onAction} />;
  if (trade)
    return (
      <ResponderMode view={view} legal={legal} validate={validate} onAction={onAction} deadline={offerDeadline ?? null} />
    );
  if (canOffer) return <OfferComposer view={view} mode="offer" validate={validate} onAction={onAction} />;
  return <p className="hint">{t('dlg_noOfferNow')}</p>;
}

/** Seconds left until `deadline` (epoch ms), ticking once a second; null without a deadline. */
function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function Countdown({ deadline }: { deadline: number | null }) {
  const { t } = useI18n();
  const left = useSecondsLeft(deadline);
  if (left == null) return null;
  const total = BOT_TRADE_WAIT_MS / 1000;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return (
    <div className={`trade-countdown${left <= 10 ? ' urgent' : ''}`} role="timer" aria-live="off">
      <span>{t('dlg_expiresIn', { s: left })}</span>
      <span className="trade-countdown-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function Terms({ getLabel, get, giveLabel, give }: { getLabel: string; get: Bag; giveLabel: string; give: Bag }) {
  const { t } = useI18n();
  return (
    <div className="trade-terms-box">
      <div>
        <span className="trade-terms-label">{getLabel}</span>
        <BagChips bag={get} t={t} />
      </div>
      <span className="trade-terms-arrow" aria-hidden="true">
        <GameIcon name="swap" size={22} />
      </span>
      <div>
        <span className="trade-terms-label">{giveLabel}</span>
        <BagChips bag={give} t={t} />
      </div>
    </div>
  );
}

function ResponderMode({
  view,
  legal,
  validate,
  onAction,
  deadline,
}: {
  view: PlayerView;
  legal: Action[];
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
  deadline: number | null;
}) {
  const { t } = useI18n();
  const name = useName();
  const avatar = useAvatar();
  const me = view.viewer ?? 'p1';
  const trade = view.trade!;
  const hand = view.players.find((p) => p.id === me)?.hand ?? {};
  const mine = trade.responses[me];
  const accept = legal.find((a) => a.t === 'respondTrade' && (a as { accept?: boolean }).accept === true);
  const decline = legal.find((a) => a.t === 'respondTrade' && (a as { accept?: boolean }).accept === false);
  const canCounter = legal.some((a) => a.t === 'respondTrade' && (a as { response?: string }).response === 'counter');
  const lacks = !Object.entries(trade.get).every(([r, n]) => (hand[r] ?? 0) >= (n ?? 0));
  const [countering, setCountering] = useState(false);

  const answer =
    mine?.response === 'accept'
      ? t('dlg_youAccepted')
      : mine?.response === 'decline'
        ? t('dlg_youDeclined')
        : mine?.response === 'counter'
          ? t('dlg_youCountered', { give: bagText(mine.give, t), get: bagText(mine.get, t) })
          : null;

  return (
    <div className="trade-respond">
      <p className="trade-from">
        <Avatar id={avatar(trade.from)} seat={trade.from} size={30} />{' '}
        <strong>{t('dlg_theirOffer', { name: name(trade.from) })}</strong>
      </p>
      <Terms getLabel={t('dlg_youGet')} get={trade.give} giveLabel={t('dlg_youGive')} give={trade.get} />
      <Countdown deadline={deadline} />
      {answer && (
        <p className="trade-answer" role="status">
          {answer} <span className="hint">{t('dlg_canChange')}</span>
        </p>
      )}
      {lacks && <p className="hint">{t('dlg_lackCards')}</p>}
      <div className="dialog-actions">
        {canCounter && !countering && (
          <Button variant="ghost" onClick={() => setCountering(true)}>
            {t('dlg_counterOpen')}
          </Button>
        )}
        <Button variant="danger" disabled={!decline} onClick={() => decline && onAction(decline)}>
          <GameIcon name="cross" size={14} /> {t('dlg_decline')}
        </Button>
        <Button variant="primary" disabled={!accept} onClick={() => accept && onAction(accept)}>
          <GameIcon name="check" size={14} /> {t('dlg_accept')}
        </Button>
      </div>
      {canCounter && countering && (
        <OfferComposer
          view={view}
          mode="counter"
          validate={validate}
          initialGive={capTo(trade.get, hand)}
          initialGet={trade.give}
          onCancel={() => setCountering(false)}
          onAction={(a) => {
            onAction({ ...(a as { give: Bag; get: Bag }), t: 'respondTrade', player: me, response: 'counter' });
            setCountering(false);
          }}
        />
      )}
    </div>
  );
}

function OffererMode({ view, legal, onAction }: { view: PlayerView; legal: Action[]; onAction: (a: Action) => void }) {
  const { t } = useI18n();
  const name = useName();
  const avatar = useAvatar();
  const me = view.viewer ?? 'p1';
  const trade = view.trade!;
  const confirms = legal.filter((a) => a.t === 'confirmTrade');
  const cancel = legal.find((a) => a.t === 'cancelTrade');
  const others = view.players.filter((p) => p.id !== me);
  const answered = others.filter((p) => trade.responses[p.id]).length;
  const allDeclined = answered === others.length && others.every((p) => trade.responses[p.id]?.response === 'decline');

  return (
    <div className="trade-offer">
      <p>
        <strong>{t('dlg_yourOffer')}</strong>
      </p>
      <Terms getLabel={t('dlg_youGet')} get={trade.get} giveLabel={t('dlg_youGive')} give={trade.give} />
      <ul className="trade-responses">
        {others.map((p) => {
          const r = trade.responses[p.id];
          const c = confirms.find((a) => (a as { with: string }).with === p.id);
          const label =
            r?.response === 'accept'
              ? t('side_accepted')
              : r?.response === 'decline'
                ? t('side_declined')
                : r?.response === 'counter'
                  ? t('dlg_theyCounter', { give: bagText(r.give, t), get: bagText(r.get, t) })
                  : t('side_pending');
          return (
            <li key={p.id} style={{ borderColor: playerColor(p.id) }}>
              <Avatar id={avatar(p.id)} seat={p.id} size={28} /> <b>{name(p.id)}</b>:{' '}
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
      <p className="hint" role="status">
        {allDeclined ? t('dlg_allDeclined') : confirms.length ? t('dlg_pickPartner') : t('dlg_waitingAnswers')}
      </p>
      {cancel && (
        <div className="dialog-actions">
          <Button variant="danger" onClick={() => onAction(cancel)}>
            <GameIcon name="cross" size={14} /> {t('act_cancelOffer')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Localized reason for an invalid offer/counter (engine codes; English message only as a fallback). */
function reasonText(v: Validation, t: TFn): string | undefined {
  if (v.ok) return undefined;
  const key = `trade_err_${v.code}`;
  const s = t(key);
  return s === key ? t('trade_err_other') : s;
}

function OfferComposer({
  view,
  mode,
  validate,
  onAction,
  onCancel,
  initialGive,
  initialGet,
}: {
  view: PlayerView;
  mode: 'offer' | 'counter';
  validate: (a: Action) => Validation;
  onAction: (a: Action) => void;
  onCancel?: () => void;
  initialGive?: Bag;
  initialGet?: Bag;
}) {
  const { t } = useI18n();
  const me = view.viewer ?? 'p1';
  const hand = view.players.find((p) => p.id === me)?.hand ?? {};
  const partnerHand =
    mode === 'offer'
      ? 0
      : view.players.find((p) => p.id === view.trade?.from)?.handCount ?? 0;
  const [give, setGive] = useState<Bag>(() => clean(initialGive ?? {}));
  const [get, setGet] = useState<Bag>(() => clean(initialGet ?? {}));

  const probe: Action =
    mode === 'offer'
      ? { t: 'offerTrade', player: me, give, get }
      : { t: 'respondTrade', player: me, response: 'counter', give, get };
  const empty = totalOf(give) === 0 || totalOf(get) === 0;
  // Nothing chosen yet is not an error: say what to do instead of shouting a rule code.
  const v = empty ? ({ ok: true } as Validation) : validate(probe);
  const ok = v.ok && !empty;
  const reason = reasonText(v, t);

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
      <p className="hint">{t(mode === 'offer' ? 'dlg_offerHint' : 'dlg_counterHint')}</p>
      <CardPicker
        side="give"
        label={t('dlg_youGive')}
        bag={give}
        hand={hand}
        cap={(r) => hand[r] ?? 0}
        onBump={(r, d) => bump(give, setGive, r, d, hand[r] ?? 0)}
        t={t}
      />
      <div className="bank-swap" aria-hidden="true">
        <GameIcon name="swap" size={20} />
      </div>
      <CardPicker
        side="get"
        label={t('dlg_youGet')}
        bag={get}
        hand={hand}
        cap={() => (mode === 'offer' ? 99 : partnerHand)}
        onBump={(r, d) => bump(get, setGet, r, d, mode === 'offer' ? 99 : partnerHand)}
        t={t}
      />
      {empty ? (
        <p className="hint">{t('dlg_pickBoth')}</p>
      ) : (
        reason && <p className="error-text">{reason}</p>
      )}
      <div className="dialog-actions">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('dlg_cancel')}
          </Button>
        )}
        <Button variant="primary" type="submit" disabled={!ok}>
          {mode === 'offer' ? t('dlg_offer') : t('dlg_sendCounter')}
        </Button>
      </div>
    </form>
  );
}

/**
 * One side of an offer as a row of painted cards (PO 2026-11-28, same look as the bank tab): a click
 * on a card adds one, the − under it takes one back; the count sits on the card. On the give side
 * each card says how many you hold and cards you have none of are dimmed.
 */
function CardPicker({
  side,
  label,
  bag,
  hand,
  cap,
  onBump,
  t,
}: {
  side: 'give' | 'get';
  label: string;
  bag: Bag;
  hand: Bag;
  cap: (r: string) => number;
  onBump: (r: string, d: number) => void;
  t: TFn;
}) {
  return (
    <Fieldset label={label}>
      <div className={`tcard-row tcard-${side}`}>
        {resourceKinds(hand).map((r) => {
          const n = bag[r] ?? 0;
          const max = cap(r);
          const none = side === 'give' && (hand[r] ?? 0) === 0;
          return (
            <div key={r} className={`tcard${n > 0 ? ' on' : ''}${none ? ' none' : ''}`} data-res={r}>
              <button
                type="button"
                className="tcard-face"
                disabled={n >= max}
                aria-label={`+ ${t(resKey(r))} (${label})`}
                onClick={() => onBump(r, +1)}
              >
                <ResourceArt res={r} />
                {n > 0 && <span className="tcard-n">{n}</span>}
              </button>
              <span className="tcard-step">
                <button type="button" aria-label={`− ${t(resKey(r))} (${label})`} disabled={n === 0} onClick={() => onBump(r, -1)}>
                  <GameIcon name="minus" size={12} />
                </button>
              </span>
              <small>{side === 'give' ? t('dlg_bankHold', { n: hand[r] ?? 0 }) : t(resKey(r))}</small>
            </div>
          );
        })}
      </div>
    </Fieldset>
  );
}

function BagChips({ bag, t }: { bag: Bag | undefined; t: TFn }) {
  const parts = Object.entries(bag ?? {}).filter(([, n]) => (n || 0) > 0);
  if (!parts.length) return <span className="hint">{t('toast_none')}</span>;
  return (
    <span className="bag-chips">
      {parts.map(([r, n]) => (
        <span key={r} className="bag-chip" title={t(resKey(r))}>
          <span className="bag-card">
            <ResourceArt res={r} />
          </span>
          <b>×{n}</b>
          <span className="xp-sr">{t(resKey(r))}</span>
        </span>
      ))}
    </span>
  );
}

function bagText(bag: Bag | undefined, t: TFn): string {
  if (!bag) return t('toast_none');
  const parts = Object.entries(bag)
    .filter(([, n]) => (n || 0) > 0)
    .map(([r, n]) => `${n}× ${t(resKey(r))}`);
  return parts.length ? parts.join(', ') : t('toast_none');
}

function clean(bag: Bag): Bag {
  const out: Bag = {};
  for (const [r, n] of Object.entries(bag)) if ((n ?? 0) > 0) out[r] = n;
  return out;
}

function capTo(want: Bag, hand: Bag): Bag {
  const out: Bag = {};
  for (const [r, n] of Object.entries(want)) {
    const k = Math.min(n ?? 0, hand[r] ?? 0);
    if (k > 0) out[r] = k;
  }
  return out;
}

function totalOf(bag: Bag): number {
  return Object.values(bag).reduce((s, n) => s + (n || 0), 0);
}
