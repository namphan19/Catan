// App root: owns the engine state, the acting viewer, and the event feed. Everything else
// renders from redacted views and legal actions.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Action, GameEvent, GameState, PlayerId } from '@hexgame/engine';
import {
  IllegalActionError,
  applyAction,
  createGame,
  getEventsView,
  getLegalActions,
  getPlayerView,
  replay,
  validateAction,
} from '@hexgame/engine';
import { I18nProvider, useI18n } from './i18n';
import { HotseatShell } from './shell/HotseatShell';
import { HomeScreen } from './shell/HomeScreen';

export default function App() {
  return (
    <I18nProvider>
      <GameApp />
    </I18nProvider>
  );
}

function GameApp() {
  const { t, lang, setLang } = useI18n();
  const [state, setState] = useState<GameState | null>(null);
  const [names, setNames] = useState<Record<PlayerId, string>>({});
  const [actor, setActor] = useState<PlayerId | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Players who can act right now, current player first (hot-seat seat switching). */
  const actors = useMemo<PlayerId[]>(() => {
    if (!state) return [];
    const ids = state.players.map((p) => p.id).filter((id) => getLegalActions(state, id).length > 0);
    const cur = state.turn.current;
    return ids.includes(cur) ? [cur, ...ids.filter((i) => i !== cur)] : ids;
  }, [state]);

  // Keep the acting viewer on someone who can act.
  useEffect(() => {
    if (!state) return;
    if (actors.length === 0) {
      setActor(null);
    } else if (!actor || !actors.includes(actor)) {
      setActor(actors[0]);
    }
  }, [state, actors, actor]);

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

  const onNew = useCallback((seed: string, playerNames: string[]) => {
    try {
      const s = createGame({ seed, playerCount: playerNames.length });
      const nm: Record<PlayerId, string> = {};
      s.players.forEach((p, i) => {
        nm[p.id] = playerNames[i];
      });
      setState(s);
      setNames(nm);
      setActor(null);
      setEvents(getEventsView([], null));
      setErrors([]);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

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
      setActor(null);
      setEvents(getEventsView([], null));
      setErrors([]);
      setError(null);
    } catch (e) {
      setError(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const exportLog = useCallback(
    () => (state ? JSON.stringify({ init: state.init, actions: state.log.map((l) => l.action) }, null, 2) : ''),
    [state],
  );

  const goHome = useCallback(() => {
    setState(null);
    setActor(null);
    setEvents([]);
    setErrors([]);
    setError(null);
  }, []);

  if (!state || !view) {
    return (
      <HomeScreen
        onNew={onNew}
        onLoad={onLoad}
        onLangToggle={() => setLang(lang === 'vi' ? 'en' : 'vi')}
        error={error}
      />
    );
  }

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
    />
  );
}
