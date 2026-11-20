import { art2dUrl, useAssets } from '../board/assets';
import { RESOURCE_COLORS } from './colors';

/**
 * Resource icon (timber, clay, fiber, grain, stone) — asset first, diamond fallback.
 * The colour is only decoration: every use pairs the icon with a text label.
 */
export function ResourceIcon({ res, size = 20 }: { res: string; size?: number }) {
  // Painted goods icon (Tripo, art2d/icon); a coloured diamond until it has loaded.
  const path = art2dUrl('icon', res);
  const ok = useAssets([path])[path];
  const color = RESOURCE_COLORS[res] ?? 'var(--ink-soft)';
  if (ok) {
    return (
      <span className="resicon" style={{ width: size, height: size }}>
        <img src={path} alt="" width={size} height={size} />
      </span>
    );
  }
  return (
    <span className="resicon" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24">
        <rect x={12 - size / 3} y={12 - size / 3} width={(size * 2) / 3} height={(size * 2) / 3}
          transform={`rotate(45 12 12)`} fill={color} stroke="var(--ink)" strokeWidth={2} />
      </svg>
    </span>
  );
}
