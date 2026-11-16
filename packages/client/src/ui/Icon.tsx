// Small inline icons for buttons and stat rows. The art is our own (public/assets/ui and
// public/assets/piece), inlined like the board pieces so `currentColor` follows the text or
// player colour. Icons are decoration only: every use carries a text label or an aria-label.
import rollRaw from '../../public/assets/ui/roll.svg?raw';
import endRaw from '../../public/assets/ui/end.svg?raw';
import tradeRaw from '../../public/assets/ui/trade.svg?raw';
import cardRaw from '../../public/assets/ui/card.svg?raw';
import buildRaw from '../../public/assets/ui/build.svg?raw';
import infoRaw from '../../public/assets/ui/info.svg?raw';
import { PIECE_ART, parseArt, type Art } from '../board/pieceArt';

const UI_ART: Record<string, Art | null> = {
  roll: parseArt(rollRaw),
  end: parseArt(endRaw),
  trade: parseArt(tradeRaw),
  card: parseArt(cardRaw),
  build: parseArt(buildRaw),
  info: parseArt(infoRaw),
};

export type UiIconName = 'roll' | 'end' | 'trade' | 'card' | 'build' | 'info';

export function UiIcon({ name, size = 18 }: { name: UiIconName; size?: number }) {
  const art = UI_ART[name] ?? null;
  if (!art) return null;
  return (
    <svg
      className="uiicon"
      width={size}
      height={size}
      viewBox={art.viewBox}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: art.inner }}
    />
  );
}

/** A board piece (road / settlement / city) as a small icon in the given player colour. */
export function PieceIcon({ kind, color, size = 18 }: { kind: 'road' | 'settlement' | 'city'; color: string; size?: number }) {
  const art = PIECE_ART[kind] ?? null;
  if (!art) {
    return <span className="pieceicon pieceicon-fallback" style={{ width: size, height: size, background: color }} aria-hidden="true" />;
  }
  const [, , vw = 1, vh = 1] = art.viewBox.split(/[\s,]+/).map(Number);
  // Fit into a box 1.5 x 1 of `size` (the road art is very wide).
  const k = Math.min((size * 1.5) / vw, size / vh);
  return (
    <svg
      className="pieceicon"
      width={Math.round(vw * k * 10) / 10}
      height={Math.round(vh * k * 10) / 10}
      viewBox={art.viewBox}
      style={{ color }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: art.inner }}
    />
  );
}

/** Two fanned cards: "cards in hand". */
export function HandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="uiicon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x={3.5} y={5} width={10} height={14} rx={2} transform="rotate(-12 8.5 12)" fill="var(--parchment)" stroke="currentColor" strokeWidth={2} />
      <rect x={10.5} y={5} width={10} height={14} rx={2} transform="rotate(12 15.5 12)" fill="var(--parchment)" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

/** Shield: "guards played". */
export function GuardIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="uiicon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 3v5.2c0 4.3-2.9 7.7-7 9.8-4.1-2.1-7-5.5-7-9.8V6z" fill="var(--parchment)" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      <path d="M12 7.5v8M8.5 11h7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** Gold star: victory points. */
export function StarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="uiicon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
        fill="var(--gold)"
        stroke="var(--ink)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
