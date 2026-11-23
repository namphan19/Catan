// Board overlay of the Tidelands expansion: cogs, the corsair / corsair fleet, rewards on edges,
// weavers' villages, wonder sites, corsair forts and landings. Display only (board coordinates).
// Painted sprites (Tripo art, docs/ART_TIDELANDS.md) once they have loaded; the simple vector shapes
// stay as the fallback (same rule as the base pieces).
import type { EdgeId, Graph, HexId, PlayerId, Pieces, VertexId } from '@hexgame/engine';
import { edgeGeom, hexCenter, SIZE, vertexPos } from '../board/geom';
import { Sprite, useSprite } from '../board/Piece';
import { art2dUrl, useAssets } from '../board/assets';
import { playerColor } from '../ui/colors';
import { useI18n } from '../i18n';
import type { TlView } from './view';

const SHADOW = { filter: 'drop-shadow(0 1.5px 1.2px rgba(27, 21, 18, 0.5))' };

/** URL of a painted icon once it has loaded, else null. */
function useIcon(name: string | undefined): string | null {
  const url = name ? art2dUrl('icon', name) : '';
  const ok = useAssets(url ? [url] : [])[url];
  return ok ? url : null;
}

/**
 * A cog lying on its edge like a road (PO request): a top-down piece (art2d/piece/cog-top, seen from
 * straight above, bow to the left) rotated to the edge and centred on it, so it sits in the seam
 * without the skew a rotated side-view sprite had. The angle is folded into (-90, 90].
 */
function Cog({ graph, e, owner, war }: { graph: Graph; e: EdgeId; owner: PlayerId; war?: boolean }) {
  const g = edgeGeom(graph, e);
  const s = SIZE * 0.36;
  const a = ((g.angle % 180) + 180) % 180;
  const angle = a > 90 ? a - 180 : a;
  const color = playerColor(owner);
  const name = war ? 'warship-top' : 'cog-top';
  const painted = useSprite(name);
  if (painted) {
    const w = g.len * 0.86; // hull length along the edge; the sprite keeps its aspect inside the box
    // Shadow on the outer group so it keeps falling downwards whatever the hull's rotation.
    return (
      <g className={`tl-cog${war ? ' tl-warship' : ''}`} transform={`translate(${g.mid.x} ${g.mid.y})`} data-owner={owner} pointerEvents="none" style={SHADOW}>
        <g transform={`rotate(${angle})`}>
          <Sprite name={name} x={-w / 2} y={-w / 2} width={w} height={w} owner={owner} />
        </g>
      </g>
    );
  }
  return (
    <g className={`tl-cog${war ? ' tl-warship' : ''}`} transform={`translate(${g.mid.x} ${g.mid.y}) rotate(${angle})`} data-owner={owner} pointerEvents="none">
      <path
        d={`M ${-s} ${-s * 0.05} L ${s} ${-s * 0.05} L ${s * 0.65} ${s * 0.42} L ${-s * 0.65} ${s * 0.42} Z`}
        fill={war ? '#2b2420' : color}
        stroke="var(--ink)"
        strokeWidth={1.6}
      />
      <line x1={0} y1={-s * 0.05} x2={0} y2={-s * 1.15} stroke="var(--ink)" strokeWidth={1.4} />
      <path d={`M 0 ${-s * 1.1} L ${s * 0.72} ${-s * 0.32} L 0 ${-s * 0.32} Z`} fill={war ? color : '#f4ead2'} stroke="var(--ink)" strokeWidth={1.2} />
    </g>
  );
}

