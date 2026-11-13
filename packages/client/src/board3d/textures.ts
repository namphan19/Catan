// Textures for the 3D board.
//
// Terrain and sea come from the artist's existing SVGs (docs/UI.md asset contract) and are
// rasterised by the browser into THREE textures. Number tokens, harbor ratios and emblem
// badges are drawn on canvases — no new art files, no external fonts.
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { assetUrl } from '../board/assets';
import { DANGER, INK, PARCHMENT, PARCHMENT_DARK } from './world';

interface Entry {
  tex: THREE.Texture;
  refs: number;
}

const cache = new Map<string, Entry>();

function acquireSvg(url: string): THREE.Texture {
  const hit = cache.get(url);
  if (hit) {
    hit.refs += 1;
    return hit.tex;
  }
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // The hex prisms' UVs start at the north corner (v=0 = top of the SVG). Disable the
  // default vertical flip so the terrain art is not mirrored north/south.
  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(url, { tex, refs: 1 });
  return tex;
}

function releaseSvg(url: string): void {
  const hit = cache.get(url);
  if (!hit) return;
  hit.refs -= 1;
  if (hit.refs <= 0) {
    hit.tex.dispose();
    cache.delete(url);
  }
}

/** Terrain / sea SVG as a texture, ref-counted and disposed when the last board unmounts. */
export function useSvgTexture(url: string | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) {
      setTex(null);
      return;
    }
    setTex(acquireSvg(url));
    return () => {
      setTex(null);
      releaseSvg(url);
    };
  }, [url]);
  return tex;
}

export function terrainUrl(terrain: string): string {
  return assetUrl('terrain', terrain);
}

export function seaUrl(): string {
  return assetUrl('terrain', 'sea');
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Number token: parchment disc + bold number (6/8 red), exactly like the 2D token. */
export function makeTokenTexture(n: number, hot: boolean): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 122, 0, Math.PI * 2);
  ctx.fillStyle = PARCHMENT_DARK;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.fillStyle = PARCHMENT;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = hot ? DANGER : INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${hot ? '900' : '700'} 138px Cinzel, Georgia, serif`;
  ctx.fillText(String(n), 128, hot ? 134 : 132);
  return finish(canvas);
}

/** Harbor ratio chip ("3:1" / "2:1"), always camera-facing via a Sprite. */
export function makeLabelTexture(text: string): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 96);
  ctx.clearRect(0, 0, 256, 96);
  const r = 18;
  ctx.beginPath();
  ctx.moveTo(8 + r, 8);
  ctx.lineTo(248 - r, 8);
  ctx.quadraticCurveTo(248, 8, 248, 8 + r);
  ctx.lineTo(248, 88 - r);
  ctx.quadraticCurveTo(248, 88, 248 - r, 88);
  ctx.lineTo(8 + r, 88);
  ctx.quadraticCurveTo(8, 88, 8, 88 - r);
  ctx.lineTo(8, 8 + r);
  ctx.quadraticCurveTo(8, 8, 8 + r, 8);
  ctx.closePath();
  ctx.fillStyle = PARCHMENT;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 56px Cinzel, Georgia, serif';
  ctx.fillText(text, 128, 52);
  return finish(canvas);
}

/**
 * Owner plaque: shield silhouette with a player-colour rim, parchment face and the emblem
 * glyph in ink. Drawn on the same shield outline as pieces3d's `shieldShape` so the flat
 * face sits exactly on the extruded backing plate.
 */
export function makeShieldPlaqueTexture(glyph: string, border: string): THREE.CanvasTexture {
  const W = 128;
  const H = 152;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const sx = (x: number) => (x + 0.5) * W;
  const sy = (y: number) => (0.5 - y) * H;
  const path = (scale: number, dy = 0) => {
    ctx.beginPath();
    ctx.moveTo(sx(-0.5 * scale), sy(0.5 * scale + dy));
    ctx.lineTo(sx(0.5 * scale), sy(0.5 * scale + dy));
    ctx.lineTo(sx(0.5 * scale), sy(-0.04 * scale + dy));
    ctx.quadraticCurveTo(sx(0.5 * scale), sy(-0.36 * scale + dy), sx(0), sy(-0.5 * scale + dy));
    ctx.quadraticCurveTo(sx(-0.5 * scale), sy(-0.36 * scale + dy), sx(-0.5 * scale), sy(-0.04 * scale + dy));
    ctx.closePath();
  };

  path(0.97);
  ctx.fillStyle = border;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();

  path(0.72, 0.02);
  ctx.fillStyle = PARCHMENT;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '60px "Segoe UI Symbol", "Apple Symbols", Georgia, serif';
  ctx.fillText(glyph, sx(0), sy(0.01) + 2);
  return finish(canvas);
}

/** Small hook so canvas textures are disposed when the piece unmounts. */
export function useCanvasTexture(factory: () => THREE.CanvasTexture, deps: unknown[]): THREE.CanvasTexture {
  const tex = useMemo(factory, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}
