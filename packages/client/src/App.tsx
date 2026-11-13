import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Action, GameState, PlayerId } from '@hexgame/engine';
import {
  IllegalActionError,
  applyAction,
  createGame,
  getEventsView,
  getLegalActions,
  getPlayerView,
  replay,
} from '@hexgame/engine';
import { describeAction, describeEvent } from './labels';
import BoardSvg from './BoardSvg';
import StartScreen from './StartScreen';
import ActionPanel from './ActionPanel';
import SidePanel from './SidePanel';
import LogPanel from './LogPanel';

/** Players who currently have at least one legal action, current player first. */
function actorIds(s: GameState): PlayerId[] {
  const ids = s.players.map((p) => p.id).filter((id) => getLegalActions(s, id).length > 0);
  const cur = s.turn.current;
  return ids.includes(cur) ? [cur, ...ids.filter((i) => i !== cur)] : ids;
}

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [actor, setActor] = useState<PlayerId | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);

  // Keep the selected actor valid: fall back to the first player who can act.
  useEffect(() => {
    if (!state) return;
    const ids = actorIds(state);
    if (ids.length === 0) {
      setActor(null);
      return;
    }
    if (!actor || !ids.includes(actor)) setActor(ids[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const legal = useMemo(
    () => (state && actor ? getLegalActions(state, actor) : []),
    [state, actor],
  );
  const view = useMemo(
    () => (state && actor ? getPlayerView(state, actor) : null),
    [state, actor],
  );

  const doAction = useCallback(
    (a: Action) => {
      if (!state) return;
      try {
        const { state: next, events } = applyAction(state, a);
        const batch = [
          `\u25B8 ${actor ?? '?'}: ${describeAction(a)}`,
          ...getEventsView(events, actor ?? null).map(describeEvent),
        ];
        // Newest lines at the top: the last event of the newest action goes first.
        setLines((ls) => [...batch.reverse(), ...ls]);
        setState(next);
        setError(null);
      } catch (e) {
        const msg = e instanceof IllegalActionError ? `${e.code}: ${e.message}` : String(e);
        setError(`Illegal move: ${msg}`);
        setLines((ls) => [`\u2717 illegal: ${msg}`, ...ls]);
      }
    },
    [state, actor],
  );

  const tryTarget = useCallback(
    (kind: string, pred: (a: Action) => boolean) => {
      const a = legal.find(pred);
      if (a) doAction(a);
      else setError(`That ${kind} is not a legal spot for ${actor ?? '?'} — pick a highlighted one.`);
    },
    [legal, doAction, actor],
  );

  const highlights = useMemo(() => {
    const vertices = new Set<string>();
    const edges = new Set<string>();
    const hexes = new Set<string>();
    for (const a of legal) {
      if (a.t === 'placeSettlement' || a.t === 'buildCity') vertices.add(a.v);
      else if (a.t === 'placeRoad') edges.add(a.e);
      else if (a.t === 'moveBlocker') hexes.add(a.hex);
    }
    return { vertices, edges, hexes };
  }, [legal]);

  const onNew = useCallback((seed: string, count: number) => {
    try {
      const s = createGame({ seed, playerCount: count });
      setState(s);
      setActor(null);
      setError(null);
      setExportText(null);
      setLines([
        `new game: seed "${s.init.seed}", ${s.init.playerCount} players, layout ${s.init.layout}, ${s.init.vpToWin} VP to win`,
      ]);
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
      setState(s);
      setActor(null);
      setError(null);
      setExportText(null);
      setLines([`loaded log: ${parsed.actions.length} actions replayed (seed "${s.init.seed}")`]);
    } catch (e) {
      setError(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  if (!state) {
    return <StartScreen onNew={onNew} onLoad={onLoad} error={error} />;
  }

  const ids = actorIds(state);

  return (
    <div className="app">
      <main className="board" aria-label="Game board">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {state.winner && (
          <div className="banner" role="status">
            🏆 {state.winner} wins! Use "Export log" to save the game.
          </div>
        )}
        <BoardSvg
          state={state}
          hl={highlights}
          onVertex={(v) => {
            setError(null);
            tryTarget('vertex', (a) => (a.t === 'placeSettlement' || a.t === 'buildCity') && a.v === v);
          }}
          onEdge={(e) => {
            setError(null);
            tryTarget('edge', (a) => a.t === 'placeRoad' && a.e === e);
          }}
          onHex={(h) => {
            setError(null);
            tryTarget('hex', (a) => a.t === 'moveBlocker' && a.hex === h);
          }}
          onMiss={() => setError('Nothing to do there. Click a highlighted vertex, edge or hex.')}
        />
      </main>
      <aside className="side">
        <nav className="tabs" role="tablist" aria-label="Player who acts">
          {ids.length === 0 ? (
            <span className="hint">no player can act</span>
          ) : (
            ids.map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={id === actor}
                className="tab"
                onClick={() => setActor(id)}
              >
                {id}
                {id === state.turn.current ? ' \u25CF' : ''}
              </button>
            ))
          )}
        </nav>
        <ActionPanel actor={actor} legal={legal} onAction={doAction} />
        <SidePanel view={view} />
        <LogPanel lines={lines} />
        <div className="footer">
          <button
            onClick={() =>
              setExportText(
                JSON.stringify(
                  { init: state.init, actions: state.log.map((l) => l.action) },
                  null,
                  2,
                ),
              )
            }
          >
            Export log
          </button>
          <button
            onClick={() => {
              setState(null);
              setActor(null);
              setLines([]);
              setExportText(null);
              setError(null);
            }}
          >
            New game
          </button>
        </div>
        {exportText !== null && (
          <div className="modal" role="dialog" aria-label="Exported game log">
            <div>Game log JSON (copy this):</div>
            <textarea
              readOnly
              rows={10}
              value={exportText}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button onClick={() => setExportText(null)}>Close</button>
          </div>
        )}
      </aside>
    </div>
  );
}
