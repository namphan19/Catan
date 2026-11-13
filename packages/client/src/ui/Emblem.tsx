import { EMBLEM_GLYPHS } from './colors';
import { EMBLEM_ART, type Art } from '../board/pieceArt';

/**
 * Player emblem (sun, wave, leaf, star, shield, flame) with a glyph fallback.
 *
 * The emblem art is inlined (like the board pieces) instead of <img>: the SVGs use
 * fill="currentColor", which inside an <img>/<image> isolated document could never
 * receive a CSS colour. With an optional `color` the emblem is drawn in the owner's
 * player colour; default is the ink colour (same look as before).
 */
export function Emblem({ id, size = 18, color = 'var(--ink)' }: { id: string; size?: number; color?: string }) {
  const art: Art | null = EMBLEM_ART[id] ?? null;
  const glyph = EMBLEM_GLYPHS[id] ?? '•';
  return (
    <span className="emblem" style={{ width: size, height: size }} aria-hidden="true">
      {art ? (
        <svg width={size} height={size} viewBox={art.viewBox} style={{ color }} aria-hidden="true">
          {/* Trusted in-repo art, imported as a raw string; safe to inline. */}
          <g dangerouslySetInnerHTML={{ __html: art.inner }} />
        </svg>
      ) : (
        <span className="emblem-glyph" style={{ color }}>
          {glyph}
        </span>
      )}
    </span>
  );
}
