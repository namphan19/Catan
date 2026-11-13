// Board shapes. Only geometry lives here; terrain/token/harbor counts come from the ruleset config.
import type { LayoutId } from '../types';
import type { Axial } from './coords';

/** Standard layout: radius-2 hexagon, rows 3-4-5-4-3 (19 hexes). */
function standard(): Axial[] {
  const out: Axial[] = [];
  for (let r = -2; r <= 2; r++)
    for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) out.push({ q, r });
  return out;
}

/** Large layout for 5-6 players: rows 3-4-5-6-5-4-3 (30 hexes). */
function large(): Axial[] {
  const rows: Array<[number, number, number]> = [
    // [r, first q, length], each row centred under the 6-hex middle row
    [-3, 3, 3],
    [-2, 2, 4],
    [-1, 1, 5],
    [0, 0, 6],
    [1, 0, 5],
    [2, 0, 4],
    [3, 0, 3],
  ];
  const out: Axial[] = [];
  for (const [r, q0, len] of rows) for (let i = 0; i < len; i++) out.push({ q: q0 + i, r });
  return out;
}

export function layoutHexes(layout: LayoutId): Axial[] {
  if (layout === 'standard') return standard();
  if (layout === 'large') return large();
  throw new Error(`unknown layout ${String(layout)}`);
}
