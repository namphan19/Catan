// One terrain hex: art first, flat colour polygon fallback; ink outline either way.
import type { Hex } from '@hexgame/engine';
import { assetUrl, useAssets } from './assets';
import { hexCenter, hexPoints, SIZE } from './geom';
import { Token } from './Token';
import { TERRAIN_COLORS } from '../ui/colors';
import { useI18n, terrainKey } from '../i18n';

const SQRT3 = Math.sqrt(3);

export function HexTile({ hex, producing }: { hex: Hex; producing?: boolean }) {
  const { t } = useI18n();
  const path = assetUrl('terrain', hex.terrain);
  const ok = useAssets([path])[path];
  const c = hexCenter(hex.id);
  const w = SQRT3 * SIZE;
  const h = w * (230 / 200);
  // Slight per-tile brightness keeps repeated terrains from looking machine-copied
  // without rotating the art (sheep and trees must stay upright).
  const bright = 0.96 + (Math.abs(hex.q * 13 + hex.r * 7) % 7) * 0.012;
  return (
    <g className="hex-tile">
      {ok ? (
        <>
          <image
            href={path}
            x={c.x - w / 2}
            y={c.y - h / 2}
            width={w}
            height={h}
            style={{ filter: `brightness(${bright.toFixed(3)})` }}
          >
            <title>{t(terrainKey(hex.terrain))}</title>
          </image>
          <polygon points={hexPoints(hex.q, hex.r)} fill="none" stroke="var(--ink)" strokeWidth={2} />
        </>
      ) : (
        <polygon
          points={hexPoints(hex.q, hex.r)}
          fill={TERRAIN_COLORS[hex.terrain] ?? 'var(--waste)'}
          stroke="var(--ink)"
          strokeWidth={2}
        >
          <title>{t(terrainKey(hex.terrain))}</title>
        </polygon>
      )}
      {producing && <polygon className="hex-produced" points={hexPoints(hex.q, hex.r)} />}
      {hex.token != null && <Token n={hex.token} cx={c.x} cy={c.y} />}
    </g>
  );
}
