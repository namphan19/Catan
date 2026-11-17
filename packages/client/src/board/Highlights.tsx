// Glow overlays for legal vertices / edges / hexes of the selected action.
// The sets are computed by GameTable from getLegalActions — no legality logic here.
import type { EdgeId, Graph, VertexId } from '@hexgame/engine';
import { edgeGeom, hexPoints, SIZE, vertexPos } from './geom';

export interface Highlights {
  vertices: Set<string>;
  edges: Set<string>;
  hexes: Set<string>;
}

export const EMPTY_HIGHLIGHTS: Highlights = { vertices: new Set(), edges: new Set(), hexes: new Set() };

export function HighlightsLayer({ hl, graph }: { hl: Highlights; graph: Graph }) {
  return (
    <g className="highlights" aria-hidden="true">
      {[...hl.hexes].map((h) => (
        <polygon key={`h${h}`} points={hexPoints(parseHexQ(h), parseHexR(h))} className="hl-hex" />
      ))}
      {[...hl.edges].map((e) => (
        <line key={`eh${e}`} {...edgeLine(graph, e as EdgeId)} className="hl-edge-halo" />
      ))}
      {[...hl.edges].map((e) => (
        <line key={`e${e}`} {...edgeLine(graph, e as EdgeId)} className="hl-edge" />
      ))}
      {[...hl.vertices].map((v) => {
        const p = vertexPos(v as VertexId);
        return <circle key={`v${v}`} cx={p.x} cy={p.y} r={SIZE * 0.22} className="hl-vertex" />;
      })}
    </g>
  );
}

function parseHexQ(id: string): number {
  return Number(id.slice(2).split(',')[0]);
}
function parseHexR(id: string): number {
  return Number(id.slice(2).split(',')[1]);
}

function edgeLine(graph: Graph, e: EdgeId): { x1: number; y1: number; x2: number; y2: number } {
  // Inset from both corners so the band reads as "this edge" and never covers a corner spot.
  const g = edgeGeom(graph, e);
  const k = 0.14;
  return {
    x1: g.a.x + (g.b.x - g.a.x) * k,
    y1: g.a.y + (g.b.y - g.a.y) * k,
    x2: g.b.x - (g.b.x - g.a.x) * k,
    y2: g.b.y - (g.b.y - g.a.y) * k,
  };
}
