// Roads, buildings and the blocker. Art first (contract assets use fill="currentColor", the
// wrapping <g> carries the player colour); a vector fallback is drawn when the file is missing.
import type { EdgeId, Graph, Pieces, PlayerId, VertexId } from '@hexgame/engine';
import { assetUrl, useAssets } from './assets';
import { edgeGeom, hexCenter, SIZE, vertexPos } from './geom';
import { playerColor } from '../ui/colors';

const INK = 'var(--ink)';

export function Road({ edge, player, graph }: { edge: EdgeId; player: PlayerId; graph: Graph }) {
  const path = assetUrl('piece', 'road');
  const ok = useAssets([path])[path];
  const color = playerColor(player);
  const { a, b, mid, angle, len } = edgeGeom(graph, edge);
  const w = len * 0.94;
  const h = (w * 14) / 60;
  if (ok) {
    return (
      <g transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`} style={{ color }}>
        <image href={path} x={-w / 2} y={-h / 2} width={w} height={h} />
      </g>
    );
  }
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={SIZE * 0.26} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={SIZE * 0.17} strokeLinecap="round" />
    </g>
  );
}

export function Building({ v, kind, player }: { v: VertexId; kind: string; player: PlayerId }) {
  const color = playerColor(player);
  const p = vertexPos(v);
  if (kind === 'city') return <CityImage v={v} color={color} p={p} />;
  return <SettlementImage v={v} color={color} p={p} />;
}

function SettlementImage({ v, color, p }: { v: VertexId; color: string; p: { x: number; y: number } }) {
  const path = assetUrl('piece', 'settlement');
  const ok = useAssets([path])[path];
  const s = SIZE * 0.6;
  if (ok) {
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ color }}>
        <image href={path} x={-s / 2} y={-s / 2} width={s} height={s} />
        <title>{v}</title>
      </g>
    );
  }
  // House: body + roof, ink outline.
  const w = s * 0.62;
  const hh = s * 0.72;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <polygon
        points={`0,${-hh / 2} ${w / 2},${-hh / 6} ${w / 2},${hh / 2} ${-w / 2},${hh / 2} ${-w / 2},${-hh / 6}`}
        fill={color}
        stroke={INK}
        strokeWidth={2}
      />
      <title>{v}</title>
    </g>
  );
}

function CityImage({ v, color, p }: { v: VertexId; color: string; p: { x: number; y: number } }) {
  const path = assetUrl('piece', 'city');
  const ok = useAssets([path])[path];
  const s = SIZE * 0.82;
  if (ok) {
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ color }}>
        <image href={path} x={-s / 2} y={-s / 2} width={s} height={s} />
        <title>{v}</title>
      </g>
    );
  }
  // Wider keep: two towers + roof band, ink outline.
  const w = s * 0.78;
  const hh = s * 0.66;
  return (
    <g transform={`translate(${p.x} ${p.y})`}>
      <polygon
        points={`0,${-hh / 2} ${w / 2},${-hh / 4} ${w / 2},${hh / 2} ${-w / 2},${hh / 2} ${-w / 2},${-hh / 4}`}
        fill={color}
        stroke={INK}
        strokeWidth={2}
      />
      <line x1={-w / 2} y1={hh / 6} x2={w / 2} y2={hh / 6} stroke={INK} strokeWidth={2} />
      <title>{v}</title>
    </g>
  );
}

export function Blocker({ hexId }: { hexId: string }) {
  const path = assetUrl('piece', 'blocker');
  const ok = useAssets([path])[path];
  const c = hexCenter(hexId);
  const h = SIZE * 0.85;
  const w = (h * 40) / 56;
  return (
    <g className="blocker" transform={`translate(${c.x} ${c.y})`}>
      {ok ? (
        <image href={path} x={-w / 2} y={-h / 2} width={w} height={h} />
      ) : (
        <>
          <circle r={SIZE * 0.3} fill={INK} stroke="var(--gold)" strokeWidth={3} />
          <text y={4} textAnchor="middle" className="blocker-glyph">
            ☠
          </text>
        </>
      )}
    </g>
  );
}

/** All placed pieces (roads + buildings) for one board. */
export function PiecesLayer({ pieces, graph }: { pieces: Pieces; graph: Graph }) {
  return (
    <g className="pieces">
      {Object.entries(pieces.roads).map(([e, player]) => (
        <Road key={e} edge={e as EdgeId} player={player} graph={graph} />
      ))}
      {Object.entries(pieces.buildings).map(([v, b]) => (
        <Building key={v} v={v as VertexId} kind={b.kind} player={b.owner} />
      ))}
    </g>
  );
}
