// The SVG game board: sea frame, terrain hexes with number tokens, harbors, pieces.
// Zoom (wheel / buttons) and pan (drag). Highlights and click targets come in as props and
// are derived by GameTable from getLegalActions — this file has no rules logic.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** Hexes that just produced (pulse once after a roll). Display only; 2D board. */
  producing?: ReadonlySet<string>;
  /** Extra SVG drawn over the pieces in board coordinates (expansion pieces). 2D board only. */
  overlay?: ReactNode;
}

interface Tf {
  s: number;
  tx: number;
  ty: number;
}

/** How far the sea rectangle extends past the board extent (user units). */
const SEA_PAD = SIZE * 30;

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;

/** A press must move this far (in client px) before it counts as a pan (BUG-QA-02). */
const PAN_THRESHOLD = 5;

export function Board({ layout, board, pieces, highlights, onVertex, onEdge, onHex, onMiss, producing, overlay }: BoardProps) {
  const { t } = useI18n();
  const graph = useMemo(() => getBoardGraph(layout), [layout]);
  const ext = useMemo(() => boardExtent(graph), [graph]);
  // Screen-reader / tooltip names for spots: the neighbouring tiles ("Rừng 8, Ruộng lúa 3"),
  // never internal ids like "v:-1,2,N" (ids stay in data-id for tests and debugging).
  const hexName = useMemo(() => {
    const byId = new Map(board.hexes.map((h) => [h.id, h] as const));
    return (id: string) => {
      const h = byId.get(id as never);
      if (!h) return t('terrain_sea');
      return `${t(`terrain_${h.terrain}`)}${h.token ? ` ${h.token}` : ''}`;
    };
  }, [board.hexes, t]);
  const spotLabel = (ids: readonly string[] | undefined, kind: string) => {
    const names = (ids ?? []).map(hexName);
    return names.length ? `${t(kind)}: ${names.join(', ')}` : t(kind);
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const [tf, setTf] = useState<Tf>({ s: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; active: boolean } | null>(null);
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

  // Pan by dragging anywhere on the board — but only once the pointer has clearly moved.
  // A press-and-release without movement must NOT capture the pointer, so the browser
  // delivers a real `click` to the highlighted hit target underneath (BUG-QA-02).
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Clear a selection left from before (e.g. a double click) so the drag starts clean.
    window.getSelection()?.removeAllRanges();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: tf.tx, ty: tf.ty, active: false };
    const pxPerUnit = rect.width / ext.w;
    const pointerId = e.pointerId;
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const dx = ev.clientX - drag.current.x;
      const dy = ev.clientY - drag.current.y;
      if (!drag.current.active) {
        if (Math.abs(dx) + Math.abs(dy) <= PAN_THRESHOLD) return; // still just a press
        drag.current.active = true;
        svgRef.current?.setPointerCapture(pointerId);
      }
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
          {/* The sea reaches far beyond the viewBox: the letterboxed area around the fitted
              board (and any pan / zoom-out) shows the same wave pattern, never a flat seam. */}
          <rect
            x={ext.x - SEA_PAD}
            y={ext.y - SEA_PAD}
            width={ext.w + 2 * SEA_PAD}
            height={ext.h + 2 * SEA_PAD}
            fill={seaOk ? 'url(#seaPat)' : 'var(--sea)'}
            onClick={() => onMiss?.()}
          />
          {board.hexes.map((h) => (
            <HexTile key={h.id} hex={h} producing={producing?.has(h.id)} />
          ))}
          {board.harbors.map((hb, i) => (
            <Harbor key={i} harbor={hb} graph={graph} />
          ))}
          <PiecesLayer pieces={pieces} graph={graph} />
          {board.blocker && <Blocker hexId={board.blocker} />}
          {overlay}
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
              aria-label={spotLabel(graph.vertexHexes[v as VertexId], 'board_vertex')}
              data-id={v}
              onClick={(e) => {
                e.stopPropagation();
                onVertex?.(v as VertexId);
              }}
            >
              <title>{spotLabel(graph.vertexHexes[v as VertexId], 'board_vertex')}</title>
            </circle>
          ))}
          {[...hl.edges].map((e) => (
            <EdgeHit
              key={`hite${e}`}
              edge={e as EdgeId}
              layout={layout}
              onEdge={onEdge}
              label={spotLabel(graph.edgeHexes[e as EdgeId], 'board_edge')}
            />
          ))}
          {[...hl.hexes].map((h) => (
            <polygon
              key={`hith${h}`}
              points={hexPointsOf(h)}
              className="hit hit-hex"
              role="button"
              aria-label={`${t('board_hex')} ${hexName(h)}`}
              data-id={h}
              onClick={(e) => {
                e.stopPropagation();
                onHex?.(h as HexId);
              }}
            >
              <title>{`${t('board_hex')} ${hexName(h)}`}</title>
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
  // A quad (not a <line>): a horizontal line's bounding box has height 0, which real
  // clicks (Playwright locator.click) could never target. Half-width matches the old
  // stroke-width of 12 user units.
  const half = 6;
  const dx = g.b.x - g.a.x;
  const dy = g.b.y - g.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * half;
  const py = (dx / len) * half;
  const pts = [
    [g.a.x + px, g.a.y + py],
    [g.b.x + px, g.b.y + py],
    [g.b.x - px, g.b.y - py],
    [g.a.x - px, g.a.y - py],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return (
    <polygon
      points={pts}
      className="hit hit-edge"
      role="button"
      aria-label={label}
      data-id={edge}
      onClick={(e) => {
        e.stopPropagation();
        onEdge?.(edge);
      }}
    >
      <title>{label}</title>
    </polygon>
  );
}
