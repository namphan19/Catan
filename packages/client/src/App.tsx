// App root: routes between the home menu, the hot-seat game, and the online client.
// The online shell renders everything from server messages (docs/PROTOCOL.md); the hot-seat
// path owns the engine state locally. Everything else renders from redacted views.
// Local games may seat bots: they run in the browser (engine planBot) and decide only from their own
// redacted view; the screen always shows a human seat's view, never a bot's.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, BotLevel, GameEvent, GameState, PlayerId } from '@hexgame/engine';
import {
  IllegalActionError,
  botTradeWaitMs,
  applyAction,
  createGame,
  getEventsView,
  getLegalActions,
  getPlayerView,
  planBot,
  replay,
  validateAction,
} from '@hexgame/engine';
import { I18nProvider, useI18n } from './i18n';
import { HotseatShell } from './shell/HotseatShell';
import { HomeScreen, type GameSetup } from './shell/HomeScreen';
import { OnlineShell, forgetStoredRoom } from './shell/OnlineShell';

type Mode = 'menu' | 'hotseat' | 'online';

/** Pause before a bot move, so the human can follow (ms). */
const BOT_DELAY_MS = 600;
/** Thinking time of an 'expert' bot per searched decision (ms). */
const BOT_THINK_MS = 1500;
/** Search slice: the page stays responsive between slices. */
const BOT_SLICE_MS = 12;

export default function App() {
  return (
    <I18nProvider>
      <GameApp />
    </I18nProvider>
  );
}

