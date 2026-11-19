// Harbor as a TILE, like a physical board-game piece (PO request): one tile of the sea frame
// (Board draws the ring with SeaTile), next to the coast edge and on the same grid as the land
// tiles, so it can never look off. On it: two wooden jetties running to the edge's two corners (the trading spots) and a
// parchment medallion with the goods icon and the trade ratio printed in the middle.
// The 3D board keeps its own dock + badge (geom.ts harborGeom / harborBadgeCentre).
import type { Graph, Harbor as HarborData } from '@hexgame/engine';
import { art2dUrl, useAssets } from './assets';
import { edgeGeom, harborTileCentre, SIZE } from './geom';
import { useI18n, resKey } from '../i18n';
import { RESOURCE_COLORS } from '../ui/colors';

type Pt = { x: number; y: number };

const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

/** A short jetty from a point inside the harbor tile out to (just short of) a coast corner. */
function Jetty({ from, to }: { from: Pt; to: Pt }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ang = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const w = SIZE * 0.15;
  const planks = Math.max(2, Math.round(len / 5));
  return (
    <g transform={`translate(${from.x} ${from.y}) rotate(${ang})`} className="harbor-jetty">
      <rect x={0} y={-w / 2} width={len} height={w} rx={1.4} className="harbor-pier" />
      {Array.from({ length: planks - 1 }, (_, i) => {
        const x = ((i + 1) * len) / planks;
        return <line key={i} x1={x} y1={-w / 2} x2={x} y2={w / 2} className="harbor-plank" />;
      })}
    </g>
  );
}

export function Harbor({ harbor, graph }: { harbor: HarborData; graph: Graph }) {
  const { t } = useI18n();
  const painted = art2dUrl('icon', harbor.kind);
  const icon = useAssets([painted])[painted] ? painted : null;
  const g = edgeGeom(graph, harbor.edge);
  const c = harborTileCentre(graph, harbor.edge);
  const label = `${harbor.ratio}:1`;
  const color = harbor.kind === 'any' ? 'var(--sea)' : RESOURCE_COLORS[harbor.kind] ?? 'var(--sea)';
  const title = harbor.kind === 'any' ? t('dlg_rate', { r: harbor.ratio }) : `${t(resKey(harbor.kind))} · ${label}`;
  const mr = SIZE * 0.4;
  const iconSize = SIZE * 0.42;
  return (
    <g className="harbor" data-kind={harbor.kind}>
      {/* Jetties to the two corners of the coast edge: those are the harbor's building spots. */}
      {[g.a, g.b].map((v, i) => (
        <Jetty key={i} from={lerp(v, c, 0.5)} to={lerp(v, c, 0.1)} />
      ))}
      {/* Printed medallion: goods icon over the ratio, rimmed in the goods colour. */}
      <g transform={`translate(${c.x} ${c.y})`}>
        <circle r={mr} className="harbor-medallion" style={{ stroke: color }} />
        {icon ? (
          <image href={icon} x={-iconSize / 2} y={-mr * 0.86} width={iconSize} height={iconSize} />
        ) : (
          <circle cy={-mr * 0.35} r={iconSize / 2.6} fill="var(--parchment-dark)" stroke={color} strokeWidth={2.5} />
        )}
        <text y={mr * 0.5} textAnchor="middle" dominantBaseline="central" className="harbor-ratio">
          {label}
        </text>
      </g>
      <title>{title}</title>
    </g>
  );
}
