// Placeholder for the authoritative WebSocket server (networking is out of scope for milestone 1).
// Contract it will follow: the server keeps the full GameState, validates every incoming action with
// the engine, and only ever sends redacted views/events to each client.
import {
  applyAction, getEventsView, getPlayerView, validateAction,
  type Action, type GameEvent, type GameState, type PlayerId, type PlayerView,
} from '@hexgame/engine';

export interface Outgoing {
  to: PlayerId;
  view: PlayerView;
  events: GameEvent[];
}

/** Apply one client action and build the per-player messages (never the raw state). */
export function handleAction(state: GameState, from: PlayerId, action: Action) {
  if (action.player !== from) return { state, error: { code: 'IMPERSONATION', message: 'player mismatch' } };
  const v = validateAction(state, action);
  if (!v.ok) return { state, error: { code: v.code, message: v.message } };
  const { state: next, events } = applyAction(state, action);
  const out: Outgoing[] = next.players.map((p) => ({
    to: p.id,
    view: getPlayerView(next, p.id),
    events: getEventsView(events, p.id),
  }));
  return { state: next, out };
}
