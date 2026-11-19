// Decorative hero chart for the home screen. Pure SVG built from the game's own terrain
// art, piece art and palette, so the hub looks like the same hand-made world as the board.
import { PIECE_ART } from '../board/pieceArt';
import { art2dUrl } from '../board/assets';
import { playerHex } from '../ui/colors';

const R = 64;
const HEX_W = Math.sqrt(3) * R;
const HEX_H = 2 * R;
/** The terrain SVGs draw their hex slightly inset (3..227 of 200x230): scale so tiles touch. */
const IMG_W = (HEX_W * 100) / 97;
const IMG_H = (HEX_H * 230) / 224;
const CX = 300;
const CY = 280;
const HEX_PATH = 'M0 -64 L55.425 -32 L55.425 32 L0 64 L-55.425 32 L-55.425 -32 Z';

const ISLAND: Array<{ dx: number; dy: number; terrain: string }> = [
  { dx: 0, dy: 0, terrain: 'forest' },
  { dx: HEX_W, dy: 0, terrain: 'field' },
  { dx: HEX_W / 2, dy: -R * 1.5, terrain: 'meadow' },
  { dx: -HEX_W / 2, dy: -R * 1.5, terrain: 'quarry' },
  { dx: -HEX_W, dy: 0, terrain: 'claypit' },
  { dx: -HEX_W / 2, dy: R * 1.5, terrain: 'waste' },
  { dx: HEX_W / 2, dy: R * 1.5, terrain: 'field' },
];

const TOKENS = [
  { dx: 0, dy: 0, n: 8, hot: true },
  { dx: HEX_W / 2, dy: -R * 1.5, n: 5, hot: false },
  { dx: HEX_W, dy: 0, n: 6, hot: true },
  { dx: -HEX_W / 2, dy: -R * 1.5, n: 10, hot: false },
];

function MapToken({ x, y, n, hot }: { x: number; y: number; n: number; hot: boolean }) {
  const pips = Math.max(0, 6 - Math.abs(7 - n));
  const ink = hot ? '#A23B2A' : '#3B2F2F';
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="2" cy="5" rx="21" ry="20" fill="#1B1512" opacity=".14" />
      <circle r="21" fill="#E4D3AE" stroke="#3B2F2F" strokeWidth="2.4" />
      <circle r="17" fill="#F3E9D2" stroke="#3B2F2F" strokeWidth="1.1" />
      <text
        y={pips > 0 ? -4 : 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Cinzel, Georgia, serif"
        fontSize="18"
        fontWeight="700"
        fill={ink}
      >
        {n}
      </text>
      {Array.from({ length: pips }, (_, i) => (
        <circle key={i} cx={(i - (pips - 1) / 2) * 6} cy="10" r="1.6" fill={ink} />
      ))}
    </g>
  );
}

function MapPiece({
  kind,
  x,
  y,
  width,
  color,
}: {
  kind: 'settlement' | 'city' | 'blocker';
  x: number;
  y: number;
  width: number;
  color: string;
}) {
  const art = PIECE_ART[kind];
  if (!art) return null;
  const [, , vw, vh] = art.viewBox.split(/[\s,]+/).map(Number);
  const height = (width * vh) / vw;
  return (
    <g transform={`translate(${x} ${y})`} style={{ color }}>
      <ellipse cx="2" cy={height * 0.42} rx={width * 0.38} ry={height * 0.13} fill="#1B1512" opacity=".18" />
      <svg
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        viewBox={art.viewBox}
        overflow="visible"
        dangerouslySetInnerHTML={{ __html: art.inner }}
      />
    </g>
  );
}

