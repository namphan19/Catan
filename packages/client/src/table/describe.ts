// Turning engine actions/events into UI text. Pure display: ids and amounts come from the
// engine objects; no game logic here.
import type { Action, GameEvent, PlayerId } from '@hexgame/engine';
import { cardKey, resKey } from '../i18n';

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
  return 'piece_road';
}

/** One log line for an action. */
export function describeAction(a: Action, t: TFn, name: NameFn): string {
  const who = name(a.player);
  switch (a.t) {
    case 'placeSettlement':
      return `${who} · ${t('piece_settlement')} ${a.v}`;
    case 'placeRoad':
      return `${who} · ${t('piece_road')} ${a.e}`;
    case 'buildCity':
      return `${who} · ${t('piece_city')} ${a.v}`;
    case 'roll':
      return `${who} · ${t('act_roll')}`;
    case 'discard':
      return `${who} · ${t('toast_discarded', { n: bagTotal(a.bag) })} (${bagList(a.bag, t)})`;
    case 'moveBlocker':
      return `${who} · ${t('blocker')} → ${a.hex}`;
    case 'steal':
      return `${who} · ${t('dlg_stealTitle')} ${name(a.target)}`;
    case 'bankTrade':
      return `${who} · ${t('act_bankTrade')} (${bagList(a.give, t)} → ${bagList(a.get, t)})`;
    case 'offerTrade':
      return `${who} · ${t('toast_tradeOffered', { name: who })} (${bagList(a.give, t)} → ${bagList(a.get, t)})`;
    case 'respondTrade': {
      const acc = 'accept' in a ? a.accept : (a as { response?: string }).response;
      const resp = acc === true || acc === 'accept' ? t('toast_respondAccept') : acc === 'counter' ? t('dlg_counter') : t('toast_respondDecline');
      return `${who} · ${resp}`;
    }
    case 'confirmTrade':
      return `${who} · ${t('act_confirmWith', { name: name(a.with) })}`;
    case 'cancelTrade':
      return `${who} · ${t('act_cancelOffer')}`;
    case 'buyCard':
      return `${who} · ${t('act_buyCard')}`;
    case 'playCard':
      return `${who} · ${t('toast_cardPlayed', { card: t(cardKey(a.card)) })}`;
    case 'endTurn':
      return `${who} · ${t('act_endTurn')}`;
    default:
      return `${who} · ${a.t}`;
  }
}

/** One log line for an event (already redacted for the viewer via getEventsView). */
export function describeEvent(ev: GameEvent, t: TFn, name: NameFn): string {
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
        return t('toast_produced', { name: name(id), bag: bagList(bag, t) });
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
              ? 'dlg_counter'
              : 'toast_respondDecline',
        ),
      });
    }
    case 'tradeCancelled':
      return t('toast_tradeCancelled', { name: name(ev.player) });
    case 'cardBought':
      return ev.card
        ? `${t('toast_cardBought', { name: name(ev.player) })} · ${t(cardKey(ev.card))}`
        : t('toast_cardBought', { name: name(ev.player) });
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
      return `${ev.id}`;
    default:
      return '';
  }
}

/** "2× Gỗ, 1× Lúa" */
export function bagList(bag: Record<string, number> | undefined, t: TFn): string {
  if (!bag) return '—';
  const parts = Object.entries(bag)
    .filter(([, n]) => (n || 0) > 0)
    .map(([r, n]) => `${n}× ${t(resKey(r))}`);
  return parts.length ? parts.join(', ') : '—';
}
