// SVG rendering of the board. Pure display: geometry helpers come from the engine, legality from
// the engine (passed in as highlight sets). Nothing here computes game rules.
import type { EdgeId, GameState, HexId, VertexId } from '@hexgame/engine';
import { getGraph, hexToPixel, vertexToPixel } from '@hexgame/engine';

const SIZE = 42; // hex circumradius in px
const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00'];

const TERRAIN_FILL: Record<string, string> = {
  forest: '#2f6b34',
  claypit: '#a15c2e',
  meadow: '#7ba338',
  field: '#e3bd3a',
  quarry: '#98a2ab',
  waste: '#d8cfbf',
};

export interface Highlights {
  vertices: Set<string>;
  edges: Set<string>;
  hexes: Set<string>;
}

interface Props {
  state: GameState;
  hl: Highlights;
  onVertex: (v: VertexId) => void;
  onEdge: (e: EdgeId) => void;
  onHex: (h: HexId) => void;
  onMiss: () => void;
}

export default function BoardSvg({ state, hl, onVertex, onEdge, onHex, onMiss }: Props) {
  const colorOf = (id: string): string => {
    const i = state.players.findIndex((p) => p.id === id);
    return PALETTE[i >= 0 ? i % PALETTE.length : 0];
  };

  const px = new Map<string, { x: number; y: number }>();
  for (const h of state.board.hexes) px.set(h.id, hexToPixel(h.q, h.r, SIZE));
  const xs = [...px.values()].map((p) => p.x);
  const ys = [...px.values()].map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = SIZE * 2.4;
  const viewBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const hexPoints = (x: number, y: number): string =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((-90 + 60 * i) * Math.PI) / 180;
      return `${(x + SIZE * Math.cos(a)).toFixed(1)},${(y + SIZE * Math.sin(a)).toFixed(1)}`;
    }).join(' ');

  const graph = getGraph(state.board.layout);

  return (
    <svg
      viewBox={viewBox}
      className="board-svg"
      role="img"
      aria-label={`Board: ${state.board.hexes.length} hexes, layout ${state.board.layout}`}
    >
      {/* background catches clicks on empty space */}
      <rect
        x={minX - pad}
        y={minY - pad}
        width={maxX - minX + pad * 2}
        height={maxY - minY + pad * 2}
        fill="transparent"
        onClick={onMiss}
      />

      {/* hexes */}
      {state.board.hexes.map((h) => {
        const p = px.get(h.id)!;
        const lit = hl.hexes.has(h.id);
        return (
          <polygon
            key={h.id}
            points={hexPoints(p.x, p.y)}
            fill={TERRAIN_FILL[h.terrain] ?? '#cccccc'}
            stroke="#333"
            strokeWidth={1.5}
            cursor={lit ? 'pointer' : undefined}
            onClick={lit ? () => onHex(h.id) : onMiss}
          />
        );
      })}

      {/* moveBlocker highlights */}
      {[...hl.hexes]
        .filter((h) => px.has(h))
        .map((h) => {
          const p = px.get(h)!;
          return (
            <polygon
              key={`hl-${h}`}
              points={hexPoints(p.x, p.y)}
              fill="rgba(255,238,51,0.45)"
              stroke="#111"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              style={{ pointerEvents: 'none' }}
            />
          );
        })}

      {/* number tokens (6 and 8 in red) */}
      {state.board.hexes.map((h) => {
        if (h.token == null) return null;
        const p = px.get(h.id)!;
        const hot = h.token === 6 || h.token === 8;
        return (
          <g key={`t-${h.id}`} style={{ pointerEvents: 'none' }}>
            <circle cx={p.x} cy={p.y} r={12} fill="#f5f1e6" stroke="#555" strokeWidth={1} />
            <text
              x={p.x}
              y={p.y + 4.5}
              textAnchor="middle"
              fontSize={13}
              fontWeight="bold"
              fill={hot ? '#c62828' : '#333'}
            >
              {h.token}
            </text>
          </g>
        );
      })}

      {/* blocker marker */}
      {(() => {
        const p = px.get(state.board.blocker);
        if (!p) return null;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={p.x} cy={p.y - SIZE * 0.45} r={9} fill="#111" opacity={0.85} />
            <text
              x={p.x}
              y={p.y - SIZE * 0.45 + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight="bold"
              fill="#fff"
            >
              X
            </text>
          </g>
        );
      })()}

      {/* roads */}
      {Object.entries(state.pieces.roads).map(([e, owner]) => {
        const ends = graph.edgeEnds[e as EdgeId];
        if (!ends) return null;
        const a = vertexToPixel(ends[0], SIZE);
        const b = vertexToPixel(ends[1], SIZE);
        return (
          <line
            key={`r-${e}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={colorOf(owner)}
            strokeWidth={7}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* placeRoad highlights */}
      {[...hl.edges]
        .filter((e) => graph.edgeEnds[e as EdgeId])
        .map((e) => {
          const ends = graph.edgeEnds[e as EdgeId];
          const a = vertexToPixel(ends[0], SIZE);
          const b = vertexToPixel(ends[1], SIZE);
          return (
            <g key={`hle-${e}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(255,238,51,0.6)"
                strokeWidth={13}
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={18}
                strokeLinecap="round"
                cursor="pointer"
                onClick={() => onEdge(e as EdgeId)}
              />
            </g>
          );
        })}

      {/* harbors: marker pushed outward from the board centre */}
      {state.board.harbors.map((hb, i) => {
        const ends = graph.edgeEnds[hb.edge];
        if (!ends) return null;
        const a = vertexToPixel(ends[0], SIZE);
        const b = vertexToPixel(ends[1], SIZE);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = mx - cx;
        const dy = my - cy;
        const len = Math.hypot(dx, dy) || 1;
        const ox = mx + (dx / len) * SIZE * 0.95;
        const oy = my + (dy / len) * SIZE * 0.95;
        const label = `${hb.ratio}:1 ${hb.kind}`;
        return (
          <g key={`hb-${i}`} style={{ pointerEvents: 'none' }}>
            <rect x={ox - 27} y={oy - 8} width={54} height={16} rx={4} fill="#fff" opacity={0.92} stroke="#444" />
            <text x={ox} y={oy + 4} textAnchor="middle" fontSize={9.5} fill="#222">
              {label}
            </text>
          </g>
        );
      })}

      {/* buildings */}
      {Object.entries(state.pieces.buildings).map(([v, b]) => {
        const p = vertexToPixel(v as VertexId, SIZE);
        const c = colorOf(b.owner);
        if (b.kind === 'city') {
          return (
            <g key={`b-${v}`} style={{ pointerEvents: 'none' }}>
              <polygon
                points={`${p.x - 10},${p.y + 7} ${p.x - 10},${p.y - 2} ${p.x},${p.y - 10} ${p.x + 10},${p.y - 2} ${p.x + 10},${p.y + 7}`}
                fill={c}
                stroke="#111"
                strokeWidth={1.5}
              />
              <rect x={p.x - 3} y={p.y - 1} width={6} height={8} fill="#fff" opacity={0.8} />
            </g>
          );
        }
        return (
          <rect
            key={`b-${v}`}
            x={p.x - 6}
            y={p.y - 6}
            width={12}
            height={12}
            fill={c}
            stroke="#111"
            strokeWidth={1.5}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* settlement/city highlights */}
      {[...hl.vertices].map((v) => {
        const p = vertexToPixel(v as VertexId, SIZE);
        return (
          <g key={`hlv-${v}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={9}
              fill="rgba(255,238,51,0.6)"
              stroke="#111"
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={14}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onClick={() => onVertex(v as VertexId)}
            />
          </g>
        );
      })}
    </svg>
  );
}
