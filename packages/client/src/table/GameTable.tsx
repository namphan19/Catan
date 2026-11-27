// The game table. Takes { view, legal, onAction, events } only (docs/UI.md) so the online
// client can reuse it. Every button, highlight and dialog option derives from getLegalActions;
// disabled reasons come from validateAction. No rules logic lives here.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BOT_TRADE_WAIT_MS, SH } from '@hexgame/engine';
import type { Action, GameEvent, PlayerId, PlayerView, StrongholdsView, Validation } from '@hexgame/engine';
import { StrongholdsPanel } from '../strongholds/StrongholdsPanel';
import { AdvanceHand } from '../strongholds/AdvanceHand';
import { BoardExtras } from '../strongholds/BoardExtras';
import { BagDialog, ChoiceDialog } from '../strongholds/ChoiceDialogs';
import { CardReveal, useReveals } from '../strongholds/CardReveal';
import { narrow, nextStage } from '../strongholds/chooser';
import { stagePrompt, valueLabel } from '../strongholds/labels';
import { TidelandsPanel } from '../tidelands/TidelandsPanel';
import { SeaExtras } from '../tidelands/SeaExtras';
import { tlOf } from '../tidelands/view';
import { HighlandsPanel } from '../highlands/HighlandsPanel';
import { hlOf } from '../highlands/labels';
import { getBoardGraph } from '../board/geom';
import { art2dUrl } from '../board/assets';
import { RaidLane, ShLevels, TrackRail, WardenLayer, WardenMenu, type WardenPick } from '../strongholds/Hud';
import { GoldPicker, ScenarioBadge, TlBuildSlots, TlSeatLine } from '../tidelands/Hud';
import { FoundMoment, HlBuildSlots, HlSeatLine } from '../highlands/Hud';
import { HlTradeDialog } from '../highlands/HighlandsPanel';
import { useI18n, resKey } from '../i18n';
import { useName } from '../shell/names';
import { playerColor, playerEmblem } from '../ui/colors';
import { Emblem } from '../ui/Emblem';
import { Button } from '../ui/Button';
import { UiIcon } from '../ui/Icon';
import { ToastStack, useToasts } from '../ui/Toast';
import { Board } from '../board/Board';
import { EMPTY_HIGHLIGHTS, type Highlights } from '../board/Highlights';
import { TopBar } from './TopBar';
import { PlayerCards } from './PlayerCards';
import { PlayerDialog } from './PlayerDialog';
import { actorOf, statusOf } from './StatusBanner';
import { DiceBox } from './DiceBox';
import { HelpDialog } from './HelpDialog';
import { HandPanel } from './HandPanel';
import { ActionBar, BuildSlot, type Pending } from './ActionBar';
import { describeEvent } from './describe';
import { DiscardDialog, StealDialog, TradeDialog, CardDialog, type TradeTab, type PickCard } from '../dialogs';

// PO 2026-11-19: the log side panel (Nhật ký / Đổi bài tabs) is removed; events still show as
// toasts and trade status in the trade dialog. The side column exists only for the expansion
// panels (Tidelands, Strongholds).

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
  /** Seats played by bots: their trade offers expire after BOT_TRADE_WAIT_MS (shown as a countdown). */
  botSeats?: readonly PlayerId[];
  /** Shell info + buttons shown inside the game's single top bar (who is viewing / room code,
   *  pass device, export log, home). PO: one header row instead of two. */
  barInfo?: ReactNode;
  barActions?: ReactNode;
  /** Extra floating UI inside the board area (online chat bubble). */
  boardOverlay?: ReactNode;
  /** The viewer unlocked the dice cheat: the action bar lets them choose their dice before rolling. */
  diceCheat?: boolean;
}

