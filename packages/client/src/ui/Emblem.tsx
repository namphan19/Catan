import { assetUrl, useAssets } from '../board/assets';
import { EMBLEM_GLYPHS } from './colors';

/** Player emblem (sun, wave, leaf, star, shield, flame) with a glyph fallback. */
export function Emblem({ id, size = 18 }: { id: string; size?: number }) {
  const path = assetUrl('emblem', id);
  const ok = useAssets([path])[path];
  const glyph = EMBLEM_GLYPHS[id] ?? '•';
  return (
    <span className="emblem" style={{ width: size, height: size }} aria-hidden="true">
      {ok ? <img src={path} alt="" width={size} height={size} /> : <span className="emblem-glyph">{glyph}</span>}
    </span>
  );
}
