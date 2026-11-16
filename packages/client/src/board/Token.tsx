// Number token disc: art first, plain disc fallback. The number is always drawn by the UI
// (per the asset contract); 6 and 8 are bold red (from the base config's hot numbers).
import { baseConfig } from '@hexgame/engine';
import { assetUrl, useAssets } from './assets';
import { SIZE } from './geom';

export function Token({ n, cx, cy }: { n: number; cx: number; cy: number }) {
  const path = assetUrl('', 'token');
  const ok = useAssets([path])[path];
  const hot = (baseConfig.hotNumbers ?? []).includes(n);
  const d = SIZE * 0.94;
  // Probability pips: how many of the 36 two-dice results give this number (2/12 -> 1 ... 6/8 -> 5).
  const pips = Math.max(0, 6 - Math.abs(7 - n));
  const gap = 5.4;
  return (
    <g className="token">
      {ok ? (
        <image href={path} x={cx - d / 2} y={cy - d / 2} width={d} height={d} />
      ) : (
        <circle cx={cx} cy={cy} r={d / 2} fill="var(--parchment-dark)" stroke="var(--ink)" strokeWidth={2} />
      )}
      <text
        x={cx}
        y={pips > 0 ? cy - 4.5 : cy}
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
          cy={cy + 12.5}
          r={1.9}
        />
      ))}
    </g>
  );
}
