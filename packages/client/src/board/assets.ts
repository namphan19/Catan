import { useEffect, useState } from 'react';

/**
 * Asset loader: checks each /assets/... image actually loads so the board can fall back to
 * simple shapes while the artist's files are still arriving. Results are cached module-wide.
 */
const status = new Map<string, boolean>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function load(path: string): void {
  if (status.has(path)) return;
  status.set(path, false);
  const img = new Image();
  img.onload = () => {
    status.set(path, true);
    notify();
  };
  img.onerror = () => {
    status.set(path, false);
    notify();
  };
  img.src = path;
}

export function assetUrl(kind: string, name: string): string {
  return kind ? `/assets/${kind}/${name}.svg` : `/assets/${name}.svg`;
}

/** Returns a map path -> loaded-ok for the given asset paths (true only when the image loaded). */
export function useAssets(paths: string[]): Record<string, boolean> {
  const key = paths.join('|');
  const [, bump] = useState(0);
  useEffect(() => {
    key.split('|').filter(Boolean).forEach(load);
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [key]);
  const out: Record<string, boolean> = {};
  for (const p of key.split('|').filter(Boolean)) out[p] = status.get(p) === true;
  return out;
}
