// Board overlay of the Tidelands expansion: cogs, the corsair / corsair fleet, rewards on edges,
// weavers' villages, wonder sites, corsair forts and landings. Display only (board coordinates).
// PLACEHOLDER ART: simple vector shapes in the player colours until the design team delivers the
// pieces listed in docs/ART_TIDELANDS.md (cog, warship, corsair, fort, reward tokens, silk, wonders).
import type { EdgeId, Graph, HexId, PlayerId, Pieces, VertexId } from '@hexgame/engine';
import { edgeGeom, hexCenter, SIZE, vertexPos } from '../board/geom';
import { playerColor } from '../ui/colors';
import { useI18n } from '../i18n';
import type { TlView } from './view';

/** A cog: hull + sail, rotated along its edge (placeholder art). */
function Cog({ graph, e, owner, war }: { graph: Graph; e: EdgeId; owner: PlayerId; war?: boolean }) {
  const g = edgeGeom(graph, e);
  const s = SIZE * 0.36;
  const angle = ((g.angle % 180) + 180) % 180; // keep the sail upright-ish
  const color = playerColor(owner);
  return (
    <g className={`tl-cog${war ? ' tl-warship' : ''}`} transform={`translate(${g.mid.x} ${g.mid.y}) rotate(${angle > 90 ? angle - 180 : angle})`} data-owner={owner} pointerEvents="none">
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

function Badge({ x, y, text, fill = '#f4ead2', ink = 'var(--ink)', r = SIZE * 0.2 }: { x: number; y: number; text: string; fill?: string; ink?: string; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r} fill={fill} stroke="var(--ink)" strokeWidth={1.3} />
      <text y={r * 0.36} textAnchor="middle" fontSize={r * 1.1} fill={ink} fontWeight={700}>
        {text}
      </text>
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
        return <Badge key={`m${i}`} x={p.x} y={p.y} text={MARK_GLYPH[m.kind] ?? '•'} r={SIZE * 0.15} fill={m.kind === 'x' ? '#ddd' : '#e9d9a6'} />;
      })}
      {Object.entries(tl.silk?.villages ?? {}).map(([h, v]) => {
        const c = hexCenter(h as HexId);
        return (
          <g key={`vil${h}`} pointerEvents="none">
            <Badge x={c.x + SIZE * 0.42} y={c.y - SIZE * 0.42} text={String(v.silk)} fill="#f3d7e6" r={SIZE * 0.17} />
            {v.traders.map((p, i) => (
              <circle key={p} cx={c.x - SIZE * 0.45 + i * SIZE * 0.2} cy={c.y + SIZE * 0.55} r={SIZE * 0.08} fill={playerColor(p)} stroke="var(--ink)" strokeWidth={1} />
            ))}
          </g>
        );
      })}
      {Object.entries(tl.castaways?.rewards ?? {}).map(([e, kind]) => {
        const g = edgeGeom(graph, e as EdgeId);
        return <Badge key={`rw${e}`} x={g.mid.x} y={g.mid.y} text={REWARD_GLYPH[kind] ?? '?'} fill={kind === 'vp' ? '#f2d16b' : '#f4ead2'} />;
      })}
      {cv &&
        Object.entries(cv.seats).map(([p, seat]) => {
          const f = vertexPos(seat.fort as VertexId);
          const l = vertexPos(seat.landing as VertexId);
          const lairs = cv.lairs[p] ?? 0;
          return (
            <g key={`fort${p}`} pointerEvents="none">
              {lairs > 0 && (
                <g transform={`translate(${f.x} ${f.y})`}>
                  <rect x={-SIZE * 0.24} y={-SIZE * 0.24} width={SIZE * 0.48} height={SIZE * 0.4} fill="#3b2f2f" stroke={playerColor(p)} strokeWidth={3} />
                  <text y={SIZE * 0.08} textAnchor="middle" fontSize={SIZE * 0.26} fill="#f4ead2" fontWeight={700}>
                    {lairs}
                  </text>
                </g>
              )}
              <path d={`M ${l.x} ${l.y} l 0 ${-SIZE * 0.42} l ${SIZE * 0.26} ${SIZE * 0.09} l ${-SIZE * 0.26} ${SIZE * 0.09}`} fill={playerColor(p)} stroke="var(--ink)" strokeWidth={1.2} />
            </g>
          );
        })}
      {ships.map(([e, owner]) => (
        <Cog key={`cog${e}`} graph={graph} e={e as EdgeId} owner={owner} war={warships.has(e)} />
      ))}
      {tl.corsair && <Corsair hex={tl.corsair as HexId} fleet={!!cv} />}
    </g>
  );
}