export function GameTable({ view, legal, onAction, events, validate, errors, onExport, onHome, botSeats, barInfo, barActions, boardOverlay, diceCheat }: GameTableProps) {
  const { t } = useI18n();
  const name = useName();
  const check = validate ?? (() => ({ ok: true } as Validation));
  const [toasts, pushToast] = useToasts();
  // Dice cheat just unlocked (not on a reload that already had it): say where the dice choice is.
  const cheatSeen = useRef(diceCheat);
  useEffect(() => {
    if (diceCheat && !cheatSeen.current) pushToast({ text: t('cheat_unlocked'), kind: 'gold' });
    cheatSeen.current = diceCheat;
  }, [diceCheat, pushToast, t]);
  const reveals = useReveals();
  const pushReveal = reveals.push;
  const [pending, setPending] = useState<Pending>(null);
  const [tradeTab, setTradeTab] = useState<TradeTab>('bank');
  const [tradeOpen, setTradeOpen] = useState<TradeTab | null>(null);
  const [cardOpen, setCardOpen] = useState<PickCard | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /** Phones: the side column (log, trade, expansion panels) is a bottom sheet, open or not. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState<PlayerId | null>(null);
  const [producing, setProducing] = useState<ReadonlySet<string> | undefined>(undefined);
  const phaseKey = view.phase.k;

  // ---- Tidelands expansion: sea pieces, gold picks, road-or-cog choice ---------------------------
  const tl = tlOf(view);
  const [roadOrCog, setRoadOrCog] = useState<Action[] | null>(null);
  const golds = useMemo(() => legal.filter((a) => a.t === 'tl:gold'), [legal]);
  const silkSteals = useMemo(() => legal.filter((a) => a.t === 'tl:stealSilk'), [legal]);

  // ---- Highlands expansion: tribes, goods and award powers -------------------------------------
  const hl = hlOf(view);

  // ---- Strongholds expansion: a staged chooser that narrows the legal actions ------------------
  const sh = (view.ext?.strongholds ?? null) as StrongholdsView | null;
  const [choice, setChoice] = useState<{ cands: Action[]; title: string; mandatory: boolean } | null>(null);
  const resolves = useMemo(() => legal.filter((a) => a.t === 'sh:resolve'), [legal]);
  const promptKind = (resolves[0] as { kind?: string } | undefined)?.kind ?? null;
  const bagPrompt = promptKind !== null && ['titheTake', 'dowryGive', 'sabotageDiscard'].includes(promptKind);
  useEffect(() => {
    // A new legal list ends any running choice; a prompt addressed to the viewer starts one.
    const harborWindow = view.phase.k === 'ext' ? legal.filter((a) => a.t === 'tl:placeHarbor') : [];
    // Highlands: a declined tribe's player founds the next tribe on a board spot (ends the turn).
    const foundWindow = view.phase.k === 'ext' ? legal.filter((a) => a.t === 'hl:found') : [];
    setChoice(
      resolves.length > 0 && !bagPrompt
        ? { cands: resolves, title: t('shprompt_' + String(promptKind)), mandatory: true }
        : harborWindow.length > 0
          ? { cands: harborWindow, title: t('tl_harborWindow'), mandatory: true }
          : foundWindow.length > 0
            ? { cands: foundWindow, title: t('hl_foundWindow'), mandatory: true }
            : null,
    );
    setRoadOrCog(null);
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
    setSheetOpen(false); // phones: a pick from the panel needs the board in view
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
  const viewerRef = useRef(view.viewer);
  viewerRef.current = view.viewer;
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
      // Being robbed is news for the victim: a red toast that names the lost card.
      if (ev.e === 'stole' && ev.from === viewerRef.current) {
        pushToast({
          text: ev.resource
            ? t('toast_robbedYou', { name: name(ev.to), res: t(resKey(ev.resource)) })
            : t('toast_robbedYouUnknown', { name: name(ev.to) }),
          kind: 'error',
        });
        continue;
      }
      // An advance card played by someone else is shown face up with its effect (playtest:
      // the card names alone meant nothing to the others); the viewer's own plays stay a toast.
      if (ev.e === 'ext' && ev.id === 'strongholds') {
        const d = (ev.data ?? {}) as { type?: string; player?: string; card?: string };
        if (d.type === 'played' && d.card && d.player && d.player !== viewerRef.current) {
          pushReveal(d.player, d.card);
          continue;
        }
      }
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
  }, [events, t, name, pushToast, pushReveal]);
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
  const lastPhase = useRef('');
  useEffect(() => {
    const ph = view.phase;
    // Only when the viewer is the one asked: during another player's (or a bot's) setup the
    // banner must not say "pick an edge" and the build buttons must not look armed.
    const can = (k: string) => legal.some((a) => a.t === k);
    const phaseSig = JSON.stringify(ph);
    const phaseChanged = phaseSig !== lastPhase.current;
    lastPhase.current = phaseSig;
    if (ph.k === 'setup') {
      const k = ph.step === 'road' ? 'placeRoad' : 'placeSettlement';
      setPending(can(k) || (k === 'placeRoad' && can('tl:buildShip')) ? k : null);
    } else if (ph.k === 'moveBlocker') setPending(can('moveBlocker') || can('tl:moveCorsair') ? 'moveBlocker' : null);
    else if (ph.k === 'freeRoads') setPending(can('placeRoad') || can('tl:buildShip') ? 'placeRoad' : null);
    else if (phaseChanged) setPending(null);
    // A voluntary pick (the player pressed "Build road") survives unrelated updates such as a
    // trade answer, and is dropped only once that build is no longer possible.
    else setPending((p) => (p && !can(p) ? null : p));
  }, [phaseKey, view.phase, legal]);

  // A pick the phase itself demands (setup placement, moving the blocker, free roads) stays
  // armed: cancelling it would only leave the player without highlights.
  const mandatoryPick = phaseKey === 'setup' || phaseKey === 'moveBlocker' || phaseKey === 'freeRoads';
  const dialogOpen = helpOpen || tradeOpen !== null || cardOpen !== null || playerOpen !== null;

  // The phone utility sheet behaves like a modal panel: Esc and the board backdrop both close it.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

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

  // Open the trade dialog the moment an offer needs an answer; re-arm on each new offer. PO
  // 2026-11-18: it always pops up, also when the viewer lacks the cards (then only "decline" or a
  // counter is possible, and the dialog says why accepting is greyed out).
  const offerKey = view.trade
    ? `${view.trade.from}:${JSON.stringify(view.trade.give)}:${JSON.stringify(view.trade.get)}`
    : '';
  const canAcceptOffer = legal.some((a) => a.t === 'respondTrade' && (a as { accept?: boolean }).accept === true);
  const lastOffer = useRef('');
  // True while the dialog is open only because an offer asked for an answer: when that offer is gone
  // (cancelled, or settled with someone else) the dialog closes itself instead of showing nothing.
  const autoOpened = useRef(false);
  // When the viewer's own offer ends (settled or cancelled) the players tab has nothing left to show.
  const myOfferOpen = !!view.trade && view.trade.from === view.viewer;
  const hadMyOffer = useRef(false);
  useEffect(() => {
    if (mustRespond && offerKey && offerKey !== lastOffer.current) {
      setTradeOpen('players');
      setTradeTab('players');
      autoOpened.current = true;
    } else if (!offerKey && autoOpened.current) {
      setTradeOpen(null);
      autoOpened.current = false;
    }
    lastOffer.current = offerKey; // cleared when the offer ends, so the next offer opens again
  }, [mustRespond, offerKey]);
  useEffect(() => {
    if (hadMyOffer.current && !myOfferOpen) setTradeOpen(null);
    hadMyOffer.current = myOfferOpen;
  }, [myOfferOpen]);
  // Outside the viewer's own action phase with no offer on the table the dialog can only say
  // "only the active player may trade": close it instead of leaving an empty dialog behind
  // (seen in the playtest when a bot's offer ended between two of its moves).
  const actingNow = actorOf(view) === view.viewer;
  useEffect(() => {
    if (tradeOpen && !view.trade && !actingNow) {
      autoOpened.current = false;
      setTradeOpen(null);
    }
  }, [tradeOpen, view.trade, actingNow]);

  // A steal with a single possible victim is not a choice: take the card right away.
  const stealTargets = legal.filter((a) => a.t === 'steal');
  const autoStolen = useRef('');
  useEffect(() => {
    if (stealTargets.length !== 1 || silkSteals.length > 0) return;
    const key = `${view.log?.length ?? 0}:${JSON.stringify(stealTargets[0])}`;
    if (autoStolen.current === key) return;
    autoStolen.current = key;
    onAction(stealTargets[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal]);

  // A bot's offer expires BOT_TRADE_WAIT_MS after it appeared (the bot driver uses the same clock).
  const offerSeen = useRef<{ key: string; at: number } | null>(null);
  const offerOwner = view.trade?.from ?? '';
  if (!offerKey) offerSeen.current = null;
  else if (offerSeen.current?.key !== offerKey) offerSeen.current = { key: offerKey, at: Date.now() };
  // (Only while the viewer could accept: otherwise the bot settles after a short grace.)
  const offerDeadline =
    offerSeen.current && botSeats?.includes(offerOwner) && canAcceptOffer
      ? offerSeen.current.at + BOT_TRADE_WAIT_MS
      : null;

  const highlights = useMemo<Highlights>(() => {
    if (stage?.board) {
      const picks: Highlights = { vertices: new Set(), edges: new Set(), hexes: new Set() };
      for (const v of stage.values) {
        if (typeof v !== 'string') continue;
        if (v.startsWith('v:')) picks.vertices.add(v);
        else if (v.startsWith('e:')) picks.edges.add(v);
        else picks.hexes.add(v);
      }
      // A moving piece settled earlier (picked, or the only one that can move): mark where it stands now.
      const from = choice?.cands.map((a) => (a as { from?: unknown }).from);
      if (from?.length && typeof from[0] === 'string' && /^[ve]:/.test(from[0]) && from.every((f) => f === from[0]))
        picks.chosen = new Set([from[0]]);
      return picks;
    }
    if (!pending) return EMPTY_HIGHLIGHTS;
    const hl: Highlights = { vertices: new Set(), edges: new Set(), hexes: new Set() };
    // Setup and free-road windows take a road or a cog: both kinds of edges light up together.
    const roadOrShip = pending === 'placeRoad' && (phaseKey === 'setup' || phaseKey === 'freeRoads');
    for (const a of legal) {
      if (a.t === 'placeSettlement' && pending === 'placeSettlement') hl.vertices.add(a.v);
      else if (a.t === 'buildCity' && pending === 'buildCity') hl.vertices.add(a.v);
      else if (a.t === 'placeRoad' && pending === 'placeRoad') hl.edges.add(a.e);
      else if (a.t === 'moveBlocker' && pending === 'moveBlocker') hl.hexes.add(a.hex);
      else if (a.t === 'tl:moveCorsair' && pending === 'moveBlocker') hl.hexes.add(String((a as { hex?: string }).hex));
      else if (a.t === 'tl:buildShip' && (pending === 'tl:buildShip' || roadOrShip)) hl.edges.add(String((a as { e?: string }).e));
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

  const closeTrade = () => {
    autoOpened.current = false;
    setTradeOpen(null);
  };
  const closeCard = () => setCardOpen(null);

  // Only while the board itself asks for a pick (setup, a build, the blocker, free roads) a small
  // hint floats over the board; everything else is said by the dialogs and the pulsing buttons.
  const hintStatus = statusOf(view, legal, pending, t, name);
  const boardHint =
    hintStatus.mine && (pending !== null || phaseKey === 'setup' || phaseKey === 'freeRoads' || phaseKey === 'moveBlocker')
      ? hintStatus
      : null;

  const winner = view.winner ? view.players.find((p) => p.id === view.winner) : undefined;
  // Why the game ended: VP by default; Great Works can end on a finished wonder, Silk on empty villages,
  // both below the VP target, so "reached 6 victory points" would read like a bug.
  const winVP = winner?.vp ?? winner?.publicVP ?? 0;
  const winWonder = view.winner && tl?.works ? Object.keys(tl.works.claims).find((w) => tl.works!.claims[w] === view.winner) : undefined;
  const winReason = hl
    ? t('hl_winCulture', { n: winVP })
    : winWonder && (tl?.works?.levels[view.winner ?? ''] ?? 0) >= 4
      ? t('tl_winWonder', { wonder: t(`wonder_${winWonder}`), n: winVP })
      : tl?.silk && winVP < view.init.vpToWin
        ? t('tl_winSilk', { n: winVP })
        : t('winner_vp', { n: winVP });

  // Strongholds: a click on one of the viewer's wardens opens its actions around it.
  const [wardenAt, setWardenAt] = useState<WardenPick | null>(null);
  useEffect(() => setWardenAt(null), [legal]);
  // Highlands: the goods-set / caravan dialog (opened from the build row).
  const [hlDialog, setHlDialog] = useState<'hl:goodsSet' | 'hl:caravan' | null>(null);
  const boardBusy = pending !== null || (!!choice && !!stage?.board);

  // The guidance line under the turn label: a running board choice, a board pick (with Cancel),
  // or simply what the viewer can do / whom the table waits for.
  const guide =
    choice && stage?.board ? (
      <div className="hud-guide sh-pickbar" role="status">
        <span>
          {choice.title}: {choice.cands[0]?.t.startsWith('tl:') ? t('tl_pick_' + stage.field) : stagePrompt(stage.field, t)}
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
    ) : boardHint ? (
      <div className="hud-guide board-hint" role="status">
        <span>{boardHint.text}</span>
        {boardHint.cancellable && (
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t('status_cancel')}
          </Button>
        )}
      </div>
    ) : (
      <p className="hud-guide" data-mine={hintStatus.mine ? 'true' : 'false'} role="status" aria-live="polite">
        {hintStatus.text}
      </p>
    );

  // Strongholds builds next to the base ones: rampart and recruiting a warden.
  const meHand = view.players.find((p) => p.id === view.viewer)?.hand;
  const shOf = (tt: string) => legal.filter((a) => a.t === tt);
  const shBuild = sh ? (
    <>
      <BuildSlot
        icon={<img src={art2dUrl('piece', 'rampart')} alt="" width={34} height={34} />}
        label={t('shact_rampart')}
        note={t('shhud_rampartNote')}
        cost={SH.costs.rampart as Record<string, number>}
        hand={meHand}
        enabled={shOf('sh:rampart').length > 0}
        reason={t('shcost_rampart')}
        onClick={() => startChoice(shOf('sh:rampart'), t('shact_rampart'))}
        data="rampart"
      />
      <BuildSlot
        icon={<img src={art2dUrl('piece', 'warden')} alt="" width={32} height={32} />}
        label={t('shact_recruit')}
        cost={SH.costs.warden as Record<string, number>}
        hand={meHand}
        enabled={shOf('sh:recruit').length > 0}
        reason={t('shcost_recruit')}
        onClick={() => startChoice(shOf('sh:recruit'), t('shact_recruit'))}
        data="recruit"
      />
    </>
  ) : undefined;
  const extraBuild =
    sh || tl || hl ? (
      <>
        {tl && <TlBuildSlots view={view} tl={tl} legal={legal} onStart={startChoice} onAction={onAction} />}
        {shBuild}
        {hl && <HlBuildSlots view={view} hl={hl} legal={legal} onAction={onAction} onDialog={setHlDialog} />}
      </>
    ) : undefined;
  // Under each player's name: what the expansions track per player.
  const seatExtra =
    sh || tl || hl
      ? (id: string) => (
          <>
            {sh && <ShLevels sh={sh} id={id} />}
            {tl && <TlSeatLine tl={tl} id={id} />}
            {hl && <HlSeatLine hl={hl} id={id} />}
          </>
        )
      : undefined;
  const founding = choice?.cands[0]?.t === 'hl:found';

  // Expansion panels are drawers on every screen: the HUD shows their essentials, the drawer the rest.
  const hasSide = !!(sh || tl || hl);
  const tableClass = `table hud${sh ? ' has-sh' : ''}${tl ? ' has-tl' : ''}${hl ? ' has-hl' : ''}${hasSide ? ' has-drawer' : ''}`;

  return (
    <div className={tableClass} data-sheet={sheetOpen ? 'open' : undefined}>
      <div className="table-main">
        <div className="board-area">
          <Board
            overlay={
              sh || tl ? (
                <>
                  {tl && <SeaExtras graph={getBoardGraph(view.init.layout)} pieces={view.pieces} tl={tl} />}
                  {sh && <BoardExtras pieces={view.pieces} sh={sh} />}
                </>
              ) : undefined
            }
            overlayTop={
              sh ? (
                <WardenLayer legal={legal} open={wardenAt} setOpen={setWardenAt} enabled={!boardBusy} />
              ) : undefined
            }
            layout={view.init.layout}
            board={view.board}
            pieces={view.pieces}
            highlights={highlights}
            onVertex={(v) => {
              if (pickOnBoard(v)) return;
              tryTarget((a) => (a.t === 'placeSettlement' || a.t === 'buildCity') && a.v === v, 'vertex');
            }}
            onEdge={(e) => {
              if (pickOnBoard(e)) return;
              const roadOk = pending === 'placeRoad';
              const shipOk = pending === 'tl:buildShip' || (roadOk && (phaseKey === 'setup' || phaseKey === 'freeRoads'));
              const cands = legal.filter(
                (a) => (a as { e?: string }).e === e && ((roadOk && a.t === 'placeRoad') || (shipOk && a.t === 'tl:buildShip')),
              );
              if (cands.length > 1) setRoadOrCog(cands);
              else tryTarget((a) => cands.includes(a), 'edge');
            }}
            onHex={(h) => {
              if (!pickOnBoard(h))
                tryTarget((a) => (a.t === 'moveBlocker' || a.t === 'tl:moveCorsair') && (a as { hex?: string }).hex === h, 'hex');
            }}
            onMiss={() => {
              setWardenAt(null);
              if (choice && !choice.mandatory) setChoice(null);
              if (!mandatoryPick) setPending(null);
            }}
            producing={producing}
          />
          {/* Dark scrims on the edges: the HUD reads on any part of the map (display only). */}
          <span className="hud-scrim hud-scrim-top" aria-hidden="true" />
          <span className="hud-scrim hud-scrim-left" aria-hidden="true" />
          <span className="hud-scrim hud-scrim-bottom" aria-hidden="true" />
          {sh && <span className="hud-scrim hud-scrim-right" aria-hidden="true" />}

          <TopBar
            view={view}
            info={barInfo}
            actions={barActions}
            onHelp={() => setHelpOpen(true)}
            guide={guide}
            badge={tl ? <ScenarioBadge view={view} tl={tl} /> : undefined}
          />
          <div className="seat-strip">
            <PlayerCards view={view} onSelect={setPlayerOpen} extra={seatExtra} />
          </div>
          <div className="hud-tr">
            <DiceBox view={view} sh={sh} />
            {sh && <RaidLane view={view} sh={sh} />}
          </div>
          {sh && view.viewer && (
            <TrackRail view={view} sh={sh} legal={legal} onStart={startChoice} onPanel={() => setSheetOpen(true)} />
          )}
          {/* The expansion panel: a drawer (Strongholds, and every expansion on phones). */}
          {hasSide && (
            <button
              type="button"
              className="hud-icon sheet-toggle"
              aria-expanded={sheetOpen}
              aria-controls="expansion-sheet"
              aria-label={t('sheet_open')}
              title={t('sheet_open')}
              onClick={() => setSheetOpen((o) => !o)}
            >
              <UiIcon name="sheet" size={18} />
              <span className="sheet-toggle-text">{t('sheet_open')}</span>
            </button>
          )}
          {sh && wardenAt && !boardBusy && (
            <WardenMenu legal={legal} open={wardenAt} onClose={() => setWardenAt(null)} onStart={startChoice} />
          )}
          {founding && <FoundMoment />}
          {golds.length > 0 && view.viewer && (
            <GoldPicker key={'gold:' + String(view.log.length)} golds={golds} onAction={onAction} />
          )}
          <ToastStack toasts={toasts} />
          {boardOverlay}
          {reveals.current && <CardReveal reveal={reveals.current} onClose={reveals.close} t={t} name={name} />}
          <div className="table-bottom">
            <HandPanel view={view} extraLabel={sh ? t('shhud_commodities') : hl ? t('hlhud_goodsLabel') : undefined} />
            {sh && <AdvanceHand view={view} sh={sh} legal={legal} onStart={startChoice} />}
            <ActionBar
              view={view}
              legal={legal}
              onAction={onAction}
              validate={validate}
              pending={pending}
              setPending={setPending}
              onOpenTrade={(tab) => {
                setTradeTab(tab);
                autoOpened.current = false;
                setTradeOpen(tab);
              }}
              onOpenCards={(c) => setCardOpen(c)}
              diceCheat={diceCheat}
              extraBuild={extraBuild}
            />
          </div>
        </div>
        {hasSide && (
          <>
            <button
              type="button"
              className="sheet-backdrop"
              aria-label={t('sheet_close')}
              tabIndex={-1}
              onClick={() => setSheetOpen(false)}
            />
            <aside className="sidecol" id="expansion-sheet" aria-label={t('sheet_open')}>
              <button type="button" className="btn btn-ghost sheet-close" onClick={() => setSheetOpen(false)}>
                <UiIcon name="close" size={16} /> {t('sheet_close')}
              </button>
              {tl && (
                <TidelandsPanel
                  view={view}
                  tl={tl}
                  legal={legal}
                  onPick={(p) => {
                    setSheetOpen(false);
                    setChoice(null);
                    setPending(pending === p ? null : (p as 'tl:buildShip'));
                  }}
                  onStart={startChoice}
                  onAction={(a) => {
                    setSheetOpen(false);
                    onAction(a);
                  }}
                />
              )}
              {sh && <StrongholdsPanel view={view} sh={sh} legal={legal} onStart={startChoice} />}
              {hl && (
                <HighlandsPanel
                  view={view}
                  hl={hl}
                  legal={legal}
                  onAction={(a) => {
                    setSheetOpen(false);
                    onAction(a);
                  }}
                />
              )}
            </aside>
          </>
        )}
      </div>

      {mustDiscard && <DiscardDialog view={view} legal={legal} validate={check} onAction={onAction} onClose={() => {}} />}
      {mustSteal && !mustDiscard && stealTargets.length > 1 && silkSteals.length === 0 && (
        <StealDialog view={view} legal={legal} onAction={onAction} onClose={() => {}} />
      )}
      {silkSteals.length > 0 && (
        <ChoiceDialog
          title={t('tl_stealTitle')}
          prompt={t('tl_stealTitle')}
          options={[...stealTargets, ...silkSteals].map((a, i) => {
            const target = String((a as { target?: string }).target);
            return { key: String(i), value: a, label: t(a.t === 'steal' ? 'tl_stealRes' : 'tl_stealSilk', { name: name(target) }) };
          })}
          onPick={(a) => onAction(a as Action)}
        />
      )}
      {roadOrCog && (
        <ChoiceDialog
          title={t('tl_roadOrCog')}
          prompt={t('tl_roadOrCog')}
          options={roadOrCog.map((a) => ({ key: a.t, value: a, label: t(a.t === 'placeRoad' ? 'tl_road' : 'tl_ship') }))}
          onPick={(a) => {
            setRoadOrCog(null);
            setPending(null);
            onAction(a as Action);
          }}
          onCancel={() => setRoadOrCog(null)}
        />
      )}
      {tradeOpen && !mustDiscard && (
        <TradeDialog
          view={view}
          legal={legal}
          validate={check}
          onAction={onAction}
          tab={tradeTab}
          setTab={setTradeTab}
          onClose={closeTrade}
          offerDeadline={offerDeadline}
          docked={!actingNow && !!view.trade}
        />
      )}
      {cardOpen && !mustDiscard && !mustSteal && (
        <CardDialog
          card={cardOpen}
          legal={legal}
          onAction={(a) => {
            onAction(a);
            closeCard(); // the card is played: its choices are gone, so close instead of showing "no options"
          }}
          onClose={closeCard}
        />
      )}

      {choice && stage && !stage.board && (
        <ChoiceDialog
          title={choice.title}
          prompt={choice.cands[0]?.t.startsWith('tl:') ? t('tl_pick_' + stage.field) : stagePrompt(stage.field, t)}
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

      {hlDialog && (
        <HlTradeDialog kind={hlDialog} view={view} legal={legal} onAction={onAction} onClose={() => setHlDialog(null)} />
      )}
      {helpOpen && <HelpDialog view={view} onClose={() => setHelpOpen(false)} />}
      {playerOpen && <PlayerDialog view={view} playerId={playerOpen} onClose={() => setPlayerOpen(null)} />}

      {view.winner && (
        <div className="winner-overlay" role="status" aria-live="polite">
          <div className="winner-card">
            <p className="winner-title">
              {t('winner_title', { name: name(view.winner) })}
            </p>
            <p className="winner-vp">
              <Emblem id={playerEmblem(view.winner)} size={28} color={playerColor(view.winner)} />
              {/* ink text: the emblem carries the seat colour (ivory p3 is unreadable on the card) */}
              <span>{name(view.winner)}</span>{' '}
              {winReason}
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
