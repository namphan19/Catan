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
  return (
    <g className="token">
      {ok ? (
        <image href={path} x={cx - d / 2} y={cy - d / 2} width={d} height={d} />
      ) : (
        <circle cx={cx} cy={cy} r={d / 2} fill="var(--parchment-dark)" stroke="var(--ink)" strokeWidth={2} />
      )}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className={hot ? 'token-num hot' : 'token-num'}
      >
        {n}
      </text>
    </g>
  );
}
