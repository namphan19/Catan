// Redacted views. The server must only ever send these, never a raw GameState.
import type { Bag, CardId, GameEvent, GameInit, GameState, PlayerId } from './types';
import { bagTotal } from './bag';
import { victoryPoints } from './engine';

export interface PublicPlayer {
  id: PlayerId;
  handCount: number;
  cardCount: number;
  played: Record<CardId, number>;
  supply: Record<string, number>;
  publicVP: number;
  /** Present only for the viewer. */
  hand?: Bag;
  cards?: CardId[];
  newCards?: CardId[];
  vp?: number;
}

export interface PlayerView {
  viewer: PlayerId | null;
  init: Omit<GameInit, 'seed'>;
  board: GameState['board'];
  pieces: GameState['pieces'];
  players: PublicPlayer[];
  bank: { hand: Bag; deckCount: number };
  phase: GameState['phase'];
  turn: GameState['turn'];
  trade?: GameState['trade'];
  awards: GameState['awards'];
  log: GameState['log'];
  winner?: PlayerId;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * View for one player (or a spectator with null). Hidden: the seed and RNG state (they would reveal
 * the deck order and future dice), the deck order, other players' hands and cards (counts only),
 * and state.ext (extension rulesets must add their own redaction before exposing anything there).
 *
 * Deliberately public (D18): discards are face up. The `log` contains every action including
 * `discard` with its bag, and the `discarded` events are not redacted by getEventsView — every
 * viewer sees which cards each player discarded.
 *
 * Reveal-all: once there is a winner, every player entry includes hand, cards, newCards and vp
 * (all hands are revealed, not just the viewer's).
 */
export function getPlayerView(state: GameState, viewer: PlayerId | null): PlayerView {
  const { seed: _seed, ...init } = state.init;
  return clone({
    viewer,
    init,
    board: state.board,
    pieces: state.pieces,
    players: state.players.map((p) => {
      const pub: PublicPlayer = {
        id: p.id,
        handCount: bagTotal(p.hand),
        cardCount: p.cards.length + p.newCards.length,
        played: p.played,
        supply: p.supply,
        publicVP: victoryPoints(state, p.id, { public: true }),
      };
      if (p.id === viewer || state.winner) {
        pub.hand = p.hand;
        pub.cards = p.cards;
        pub.newCards = p.newCards;
        pub.vp = victoryPoints(state, p.id, { public: false });
      }
      return pub;
    }),
    bank: { hand: state.bank.hand, deckCount: state.bank.deck.length },
    phase: state.phase,
    turn: state.turn,
    trade: state.trade,
    awards: state.awards,
    log: state.log,
    winner: state.winner,
  });
}

/** Redact events for a viewer: stolen resources and bought cards are private (discards stay public, D18).
 *  The returned array is a fresh deep copy: mutating it never affects the caller's input array. */
export function getEventsView(events: GameEvent[], viewer: PlayerId | null): GameEvent[] {
  return clone(events).map((ev) => {
    if (ev.e === 'stole' && viewer !== ev.from && viewer !== ev.to) return { ...ev, resource: undefined };
    if (ev.e === 'cardBought' && viewer !== ev.player) return { ...ev, card: undefined };
    return ev;
  });
}
