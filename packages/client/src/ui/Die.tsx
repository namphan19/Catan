// Inline dice face (no asset dependency, readable at any size). The two dice use the
// classic CATAN colours: one red, one yellow, both with the same pip layout.
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[24, 24]],
  2: [[14, 14], [34, 34]],
  3: [[14, 14], [24, 24], [34, 34]],
  4: [[14, 14], [34, 14], [14, 34], [34, 34]],
  5: [[14, 14], [34, 14], [24, 24], [14, 34], [34, 34]],
  6: [[14, 12], [34, 12], [14, 24], [34, 24], [14, 36], [34, 36]],
};

/** 'red' / 'yellow': the base game's two dice; 'plain' remains for custom/UI dice. */
export type DieTone = 'plain' | 'red' | 'yellow';

const TONES: Record<DieTone, { face: string; edge: string; pip: string; pipEdge: string }> = {
  plain: { face: 'var(--parchment)', edge: 'var(--ink)', pip: 'var(--ink)', pipEdge: 'transparent' },
  red: { face: '#B93B2D', edge: '#6F2018', pip: '#FFF6DE', pipEdge: '#7E2A1E' },
  yellow: { face: '#E5B93F', edge: '#8E6C18', pip: '#7A2A1E', pipEdge: '#5B1C13' },
};

export function Die({ n, size = 30, tone = 'plain' }: { n: number; size?: number; tone?: DieTone }) {
  const pips = PIPS[n] ?? PIPS[1] ?? [];
  const c = TONES[tone];
  return (
    <svg className="die" data-tone={tone} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect x="3.4" y="4.4" width="42" height="42" rx="9" fill="var(--ink)" opacity=".22" />
      <rect x="2" y="2" width="44" height="44" rx="9" fill={c.face} stroke={c.edge} strokeWidth="2.2" />
      <path d="M5.4 9.2 Q6 5.4 10 4.8 L20 4.4" fill="none" stroke="#FFFFFF" strokeWidth="2.6" opacity=".45" strokeLinecap="round" />
      <path d="M4 38 Q5 43 10 43.4 L28 43.8" fill="none" stroke="#000000" strokeWidth="2.4" opacity=".12" strokeLinecap="round" />
      {pips.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4.5" fill={c.pipEdge} opacity={tone === 'plain' ? 0 : 0.45} />
          <circle cx={x} cy={y} r="4.2" fill={c.pip} />
          <circle cx={x - 1.2} cy={y - 1.2} r="1.2" fill="#FFFFFF" opacity={tone === 'plain' ? 0 : 0.28} />
        </g>
      ))}
    </svg>
  );
}
