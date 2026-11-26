// Display-only colours and emblems from docs/UI.md (colour-blind safe, always paired with an emblem).
// No rules here: the engine decides everything; these are paint pots.

export const PLAYER_COLORS: Record<string, string> = {
  p1: 'var(--p1)',
  p2: 'var(--p2)',
  p3: 'var(--p3)',
  p4: 'var(--p4)',
  p5: 'var(--p5)',
  p6: 'var(--p6)',
};

/** Emblem id per seat: sun, wave, leaf, star, shield, flame (assets/emblem/{id}.svg). */
export const SEAT_EMBLEMS = ['sun', 'wave', 'leaf', 'star', 'shield', 'flame'] as const;

/** Fallback glyph when the emblem asset is missing (never colour alone). */
export const EMBLEM_GLYPHS: Record<string, string> = {
  sun: '☀',
  wave: '≈',
  leaf: '☘',
  star: '★',
  shield: '⛨',
  flame: '△',
};

export function seatIndex(id: string): number {
  const n = Number(id.replace(/\D/g, ''));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function playerColor(id: string): string {
  return PLAYER_COLORS[`p${seatIndex(id)}`] ?? 'var(--ink-soft)';
}

export function playerEmblem(id: string): string {
  return SEAT_EMBLEMS[(seatIndex(id) - 1) % SEAT_EMBLEMS.length] ?? 'sun';
}

/**
 * Text colour that reads on a band painted in the seat colour (phones put the player's name
 * on it): white or ink, whichever contrasts more with the seat. WCAG relative luminance, so
 * the choice follows the palette instead of a hand-kept list.
 */
export function playerInk(id: string): string {
  const hex = PLAYER_HEX[`p${seatIndex(id)}`] ?? '#6b5b4e';
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const seat = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const ink = 0.036; // --ink #3b2f2f
  const onWhite = 1.05 / (seat + 0.05);
  const onInk = (seat + 0.05) / (ink + 0.05);
  return onInk > onWhite ? 'var(--ink)' : '#fff';
}

/** Terrain fill colours for the fallback board (and resource chips). */
export const TERRAIN_COLORS: Record<string, string> = {
  forest: 'var(--forest)',
  claypit: 'var(--claypit)',
  meadow: 'var(--meadow)',
  field: 'var(--field)',
  quarry: 'var(--quarry)',
  waste: 'var(--waste)',
  sea: 'var(--sea)',
  // Tidelands placeholders until the painted tiles arrive (see docs/ART_TIDELANDS.md).
  goldmine: '#C9A227',
  mist: '#9AA3A8',
  village: '#B9A07A',
  // Highlands placeholders until the painted tiles arrive (see docs/ART_HIGHLANDS.md).
  jungle: '#2F5E34',
  grove: '#5E8C3A',
  fishery: '#5FA8C2',
  wilds: '#1F3B24',
};

/** Same palette as hex strings, for WebGL materials (CSS var() cannot reach a shader). */
export const PLAYER_HEX: Record<string, string> = {
  p1: '#c0392b',
  p2: '#2e6da4',
  p3: '#e9e0cc',
  p4: '#d9822b',
  p5: '#3e8e4e',
  p6: '#7a4b2a',
};

export const TERRAIN_HEX: Record<string, string> = {
  forest: '#3f7448',
  claypit: '#b85c34',
  meadow: '#8dbe55',
  field: '#d9b754',
  quarry: '#878c94',
  waste: '#dcc28b',
  sea: '#2d6e9b',
};

export function playerHex(id: string): string {
  return PLAYER_HEX[`p${seatIndex(id)}`] ?? '#6b5b4e';
}

/** Resource -> chip colour (matches the terrain that produces it). */
export const RESOURCE_COLORS: Record<string, string> = {
  timber: 'var(--forest)',
  clay: 'var(--claypit)',
  fiber: 'var(--meadow)',
  grain: 'var(--field)',
  stone: 'var(--quarry)',
  // Highlands goods
  plume: '#C2453A',
  herb: '#5E8C3A',
  fish: '#5FA8C2',
};
