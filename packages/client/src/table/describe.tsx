// Turning engine actions/events into UI text. Pure display: ids and amounts come from the
// engine objects; no game logic here. Log lines are human sentences in the UI language and
// never show raw board ids like "v:-2,1,S" (resource gains get icons where useful).
import type { ReactNode } from 'react';
import type { Action, GameEvent, PlayerId } from '@hexgame/engine';
import { cardKey, resKey } from '../i18n';
import { ResourceIcon } from '../ui/ResourceIcon';
import { describeShAction, describeShEvent } from '../strongholds/labels';
import { describeTlAction, describeTlEvent } from '../tidelands/labels';

export type TFn = (key: string, params?: Record<string, string | number>) => string;
export type NameFn = (id: PlayerId) => string;

function bagTotal(bag: Record<string, number> | undefined): number {
  if (!bag) return 0;
  return Object.values(bag).reduce((s, n) => s + (n || 0), 0);
}

const AWARD_KEYS: Record<string, string> = {
  longestRoute: 'award_route',
  largestForce: 'award_force',
};

export function awardKey(award: string): string {
  return AWARD_KEYS[award] ?? award;
}

function pieceKey(kind: string): string {
  if (kind === 'settlement') return 'piece_settlement';
  if (kind === 'city') return 'piece_city';
  if (kind === 'ship') return 'piece_ship';
  return 'piece_road';
}

/** "2× Gỗ, 1× Lúa mì" with a small icon per resource (used in log lines and toasts). */
export function bagNode(bag: Record<string, number> | undefined, t: TFn): ReactNode {
  const entries = Object.entries(bag ?? {}).filter(([, n]) => (n || 0) > 0);
  if (entries.length === 0) return t('toast_none');
  return entries.map(([r, n], i) => (
    <span key={r} className="log-res">
      {i > 0 && ', '}
      <ResourceIcon res={r} size={13} /> {n}× {t(resKey(r))}
    </span>
  ));
}

/** Plain-text variant (for aria strings and toasts that must stay text). */
export function bagList(bag: Record<string, number> | undefined, t: TFn): string {
  if (!bag) return '—';
  const parts = Object.entries(bag)
    .filter(([, n]) => (n || 0) > 0)
    .map(([r, n]) => `${n}× ${t(resKey(r))}`);
  return parts.length ? parts.join(', ') : '—';
}

/** Public outcome stored next to a logged action (engine LoggedAction.roll / .gains). */
export interface LogOutcome {
  roll?: { dice: number[]; sum: number };
  gains?: Record<PlayerId, Record<string, number>>;
}

/** "Nam: 1× Gỗ · Bot 2: 2× Lông cừu" (who received what), or null when nobody got anything. */
export function gainsNode(gains: LogOutcome['gains'], t: TFn, name: NameFn): ReactNode {
  const entries = Object.entries(gains ?? {}).filter(([, bag]) => bagTotal(bag) > 0);
  if (!entries.length) return null;
  return entries.map(([id, bag], i) => (
    <span key={id}>
      {i > 0 && ' · '}
      {name(id)}: {bagNode(bag, t)}
    </span>
  ));
}

/** One log line for an action — a human sentence, no raw board ids. `out` adds the public
 *  outcome (dice, production) when the log carries it. */
export function describeAction(a: Action, t: TFn, name: NameFn, out?: LogOutcome): ReactNode {
  const who = name(a.player);
  const gains = gainsNode(out?.gains, t, name);
  switch (a.t) {
    case 'placeSettlement':
      // the 2nd setup settlement produces its starting cards
      return out?.gains?.[a.player] ? (
        <>
          {t('log_settlement', { name: who })} — {t('log_gotStart')} {bagNode(out.gains[a.player], t)}
        </>
      ) : (
        t('log_settlement', { name: who })
      );
    case 'placeRoad':
      return t('log_road', { name: who });
    case 'buildCity':
      return t('log_city', { name: who });
    case 'roll': {
      if (!out?.roll) return t('log_roll', { name: who });
      const head = t('log_rollResult', {
        name: who,
        a: out.roll.dice[0] ?? 0,
        b: out.roll.dice[1] ?? 0,
        sum: out.roll.sum,
      });
      if (gains) return <>{head} — {gains}</>;
      return out.roll.sum === 7 ? `${head} — ${t('log_rollSeven')}` : `${head} — ${t('log_rollNothing')}`;
    }
    case 'discard':
      return (
        <>
          {t('log_discard', { name: who, n: bagTotal(a.bag) })} ({bagNode(a.bag, t)})
        </>
      );
    case 'moveBlocker':
      return t('log_blocker', { name: who });
    case 'steal':
      return t('log_stole', { name: who, name2: name(a.target) });
    case 'bankTrade': {
      const n = bagTotal(a.give);
      const m = bagTotal(a.get);
      return (
        <>
          {t('log_bankTrade', { name: who, n, m })} ({bagNode(a.give, t)} → {bagNode(a.get, t)})
        </>
      );
    }
    case 'offerTrade': {
      const n = bagTotal(a.give);
      const m = bagTotal(a.get);
      return (
        <>
          {t('log_offerTrade', { name: who, n, m })} ({bagNode(a.give, t)} → {bagNode(a.get, t)})
        </>
      );
    }
    case 'respondTrade': {
      const acc = 'accept' in a ? a.accept : (a as { response?: string }).response;
      if (acc === 'counter') {
        const c = a as { give?: Record<string, number>; get?: Record<string, number> };
        return (
          <>
            {t('log_respondTrade', { name: who, resp: t('toast_respondCounter') })} ({bagNode(c.give, t)} →{' '}
            {bagNode(c.get, t)})
          </>
        );
      }
      const resp = acc === true || acc === 'accept' ? t('toast_respondAccept') : t('toast_respondDecline');
      return t('log_respondTrade', { name: who, resp });
    }
    case 'confirmTrade':
      return t('log_confirmTrade', { name: who, name2: name(a.with) });
    case 'cancelTrade':
      return t('log_cancelTrade', { name: who });
    case 'buyCard':
      return t('log_buyCard', { name: who });
    case 'playCard':
      return t('log_playCard', { name: who, card: t(cardKey(a.card)) });
    case 'endTurn':
      return t('log_endTurn', { name: who });
    default:
      return describeShAction(a, t, name) ?? describeTlAction(a, t, name) ?? t('log_other', { name: who, action: a.t });
  }
}

