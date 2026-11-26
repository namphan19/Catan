// The highlands map: fixed coast and jungle, land hexes fixed (starter) or shuffled (variable setup);
// the number tokens always stay on their printed spots.
import type { Board, GameInit, RngState } from '../../types';
import { hexId } from '../../board/coords';
import { registerLayout } from '../../board/layouts';
import { shuffle } from '../../rng';
import { HL_LAYOUT, MAP, WILDS_CELL } from './config';

registerLayout(HL_LAYOUT, MAP.map(({ q, r }) => ({ q, r })));

export type MapMode = 'starter' | 'variable';

export const mapMode = (init: GameInit): MapMode => (init.options?.map === 'starter' ? 'starter' : 'variable');

export const WILDS = hexId(WILDS_CELL.q, WILDS_CELL.r);

export function makeHighlandsBoard(rng: RngState, init: GameInit): Board {
  const land = MAP.filter((c) => c.shuffle);
  const terrains = mapMode(init) === 'variable' ? shuffle(rng, land.map((c) => c.terrain)) : land.map((c) => c.terrain);
  let k = 0;
  const hexes = MAP.map((c) => ({
    id: hexId(c.q, c.r),
    q: c.q,
    r: c.r,
    terrain: c.shuffle ? terrains[k++] : c.terrain,
    ...(c.token !== undefined ? { token: c.token } : {}),
  }));
  return { layout: HL_LAYOUT, hexes, harbors: [], blocker: WILDS };
}
