// Harbor badge drawn just outside a coast edge: art first, ratio badge fallback.
import type { Graph, Harbor as HarborData } from '@hexgame/engine';
import { assetUrl, useAssets } from './assets';
import { edgeGeom, SIZE } from './geom';
import { useI18n, resKey } from '../i18n';
import { RESOURCE_COLORS } from '../ui/colors';

export function Harbor({ harbor, graph }: { harbor: HarborData; graph: Graph }) {
  const { t } = useI18n();
  const path = assetUrl('harbor', harbor.kind);
  const ok = useAssets([path])[path];
  const g = edgeGeom(graph, harbor.edge);
  const d = SIZE * 0.52;
  // Ratio chip sits fully below the icon (never over it): chip top = icon bottom + 4px.
  const dy = d / 2 + 4;
  const label = `${harbor.ratio}:1`;
  const color = harbor.kind === 'any' ? 'var(--sea)' : RESOURCE_COLORS[harbor.kind] ?? 'var(--sea)';
  return (
    <g className="harbor" transform={`translate(${g.mid.x} ${g.mid.y})`}>
      {ok ? (
        <image href={path} x={-d / 2} y={-d / 2} width={d} height={d} />
      ) : (
        <circle r={d / 2} fill="var(--parchment-dark)" stroke={color} strokeWidth={3} />
      )}
      <rect className="harbor-ratio-bg" x={-16} y={dy} width={32} height={17} rx={4} />
      <text y={dy + 13} textAnchor="middle" className="harbor-ratio">
        {label}
      </text>
      <title>
        {harbor.kind === 'any' ? t('dlg_rate', { r: harbor.ratio }) : `${t(resKey(harbor.kind))} · ${label}`}
      </title>
    </g>
  );
}
