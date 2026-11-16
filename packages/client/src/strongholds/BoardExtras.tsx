// Strongholds pieces drawn on top of the 2D board (inside the board's own coordinate system):
// wardens, ramparts, capitals, the caravan and toppled cities. Original, simple map-style shapes.
import type { Pieces, StrongholdsView } from '@hexgame/engine';
import { SIZE, hexCenter, vertexPos } from '../board/geom';
import { useI18n } from '../i18n';
import { useName } from '../shell/names';
import { playerColor } from '../ui/colors';
import { trackName } from './labels';

const INK = 'var(--ink)';
const PARCHMENT = 'var(--parchment)';

/** A heater shield; the fill shows the owner, bars show the rank, a faded look means inactive. */
function Warden({ v, owner, level, active }: { v: string; owner: string; level: number; active: boolean }) {
  const { t } = useI18n();
  const name = useName();
  const p = vertexPos(v);
  const s = SIZE * 0.24;
  const color = playerColor(owner);
  const shield = `M ${-s} ${-s} H ${s} V ${s * 0.15} Q ${s} ${s * 0.95} 0 ${s * 1.3} Q ${-s} ${s * 0.95} ${-s} ${s * 0.15} Z`;
  const label = `${t('sh_warden')} ${t('sh_rank', { n: level })} · ${name(owner)} · ${t(active ? 'sh_active' : 'sh_inactive')}`;
  return (
    <g className={`sh-warden${active ? ' active' : ' inactive'}`} transform={`translate(${p.x} ${p.y})`} data-owner={owner} data-level={level}>
      {active && <circle r={s * 1.55} cy={s * 0.1} fill="none" stroke="var(--gold)" strokeWidth={3} />}
      <path d={shield} fill={active ? color : PARCHMENT} stroke={INK} strokeWidth={2} />
      {!active && <path d={shield} fill={color} opacity={0.35} stroke="none" />}
      {Array.from({ length: level }, (_, i) => (
        <line
          key={i}
          x1={-s * 0.55}
          x2={s * 0.55}
          y1={-s * 0.55 + i * s * 0.42}
          y2={-s * 0.55 + i * s * 0.42}
          stroke={INK}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      <title>{label}</title>
    </g>
  );
}

/** Crenellated wall in front of a city. */
function Rampart({ v }: { v: string }) {
  const { t } = useI18n();
  const p = vertexPos(v);
  const w = SIZE * 0.92;
  const h = SIZE * 0.16;
  const y = SIZE * 0.3;
  const merlon = w / 7;
  return (
    <g className="sh-rampart" transform={`translate(${p.x} ${p.y})`}>
      <rect x={-w / 2} y={y} width={w} height={h} fill="#8A8D91" stroke={INK} strokeWidth={2} />
      {[0, 2, 4, 6].map((i) => (
        <rect key={i} x={-w / 2 + i * merlon} y={y - h * 0.6} width={merlon} height={h * 0.6} fill="#8A8D91" stroke={INK} strokeWidth={2} />
      ))}
      <title>{t('sh_rampart')}</title>
    </g>
  );
}

function star(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = (-90 + i * 36) * (Math.PI / 180);
    pts.push(`${(rad * Math.cos(ang)).toFixed(1)},${(rad * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Gold star above the city that carries a track's capital. */
function Capital({ v, track }: { v: string; track: string }) {
  const { t } = useI18n();
  const p = vertexPos(v);
  return (
    <g className="sh-capital" transform={`translate(${p.x} ${p.y - SIZE * 0.62})`} data-track={track}>
      <polygon points={star(SIZE * 0.22)} fill="var(--gold)" stroke={INK} strokeWidth={2} />
      <title>{`${t('sh_capital')}: ${trackName(t, track)}`}</title>
    </g>
  );
}

function Toppled({ v }: { v: string }) {
  const { t } = useI18n();
  const p = vertexPos(v);
  return (
    <g className="sh-toppled" transform={`translate(${p.x + SIZE * 0.34} ${p.y - SIZE * 0.3})`}>
      <circle r={SIZE * 0.14} fill="var(--danger)" stroke={INK} strokeWidth={2} />
      <text textAnchor="middle" y={SIZE * 0.07} fontSize={SIZE * 0.2} fontWeight={700} fill={PARCHMENT}>
        !
      </text>
      <title>{t('sh_toppled')}</title>
    </g>
  );
}

/** A covered cart in the owner's colour, in the lower-left of its hex. */
function Caravan({ hex, owner }: { hex: string; owner: string }) {
  const { t } = useI18n();
  const name = useName();
  const c = hexCenter(hex);
  const w = SIZE * 0.4;
  const h = SIZE * 0.2;
  return (
    <g className="sh-caravan" transform={`translate(${c.x - SIZE * 0.42} ${c.y + SIZE * 0.42})`} data-owner={owner}>
      <path d={`M ${-w / 2} 0 Q 0 ${-h * 2.2} ${w / 2} 0 Z`} fill={PARCHMENT} stroke={INK} strokeWidth={2} />
      <rect x={-w / 2} y={0} width={w} height={h} fill={playerColor(owner)} stroke={INK} strokeWidth={2} />
      <circle cx={-w * 0.28} cy={h} r={h * 0.42} fill={PARCHMENT} stroke={INK} strokeWidth={2} />
      <circle cx={w * 0.28} cy={h} r={h * 0.42} fill={PARCHMENT} stroke={INK} strokeWidth={2} />
      <title>{`${t('sh_caravan')} · ${name(owner)}`}</title>
    </g>
  );
}

export function BoardExtras({ pieces, sh }: { pieces: Pieces; sh: StrongholdsView }) {
  return (
    <g className="sh-extras">
      {sh.ramparts.map((v) => (
        <Rampart key={`r${v}`} v={v} />
      ))}
      {Object.entries(sh.capitals).map(([track, cap]) => (cap ? <Capital key={track} v={cap.v} track={track} /> : null))}
      {sh.toppled.map((v) => (
        <Toppled key={`t${v}`} v={v} />
      ))}
      {sh.caravan && <Caravan hex={sh.caravan.hex} owner={sh.caravan.owner} />}
      {Object.entries(pieces.occupants ?? {}).map(([v, o]) => (
        <Warden key={`w${v}`} v={v} owner={o.owner} level={o.level} active={o.active} />
      ))}
    </g>
  );
}
