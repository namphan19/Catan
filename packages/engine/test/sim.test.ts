// Sim mode must behave exactly like the real engine: same states after every move (minus the log),
// same legal actions, and sim copies must be independent. Random games over all player counts and
// the strongholds expansion, every action type including trades.
import { describe, expect, it } from 'vitest';
import {
  applyAction, cloneSim, createGame, getLegalActions, randInt, seedRng, simActors, simApply, toSim,
  type Action, type GameState,
} from '../src';

const W: Record<string, number> = {
  buildCity: 60, placeSettlement: 60, placeRoad: 8, buyCard: 12, playCard: 10, bankTrade: 4,
  offerTrade: 0.5, respondTrade: 3, confirmTrade: 5, cancelTrade: 1, endTurn: 3,
  'sh:improve': 40, 'sh:recruit': 12, 'sh:activate': 10, 'sh:promote': 8, 'sh:rampart': 6, 'sh:play': 3,
  'sh:moveWarden': 0.3, 'sh:displace': 3, 'sh:chase': 2, 'sh:bazaarOffer': 2, 'sh:discardCard': 1,
};

const strip = (s: GameState): string => JSON.stringify({ ...s, log: [] });

function lockstep(seed: string, players: number, rulesets: string[], maxActions = 1500): number {
  let real = createGame({ seed, playerCount: players, rulesets });
  const sim = toSim(real);
  const rng = seedRng(`sim:${seed}`);
  let n = 0;
  while (!real.winner && n < maxActions) {
    const legal: Action[] = [];
    for (const p of real.players) {
      const lr = getLegalActions(real, p.id);
      expect(JSON.stringify(getLegalActions(sim, p.id))).toBe(JSON.stringify(lr));
      legal.push(...lr);
    }
    // Every player who must act has a legal action (the sim helper agrees with the engine).
    for (const id of simActors(sim)) expect(legal.some((a) => a.player === id)).toBe(true);
    let total = 0;
    const w = legal.map((a) => (total += W[a.t] ?? 1));
    const pick = (randInt(rng, 1_000_000) / 1_000_000) * total;
    const a = legal[w.findIndex((x) => x > pick)] ?? legal[legal.length - 1];
    real = applyAction(real, a).state;
    simApply(sim, a);
    expect(strip(sim)).toBe(strip(real));
    n++;
  }
  expect(sim.winner).toBe(real.winner);
  return n;
}

describe('sim mode', () => {
  it.each([3, 4, 5, 6])('matches the real engine move by move (%i players, base)', (n) => {
    expect(lockstep(`sim-base-${n}`, n, ['base'])).toBeGreaterThan(50);
  }, 120_000);

  it.each([4, 5])('matches the real engine move by move (%i players, strongholds)', (n) => {
    expect(lockstep(`sim-sh-${n}`, n, ['base', 'strongholds'])).toBeGreaterThan(50);
  }, 120_000);

  it('copies are independent and simApply rejects illegal moves', () => {
    const s = toSim(createGame({ seed: 'indep', playerCount: 4 }));
    const before = JSON.stringify(s);
    const c = cloneSim(s);
    const id = simActors(c)[0];
    simApply(c, getLegalActions(c, id)[0]);
    expect(JSON.stringify(s)).toBe(before);
    expect(() => simApply(s, { t: 'endTurn', player: id })).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
});