/** The corsair (or the corsair fleet): a dark ship with a red sail on its hex. */
function Corsair({ hex, fleet }: { hex: HexId; fleet?: boolean }) {
  const { t } = useI18n();
  const c = hexCenter(hex);
  const s = SIZE * 0.5;
  const painted = useSprite('corsair');
  if (painted) {
    const w = SIZE * 1.0;
    return (
      <g className="tl-corsair" transform={`translate(${c.x} ${c.y + SIZE * 0.1})`} pointerEvents="none" style={SHADOW}>
        <title>{t(fleet ? 'tl_fleet' : 'tl_corsair')}</title>
        <Sprite name="corsair" x={-w / 2} y={-w * 0.66} width={w} height={w} />
        {fleet && (
          <g transform={`translate(${w * 0.36} ${-w * 0.5})`}>
            <circle r={SIZE * 0.15} fill="#1f1a17" stroke="#9c2a22" strokeWidth={1.5} />
            <text y={SIZE * 0.06} textAnchor="middle" fontSize={SIZE * 0.18} fill="#f4ead2">
              ☠
            </text>
          </g>
        )}
      </g>
    );
  }
  return (
    <g className="tl-corsair" transform={`translate(${c.x} ${c.y + SIZE * 0.1})`} pointerEvents="none">
      <title>{t(fleet ? 'tl_fleet' : 'tl_corsair')}</title>
      <ellipse cx={0} cy={s * 0.55} rx={s * 0.95} ry={s * 0.22} fill="rgba(27,21,18,0.35)" />
      <path d={`M ${-s} 0 L ${s} 0 L ${s * 0.6} ${s * 0.5} L ${-s * 0.6} ${s * 0.5} Z`} fill="#1f1a17" stroke="#000" strokeWidth={1.5} />
      <line x1={0} y1={0} x2={0} y2={-s * 1.2} stroke="#000" strokeWidth={2} />
      <path d={`M 0 ${-s * 1.15} L ${s * 0.85} ${-s * 0.25} L 0 ${-s * 0.25} Z`} fill="#9c2a22" stroke="#000" strokeWidth={1.2} />
      {fleet && <text x={-s * 0.55} y={-s * 0.45} fontSize={s * 0.55} fill="#f4ead2">☠</text>}
    </g>
  );
}

const REWARD_GLYPH: Record<string, string> = { vp: '★', card: '▤', harbor: '⚓' };

const REWARD_ICON: Record<string, string> = { vp: 'reward-vp', card: 'reward-card', harbor: 'reward-harbor' };
const MARK_ICON: Record<string, string> = { wall: 'wonder-wall', bridge: 'wonder-bridge', beacon: 'wonder-beacon' };

/** A round token: the painted icon once it has loaded, else the text glyph. */
function Badge({ x, y, text, icon, fill = '#f4ead2', ink = 'var(--ink)', r = SIZE * 0.2 }: { x: number; y: number; text: string; icon?: string; fill?: string; ink?: string; r?: number }) {
  const url = useIcon(icon);
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r} fill={fill} stroke="var(--ink)" strokeWidth={1.3} />
      {url ? (
        <image href={url} x={-r * 0.82} y={-r * 0.82} width={r * 1.64} height={r * 1.64} />
      ) : (
        <text y={r * 0.36} textAnchor="middle" fontSize={r * 1.1} fill={ink} fontWeight={700}>
          {text}
        </text>
      )}
    </g>
  );
}

/** Silk supply of a weavers' village: the silk bolt icon (once loaded) next to the count. */
function SilkBadge({ x, y, n }: { x: number; y: number; n: number }) {
  const url = useIcon('silk');
  const r = SIZE * 0.17;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {url && <image href={url} x={-r * 2.3} y={-r * 0.95} width={r * 1.9} height={r * 1.9} />}
      <circle r={r} fill="#f3d7e6" stroke="var(--ink)" strokeWidth={1.3} />
      <text y={r * 0.36} textAnchor="middle" fontSize={r * 1.1} fill="var(--ink)" fontWeight={700}>
        {n}
      </text>
    </g>
  );
}

