// The base ruleset: config, hook implementations and action table.
import type { Bag, PlayerId } from '../../types';
import type { Ruleset } from '../../ruleset/types';
import { randInt } from '../../rng';
import { baseConfig } from './config';
import { buildCity, placeRoad, placeSettlement } from './build';
import { bankTrade, cancelTrade, confirmTrade, offerTrade, respondTrade } from './trade';
import { discard, endTurn, moveBlocker, roll, steal } from './turn';
import { buyCard, playCard } from './cards';
import { pairedPlayer, player, seatOrder, vp, winningActor } from './helpers';

export const baseRuleset: Ruleset = {
  id: 'base',
  config: () => JSON.parse(JSON.stringify(baseConfig)),
  hooks: {
    rollDice: (ctx) => [randInt(ctx.state.rng, 6) + 1, randInt(ctx.state.rng, 6) + 1],

    production(ctx, _prev, sum) {
      const { state, graph, rules } = ctx;
      // claims[resource][player] = amount owed by the bank
      const claims: Record<string, Record<PlayerId, number>> = {};
      for (const hex of state.board.hexes) {
        if (hex.token !== sum || hex.id === state.board.blocker) continue;
        const r = rules.config.terrainResource[hex.terrain];
        if (!r) continue;
        for (const v of graph.hexVertices[hex.id]) {
          const b = state.pieces.buildings[v];
          if (!b) continue;
          const n = rules.config.buildingYield[b.kind] ?? 0;
          (claims[r] ??= {})[b.owner] = (claims[r][b.owner] ?? 0) + n;
        }
      }
      // Bank shortage: if the bank cannot pay everyone, nobody gets that resource, unless only
      // one player is owed it, in which case that player gets what is left.
      const gains: Record<PlayerId, Bag> = {};
      for (const [r, byPlayer] of Object.entries(claims)) {
        const owed = Object.values(byPlayer).reduce((s, n) => s + n, 0);
        const inBank = state.bank.hand[r] ?? 0;
        const ids = Object.keys(byPlayer);
        if (owed <= inBank) for (const id of ids) (gains[id] ??= {})[r] = byPlayer[id];
        else if (ids.length === 1 && inBank > 0) (gains[ids[0]] ??= {})[r] = inBank;
      }
      return gains;
    },

    buildCost: (_ctx, prev) => prev,

    victoryPoints(ctx, prev, id, opts) {
      const { state, rules } = ctx;
      const c = rules.config;
      let total = prev;
      for (const b of Object.values(state.pieces.buildings))
        if (b.owner === id) total += c.buildingVP[b.kind] ?? 0;
      if (!opts.public) {
        const p = player(state, id);
        total += [...p.cards, ...p.newCards].filter((x) => c.scoringCards.includes(x)).length;
      }
      if (state.awards.longestRoute === id) total += c.awards.longestRoute.vp;
      if (state.awards.largestForce === id) total += c.awards.largestForce.vp;
      return total;
    },

    // The player whose action window is open wins on reaching the target. Setup and the legacy
    // extra-build windows never produce a win (D11); the paired player wins instantly in their
    // own phase (5-6 p.3).
    checkWinner(ctx, prev) {
      if (prev) return prev;
      const { state } = ctx;
      const id = winningActor(state);
      if (!id) return undefined;
      return vp(ctx, id) >= state.init.vpToWin ? id : undefined;
    },

    phaseAfterRoll: (_ctx, prev) => prev,

    phaseAfterTurn(ctx, prev) {
      const { state } = ctx;
      // 5-6 players, paired mode (5-6 p.3): player 2 (third seat left of player 1) gets an action
      // phase with no roll after player 1 ends the turn. One card per phase, not per turn.
      if (state.init.largeTableMode === 'paired' && state.players.length >= 5) {
        state.turn.cardPlayed = false;
        return { k: 'paired', player: pairedPlayer(state) };
      }
      if (!state.init.extraBuild) return prev;
      const seats = seatOrder(state);
      const i = seats.indexOf(state.turn.current);
      const queue = [...seats.slice(i + 1), ...seats.slice(0, i)];
      return { k: 'extraBuild', queue };
    },
  },
  actions: {
    placeSettlement: () => placeSettlement,
    placeRoad: () => placeRoad,
    buildCity: () => buildCity,
    roll: () => roll,
    discard: () => discard,
    moveBlocker: () => moveBlocker,
    steal: () => steal,
    bankTrade: () => bankTrade,
    offerTrade: () => offerTrade,
    respondTrade: () => respondTrade,
    confirmTrade: () => confirmTrade,
    cancelTrade: () => cancelTrade,
    buyCard: () => buyCard,
    playCard: () => playCard,
    endTurn: () => endTurn,
  },
};
