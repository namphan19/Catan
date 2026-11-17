// Inline dice face (no asset dependency, readable at any size).
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[24, 24]],
  2: [[14, 14], [34, 34]],
  3: [[14, 14], [24, 24], [34, 34]],
  4: [[14, 14], [34, 14], [14, 34], [34, 34]],
  5: [[14, 14], [34, 14], [24, 24], [14, 34], [34, 34]],
  6: [[14, 12], [34, 12], [14, 24], [34, 24], [14, 36], [34, 36]],
};

/** 'red': the expansion's red production die (it also counts for the event die's card draws). */
export type DieTone = 'plain' | 'red';

const TONES: Record<DieTone, { face: string; pip: string }> = {
  plain: { face: 'var(--parchment)', pip: 'var(--ink)' },
  red: { face: '#B3322A', pip: '#FFF8EC' },
};

export function Die({ n, size = 30, tone = 'plain' }: { n: number; size?: number; tone?: DieTone }) {
  const pips = PIPS[n] ?? PIPS[1] ?? [];
  const c = TONES[tone];
  return (
    <svg className="die" data-tone={tone} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect x={2} y={2} width={44} height={44} rx={8} fill={c.face} stroke="var(--ink)" strokeWidth={2.5} />
      {pips.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4.4} fill={c.pip} />
      ))}
    </svg>
  );
}
