// Random board from a layout spec, using the game RNG (deterministic for a seed).
import type { Board, Harbor, Hex, LayoutId, RngState } from '../types';
import type { LayoutSpec } from '../ruleset/types';
import { shuffle } from '../rng';
import { getGraph } from './graph';
import { parseHex } from './coords';

const MAX_TOKEN_ATTEMPTS = 2000;

export function generateBoard(
  rng: RngState, layout: LayoutId, spec: LayoutSpec, opts: { producing: (terrain: string) => boolean; hotNumbers: number[]; genericRate: number; specificRate: number },
): Board {
  const g = getGraph(layout);
  const terrains = shuffle(rng, Object.entries(spec.terrains).flatMap(([t, n]) => Array<string>(n).fill(t)));
  if (terrains.length !== g.hexes.length)
    throw new Error(`layout ${layout}: ${terrains.length} terrains for ${g.hexes.length} hexes`);
  const hexes: Hex[] = g.hexes.map((id, i) => ({ id, ...parseHex(id), terrain: terrains[i] }));
  const producing = hexes.filter((h) => opts.producing(h.terrain));
  if (producing.length !== spec.tokens.length)
    throw new Error(`layout ${layout}: ${spec.tokens.length} tokens for ${producing.length} producing hexes`);

  // Tokens: reshuffle until no two hot numbers are on adjacent hexes.
  const isHot = (n: number | undefined) => n !== undefined && opts.hotNumbers.includes(n);
  let ok = false;
  for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS && !ok; attempt++) {
    const tokens = shuffle(rng, [...spec.tokens]);
    producing.forEach((h, i) => (h.token = tokens[i]));
    const byId = Object.fromEntries(hexes.map((h) => [h.id, h]));
    ok = hexes.every((h) => !isHot(h.token) || g.hexNeighbors[h.id].every((n) => !isHot(byId[n].token)));
  }
  if (!ok) throw new Error('could not place number tokens without adjacent hot numbers');

  // Harbors: evenly spaced along the clockwise coast, kinds shuffled.
  const kinds = shuffle(rng, [...spec.harbors]);
  const step = g.coast.length / kinds.length;
  const harbors: Harbor[] = kinds.map((kind, i) => {
    const edge = g.coast[Math.floor(i * step)];
    const [a, b] = g.edgeEnds[edge];
    return { edge, vertices: [a, b], kind, ratio: kind === 'any' ? opts.genericRate : opts.specificRate };
  });

  const blockerHex = hexes.find((h) => !opts.producing(h.terrain)) ?? hexes[0];
  return { layout, hexes, harbors, blocker: blockerHex.id };
}