/** One log/toast line for an event (already redacted for the viewer via getEventsView). */
export function describeEvent(ev: GameEvent, t: TFn, name: NameFn): ReactNode {
  switch (ev.e) {
    case 'rolled':
      return t('toast_rolled', {
        name: name(ev.player),
        a: ev.dice[0] ?? 0,
        b: ev.dice[1] ?? 0,
        sum: ev.sum,
      });
    case 'produced': {
      const entries = Object.entries(ev.gains).filter(([, bag]) => bagTotal(bag) > 0);
      if (entries.length === 0) return '';
      if (entries.length === 1) {
        const [id, bag] = entries[0] as [string, Record<string, number>];
        return (
          <>
            {t('toast_produced', { name: name(id) })}: {bagNode(bag, t)}
          </>
        );
      }
      return t('toast_producedMany', {
        text: entries.map(([id, bag]) => `${name(id)}: ${bagList(bag, t)}`).join(' · '),
      });
    }
    case 'placed':
      return ev.free
        ? t('toast_placed', { name: name(ev.player), kind: t(pieceKey(ev.kind)) })
        : t('toast_built', { name: name(ev.player), kind: t(pieceKey(ev.kind)) });
    case 'discarded':
      return t('toast_discarded', { name: name(ev.player), n: bagTotal(ev.bag) });
    case 'blockerMoved':
      return t('toast_blockerMoved', { name: name(ev.player) });
    case 'stole':
      return ev.resource
        ? `${t('toast_stole', { name: name(ev.to), name2: name(ev.from) })} (${t(resKey(ev.resource))})`
        : t('toast_stoleUnknown', { name: name(ev.to), name2: name(ev.from) });
    case 'traded':
      return ev.b === 'bank'
        ? t('toast_tradedBank', { name: name(ev.a) })
        : t('toast_tradedPlayers', { name: name(ev.a), name2: name(ev.b) });
    case 'tradeOffered':
      return t('toast_tradeOffered', { name: name(ev.player) });
    case 'tradeResponse': {
      const resp =
        ev.response ??
        (ev.accept ? 'accept' : undefined); // older events only had the `accept` flag
      return t('toast_tradeResponse', {
        name: name(ev.player),
        resp: t(
          resp === 'accept'
            ? 'toast_respondAccept'
            : resp === 'counter'
              ? 'toast_respondCounter'
              : 'toast_respondDecline',
        ),
      });
    }
    case 'tradeCancelled':
      return t('toast_tradeCancelled', { name: name(ev.player) });
    case 'cardBought':
      // Never name the card: on a shared screen everyone reads the toast (the buyer sees it in hand).
      return t('toast_cardBought', { name: name(ev.player) });
    case 'cardPlayed':
      return t('toast_cardPlayed', { name: name(ev.player), card: t(cardKey(ev.card)) });
    case 'awardChanged':
      return t('toast_award', {
        award: t(awardKey(ev.award)),
        name: ev.to ? name(ev.to) : '—',
      });
    case 'won':
      return t('toast_won', { name: name(ev.player) });
    case 'phase':
      return t('toast_phase', { phase: t(`phase_${ev.phase}`) });
    case 'turnStarted':
      return t('toast_turnStarted', { name: name(ev.player) });
    case 'ext':
      if (ev.id === 'tidelands') return describeTlEvent(ev, t, name);
      return ev.id === 'strongholds' ? describeShEvent(ev, t, name) : '';
    default:
      return '';
  }
}
