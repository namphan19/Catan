// Small inline icons for buttons and stat rows. The art is our own (public/assets/ui and
// public/assets/piece), inlined like the board pieces so `currentColor` follows the text or
// player colour. Icons are decoration only: every use carries a text label or an aria-label.
import rollRaw from '../../public/assets/ui/roll.svg?raw';
import endRaw from '../../public/assets/ui/end.svg?raw';
import tradeRaw from '../../public/assets/ui/trade.svg?raw';
import cardRaw from '../../public/assets/ui/card.svg?raw';
import buildRaw from '../../public/assets/ui/build.svg?raw';
import infoRaw from '../../public/assets/ui/info.svg?raw';
import { useId } from 'react';
import { PIECE_ART, parseArt, type Art } from '../board/pieceArt';
import { art2dUrl, useAssets } from '../board/assets';

const menuRaw = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const closeRaw = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const sheetRaw = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 3.5h9l3 3V20H6z" fill="var(--parchment)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14.5 3.5V7H18M9 11h6M9 14.5h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const UI_ART: Record<string, Art | null> = {
  roll: parseArt(rollRaw),
  end: parseArt(endRaw),
  trade: parseArt(tradeRaw),
  card: parseArt(cardRaw),
  build: parseArt(buildRaw),
  info: parseArt(infoRaw),
  menu: parseArt(menuRaw),
  close: parseArt(closeRaw),
  sheet: parseArt(sheetRaw),
};

export type UiIconName = 'roll' | 'end' | 'trade' | 'card' | 'build' | 'info' | 'menu' | 'close' | 'sheet';

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

/**
 * A board piece (road / settlement / city) as a small icon in the given player colour, drawn
 * exactly like the piece on the 2D board (PO request): the painted block sprite tinted with
 * the same multiply filter (art2d/piece), and the road as the board's flat bar. Falls back to
 * the vector piece art while the sprite is loading or missing.
 */
export function PieceIcon({ kind, color, size = 18 }: { kind: 'road' | 'settlement' | 'city' | 'ship' | 'warden' | 'rampart' | 'caravan'; color: string; size?: number }) {
  const fid = `pi-tint-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const sprite = art2dUrl('piece', kind === 'road' ? 'settlement' : kind === 'ship' ? 'cog' : kind);
  const loaded = useAssets([sprite])[sprite];
  if (kind === 'ship' && !loaded) {
    // Tidelands cog while the sprite loads (or is missing): the board's vector cog in miniature.
    return (
      <svg className="pieceicon" width={size} height={size} viewBox="-12 -14 24 24" style={{ color }} aria-hidden="true">
        <path d="M -10 0 L 10 0 L 6.5 5 L -6.5 5 Z" fill="currentColor" stroke="#3B2F2F" strokeWidth={1.3} />
        <line x1={0} y1={0} x2={0} y2={-12} stroke="#3B2F2F" strokeWidth={1.3} />
        <path d="M 0 -11.5 L 7.5 -3 L 0 -3 Z" fill="#f4ead2" stroke="#3B2F2F" strokeWidth={1.1} />
      </svg>
    );
  }
  if (kind === 'road') {
    // Same bar as board/Piece.tsx Road: player colour, ink outline, light top / dark bottom strip.
    const w = Math.round(size * 1.5);
    const h = Math.max(5, Math.round(size * 0.42));
    return (
      <svg className="pieceicon" width={w} height={h} viewBox="0 0 40 10" style={{ color }} aria-hidden="true">
        <rect x={0.8} y={0.8} width={38.4} height={8.4} rx={2.6} fill="currentColor" stroke="#3B2F2F" strokeWidth={1.3} />
        <rect x={2.5} y={1.9} width={35} height={2.2} rx={1} fill="#FFFFFF" opacity={0.32} />
        <rect x={2.5} y={6.4} width={35} height={1.7} rx={0.8} fill="#1B1512" opacity={0.18} />
      </svg>
    );
  }
  if (loaded) {
    const box = Math.round(size * 1.15);
    return (
      <svg className="pieceicon" width={box} height={box} viewBox="0 0 100 100" aria-hidden="true">
        <filter id={fid} colorInterpolationFilters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
          <feFlood style={{ floodColor: color }} result="c" />
          <feBlend in="c" in2="SourceGraphic" mode="multiply" result="m" />
          <feComposite in="m" in2="SourceAlpha" operator="in" />
        </filter>
        <image href={sprite} x={0} y={0} width={100} height={100} preserveAspectRatio="xMidYMid meet" filter={`url(#${fid})`} />
      </svg>
    );
  }
  const art = (PIECE_ART as Record<string, Art | null | undefined>)[kind] ?? null;
  if (!art) {
    return <span className="pieceicon pieceicon-fallback" style={{ width: size, height: size, background: color }} aria-hidden="true" />;
  }
  const [, , vw = 1, vh = 1] = art.viewBox.split(/[\s,]+/).map(Number);
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
