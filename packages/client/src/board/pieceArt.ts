// Inline piece art (BUG: pieces rendered BLACK — see docs/UI contract).
//
// The artist's SVGs use fill="currentColor" so a wrapping element's CSS colour tints them.
// That only works when the markup is part of the same document: an SVG loaded through
// <image href> (or <img>) is an ISOLATED document, so currentColor never sees the player
// colour and everything falls back to black. The fix is to inline the art: the raw SVG
// text is imported at build time (?raw), parsed into viewBox + inner markup, and rendered
// inside an <svg> whose parent <g> carries the player colour. Inherited CSS colours
// (currentColor) then resolve correctly, and the browser keeps the art's 2 px ink outline.
//
// The files live in packages/client/public/assets (artist-owned); importing them by
// RELATIVE path with ?raw just reads the file text — they are still served normally at
// /assets/... for anything that wants them as standalone documents (terrain, sea, token).

import roadRaw from '../../public/assets/piece/road.svg?raw';
import settlementRaw from '../../public/assets/piece/settlement.svg?raw';
import cityRaw from '../../public/assets/piece/city.svg?raw';
import blockerRaw from '../../public/assets/piece/blocker.svg?raw';
import sunRaw from '../../public/assets/emblem/sun.svg?raw';
import waveRaw from '../../public/assets/emblem/wave.svg?raw';
import leafRaw from '../../public/assets/emblem/leaf.svg?raw';
import starRaw from '../../public/assets/emblem/star.svg?raw';
import shieldRaw from '../../public/assets/emblem/shield.svg?raw';
import flameRaw from '../../public/assets/emblem/flame.svg?raw';

export interface Art {
  /** The art's own coordinate system, e.g. "0 0 40 40". */
  viewBox: string;
  /** Everything between <svg ...> and </svg>, ready for dangerouslySetInnerHTML. */
  inner: string;
}

/** Parse raw SVG text into { viewBox, inner }; null when the markup is unusable. */
export function parseArt(raw: string): Art | null {
  const open = /<svg\b[^>]*>/i.exec(raw);
  if (!open) return null;
  const viewBox = /viewBox\s*=\s*"([^"]+)"/i.exec(open[0])?.[1];
  const start = open.index + open[0].length;
  const end = raw.lastIndexOf('</svg>');
  const inner = end > start ? raw.slice(start, end).trim() : '';
  if (!viewBox || !inner) return null;
  return { viewBox, inner };
}

export const PIECE_ART: Record<string, Art | null> = {
  road: parseArt(roadRaw),
  settlement: parseArt(settlementRaw),
  city: parseArt(cityRaw),
  blocker: parseArt(blockerRaw),
};

export const EMBLEM_ART: Record<string, Art | null> = {
  sun: parseArt(sunRaw),
  wave: parseArt(waveRaw),
  leaf: parseArt(leafRaw),
  star: parseArt(starRaw),
  shield: parseArt(shieldRaw),
  flame: parseArt(flameRaw),
};
