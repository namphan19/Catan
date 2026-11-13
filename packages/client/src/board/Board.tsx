// The SVG game board: sea frame, terrain hexes with number tokens, harbors, pieces.
// Zoom (wheel / buttons) and pan (drag). Highlights and click targets come in as props and
// are derived by GameTable from getLegalActions — this file has no rules logic.
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Board as EngineBoard,
  EdgeId,
  HexId,
  LayoutId,
  Pieces,
  VertexId,
} from '@hexgame/engine';
import { SIZE, getBoardGraph, boardExtent, edgeGeom, hexPoints, vertexPos } from './geom';
import { HexTile } from './HexTile';
import { Harbor } from './Harbor';
import { Blocker, PiecesLayer } from './Piece';
import { EMPTY_HIGHLIGHTS, HighlightsLayer, type Highlights } from './Highlights';
import { assetUrl, useAssets } from './assets';
import { useI18n } from '../i18n';

export interface BoardProps {
  layout: LayoutId;
  board: EngineBoard;
  pieces: Pieces;
  highlights?: Highlights;
  onVertex?: (v: VertexId) => void;
  onEdge?: (e: EdgeId) => void;
  onHex?: (h: HexId) => void;
  /** Background click (no pending action or nothing there) — used to cancel a selection. */
  onMiss?: () => void;
}

interface Tf {
  s: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;

export function Board({ layout, board, pieces, highlights, onVertex, onEdge, onHex, onMiss }: BoardProps) {
  const { t } = useI18n();
  const graph = useMemo(() => getBoardGraph(layout), [layout]);
  const ext = useMemo(() => boardExtent(graph), [graph]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tf, setTf] = useState<Tf>({ s: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const hl = highlights ?? EMPTY_HIGHLIGHTS;

  // Wheel zoom anchored at the cursor (native listener so preventDefault works).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = el.getScreenCTM();
      if (!ctm) return;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      setTf((prev) => {
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.s * Math.exp(-e.deltaY * 0.0012)));
        const bx = (pt.x - prev.tx) / prev.s;
        const by = (pt.y - prev.ty) / prev.s;
        return { s, tx: pt.x - bx * s, ty: pt.y - by * s };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pan by dragging anywhere on the board.
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: tf.tx, ty: tf.ty, moved: false };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const pxPerUnit = rect.width / ext.w;
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const dx = ev.clientX - drag.current.x;
      const dy = ev.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
      setTf((prev) => ({ ...prev, tx: drag.current!.tx + dx / pxPerUnit, ty: drag.current!.ty + dy / pxPerUnit }));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const zoomBy = (f: number) => {
    setTf((prev) => ({ ...prev, s: Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.s * f)) }));
  };

  const seaPath = assetUrl('terrain', 'sea');
  const seaOk = useAssets([seaPath])[seaPath];

  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        className="board-svg"
        viewBox={`${ext.x} ${ext.y} ${ext.w} ${ext.h}`}
        role="application"
        aria-label={t('appTitle')}
        onPointerDown={onPointerDown}
      >
        <defs>
          <pattern id="seaPat" width={SIZE * 1.2} height={SIZE * 1.2} patternUnits="userSpaceOnUse">
            <image href={seaPath} width={SIZE * 1.2} height={SIZE * 1.2} />
          </pattern>
        </defs>
        <g transform={`translate(${tf.tx} ${tf.ty}) scale(${tf.s})`}>
          <rect
            x={ext.x - SIZE}
            y={ext.y - SIZE}
            width={ext.w + 2 * SIZE}
            height={ext.h + 2 * SIZE}
            fill={seaOk ? 'url(#seaPat)' : 'var(--sea)'}
            onClick={() => onMiss?.()}
          />
          {board.hexes.map((h) => (
            <HexTile key={h.id} hex={h} />
          ))}
          {board.harbors.map((hb, i) => (
            <Harbor key={i} harbor={hb} graph={graph} />
          ))}
          <PiecesLayer pieces={pieces} graph={graph} />
          <Blocker hexId={board.blocker} />
          <HighlightsLayer hl={hl} graph={graph} />

          {/* Click targets: only highlighted spots are interactive (pointer-events in CSS). */}
          {[...hl.vertices].map((v) => (
            <circle
              key={`hitv${v}`}
              cx={vertexPos(v as VertexId).x}
              cy={vertexPos(v as VertexId).y}
              r={SIZE * 0.3}
              className="hit hit-vertex"
              role="button"
              aria-label={`${t('board_vertex')} ${v}`}
              onClick={(e) => {
                e.stopPropagation();
                onVertex?.(v as VertexId);
              }}
            >
              <title>{`${t('board_vertex')} ${v}`}</title>
            </circle>
          ))}
          {[...hl.edges].map((e) => (
            <EdgeHit
              key={`hite${e}`}
              edge={e as EdgeId}
              layout={layout}
              onEdge={onEdge}
              label={`${t('board_edge')} ${e}`}
            />
          ))}
          {[...hl.hexes].map((h) => (
            <polygon
              key={`hith${h}`}
              points={hexPointsOf(h)}
              className="hit hit-hex"
              role="button"
              aria-label={`${t('board_hex')} ${h}`}
              onClick={(e) => {
                e.stopPropagation();
                onHex?.(h as HexId);
              }}
            >
              <title>{`${t('board_hex')} ${h}`}</title>
            </polygon>
          ))}
        </g>
      </svg>
      <div className="board-zoom">
        <button type="button" className="btn btn-icon" onClick={() => zoomBy(1.25)} aria-label={t('board_zoomIn')}>
          ＋
        </button>
        <button type="button" className="btn btn-icon" onClick={() => zoomBy(0.8)} aria-label={t('board_zoomOut')}>
          －
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setTf({ s: 1, tx: 0, ty: 0 })}
          aria-label={t('board_reset')}
        >
          ⤢
        </button>
      </div>
    </div>
  );
}

function hexPointsOf(id: string): string {
  const [q, r] = id.slice(2).split(',').map(Number);
  return hexPoints(q, r);
}

function EdgeHit({
  edge,
  layout,
  onEdge,
  label,
}: {
  edge: EdgeId;
  layout: LayoutId;
  onEdge?: (e: EdgeId) => void;
  label: string;
}) {
  const g = edgeGeom(getBoardGraph(layout), edge);
  return (
    <line
      x1={g.a.x}
      y1={g.a.y}
      x2={g.b.x}
      y2={g.b.y}
      className="hit hit-edge"
      role="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onEdge?.(edge);
      }}
    >
      <title>{label}</title>
    </line>
  );
}
