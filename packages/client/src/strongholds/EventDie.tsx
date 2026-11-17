// The expansion's event die face: raid fleet (dark, ship) or one of the three improvement tracks
// (track colour - the same as the capital gems on the 3D board - with the track's symbol).
import type { EventFace } from '@hexgame/engine';

const FACE: Record<EventFace, string> = {
  raid: '#2F2A28',
  learning: '#4E7A4A',
  commerce: '#B8862F',
  council: '#5E7186',
};

const INK = '#FFF8EC';

function Glyph({ face }: { face: EventFace }) {
  switch (face) {
    case 'raid':
      // Ship: hull and sails.
      return (
        <g fill={INK}>
          <path d="M9 30 H39 L34 38 H14 Z" />
          <path d="M24 9 V28 H12 Z" />
          <path d="M26 13 V28 H35 Z" opacity={0.75} />
        </g>
      );
    case 'commerce':
      // Scales.
      return (
        <g stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round">
          <path d="M24 10 V36 M16 38 H32 M12 15 H36" />
          <path d="M12 15 L7 26 H17 Z M36 15 L31 26 H41 Z" fill={INK} />
        </g>
      );
    case 'council':
      // Crown.
      return <path d="M9 33 L11 15 L18 23 L24 12 L30 23 L37 15 L39 33 Z" fill={INK} />;
    case 'learning':
      // Open book.
      return (
        <g fill={INK}>
          <path d="M8 14 Q16 11 23 15 V36 Q16 32 8 35 Z" />
          <path d="M40 14 Q32 11 25 15 V36 Q32 32 40 35 Z" />
        </g>
      );
  }
}

export function EventDie({ face, size = 30 }: { face: EventFace; size?: number }) {
  return (
    <svg className="die event-die" data-face={face} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect x={2} y={2} width={44} height={44} rx={8} fill={FACE[face]} stroke="var(--ink)" strokeWidth={2.5} />
      <Glyph face={face} />
    </svg>
  );
}