function GameApp() {
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState<Mode>('menu');
  const [state, setState] = useState<GameState | null>(null);
  const [names, setNames] = useState<Record<PlayerId, string>>({});
  const [bots, setBots] = useState<Record<PlayerId, BotLevel>>({});
  const [actor, setActor] = useState<PlayerId | null>(null);
  const [thinking, setThinking] = useState<PlayerId | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hasBots = Object.keys(bots).length > 0;
  const botSeats = useMemo(() => Object.keys(bots), [bots]);

  /** Players who can act right now, current player first (hot-seat seat switching). */
  const actors = useMemo<PlayerId[]>(() => {
    if (!state) return [];
    const ids = state.players.map((p) => p.id).filter((id) => getLegalActions(state, id).length > 0);
    const cur = state.turn.current;
    return ids.includes(cur) ? [cur, ...ids.filter((i) => i !== cur)] : ids;
  }, [state]);

  // Keep the viewer on a human who can act. With bots, the view stays on a human seat even while
  // bots move (it must never show a bot's hidden cards).
  useEffect(() => {
    if (!state) return;
    if (hasBots) {
      const humanActors = actors.filter((id) => !bots[id]);
      if (humanActors.length) {
        if (!actor || !humanActors.includes(actor)) setActor(humanActors[0]);
      } else if (!actor || bots[actor]) {
        setActor(state.players.map((p) => p.id).find((id) => !bots[id]) ?? null);
      }
      return;
    }
    if (actors.length === 0) {
      // Nobody can act (the game is over): keep the table on the last viewer, or the winner's seat,
      // so the winner dialog shows instead of falling back to the home screen.
      if (!actor) setActor(state.winner ?? state.turn.current);
    } else if (!actor || !actors.includes(actor)) {
      setActor(actors[0]);
    }
  }, [state, actors, actor, bots, hasBots]);

  // (hot-seat only; the online client lets the server decide who acts)
  const legal = useMemo(() => (state && actor ? getLegalActions(state, actor) : []), [state, actor]);
  const view = useMemo(() => (state && actor ? getPlayerView(state, actor) : null), [state, actor]);
  const validate = useCallback(
    (a: Action) => (state ? validateAction(state, a) : { ok: false, code: 'NO_GAME', message: 'No game.' }),
    [state],
  );

  const doAction = useCallback(
    (a: Action) => {
      if (!state) return;
      try {
        const { state: next, events: batch } = applyAction(state, a);
        const redacted = getEventsView(batch, actor ?? null);
        setEvents((evs) => [...evs, ...redacted]);
        setState(next);
        setError(null);
      } catch (e) {
        const msg = e instanceof IllegalActionError ? `${e.code}: ${e.message}` : String(e);
        const text = t('toast_illegal', { msg });
        setErrors((es) => [...es, text]);
        setError(text);
      }
    },
    [state, actor, t],
  );
  const doActionRef = useRef(doAction);
  doActionRef.current = doAction;

  // When the open trade offer was made (bots settle their own offers after botTradeWaitMs).
  const tradeSince = useRef<number | null>(null);
  const hadTrade = useRef(false);
  useEffect(() => {
    const open = !!state?.trade;
    if (open && !hadTrade.current) tradeSince.current = Date.now();
    if (!open) tradeSince.current = null;
    hadTrade.current = open;
  }, [state]);

  // Bot driver: after every state change, let one bot act (responders first, then the current player).
  // Expert searches run in short slices; a newer state cancels whatever is pending.
  useEffect(() => {
    if (mode !== 'hotseat' || !state || state.winner || !hasBots) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cur = state.turn.current;
    const order = Object.keys(bots).sort((a, b) => Number(a === cur) - Number(b === cur));
    const play = (a: Action | null) => {
      setThinking(null);
      if (!cancelled && a) doActionRef.current(a);
    };
    const run = () => {
      if (cancelled) return;
      const waited = tradeSince.current === null ? 0 : Date.now() - tradeSince.current;
      const tradeWait = state.trade ? botTradeWaitMs(state, (pid) => !!bots[pid]) : 0;
      for (const id of order) {
        const plan = planBot(state, id, {
          level: bots[id],
          // Settle the own offer when the wait is over (shorter when no human could accept it).
          tradeTimedOut: state.trade?.from === id && waited >= tradeWait,
          search: { timeMs: BOT_THINK_MS, clock: () => performance.now() },
        });
        if (plan.kind === 'search') {
          setThinking(id);
          const tick = () => {
            if (cancelled) return;
            if (!plan.run.step(BOT_SLICE_MS)) {
              timer = setTimeout(tick, 0);
              return;
            }
            play(plan.finish());
          };
          tick();
          return;
        }
        if (plan.action) {
          play(plan.action);
          return;
        }
      }
      // A bot waits for answers to its own offer: look again when the wait runs out.
      if (state.trade && bots[state.trade.from]) timer = setTimeout(run, Math.max(100, tradeWait - waited));
    };
    timer = setTimeout(run, BOT_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setThinking(null);
    };
  }, [mode, state, bots, hasBots]);

  const onNew = useCallback(
    (seed: string, playerNames: string[], setup: GameSetup = { strongholds: false, tidelands: null }, seatBots: (BotLevel | null)[] = []) => {
      try {
        const rulesets = setup.highlands
          ? ['base', 'highlands']
          : ['base', ...(setup.strongholds ? ['strongholds'] : []), ...(setup.tidelands ? ['tidelands'] : [])];
        const s = createGame({
          seed,
          playerCount: playerNames.length,
          ...(rulesets.length > 1 ? { rulesets } : {}),
          ...(setup.highlands ? { options: { map: setup.highlands } } : setup.tidelands ? { options: { scenario: setup.tidelands } } : {}),
        });
        const nm: Record<PlayerId, string> = {};
        const bt: Record<PlayerId, BotLevel> = {};
        s.players.forEach((p, i) => {
          nm[p.id] = playerNames[i];
          const level = seatBots[i];
          if (level) bt[p.id] = level;
        });
        setState(s);
        setNames(nm);
        setBots(bt);
        setActor(null);
        setEvents(getEventsView([], null));
        setErrors([]);
        setError(null);
        setMode('hotseat');
      } catch (e) {
        setError(String(e));
      }
    },
    [],
  );

  const onLoad = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text) as { init?: unknown; actions?: unknown };
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !parsed.init ||
        typeof parsed.init !== 'object' ||
        !Array.isArray(parsed.actions)
      ) {
        throw new Error('expected JSON of shape {"init": ..., "actions": [...]}');
      }
      const s = replay(parsed.init as Parameters<typeof replay>[0], parsed.actions as Action[]);
      const nm: Record<PlayerId, string> = {};
      s.players.forEach((p, i) => {
        nm[p.id] = nm[p.id] ?? `p${i + 1}`;
      });
      setState(s);
      setNames(nm);
      setBots({});
      setActor(null);
      setEvents(getEventsView([], null));
      setErrors([]);
      setError(null);
      setMode('hotseat');
    } catch (e) {
      setError(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const exportLog = useCallback(
    () => (state ? JSON.stringify({ init: state.init, actions: state.log.map((l) => l.action) }, null, 2) : ''),
    [state],
  );

  const goHome = useCallback(() => {
    setMode('menu');
    setState(null);
    setBots({});
    setActor(null);
    setEvents([]);
    setErrors([]);
    setError(null);
  }, []);

  const goMenu = useCallback(() => setMode('menu'), []);
  const goOnline = useCallback((fresh = false) => {
    if (fresh) forgetStoredRoom();
    setMode('online');
  }, []);
  const toggleLang = useCallback(() => setLang(lang === 'vi' ? 'en' : 'vi'), [lang, setLang]);

  if (mode === 'online') {
    return <OnlineShell onHome={goMenu} onLangToggle={toggleLang} />;
  }

  if (mode === 'hotseat' && state && view) {
    return (
      <HotseatShell
        names={names}
        view={view}
        legal={legal}
        onAction={doAction}
        events={events}
        validate={validate}
        errors={errors}
        exportLog={exportLog}
        onHome={goHome}
        thinking={thinking}
        botSeats={botSeats}
      />
    );
  }

  return <HomeScreen onNew={onNew} onLoad={onLoad} onOnline={goOnline} onLangToggle={toggleLang} error={error} />;
}
