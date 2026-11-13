// Helpers for resource multisets (Bag = Record<ResourceId, number>).
import type { Bag } from './types';

export const bagTotal = (b: Bag): number => Object.values(b).reduce((s, n) => s + n, 0);

export const bagHas = (have: Bag, need: Bag): boolean =>
  Object.entries(need).every(([r, n]) => (have[r] ?? 0) >= n);

/** Mutates into. */
export function bagAdd(into: Bag, add: Bag): void {
  for (const [r, n] of Object.entries(add)) into[r] = (into[r] ?? 0) + n;
}

/** Mutates from. */
export function bagSub(from: Bag, sub: Bag): void {
  for (const [r, n] of Object.entries(sub)) from[r] = (from[r] ?? 0) - n;
}

/** Valid bag: an object of known resources mapped to non-negative integers. */
export function bagValid(b: unknown, resources: readonly string[]): b is Bag {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
  return Object.entries(b as Record<string, unknown>).every(
    ([r, n]) => resources.includes(r) && Number.isInteger(n) && (n as number) >= 0,
  );
}

/** Copy without zero entries. */
export function bagClean(b: Bag): Bag {
  const out: Bag = {};
  for (const [r, n] of Object.entries(b)) if (n) out[r] = n;
  return out;
}

export function emptyBag(resources: readonly string[], n = 0): Bag {
  return Object.fromEntries(resources.map((r) => [r, n]));
}

/** Expand a bag into a list of single resources, ordered by the resources list. */
export function bagToList(b: Bag, resources: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of resources) for (let i = 0; i < (b[r] ?? 0); i++) out.push(r);
  return out;
}
