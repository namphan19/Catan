// The game table. Takes { view, legal, onAction, events } only (docs/UI.md) so the online
// client can reuse it. Every button, highlight and dialog option derives from getLegalActions;
// disabled reasons come from validateAction. No rules logic lives here.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameEvent, PlayerId, PlayerView, Validation } from '@hexgame/engine';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { Button } from '../ui/Button';
import { ToastStack, useToasts } from '../ui/Toast';
import { Board } from '../board/Board';
import { EMPTY_HIGHLIGHTS, type Highlights } from '../board/Highlights';
import { TopBar } from './TopBar';
import { OpponentStrip } from './OpponentStrip';
import { HandPanel } from './HandPanel';
import { ActionBar, type Pending } from './ActionBar';
import { SidePanel } from './SidePanel';
import { describeEvent } from './describe';
import { DiscardDialog, StealDialog, TradeDialog, CardDialog, type TradeTab, type PickCard } from '../dialogs';

export interface GameTableProps {
  view: PlayerView;
  legal: Action[];
  onAction: (a: Action) => void;
  /** Freshly produced (already redacted) events of the latest action. */
  events: GameEvent[];
  validate?: (a: Action) => Validation;
  /** Rejected move messages — surfaced as error toasts. */
  errors?: string[];
  /** Winner-overlay actions (hot-seat shell provides them; online client may not). */
  onExport?: () => void;
  onHome?: () => void;
}

