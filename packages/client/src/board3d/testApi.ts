// Test-only bridge for Playwright. Installed only when MODE !== 'production' or the page
// is loaded with ?e2e=1, so it never exists for players in a normal production visit.
export interface Boschtan3DApi {
  /** Screen (CSS px) position of a vertex/edge/hex id, computed via the live camera. */
  project(id: string): { x: number; y: number; visible: boolean } | null;
  /** Non-blank pixel count / distinct colour count of the rendered canvas. */
  sample(): { w: number; h: number; nonBlank: number; distinct: number };
  /** Exactly the highlighted targets GameTable derived from getLegalActions. */
  targets(): { vertices: string[]; edges: string[]; hexes: string[] };
  /** Move the orbit camera to look at a vertex/edge/hex from a tilted, zoomed-in pose. */
  focus(id: string, distance?: number): boolean;
  /** Diagnostics for the terrain instancing test. */
  debug(): Array<Record<string, unknown>>;
  /** Expansion piece groups in the scene, as their `userData.boschtanPiece` records. */
  pieces(): Array<Record<string, unknown>>;
}

declare global {
  interface Window {
    __boschtan3d?: Boschtan3DApi;
  }
}

export {};
