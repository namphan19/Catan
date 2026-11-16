// The game table. Takes { view, legal, onAction, events } only (docs/UI.md) so the online
// client can reuse it. Every button, highlight and dialog option derives from getLegalActions;
// disabled reasons come from validateAction. No rules logic lives here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameEvent, PlayerId, PlayerView, StrongholdsView, Validation } from '@hexgame/engine';
import { StrongholdsPanel } from '../strongholds/StrongholdsPanel';
import { BoardExtras } from '../strongholds/BoardExtras';
import { BagDialog, ChoiceDialog } from '../strongholds/ChoiceDialogs';
import { narrow, nextStage } from '../strongholds/chooser';
import { stagePrompt, valueLabel } from '../strongholds/labels';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { Button } from '../ui/Button';
import { ToastStack, useToasts } from '../ui/Toast';
import { BoardSwitch, readBoardMode, writeBoardMode, type BoardMode } from '../board/BoardSwitch';
import { EMPTY_HIGHLIGHTS, type Highlights } from '../board/Highlights';
import { TopBar } from './TopBar';
import { PlayerCards } from './PlayerCards';
import { StatusBanner } from './StatusBanner';
import { DiceBox } from './DiceBox';
import { CostCard } from './CostCard';
import { HelpDialog } from './HelpDialog';
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
  const [boardMode, setBoardMode] = useState<BoardMode>(readBoardMode);
  const [tradeTab, setTradeTab] = useState<TradeTab>('bank');
  const [tradeOpen, setTradeOpen] = useState<TradeTab | null>(null);
  const [cardOpen, setCardOpen] = useState<PickCard | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [producing, setProducing] = useState<ReadonlySet<string> | undefined>(undefined);
  const phaseKey = view.phase.k;

  // ---- Strongholds expansion: a staged chooser that narrows the legal actions ------------------
  const sh = (view.ext?.strongholds ?? null) as StrongholdsView | null;
  const [choice, setChoice] = useState<{ cands: Action[]; title: string; mandatory: boolean } | null>(null);
  const resolves = useMemo(() => legal.filter((a) => a.t === 'sh:resolve'), [legal]);
  const promptKind = (resolves[0] as { kind?: string } | undefined)?.kind ?? null;
  const bagPrompt = promptKind !== null && ['titheTake', 'dowryGive', 'sabotageDiscard'].includes(promptKind);
  useEffect(() => {
    // A new legal list ends any running choice; a prompt addressed to the viewer starts one.
    setChoice(
      resolves.length > 0 && !bagPrompt
        ? { cands: resolves, title: t('shprompt_' + String(promptKind)), mandatory: true }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal]);
  const stage = choice ? nextStage(choice.cands) : null;
  useEffect(() => {
    if (!choice || stage) return;
    const a = choice.cands[0];
    setChoice(null);
    if (a) onAction(a);
  }, [choice, stage, onAction]);
  const startChoice = (cands: Action[], title: string) => {
    setPending(null);
    setChoice(cands.length > 0 ? { cands, title, mandatory: false } : null);
  };
  const pickValue = (value: unknown) =>
    setChoice((c) => {
      const s = c ? nextStage(c.cands) : null;
      return c && s ? { ...c, cands: narrow(c.cands, s.field, value) } : c;
    });
  /** Board click while the chooser asks for a board spot. Returns false when it is not asking. */
  const pickOnBoard = (id: string): boolean => {
    if (!stage?.board) return false;
    if (stage.values.includes(id)) pickValue(id);
    else pushToast({ text: t('board_pickHint'), kind: 'error' });
    return true;
  };
  useEffect(() => {
    if (!choice || choice.mandatory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChoice(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choice]);
  const myHand: Record<string, number> = view.players.find((pl) => pl.id === view.viewer)?.hand ?? {};
  const bagHand: Record<string, number> =
    promptKind === 'titheTake' ? ((sh?.peek as { hand?: Record<string, number> } | null)?.hand ?? {}) : myHand;
  const bagNeed = Math.min(
    (sh?.pending[0] as { count?: number } | undefined)?.count ?? 0,
    Object.values(bagHand).reduce((x, y) => x + y, 0),
  );

  // Event toasts (dice roll, production, builds, trades...). A fresh roll also makes the
  // hexes carrying the rolled number pulse once (display only; the blocked hex stays quiet).
  const seen = useRef(0);
  const boardRef = useRef(view.board);
  boardRef.current = view.board;
  const pulseTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (seen.current > events.length) seen.current = 0; // new game: the feed shrank
    let rolled: number | null = null;
    for (const ev of events.slice(seen.current)) {
      if (ev.e === 'rolled') rolled = ev.sum;
      // The dice box shows the roll and the status banner shows phase / turn changes:
      // no toast for those, so the few toasts left are real news (gains, builds, trades).
      if (ev.e === 'rolled' || ev.e === 'phase' || ev.e === 'turnStarted') continue;
      const line = describeEvent(ev, t, name);
      if (line) pushToast({ text: line, kind: ev.e === 'won' ? 'gold' : 'info' });
    }
    seen.current = events.length;
    if (rolled !== null) {
      const b = boardRef.current;
      const ids = b.hexes.filter((h) => h.token === rolled && h.id !== b.blocker).map((h) => h.id);
      window.clearTimeout(pulseTimer.current);
      setProducing(ids.length > 0 ? new Set(ids) : undefined);
      pulseTimer.current = window.setTimeout(() => setProducing(undefined), 2200);
    }
  }, [events, t, name, pushToast]);
  useEffect(() => () => window.clearTimeout(pulseTimer.current), []);

  // Online play: colleagues switch to other windows while waiting. When it becomes the
  // viewer's turn and the tab is in the background, say so in the tab title.
  const myMove = legal.length > 0 && !view.winner;
  const baseTitle = useRef(typeof document !== 'undefined' ? document.title : '');
  useEffect(() => {
    const base = baseTitle.current;
    if (!myMove) return;
    const mark = () => {
      document.title = document.hidden ? `● ${t('status_yourTurnTitle')} · ${base}` : base;
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => {
      document.removeEventListener('visibilitychange', mark);
      document.title = base;
    };
  }, [myMove, t]);

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

  // A pick the phase itself demands (setup placement, moving the blocker, free roads) stays
  // armed: cancelling it would only leave the player without highlights.
  const mandatoryPick = phaseKey === 'setup' || phaseKey === 'moveBlocker' || phaseKey === 'freeRoads';
  const dialogOpen = helpOpen || tradeOpen !== null || cardOpen !== null;

  // Esc cancels a voluntary pending board selection (not while a dialog is using Esc).
  useEffect(() => {
    if (!pending || mandatoryPick || dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, mandatoryPick, dialogOpen]);

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
    if (stage?.board) {
      const picks: Highlights = { vertices: new Set(), edges: new Set(), hexes: new Set() };
      for (const v of stage.values) {
        if (typeof v !== 'string') continue;
        if (v.startsWith('v:')) picks.vertices.add(v);
        else if (v.startsWith('e:')) picks.edges.add(v);
        else picks.hexes.add(v);
      }
      return picks;
    }
    if (!pending) return EMPTY_HIGHLIGHTS;
    const hl: Highlights = { vertices: new Set(), edges: new Set(), hexes: new Set() };
    for (const a of legal) {
      if (a.t === 'placeSettlement' && pending === 'placeSettlement') hl.vertices.add(a.v);
      else if (a.t === 'buildCity' && pending === 'buildCity') hl.vertices.add(a.v);
      else if (a.t === 'placeRoad' && pending === 'placeRoad') hl.edges.add(a.e);
      else if (a.t === 'moveBlocker' && pending === 'moveBlocker') hl.hexes.add(a.hex);
    }
    return hl;
    // `stage` is derived from `choice` on every render; `choice` is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, legal, choice]);

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

  const changeBoardMode = (m: BoardMode) => {
    setBoardMode(m);
    writeBoardMode(m);
  };

  // 3D unavailable / lost its context: switch back to the SVG board and say why.
  const boardFallback = useCallback(() => {
    setBoardMode('2d');
    writeBoardMode('2d');
    pushToast({ text: t('board3d_fallback'), kind: 'error' });
  }, [t, pushToast]);

  const closeTrade = () => setTradeOpen(null);
  const closeCard = () => setCardOpen(null);

  const winner = view.winner ? view.players.find((p) => p.id === view.winner) : undefined;

  return (
    <div className="table">
      <TopBar
        view={view}
        boardMode={sh ? '2d' : boardMode}
        onBoardMode={sh ? () => pushToast({ text: t('sh_no3d'), kind: 'info' }) : changeBoardMode}
        onHelp={() => setHelpOpen(true)} />
      <StatusBanner view={view} legal={legal} pending={pending} onCancel={() => setPending(null)} />
      <div className="table-main">
        <div className="board-area">
          <BoardSwitch
            mode={sh ? '2d' : boardMode}
            overlay={sh ? <BoardExtras pieces={view.pieces} sh={sh} /> : undefined}
            onFallback={boardFallback}
            layout={view.init.layout}
            board={view.board}
            pieces={view.pieces}
            highlights={highlights}
            onVertex={(v) => {
              if (pickOnBoard(v)) return;
              tryTarget((a) => (a.t === 'placeSettlement' || a.t === 'buildCity') && a.v === v, 'vertex');
            }}
            onEdge={(e) => {
              if (!pickOnBoard(e)) tryTarget((a) => a.t === 'placeRoad' && a.e === e, 'edge');
            }}
            onHex={(h) => {
              if (!pickOnBoard(h)) tryTarget((a) => a.t === 'moveBlocker' && a.hex === h, 'hex');
            }}
            onMiss={() => {
              if (choice && !choice.mandatory) setChoice(null);
              if (!mandatoryPick) setPending(null);
            }}
            producing={producing}
          />
          <DiceBox view={view} />
          <CostCard view={view} />
          <ToastStack toasts={toasts} />
          {choice && stage?.board && (
            <div className="sh-pickbar" role="status">
              <span>
                {choice.title}: {stagePrompt(stage.field, t)}
              </span>
              {stage.optional && (
                <Button variant="primary" onClick={() => pickValue(undefined)}>
                  {valueLabel(stage.field, undefined, t, name)}
                </Button>
              )}
              {!choice.mandatory && (
                <Button variant="ghost" onClick={() => setChoice(null)}>
                  {t('sh_cancel')}
                </Button>
              )}
            </div>
          )}
        </div>
        <aside className="sidecol">
          <PlayerCards view={view} />
          {sh && <StrongholdsPanel view={view} sh={sh} legal={legal} onStart={startChoice} />}
          <SidePanel view={view} />
        </aside>
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

      {choice && stage && !stage.board && (
        <ChoiceDialog
          title={choice.title}
          prompt={stagePrompt(stage.field, t)}
          options={stage.values.map((v) => ({ key: String(v), value: v, label: valueLabel(stage.field, v, t, name) }))}
          onPick={pickValue}
          onCancel={choice.mandatory ? undefined : () => setChoice(null)}
        />
      )}
      {sh && bagPrompt && promptKind && (
        <BagDialog
          key={promptKind + ':' + String(view.log.length)}
          title={t('shprompt_' + promptKind)}
          hint={t('sh_pickCards')}
          hand={bagHand}
          need={bagNeed}
          onSubmit={(bag) => onAction({ t: 'sh:resolve', player: view.viewer ?? 'p1', kind: promptKind, bag } as Action)}
        />
      )}

      {helpOpen && <HelpDialog view={view} onClose={() => setHelpOpen(false)} />}

      {view.winner && (
        <div className="winner-overlay" role="status" aria-live="polite">
          <div className="winner-card">
            <p className="winner-title">
              🏆 {t('winner_title', { name: name(view.winner) })}
            </p>
            <p className="winner-vp">
              <Emblem id={playerEmblem(view.winner)} size={28} color={playerColor(view.winner)} />
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