function Road({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  return (
    <g strokeLinecap="round">
      <line x1={x1} y1={y1 + 2} x2={x2} y2={y2 + 2} stroke="#1B1512" strokeWidth="8" opacity=".18" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3B2F2F" strokeWidth="8" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="5" />
      <line x1={x1} y1={y1 - 1} x2={x2} y2={y2 - 1} stroke="#F3E9D2" strokeWidth="1" opacity=".35" />
    </g>
  );
}

export function HomeMap({ label }: { label: string }) {
  return (
    <svg className="home-map" viewBox="0 0 600 560" role="img" aria-label={label}>
      <defs>
        <clipPath id="hm-sea">
          <circle cx={CX} cy={CY} r="244" />
        </clipPath>
        <radialGradient id="hm-water" cx="48%" cy="40%" r="68%">
          <stop offset="0" stopColor="#3E86B2" />
          <stop offset="1" stopColor="#245E89" />
        </radialGradient>
        <pattern id="hm-waves" width="86" height="62" patternUnits="userSpaceOnUse">
          <path
            d="M-12 16 Q10 8 32 16 T76 16"
            fill="none"
            stroke="#7FC3DB"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".32"
          />
          <path
            d="M-12 48 Q10 40 32 48 T76 48"
            fill="none"
            stroke="#1D4F74"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".32"
          />
        </pattern>
        <filter id="hm-island-shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="hm-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="9" stdDeviation="10" floodColor="#1B1512" floodOpacity=".32" />
        </filter>
      </defs>

      {/* chart medallion */}
      <g filter="url(#hm-soft-shadow)">
        <circle cx={CX} cy={CY} r="250" fill="#E4D3AE" stroke="#3B2F2F" strokeWidth="1.2" opacity=".5" />
        <circle cx={CX} cy={CY} r="245" fill="url(#hm-water)" stroke="#3B2F2F" strokeWidth="3" />
        <g clipPath="url(#hm-sea)">
          <circle cx={CX} cy={CY} r="244" fill="url(#hm-waves)" />
          {/* compass ticks */}
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i * Math.PI * 2) / 48;
            const long = i % 6 === 0;
            const r1 = long ? 228 : 236;
            return (
              <line
                key={i}
                x1={CX + Math.cos(a) * r1}
                y1={CY + Math.sin(a) * r1}
                x2={CX + Math.cos(a) * 242}
                y2={CY + Math.sin(a) * 242}
                stroke="#F3E9D2"
                strokeWidth={long ? 1.6 : 0.8}
                opacity={long ? 0.5 : 0.25}
              />
            );
          })}
          <circle cx={CX} cy={CY} r="226" fill="none" stroke="#F3E9D2" strokeWidth="1" opacity=".18" />

          {/* faint rhumb lines from the compass, like a portolan chart */}
          <g stroke="#F3E9D2" strokeWidth=".7" opacity=".12">
            {[15, 45, 75, 105, 135, 165].map((deg) => {
              const a = (deg * Math.PI) / 180;
              return (
                <line
                  key={deg}
                  x1={116}
                  y1={156}
                  x2={116 + Math.cos(a) * 500}
                  y2={156 + Math.sin(a) * 500}
                />
              );
            })}
          </g>

          {/* whale in the south-west water */}
          <g transform="translate(154 414)" opacity=".55">
            <path
              d="M-26 0 q10 -11 24 -7 q11 3 17 -7 l5 10 l-5 10 q-6 -10 -17 -7 q-14 4 -24 -7 Z"
              fill="#2F5A78"
              fillOpacity=".45"
              stroke="#2F5A78"
              strokeWidth="1.6"
            />
            <path d="M11 -9 q2 -6 6 -8 M15 -10 q2 -5 7 -6" fill="none" stroke="#7FB2D4" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* tiny rock islet to the north-east */}
          <g transform="translate(468 168)" stroke="#3B2F2F" strokeLinejoin="round">
            <path d="M-13 8 q2 -13 13 -15 q11 2 13 15 Z" fill="#D9C79E" strokeWidth="1.6" />
            <path d="M-6 2 q5 -4 10 0 M1 -3 q3 -2 6 0" fill="none" strokeWidth="1.2" opacity=".5" />
            <path d="M-15 11 q15 4 30 0" fill="none" stroke="#CFEFF2" strokeWidth="2.4" opacity=".65" strokeLinecap="round" />
          </g>

          {/* island shadow + beach halo + terrain tiles */}
          <g transform="translate(0 12)" fill="#1B1512" opacity=".3" filter="url(#hm-island-shadow)">
            {ISLAND.map((h, i) => (
              <path key={i} d={HEX_PATH} transform={`translate(${CX + h.dx} ${CY + h.dy})`} />
            ))}
          </g>
          {ISLAND.map((h, i) => (
            <path
              key={`beach${i}`}
              d={HEX_PATH}
              transform={`translate(${CX + h.dx} ${CY + h.dy}) scale(1.065)`}
              fill="#E6D2A0"
            />
          ))}
          {ISLAND.map((h, i) => (
            // Painted Tripo tiles, a little smaller than their cell so the sand shows
            // between them, like the game board.
            <image
              key={`tile${i}`}
              href={art2dUrl('terrain', h.terrain)}
              x={CX + h.dx - IMG_W / 2}
              y={CY + h.dy - IMG_H / 2}
              width={IMG_W}
              height={IMG_H}
              preserveAspectRatio="none"
              transform={`translate(${CX + h.dx} ${CY + h.dy}) scale(0.95) translate(${-(CX + h.dx)} ${-(CY + h.dy)})`}
            />
          ))}

          {/* surf along the coast */}
          <g fill="none" stroke="#CFEFF2" strokeLinecap="round" opacity=".7">
            <path d="M142 340 q12 12 32 10" strokeWidth="3" />
            <path d="M160 372 q14 10 30 8" strokeWidth="2.4" opacity=".8" />
            <path d="M430 362 q10 8 24 6" strokeWidth="2.6" />
            <path d="M414 406 q14 6 30 2" strokeWidth="2.2" opacity=".7" />
            <path d="M258 442 q18 8 36 4" strokeWidth="2.6" />
            <path d="M198 118 q14 -8 30 -4" strokeWidth="2.2" opacity=".6" />
          </g>

          {/* buildings, roads, tokens */}
          {TOKENS.map((t, i) => (
            <MapToken key={i} x={CX + t.dx} y={CY + t.dy} n={t.n} hot={t.hot} />
          ))}
          <Road x1={355.4} y1={248} x2={355.4} y2={312} color={playerHex('p1')} />
          <Road x1={355.4} y1={312} x2={410.8} y2={344} color={playerHex('p1')} />
          <MapPiece kind="city" x={355.4} y={248} width={38} color={playerHex('p3')} />
          <MapPiece kind="settlement" x={355.4} y={312} width={30} color={playerHex('p1')} />
          <MapPiece kind="blocker" x={244.6} y={370} width={27} color="var(--ink)" />

          {/* ship + dotted trade route */}
          <path
            d="M472 386 Q448 368 432 350 Q420 337 411 344"
            fill="none"
            stroke="#3B2F2F"
            strokeWidth="1.6"
            strokeDasharray="2 7"
            strokeLinecap="round"
            opacity=".55"
          />
          <g transform="translate(484 400) rotate(-8)">
            <g className="home-map-bob">
              <path d="M-22 0 Q0 10 22 0 L17 13 Q0 19 -17 13 Z" fill="#8A5A2B" stroke="#3B2F2F" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M-15 5 Q0 10 15 5" fill="none" stroke="#C9A227" strokeWidth="1.4" opacity=".65" />
              <path d="M0 -25 V1" stroke="#3B2F2F" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M2 -23 Q16 -19 14 -5 Q2 -4 2 -1 Z" fill="#F3E9D2" stroke="#3B2F2F" strokeWidth="2" strokeLinejoin="round" />
              <path d="M-2 -20 Q-13 -16 -12 -4 Q-2 -3 -2 -1 Z" fill="#F3E9D2" stroke="#3B2F2F" strokeWidth="2" strokeLinejoin="round" />
              <path d="M0 -25 L7 -22 L0 -19 Z" fill="#C9A227" stroke="#3B2F2F" strokeWidth="1.4" strokeLinejoin="round" />
            </g>
          </g>
        </g>
        <circle cx={CX} cy={CY} r="245" fill="none" stroke="#F3E9D2" strokeWidth="1.4" opacity=".35" />
        <circle cx={CX} cy={CY} r="251" fill="none" stroke="#C9A227" strokeWidth="1.6" opacity=".75" />
        <circle
          cx={CX}
          cy={CY}
          r="256"
          fill="none"
          stroke="#3B2F2F"
          strokeWidth=".8"
          strokeDasharray="2 7"
          opacity=".3"
        />
      </g>

      {/* compass rose in the open sea, north-west (above the chart) */}
      <g transform="translate(116 156)" opacity=".92">
        <circle r="43" fill="#F3E9D2" opacity=".13" stroke="#F3E9D2" strokeWidth="1" />
        <circle r="34" fill="none" stroke="#F3E9D2" strokeWidth="1" opacity=".45" />
        <path
          d="M0 -39 L7 -8 L39 0 L7 8 L0 39 L-7 8 L-39 0 L-7 -8 Z"
          fill="#C9A227"
          stroke="#3B2F2F"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M0 -39 L0 39 M-39 0 L39 0" stroke="#3B2F2F" strokeWidth=".8" opacity=".55" />
        <circle r="4" fill="#F3E9D2" stroke="#3B2F2F" strokeWidth="1.2" />
        <text
          y="-48"
          textAnchor="middle"
          fontFamily="Cinzel, Georgia, serif"
          fontSize="12"
          fontWeight="700"
          fill="#F3E9D2"
          opacity=".8"
        >
          N
        </text>
      </g>

      {/* cardinal marks outside the ring */}
      <g fontFamily="Cinzel, Georgia, serif" fontSize="12" fontWeight="700" fill="#3B2F2F" opacity=".5" textAnchor="middle">
        <text x={CX} y="22">N</text>
        <text x={CX} y="550">S</text>
        <text x="36" y={CY + 4}>W</text>
        <text x="564" y={CY + 4}>E</text>
      </g>
    </svg>
  );
}
