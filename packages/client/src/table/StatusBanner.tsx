// "What do I do now?" — one sentence under the top bar. Display only: the sentence is picked
// from the phase, the viewer's legal actions (getLegalActions) and the pending board pick;
// no rule is evaluated here.
import type { Action, PlayerId, PlayerView } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import type { TFn, NameFn } from './describe';

type PendingPick = 'placeSettlement' | 'placeRoad' | 'buildCity' | 'moveBlocker' | 'tl:buildShip' | null;

/** The player the table is waiting for right now (read from the phase, never computed). */
export function actorOf(view: PlayerView): PlayerId | null {
  if (view.winner) return null;
  const ph = view.phase;
  switch (ph.k) {
    case 'discard':
      return Object.entries(ph.owed).find(([, n]) => (n || 0) > 0)?.[0] ?? view.turn.current;
    case 'paired':
      return ph.player;
    case 'moveBlocker':
    case 'steal':
    case 'freeRoads':
      return ph.actor ?? view.turn.current;
    case 'extraBuild':
      return ph.queue[0] ?? view.turn.current;
    case 'ext':
      return ph.actors?.[0] ?? view.turn.current;
    case 'over':
      return null;
    default:
      return view.turn.current;
  }
}

/** Everyone the table is waiting for: several players at once while discards are owed. */
export function actorsOf(view: PlayerView): PlayerId[] {
  if (view.winner) return [];
  const ph = view.phase;
  if (ph.k === 'discard') {
    const owing = Object.entries(ph.owed)
      .filter(([, n]) => (n || 0) > 0)
      .map(([id]) => id);
    if (owing.length > 0) return owing;
  }
  const one = actorOf(view);
  return one ? [one] : [];
}

export interface Status {
  /** True when the viewer has something to do. */
  mine: boolean;
  /** Whose emblem to show next to the sentence. */
  who: PlayerId | null;
  text: string;
  /** True when a voluntary board pick is armed and can be cancelled. */
  cancellable: boolean;
}

export function statusOf(view: PlayerView, legal: Action[], pending: PendingPick, t: TFn, name: NameFn): Status {
  const me = view.viewer;
  const ph = view.phase;
  const has = (tt: string) => legal.some((a) => a.t === tt);
  const mine = (text: string, cancellable = false): Status => ({ mine: true, who: me, text, cancellable });

  if (view.winner) return { mine: false, who: view.winner, text: t('status_over', { name: name(view.winner) }), cancellable: false };

  if (has('discard')) {
    const n = ph.k === 'discard' ? (ph.owed[me ?? ''] ?? 0) : 0;
    return mine(n > 0 ? t('status_discardN', { n }) : t('status_discard'));
  }
  if (has('respondTrade')) return mine(t('status_respond', { name: view.trade ? name(view.trade.from) : '' }));
  if (has('steal')) return mine(t('status_steal'));
  if (has('moveBlocker')) return mine(t('status_blocker'));
  // Strongholds: the second setup piece is a city (rules section 2), so say so.
  const setupCity =
    ph.k === 'setup' && !!view.ext?.strongholds && !!me &&
    Object.values(view.pieces.buildings).filter((b) => b.owner === me).length >= (has('placeRoad') ? 2 : 1);
  if (ph.k === 'setup' && has('placeSettlement')) return mine(t(setupCity ? 'status_setupCity' : 'status_setupSettlement'));
  if (ph.k === 'setup' && has('placeRoad')) return mine(t(setupCity ? 'status_setupRoadCity' : 'status_setupRoad'));
  if (ph.k === 'freeRoads' && has('placeRoad')) return mine(t('status_freeRoads', { n: ph.left }));
  if (has('roll')) return mine(t('status_roll'));
  if (pending === 'placeSettlement') return mine(t('status_pickSettlement'), true);
  if (pending === 'placeRoad') return mine(t('status_pickRoad'), true);
  if (pending === 'buildCity') return mine(t('status_pickCity'), true);
  if (pending === 'tl:buildShip') return mine(t('status_pickShip'), true);
  if (has('tl:gold')) return mine(t('tl_goldHint'));
  if (has('tl:placeHarbor') && ph.k === 'ext') return mine(t('tl_harborWindow'));
  if (has('confirmTrade')) return mine(t('status_confirm'));
  if (has('cancelTrade')) {
    const tr = view.trade;
    const others = view.players.filter((p) => p.id !== me);
    const allDeclined = !!tr && others.every((p) => tr.responses[p.id]?.response === 'decline');
    return mine(allDeclined ? t('dlg_allDeclined') : t('status_offerOpen'));
  }
  if (has('endTurn')) return mine(ph.k === 'main' ? t('status_main') : t('status_buildOrEnd'));
  if (legal.length > 0) return mine(t('status_act'));

  const who = actorOf(view);
  const waitName = who && who !== me ? name(who) : '';
  return {
    mine: false,
    who: who && who !== me ? who : null,
    text: waitName ? t('waitingFor', { name: waitName }) : t('status_wait'),
    cancellable: false,
  };
}

export function StatusBanner({
  view,
  legal,
  pending,
  onCancel,
  prompt,
}: {
  view: PlayerView;
  legal: Action[];
  pending: PendingPick;
  onCancel: () => void;
  /** A running expansion choice ("Recruit: pick an intersection") replaces the generic sentence. */
  prompt?: string | null;
}) {
  const { t } = useI18n();
  const name = useName();
  const base = statusOf(view, legal, pending, t, name);
  const st = prompt ? { ...base, mine: true, who: view.viewer, text: prompt } : base;
  return (
    <div className="status-banner" data-mine={st.mine ? 'true' : 'false'} role="status" aria-live="polite">
      {st.who && <Emblem id={playerEmblem(st.who)} size={22} color={playerColor(st.who)} />}
      <span className="status-text">{st.text}</span>
      {st.cancellable && (
        <button type="button" className="btn btn-ghost status-cancel" onClick={onCancel}>
          {t('status_cancel')}
        </button>
      )}
    </div>
  );
}
