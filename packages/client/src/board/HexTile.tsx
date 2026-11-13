// One terrain hex: art first, flat colour polygon fallback; ink outline either way.
import type { Hex } from '@hexgame/engine';
import { assetUrl, useAssets } from './assets';
import { hexCenter, hexPoints, SIZE } from './geom';
import { Token } from './Token';
import { TERRAIN_COLORS } from '../ui/colors';
import { useI18n, terrainKey } from '../i18n';

const SQRT3 = Math.sqrt(3);

export function HexTile({ hex }: { hex: Hex }) {
  const { t } = useI18n();
  const path = assetUrl('terrain', hex.terrain);
  const ok = useAssets([path])[path];
  const c = hexCenter(hex.id);
  const w = SQRT3 * SIZE;
  const h = w * (230 / 200);
  return (
    <g className="hex-tile">
      {ok ? (
        <>
          <image href={path} x={c.x - w / 2} y={c.y - h / 2} width={w} height={h}>
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
      {hex.token != null && <Token n={hex.token} cx={c.x} cy={c.y} />}
    </g>
  );
}