/** A corsair fort (Corsair Coves) with its lair count, and its owner's landing flag. */
function FortSeat({ fort, landing, owner, lairs }: { fort: VertexId; landing: VertexId; owner: PlayerId; lairs: number }) {
  const f = vertexPos(fort);
  const l = vertexPos(landing);
  const fortArt = useSprite('fort');
  const flagArt = useSprite('landing');
  const fw = SIZE * 0.62;
  const lw = SIZE * 0.46;
  return (
    <g pointerEvents="none">
      {lairs > 0 &&
        (fortArt ? (
          <g transform={`translate(${f.x} ${f.y})`} style={SHADOW}>
            <Sprite name="fort" x={-fw / 2} y={-fw * 0.62} width={fw} height={fw} />
            <circle cx={fw * 0.34} cy={-fw * 0.42} r={SIZE * 0.13} fill="#3b2f2f" stroke={playerColor(owner)} strokeWidth={2.5} />
            <text x={fw * 0.34} y={-fw * 0.42 + SIZE * 0.06} textAnchor="middle" fontSize={SIZE * 0.17} fill="#f4ead2" fontWeight={700}>
              {lairs}
            </text>
          </g>
        ) : (
          <g transform={`translate(${f.x} ${f.y})`}>
            <rect x={-SIZE * 0.24} y={-SIZE * 0.24} width={SIZE * 0.48} height={SIZE * 0.4} fill="#3b2f2f" stroke={playerColor(owner)} strokeWidth={3} />
            <text y={SIZE * 0.08} textAnchor="middle" fontSize={SIZE * 0.26} fill="#f4ead2" fontWeight={700}>
              {lairs}
            </text>
          </g>
        ))}
      {flagArt ? (
        <g transform={`translate(${l.x} ${l.y})`} style={SHADOW}>
          <Sprite name="landing" x={-lw / 2} y={-lw * 0.9} width={lw} height={lw} owner={owner} />
        </g>
      ) : (
        <path d={`M ${l.x} ${l.y} l 0 ${-SIZE * 0.42} l ${SIZE * 0.26} ${SIZE * 0.09} l ${-SIZE * 0.26} ${SIZE * 0.09}`} fill={playerColor(owner)} stroke="var(--ink)" strokeWidth={1.2} />
      )}
    </g>
  );
}

const MARK_GLYPH: Record<string, string> = { wall: '▮', bridge: '⌒', beacon: '✦', x: '✕' };

export function SeaExtras({ graph, pieces, tl }: { graph: Graph; pieces: Pieces; tl: TlView }) {
  const ships = Object.entries(pieces.ships ?? {});
  const cv = tl.coves;
  const warships = new Set<string>();
  if (cv) for (const [p, line] of Object.entries(cv.lines)) line.slice(0, cv.war[p] ?? 0).forEach((e) => warships.add(e));
  return (
    <g className="tl-extras">
      {cv && cv.fleet >= 0 && cv.loop.length > 1 && (
        <polyline
          className="tl-fleet-loop"
          points={[...cv.loop, cv.loop[0]].map((h) => `${hexCenter(h).x},${hexCenter(h).y}`).join(' ')}
          fill="none"
          stroke="rgba(156,42,34,0.45)"
          strokeWidth={3}
          strokeDasharray="6 8"
          pointerEvents="none"
        />
      )}
      {tl.works?.markers.map((m, i) => {
        const p = vertexPos(m.v as VertexId);
        return <Badge key={`m${i}`} x={p.x} y={p.y} text={MARK_GLYPH[m.kind] ?? '•'} icon={MARK_ICON[m.kind]} r={SIZE * 0.15} fill={m.kind === 'x' ? '#ddd' : '#e9d9a6'} />;
      })}
      {Object.entries(tl.silk?.villages ?? {}).map(([h, v]) => {
        const c = hexCenter(h as HexId);
        return (
          <g key={`vil${h}`} pointerEvents="none">
            <SilkBadge x={c.x + SIZE * 0.42} y={c.y - SIZE * 0.42} n={v.silk} />
            {v.traders.map((p, i) => (
              <circle key={p} cx={c.x - SIZE * 0.45 + i * SIZE * 0.2} cy={c.y + SIZE * 0.55} r={SIZE * 0.08} fill={playerColor(p)} stroke="var(--ink)" strokeWidth={1} />
            ))}
          </g>
        );
      })}
      {Object.entries(tl.castaways?.rewards ?? {}).map(([e, kind]) => {
        const g = edgeGeom(graph, e as EdgeId);
        return <Badge key={`rw${e}`} x={g.mid.x} y={g.mid.y} text={REWARD_GLYPH[kind] ?? '?'} icon={REWARD_ICON[kind]} fill={kind === 'vp' ? '#f2d16b' : '#f4ead2'} />;
      })}
      {cv &&
        Object.entries(cv.seats).map(([p, seat]) => (
          <FortSeat key={`fort${p}`} fort={seat.fort as VertexId} landing={seat.landing as VertexId} owner={p as PlayerId} lairs={cv.lairs[p] ?? 0} />
        ))}
      {ships.map(([e, owner]) => (
        <Cog key={`cog${e}`} graph={graph} e={e as EdgeId} owner={owner} war={warships.has(e)} />
      ))}
      {tl.corsair && <Corsair hex={tl.corsair as HexId} fleet={!!cv} />}
    </g>
  );
}
