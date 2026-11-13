// Seeded RNG (sfc32). The 128-bit state lives inside GameState.rng. These functions mutate the given
// tuple, so the engine only ever passes the rng of a cloned draft state.
import type { RngState } from './types';

/** Hash a seed string into an initial RNG state (xmur3-style mixing). */
export function seedRng(seed: string): RngState {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const s: RngState = [next(), next(), next(), next()];
  for (let i = 0; i < 12; i++) nextU32(s); // warm up
  return s;
}

export function nextU32(s: RngState): number {
  let a = s[0] | 0;
  let b = s[1] | 0;
  let c = s[2] | 0;
  let d = s[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t >>> 0;
}

/** Uniform integer in [0, n). */
export function randInt(s: RngState, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('randInt: n must be a positive integer');
  return Math.floor((nextU32(s) / 4294967296) * n);
}

/** Fisher-Yates shuffle in place; returns the same array. */
export function shuffle<T>(s: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
