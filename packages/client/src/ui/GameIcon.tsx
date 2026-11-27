// One consistent set of small icons for buttons, tracks and tables. It replaces the Unicode
// glyphs / emoji that used to stand in for icons (they look different on every OS and font).
// Style: ink-coloured outline (currentColor), rounded joins, a soft fill and one accent shape,
// so they sit next to the painted board art. Decoration only: callers keep a text label or aria-label.
import type { ReactNode } from 'react';

export type GameIconName =
  | 'anchor' | 'swords' | 'flag' | 'tower' | 'promote' | 'bolt' | 'move' | 'push' | 'target'
  | 'ship' | 'shield' | 'skull' | 'bot' | 'chat' | 'globe' | 'check' | 'cross' | 'plus' | 'minus'
  | 'fit' | 'undo' | 'caretDown' | 'caretRight' | 'arrowLeft' | 'swap' | 'plusCircle';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const SOFT = { fill: 'currentColor', fillOpacity: 0.22 } as const;

const PATHS: Record<GameIconName, ReactNode> = {
  anchor: (
    <g {...S}>
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V20M8.5 10.5h7" />
      <path d="M4.5 13.5c.6 4 3.5 6.5 7.5 6.5s6.9-2.5 7.5-6.5" />
      <path d="M2.8 14.8l1.7-1.6 1.8 1.7M17.7 14.9l1.8-1.7 1.7 1.6" />
    </g>
  ),
  swords: (
    <g {...S}>
      <path d="M5 4.5l9.5 9.5M19 4.5L9.5 14" />
      <path d="M12.8 12.2l3.6 3.6M11.2 12.2l-3.6 3.6" />
      <path d="M15.2 17l2 2M8.8 17l-2 2M4.5 19.5l2-2M19.5 19.5l-2-2" />
      <path d="M5 4.5l.5 3M19 4.5l-.5 3" />
    </g>
  ),
  flag: (
    <g {...S}>
      <path d="M6 3.5v17" />
      <path d="M6 4.5h11.5l-2.8 3.8 2.8 3.7H6z" {...SOFT} />
    </g>
  ),
  tower: (
    <g {...S}>
      <path d="M5.5 20.5V8.5h2.5v-3h2.5v3h3v-3H16v3h2.5v12z" {...SOFT} />
      <path d="M10 20.5v-4.2a2 2 0 0 1 4 0v4.2" />
    </g>
  ),
  promote: (
    <g {...S}>
      <path d="M6 12l6-6 6 6" />
      <path d="M6 18l6-6 6 6" {...SOFT} />
    </g>
  ),
  bolt: <path d="M13.5 2.8L5.5 13.2h5.6l-1.2 8 8-10.6h-5.6z" {...S} {...SOFT} />,
  move: (
    <g {...S}>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </g>
  ),
  push: (
    <g {...S}>
      <path d="M3.5 12h12" />
      <path d="M11.5 7l5 5-5 5" />
      <path d="M20.5 5v14" />
    </g>
  ),
  target: (
    <g {...S}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" {...SOFT} />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </g>
  ),
  ship: (
    <g {...S}>
      <path d="M3.5 15.5h17l-3 4.5h-11z" {...SOFT} />
      <path d="M12 3.5v12" />
      <path d="M12 4.5l6 8H12z" {...SOFT} />
      <path d="M11 7.5l-4 5h4" />
    </g>
  ),
  shield: (
    <g {...S}>
      <path d="M12 3l7.2 3v5.2c0 4.3-2.9 7.7-7.2 9.8-4.3-2.1-7.2-5.5-7.2-9.8V6z" {...SOFT} />
      <path d="M12 8v7M8.5 11.5h7" />
    </g>
  ),
  skull: (
    <g {...S}>
      <path d="M12 3.2c-4.2 0-7 2.7-7 6.4 0 2.2 1 3.8 2.6 4.8V18h8.8v-3.6c1.6-1 2.6-2.6 2.6-4.8 0-3.7-2.8-6.4-7-6.4z" {...SOFT} />
      <circle cx="9.2" cy="10.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="10.2" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10.2 18v2.3M13.8 18v2.3M12 13v1.6" />
    </g>
  ),
  bot: (
    <g {...S}>
      <rect x="4.5" y="8" width="15" height="11.5" rx="3.2" {...SOFT} />
      <path d="M12 8V4.6M12 4.6h0" />
      <circle cx="12" cy="3.8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13.4" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.4" r="1.4" fill="currentColor" stroke="none" />
      <path d="M2.8 12.5v3M21.2 12.5v3" />
    </g>
  ),
  chat: (
    <g {...S}>
      <path d="M4 5.5h16v10.5H11l-4.5 3.6V16H4z" {...SOFT} />
      <path d="M8 9.5h8M8 12.5h5" />
    </g>
  ),
  globe: (
    <g {...S}>
      <circle cx="12" cy="12" r="8.5" {...SOFT} />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c-3.2 3.4-3.2 13.6 0 17M12 3.5c3.2 3.4 3.2 13.6 0 17" />
    </g>
  ),
  check: <path d="M5 12.8l4.6 4.6L19 7.2" {...S} strokeWidth={2.8} />,
  cross: <path d="M6 6l12 12M18 6L6 18" {...S} strokeWidth={2.8} />,
  plus: <path d="M12 5v14M5 12h14" {...S} strokeWidth={2.8} />,
  minus: <path d="M5 12h14" {...S} strokeWidth={2.8} />,
  plusCircle: (
    <g {...S}>
      <circle cx="12" cy="12" r="8.5" {...SOFT} />
      <path d="M12 8v8M8 12h8" />
    </g>
  ),
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...S} strokeWidth={2.4} />,
  undo: (
    <g {...S}>
      <path d="M8.5 5.5L4.5 9.5l4 4" />
      <path d="M5 9.5h9a5 5 0 0 1 0 10h-4" />
    </g>
  ),
  caretDown: <path d="M6 9h12l-6 7.5z" fill="currentColor" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />,
  caretRight: <path d="M9 6v12l7.5-6z" fill="currentColor" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />,
  arrowLeft: <path d="M19.5 12h-14M11 6.5L5.5 12l5.5 5.5" {...S} strokeWidth={2.4} />,
  swap: (
    <g {...S}>
      <path d="M4 8.5h15M15.5 5l3.5 3.5-3.5 3.5" />
      <path d="M20 15.5H5M8.5 12L5 15.5 8.5 19" />
    </g>
  ),
};

export function GameIcon({
  name,
  size = 18,
  x,
  y,
  className,
}: {
  name: GameIconName;
  size?: number;
  /** Only when nested inside another <svg> (board art). */
  x?: number;
  y?: number;
  className?: string;
}) {
  return (
    <svg
      className={`uiicon gameicon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      x={x}
      y={y}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
