// Number token: a plain flat parchment disc with a thin ink ring, the number and its
// probability pips (PO: simpler than the old bevelled gold disc, and 15% smaller).
// 6 and 8 are bold red (from the base config's hot numbers).
import { baseConfig } from '@hexgame/engine';
import { SIZE } from './geom';

/** Token diameter in board units (was SIZE * 0.94 before the PO asked for -15%). */
export const TOKEN_D = SIZE * 0.94 * 0.85;

export function Token({ n, cx, cy }: { n: number; cx: number; cy: number }) {
  const hot = (baseConfig.hotNumbers ?? []).includes(n);
  const r = TOKEN_D / 2;
  // Probability pips: how many of the 36 two-dice results give this number (2/12 -> 1 ... 6/8 -> 5).
  const pips = Math.max(0, 6 - Math.abs(7 - n));
  const gap = 4.4;
  return (
    <g className="token">
      <circle cx={cx} cy={cy} r={r} className="token-disc" />
      <text
        x={cx}
        y={pips > 0 ? cy - 3.6 : cy}
        textAnchor="middle"
        dominantBaseline="central"
        className={hot ? 'token-num hot' : 'token-num'}
      >
        {n}
      </text>
      {Array.from({ length: pips }, (_, i) => (
        <circle
          key={i}
          className={hot ? 'token-pip hot' : 'token-pip'}
          cx={cx + (i - (pips - 1) / 2) * gap}
          cy={cy + 10.4}
          r={1.55}
        />
      ))}
    </g>
  );
}
