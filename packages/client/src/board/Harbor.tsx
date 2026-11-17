// Harbor drawn OUT IN THE SEA so the coast stays clear for pieces: two wooden piers run from the
// coast edge's corners to a small dock, and a badge [icon · ratio] floats beyond the dock.
// Geometry is shared with the 3D board (geom.ts harborGeom / harborBadgeCentre).
import type { Graph, Harbor as HarborData } from '@hexgame/engine';
import { assetUrl, useAssets } from './assets';
import { harborBadgeCentre, harborGeom, SIZE } from './geom';
import { useI18n, resKey } from '../i18n';
import { RESOURCE_COLORS } from '../ui/colors';

/** Badge size in board pixels (icon + ratio pill). */
export const HARBOR_BADGE_W = 58;
export const HARBOR_BADGE_H = 26;

type Pt = { x: number; y: number };

function Pier({ from, to }: { from: Pt; to: Pt }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ang = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const planks = Math.max(2, Math.floor(len / 6));
  return (
    <g transform={`translate(${from.x} ${from.y}) rotate(${ang})`}>
      {/* two beams with planks across */}
      <rect x={0} y={-5.5} width={len} height={11} rx={1.5} className="harbor-pier" />
      {Array.from({ length: planks }, (_, i) => (
        <line key={i} x1={(i + 0.5) * (len / planks)} y1={-5.5} x2={(i + 0.5) * (len / planks)} y2={5.5} className="harbor-plank" />
      ))}
    </g>
  );
}

export function Harbor({ harbor, graph }: { harbor: HarborData; graph: Graph }) {
  const { t } = useI18n();
  const path = assetUrl('harbor', harbor.kind);
  const ok = useAssets([path])[path];
  const h = harborGeom(graph, harbor.edge);
  const label = `${harbor.ratio}:1`;
  const color = harbor.kind === 'any' ? 'var(--sea)' : RESOURCE_COLORS[harbor.kind] ?? 'var(--sea)';
  const badge = harborBadgeCentre(h, HARBOR_BADGE_W, HARBOR_BADGE_H);
  const dockAng = (Math.atan2(h.t.y, h.t.x) * 180) / Math.PI;
  const dockW = SIZE * 0.62;
  const dockH = SIZE * 0.24;
  const icon = 22;
  const title = harbor.kind === 'any' ? t('dlg_rate', { r: harbor.ratio }) : `${t(resKey(harbor.kind))} · ${label}`;
  return (
    <g className="harbor">
      <Pier from={h.pierFromA} to={h.pierToA} />
      <Pier from={h.pierFromB} to={h.pierToB} />
      {/* dock platform with mooring posts; the trim shows the harbor's resource colour */}
      <g transform={`translate(${h.dock.x} ${h.dock.y}) rotate(${dockAng})`}>
        <rect x={-dockW / 2} y={-dockH / 2} width={dockW} height={dockH} rx={2} className="harbor-dock" />
        <line x1={-dockW / 2 + 3} y1={dockH / 2 - 2} x2={dockW / 2 - 3} y2={dockH / 2 - 2} stroke={color} strokeWidth={3} />
        {[-dockW / 2, dockW / 2].map((x) => (
          <circle key={x} cx={x} cy={-dockH / 2} r={3.2} className="harbor-post" />
        ))}
      </g>
      {/* badge out in the sea: [icon | ratio] */}
      <g transform={`translate(${badge.x} ${badge.y})`}>
        <rect
          x={-HARBOR_BADGE_W / 2}
          y={-HARBOR_BADGE_H / 2}
          width={HARBOR_BADGE_W}
          height={HARBOR_BADGE_H}
          rx={HARBOR_BADGE_H / 2}
          className="harbor-badge"
          style={{ stroke: color }}
        />
        {ok ? (
          <image href={path} x={-HARBOR_BADGE_W / 2 + 2} y={-icon / 2} width={icon} height={icon} />
        ) : (
          <circle cx={-HARBOR_BADGE_W / 2 + 2 + icon / 2} r={icon / 2 - 1} fill="var(--parchment-dark)" stroke={color} strokeWidth={2.5} />
        )}
        <text x={-HARBOR_BADGE_W / 2 + icon + 18} y={6} textAnchor="middle" className="harbor-ratio">
          {label}
        </text>
      </g>
      <title>{title}</title>
    </g>
  );
}
