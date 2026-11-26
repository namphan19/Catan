// One terrain hex: painted art (art2d/*.webp), flat colour polygon fallback. Tiles are drawn slightly smaller than their grid cell (TILE_GAP) so a sand-coloured
// seam shows between neighbours, like cardboard tiles laid on a table (PO request). Only the
// tile art shrinks: tokens, harbours, roads and buildings stay on the original grid.
import type { Hex } from '@hexgame/engine';
import { art2dUrl, useAssets } from './assets';
import { hexCenter, hexPoints, SIZE } from './geom';
import { Token } from './Token';
import { TERRAIN_COLORS } from '../ui/colors';
import { useI18n, terrainKey } from '../i18n';

const SQRT3 = Math.sqrt(3);

/** Tile scale inside its cell: 1 = edge to edge; 0.94 leaves a ~6 px seam at SIZE 56. */
export const TILE_GAP = 0.94;

/** Placeholder marks drawn on terrains that have no painted tile yet (tidelands). */
const PLACEHOLDER_GLYPH: Record<string, string> = {
  goldmine: '◆', mist: '?', village: '⌂',
  // Highlands (docs/ART_HIGHLANDS.md)
  jungle: '🪶', grove: '🌿', fishery: '🐟', wilds: '🌴',
};

export function HexTile({ hex, producing }: { hex: Hex; producing?: boolean }) {
  // Sea hexes inside a scenario map look like the sea frame around the island.
  if (hex.terrain === 'sea') return <SeaTile q={hex.q} r={hex.r} />;
  return <LandTile hex={hex} producing={producing} />;
}

function LandTile({ hex, producing }: { hex: Hex; producing?: boolean }) {
  const { t } = useI18n();
  const painted = art2dUrl('terrain', hex.terrain);
  const path = useAssets([painted])[painted] ? painted : null;
  const c = hexCenter(hex.id);
  const w = SQRT3 * SIZE;
  // The painted webp is cut exactly to the hex (w x 2*SIZE).
  const h = 2 * SIZE;
  // Slight per-tile brightness keeps repeated terrains from looking machine-copied,
  // and some tiles are mirrored left/right: the art stays upright (sheep, trees) while
  // the copied motif is much less obvious on a board with 3-4 hexes of one terrain.
  const bright = 0.96 + (Math.abs(hex.q * 13 + hex.r * 7) % 7) * 0.012;
  const flip = (Math.abs(hex.q * 5 + hex.r * 3) % 3) === 0;
  const shrink = `translate(${c.x} ${c.y}) scale(${TILE_GAP}) translate(${-c.x} ${-c.y})`;
  return (
    <g className="hex-tile">
      <g transform={shrink}>
        {path ? (
          <>
            <g transform={flip ? `translate(${2 * c.x} 0) scale(-1 1)` : undefined}>
              <image
                href={path}
                x={c.x - w / 2}
                y={c.y - h / 2}
                width={w}
                height={h}
                preserveAspectRatio="none"
                style={{ filter: `brightness(${bright.toFixed(3)}) saturate(1.04) drop-shadow(0 1.6px 1.4px rgba(27, 21, 18, 0.45))` }}
              >
                <title>{t(terrainKey(hex.terrain))}</title>
              </image>
            </g>
          </>
        ) : (
          <>
            <polygon
              points={hexPoints(hex.q, hex.r)}
              fill={TERRAIN_COLORS[hex.terrain] ?? 'var(--waste)'}
              stroke="var(--ink)"
              strokeWidth={2}
              className={`terrain-${hex.terrain}`}
            >
              <title>{t(terrainKey(hex.terrain))}</title>
            </polygon>
            {PLACEHOLDER_GLYPH[hex.terrain] && (
              <text
                x={c.x}
                y={c.y + (hex.token != null ? -SIZE * 0.42 : SIZE * 0.14)}
                className="terrain-glyph"
                textAnchor="middle"
                fontSize={SIZE * (hex.terrain === 'mist' ? 0.8 : hex.terrain === 'wilds' ? 0.7 : 0.42)}
                pointerEvents="none"
              >
                {PLACEHOLDER_GLYPH[hex.terrain]}
              </text>
            )}
          </>
        )}
        {producing && <polygon className="hex-produced" points={hexPoints(hex.q, hex.r)} />}
      </g>
      {hex.token != null && <Token n={hex.token} cx={c.x} cy={c.y} />}
    </g>
  );
}

/** One tile of the sea frame around the island (shallow painted water, same seam as land). */
export function SeaTile({ q, r }: { q: number; r: number }) {
  const path = art2dUrl('terrain', 'harbor');
  const ok = useAssets([path])[path];
  const c = hexCenter(`h:${q},${r}`);
  const w = SQRT3 * SIZE;
  const h = 2 * SIZE;
  const bright = 0.95 + (Math.abs(q * 13 + r * 7) % 7) * 0.012;
  const flip = (Math.abs(q * 5 + r * 3) % 2) === 0;
  return (
    <g className="sea-tile" pointerEvents="none" transform={`translate(${c.x} ${c.y}) scale(${TILE_GAP}) translate(${-c.x} ${-c.y})`}>
      {ok ? (
        <g transform={flip ? `translate(${2 * c.x} 0) scale(-1 1)` : undefined}>
          <image
            href={path}
            x={c.x - w / 2}
            y={c.y - h / 2}
            width={w}
            height={h}
            preserveAspectRatio="none"
            style={{ filter: `brightness(${bright.toFixed(3)}) drop-shadow(0 1.6px 1.4px rgba(27, 21, 18, 0.45))` }}
          />
        </g>
      ) : (
        <polygon points={hexPoints(q, r)} fill="#7FC4CF" stroke="rgba(59, 47, 47, 0.55)" strokeWidth={1.1} />
      )}
    </g>
  );
}
