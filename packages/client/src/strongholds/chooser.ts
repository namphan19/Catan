// Staged chooser for actions with parameters. It never decides legality: it only narrows a list of
// legal actions (from getLegalActions) field by field until exactly one is left.
import type { Action } from '@hexgame/engine';

/** Order in which differing parameters are asked. Each action type uses a subset. */
export const FIELD_ORDER = [
  'card', 'kind', 'wonder', 'track', 'deck', 'target', 'resource', 'level', 'dice.0', 'dice.1',
  'from', 'to', 'a', 'b', 'v', 'hex', 'e', 'vs.0', 'vs.1', 'rebuild', 'skip',
];

/** Read `field` or `field.index` (for array parameters) from an action. */
export function fieldOf(a: Action, path: string): unknown {
  const [k, i] = path.split('.');
  const v = (a as unknown as Record<string, unknown>)[k];
  if (i === undefined) return v;
  return Array.isArray(v) ? v[Number(i)] : undefined;
}

const keyOf = (v: unknown): string => (v === undefined ? '∅' : JSON.stringify(v));

export interface Stage {
  field: string;
  /** Distinct values of the field among the remaining candidates (may include undefined). */
  values: unknown[];
  /** Every defined value is a board id (vertex / edge / hex): pick it on the board. */
  board: boolean;
  /** One candidate has no value here: the stage can be skipped ("done" / "skip"). */
  optional: boolean;
}

/** The next parameter in which the candidates differ, or null when one action is settled. */
export function nextStage(cands: Action[]): Stage | null {
  if (cands.length <= 1) return null;
  for (const field of FIELD_ORDER) {
    const seen = new Map<string, unknown>();
    for (const a of cands) {
      const v = fieldOf(a, field);
      seen.set(keyOf(v), v);
    }
    if (seen.size <= 1) continue;
    const values = [...seen.values()];
    const defined = values.filter((v) => v !== undefined);
    const board = defined.length > 0 && defined.every((v) => typeof v === 'string' && /^[veh]:/.test(v));
    return { field, values, board, optional: defined.length < values.length };
  }
  return null;
}

export function narrow(cands: Action[], field: string, value: unknown): Action[] {
  const k = keyOf(value);
  return cands.filter((a) => keyOf(fieldOf(a, field)) === k);
}