export function GameTable({ view, legal, onAction, events, validate, errors, onExport, onHome }: GameTableProps) {
  const { t } = useI18n();
  const name = useName();
  const check = validate ?? (() => ({ ok: true } as Validation));
  const [toasts, pushToast] = useToasts();
  const [pending, setPending] = useState<Pending>(null);
  const [tradeTab, setTradeTab] = useState<TradeTab>('bank');
  const [tradeOpen, setTradeOpen] = useState<TradeTab | null>(null);
  const [cardOpen, setCardOpen] = useState<PickCard | null>(null);
  const phaseKey = view.phase.k;

  // Event toasts (dice roll, production, builds, trades...).
  const seen = useRef(0);
  useEffect(() => {
    if (seen.current > events.length) seen.current = 0; // new game: the feed shrank
    for (const ev of events.slice(seen.current)) {
      const line = describeEvent(ev, t, name);
      if (line) pushToast({ text: line, kind: ev.e === 'won' ? 'gold' : 'info' });
    }
    seen.current = events.length;
  }, [events, t, name, pushToast]);

  // Rejected-move toasts.
  const errSeen = useRef(0);
  useEffect(() => {
    const list = errors ?? [];
    if (errSeen.current > list.length) errSeen.current = 0;
    for (const e of list.slice(errSeen.current)) pushToast({ text: e, kind: 'error' });
    errSeen.current = list.length;
  }, [errors, pushToast]);

  // Auto-arm the board-pick tool the phase is asking for.
  useEffect(() => {
    const ph = view.phase;
    if (ph.k === 'setup') setPending(ph.step === 'road' ? 'placeRoad' : 'placeSettlement');
    else if (ph.k === 'moveBlocker') setPending('moveBlocker');
    else if (ph.k === 'freeRoads') setPending('placeRoad');
    else setPending(null);
  }, [phaseKey, view.phase]);

  // Esc cancels the pending board selection.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  // Mandatory dialogs come straight from the legal list.
  const mustDiscard = legal.some((a) => a.t === 'discard');
  const mustSteal = legal.some((a) => a.t === 'steal');
  const mustRespond = legal.some((a) => a.t === 'respondTrade');

  // Open the trade dialog when an offer needs an answer; re-arm on each new offer.
  const offerKey = view.trade ? `${view.trade.from}:${view.trade.give && JSON.stringify(view.trade.give)}` : '';
  const lastOffer = useRef('');
  useEffect(() => {
    if (mustRespond && offerKey && offerKey !== lastOffer.current) {
      setTradeOpen('players');
      setTradeTab('players');
    }
    lastOffer.current = offerKey;
  }, [mustRespond, offerKey]);

  const highlights = useMemo<Highlights>(() => {
    if (!pending) return EMPTY_HIGHLIGHTS;
    const hl: Highlights = { vertices: new Set(), edges: new Set(), hexes: new Set() };
    for (const a of legal) {
      if (a.t === 'placeSettlement' && pending === 'placeSettlement') hl.vertices.add(a.v);
      else if (a.t === 'buildCity' && pending === 'buildCity') hl.vertices.add(a.v);
      else if (a.t === 'placeRoad' && pending === 'placeRoad') hl.edges.add(a.e);
      else if (a.t === 'moveBlocker' && pending === 'moveBlocker') hl.hexes.add(a.hex);
    }
    return hl;
  }, [pending, legal]);

  const tryTarget = (pick: (a: Action) => boolean, what: string) => {
    const a = legal.find(pick);
    if (a) {
      setPending(null);
      onAction(a);
    } else {
      pushToast({ text: t('board_pickHint'), kind: 'error' });
      void what;
    }
  };

  const closeTrade = () => setTradeOpen(null);
  const closeCard = () => setCardOpen(null);

  const winner = view.winner ? view.players.find((p) => p.id === view.winner) : undefined;

  return (
    <div className="table">
      <TopBar view={view} />
      <OpponentStrip view={view} />
      <div className="table-main">
        <div className="board-area">
          <Board
            layout={view.init.layout}
            board={view.board}
            pieces={view.pieces}
            highlights={highlights}
            onVertex={(v) =>
              tryTarget(
                (a) => (a.t === 'placeSettlement' || a.t === 'buildCity') && a.v === v,
                'vertex',
              )
            }
            onEdge={(e) => tryTarget((a) => a.t === 'placeRoad' && a.e === e, 'edge')}
            onHex={(h) => tryTarget((a) => a.t === 'moveBlocker' && a.hex === h, 'hex')}
            onMiss={() => setPending(null)}
          />
        </div>
        <SidePanel view={view} />
      </div>
      <div className="table-bottom">
        <HandPanel view={view} />
        <ActionBar
          view={view}
          legal={legal}
          onAction={onAction}
          validate={validate}
          pending={pending}
          setPending={setPending}
          onOpenTrade={(tab) => {
            setTradeTab(tab);
            setTradeOpen(tab);
          }}
          onOpenCards={(c) => setCardOpen(c)}
        />
      </div>

      {mustDiscard && <DiscardDialog view={view} legal={legal} validate={check} onAction={onAction} onClose={() => {}} />}
      {mustSteal && !mustDiscard && <StealDialog legal={legal} onAction={onAction} onClose={() => {}} />}
      {tradeOpen && !mustDiscard && (
        <TradeDialog
          view={view}
          legal={legal}
          validate={check}
          onAction={onAction}
          tab={tradeTab}
          setTab={setTradeTab}
          onClose={closeTrade}
        />
      )}
      {cardOpen && !mustDiscard && !mustSteal && (
        <CardDialog card={cardOpen} legal={legal} onAction={onAction} onClose={closeCard} />
      )}

      {view.winner && (
        <div className="winner-overlay" role="status" aria-live="polite">
          <div className="winner-card">
            <p className="winner-title">
              🏆 {t('winner_title', { name: name(view.winner) })}
            </p>
            <p className="winner-vp">
              <Emblem id={playerEmblem(view.winner)} size={28} />
              <span style={{ color: playerColor(view.winner) }}>
                {name(view.winner)}
              </span>{' '}
              {t('winner_vp', { n: winner?.vp ?? winner?.publicVP ?? 0 })}
            </p>
            <div className="dialog-actions">
              {onExport && (
                <Button variant="ghost" onClick={onExport}>
                  {t('winner_export')}
                </Button>
              )}
              {onHome && (
                <Button variant="primary" onClick={onHome}>
                  {t('winner_newGame')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
      <span className="sr-only" aria-live="assertive">
        {mustRespond ? t('tradeBadge') : ''}
      </span>
    </div>
  );
}

/** Helper for the shell: the id of the player whose turn/phase it is to act. */
export function actingPlayerId(view: PlayerView, legal: Action[]): PlayerId | null {
  if (view.winner) return null;
  const players = new Set<string>();
  for (const a of legal) players.add(a.player);
  if (view.viewer && players.has(view.viewer)) return view.viewer;
  return [...players][0] ?? null;
}
