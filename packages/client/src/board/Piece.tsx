// Roads, buildings and the blocker.
//
// BUG (pieces rendered BLACK): the art used to be drawn with <image href="/assets/...">,
// but an SVG loaded through <image> is an isolated document, so its fill="currentColor"
// never saw the player colour from the wrapping <g style={{color}}> and fell back to
// black. The art is now inlined (see pieceArt.ts): real SVG elements in this document,
// so currentColor resolves to the player colour while the art's 2 px ink outline stays.
// A vector fallback is still drawn when the art markup fails to load/parse.
//
// Player emblems are no longer drawn on the pieces (PO decision 2026-11-18: the painted
// board is clear enough and the seals cluttered it); pieces are told apart by seat colour,
// and every piece keeps its owner in data-owner / the tooltip.
import type { EdgeId, Graph, Pieces, PlayerId, VertexId } from '@hexgame/engine';
import { edgeGeom, hexCenter, SIZE, vertexPos } from './geom';
import { playerColor, seatIndex } from '../ui/colors';
import { PIECE_ART, type Art } from './pieceArt';
import { art2dUrl, useAssets } from './assets';

// ---- Painted sprites (Tripo art, tools/art/build.py) -------------------------------------
// Player pieces are painted in neutral grey; a multiply filter tints them with the seat
// colour (one filter per seat, defined once in the board's <defs>), so the shading of the
// painted art survives while the colour follows the player. Neutral pieces (robber, wall,
// capital, rubble) keep their own colours. Every sprite falls back to the vector art.

const SEATS = [1, 2, 3, 4, 5, 6];

/** Tint filters for every seat; render once inside the board <svg><defs>. */
export function PieceTintDefs() {
  return (
    <>
      {SEATS.map((n) => (
        <filter key={n} id={`tint-p${n}`} colorInterpolationFilters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
          <feFlood style={{ floodColor: `var(--p${n})` }} result="c" />
          <feBlend in="c" in2="SourceGraphic" mode="multiply" result="m" />
          <feComposite in="m" in2="SourceAlpha" operator="in" />
        </filter>
      ))}
    </>
  );
}

/** True once the painted sprite for this piece has loaded. */
export function useSprite(name: string): boolean {
  const url = art2dUrl('piece', name);
  return useAssets([url])[url];
}

/** A painted piece fitted (aspect kept) into the box; tinted with the owner's seat colour. */
export function Sprite({
  name,
  x,
  y,
  width,
  height,
  owner,
  className,
  align = 'xMidYMid',
}: {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  owner?: PlayerId | string;
  className?: string;
  align?: string;
}) {
  return (
    <image
      href={art2dUrl('piece', name)}
      x={x}
      y={y}
      width={width}
      height={height}
      preserveAspectRatio={align === 'none' ? 'none' : `${align} meet`}
      className={className}
      filter={owner ? `url(#tint-p${seatIndex(owner)})` : undefined}
      data-sprite={name}
    />
  );
}

const SPRITE_SHADOW = { filter: 'drop-shadow(0 1.5px 1.2px rgba(27, 21, 18, 0.5))' };

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


export function Road({ edge, player, graph }: { edge: EdgeId; player: PlayerId; graph: Graph }) {
  const color = playerColor(player);
  const { mid, angle, len } = edgeGeom(graph, edge);
  // A flat top-down bar centred exactly on the grid edge, so it lies in the seam between the
  // two tiles (a perspective sprite stretched along the edge looked skewed and off the edge -
  // PO feedback). Plain shapes to match the simple pieces; ink outline + player colour.
  const rw = len * 0.8;
  const t = SIZE * 0.17;
  return (
    <g transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`} style={SPRITE_SHADOW}>
      <g className="piece-body piece-road" style={{ color }} data-owner={player}>
        <rect x={-rw / 2} y={-t / 2} width={rw} height={t} rx={t * 0.32} fill="currentColor" stroke="#3B2F2F" strokeWidth={1.3} />
        <rect x={-rw / 2 + 2} y={-t / 2 + 1.1} width={rw - 4} height={t * 0.26} rx={t * 0.13} fill="#FFFFFF" opacity={0.32} />
        <rect x={-rw / 2 + 2} y={t / 2 - 1.1 - t * 0.2} width={rw - 4} height={t * 0.2} rx={t * 0.1} fill="#1B1512" opacity={0.18} />
      </g>
    </g>
  );
}

export function Building({ v, kind, player }: { v: VertexId; kind: string; player: PlayerId }) {
  const color = playerColor(player);
  const p = vertexPos(v);
  if (kind === 'city') return <CityImage v={v} player={player} color={color} p={p} />;
  return <SettlementImage v={v} player={player} color={color} p={p} />;
}

/** Pieces in the 2D board are 30% larger than the artist's nominal size (PO request). */
const PIECE_SCALE_2D = 1.3;

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
  const s = SIZE * 0.6 * PIECE_SCALE_2D;
  const art = PIECE_ART.settlement ?? null;
  const painted = useSprite('settlement');
  if (painted) {
    // Kept small next to the number tokens (PO: pieces were too big).
    const ps = SIZE * 0.52;
    return (
      <g transform={`translate(${p.x} ${p.y})`} data-owner={player}>
        <g style={SPRITE_SHADOW}>
          <Sprite name="settlement" x={-ps / 2} y={-ps * 0.6} width={ps} height={ps} owner={player} className="piece-body piece-settlement" />
        </g>
        <title>{v}</title>
      </g>
    );
  }
  if (art) {
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ color }}>
        <InlineArt art={art} x={-s / 2} y={-s / 2} width={s} height={s} className="piece-body piece-settlement" />
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
  const s = SIZE * 0.82 * PIECE_SCALE_2D;
  // The city art is 52x44: keep that aspect (no stretching) instead of the old square box.
  const sh = s * (44 / 52);
  const art = PIECE_ART.city ?? null;
  const painted = useSprite('city');
  if (painted) {
    const ps = SIZE * 0.7;
    return (
      <g transform={`translate(${p.x} ${p.y})`} data-owner={player}>
        <g style={SPRITE_SHADOW}>
          <Sprite name="city" x={-ps / 2} y={-ps * 0.62} width={ps} height={ps} owner={player} className="piece-body piece-city" />
        </g>
        <title>{v}</title>
      </g>
    );
  }
  if (art) {
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ color }}>
        <InlineArt art={art} x={-s / 2} y={-sh / 2} width={s} height={sh} className="piece-body piece-city" />
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
  const art = PIECE_ART.blocker ?? null;
  const c = hexCenter(hexId);
  const h = SIZE * 0.85;
  const w = (h * 40) / 56;
  const painted = useSprite('blocker');
  return (
    <g className="blocker" transform={`translate(${c.x} ${c.y})`}>
      {painted ? (
        // Beside the number token (not on it) so the blocked number stays readable, on a
        // pale ground spot so the dark figure reads on dark terrain too.
        <g transform={`translate(${SIZE * 0.5} ${SIZE * 0.02})`}>
          <ellipse cy={h * 0.36} rx={h * 0.36} ry={h * 0.13} fill="rgba(243, 233, 210, 0.8)" stroke="rgba(59, 47, 47, 0.6)" strokeWidth={1.2} />
          <g style={SPRITE_SHADOW}>
            <Sprite name="blocker" x={-h * 0.5} y={-h * 0.62} width={h} height={h} className="piece-body piece-blocker" />
          </g>
        </g>
      ) : art ? (
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
