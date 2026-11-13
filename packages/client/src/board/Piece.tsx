// Roads, buildings and the blocker.
//
// BUG (pieces rendered BLACK): the art used to be drawn with <image href="/assets/...">,
// but an SVG loaded through <image> is an isolated document, so its fill="currentColor"
// never saw the player colour from the wrapping <g style={{color}}> and fell back to
// black. The art is now inlined (see pieceArt.ts): real SVG elements in this document,
// so currentColor resolves to the player colour while the art's 2 px ink outline stays.
// A vector fallback is still drawn when the art markup fails to load/parse.
//
// Colour-blind safety (docs/UI.md): colour is never the only signal — every settlement
// and city also carries the owner's emblem in a small parchment seal.
import type { EdgeId, Graph, Pieces, PlayerId, VertexId } from '@hexgame/engine';
import { edgeGeom, hexCenter, SIZE, vertexPos } from './geom';
import { playerColor, playerEmblem, EMBLEM_GLYPHS } from '../ui/colors';
import { EMBLEM_ART, PIECE_ART, type Art } from './pieceArt';

const INK = 'var(--ink)';

/** Nested inline <svg> showing one art file's markup; inherits colour from its parent. */
function InlineArt({
  art,
  x,
  y,
  width,
  height,
  className,
}: {
  art: Art;
  x: number;
  y: number;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={art.viewBox}
      className={className}
      dangerouslySetInnerHTML={{ __html: art.inner }}
    />
  );
}

/**
 * The owner's emblem in a small parchment seal (ink on parchment reads on every player
 * colour and every terrain). Falls back to the emblem glyph when the emblem art is
 * missing — still never colour alone.
 */
function EmblemSeal({ cx, cy, r, emblem }: { cx: number; cy: number; r: number; emblem: string }) {
  const art = EMBLEM_ART[emblem] ?? null;
  const e = r * 1.4;
  return (
    <g className="piece-emblem">
      <circle cx={cx} cy={cy} r={r} fill="var(--parchment)" stroke={INK} strokeWidth={1.4} />
      <g style={{ color: INK }}>
        {art ? (
          <InlineArt art={art} x={cx - e / 2} y={cy - e / 2} width={e} height={e} />
        ) : (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="piece-emblem-glyph">
            {EMBLEM_GLYPHS[emblem] ?? '•'}
          </text>
        )}
      </g>
    </g>
  );
}

export function Road({ edge, player, graph }: { edge: EdgeId; player: PlayerId; graph: Graph }) {
  const color = playerColor(player);
  const { a, b, mid, angle, len } = edgeGeom(graph, edge);
  const w = len * 0.94;
  const h = (w * 14) / 60;
  const art = PIECE_ART.road ?? null;
  if (art) {
    return (
      <g transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`} style={{ color }}>
        <InlineArt art={art} x={-w / 2} y={-h / 2} width={w} height={h} className="piece-body piece-road" />
      </g>
    );
  }
  return (
    <g className="piece-road">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={SIZE * 0.26} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={SIZE * 0.17} strokeLinecap="round" />
    </g>
  );
}

export function Building({ v, kind, player }: { v: VertexId; kind: string; player: PlayerId }) {
  const color = playerColor(player);
  const p = vertexPos(v);
  if (kind === 'city') return <CityImage v={v} player={player} color={color} p={p} />;
  return <SettlementImage v={v} player={player} color={color} p={p} />;
}

function SettlementImage({
  v,
  player,
  color,
  p,
}: {
  v: VertexId;
  player: PlayerId;
  color: string;
  p: { x: number; y: number };
}) {
  const s = SIZE * 0.6;
  const art = PIECE_ART.settlement ?? null;
  if (art) {
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ color }}>
        <InlineArt art={art} x={-s / 2} y={-s / 2} width={s} height={s} className="piece-body piece-settlement" />
        <EmblemSeal cx={s * 0.3} cy={s * 0.32} r={s * 0.18} emblem={playerEmblem(player)} />
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
      <EmblemSeal cx={s * 0.26} cy={s * 0.26} r={s * 0.16} emblem={playerEmblem(player)} />
      <title>{v}</title>
    </g>
  );
}

function CityImage({
  v,
  player,
  color,
  p,
}: {
  v: VertexId;
  player: PlayerId;
  color: string;
  p: { x: number; y: number };
}) {
  const s = SIZE * 0.82;
  const art = PIECE_ART.city ?? null;
  if (art) {
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ color }}>
        <InlineArt art={art} x={-s / 2} y={-s / 2} width={s} height={s} className="piece-body piece-city" />
        <EmblemSeal cx={s * 0.32} cy={s * 0.3} r={s * 0.15} emblem={playerEmblem(player)} />
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
      <EmblemSeal cx={s * 0.26} cy={s * 0.26} r={s * 0.14} emblem={playerEmblem(player)} />
      <title>{v}</title>
    </g>
  );
}

export function Blocker({ hexId }: { hexId: string }) {
  const art = PIECE_ART.blocker ?? null;
  const c = hexCenter(hexId);
  const h = SIZE * 0.85;
  const w = (h * 40) / 56;
  return (
    <g className="blocker" transform={`translate(${c.x} ${c.y})`}>
      {art ? (
        // The blocker is neutral: pinned to the ink colour (it used to render black).
        <g style={{ color: INK }}>
          <InlineArt art={art} x={-w / 2} y={-h / 2} width={w} height={h} className="piece-body piece-blocker" />
        </g>
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
