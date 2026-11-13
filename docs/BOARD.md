# Board coordinates

Code: `packages/engine/src/board/` (`coords.ts`, `layouts.ts`, `graph.ts`, `generate.ts`).

## Hexes: axial (q, r), pointy-top
- Neighbour directions: E (+1,0), W (-1,0), NE (+1,-1), NW (0,-1), SE (0,+1), SW (-1,+1).
- Pixel centre (size = circumradius, y down): x = size * sqrt(3) * (q + r/2), y = size * 1.5 * r.
- Id: `h:q,r`.

## Vertices and edges: canonical ownership
Every hex **owns** its N and S corners and its NE, NW and W edges, so every vertex and edge on the plane
has exactly one id - no deduplication step is needed:
- vertex `v:q,r,N` / `v:q,r,S`; edge `e:q,r,NE` / `e:q,r,NW` / `e:q,r,W`.
- Corners of hex (q,r), clockwise from the top: N = `v:q,r,N`; NE = `v:q+1,r-1,S`; SE = `v:q,r+1,N`;
  S = `v:q,r,S`; SW = `v:q-1,r+1,N`; NW = `v:q,r-1,S`.
- Edges clockwise, edge i joins corner i and i+1: NE = `e:q,r,NE`; E = `e:q+1,r,W`; SE = `e:q,r+1,NW`;
  SW = `e:q-1,r+1,NE`; W = `e:q,r,W`; NW = `e:q,r,NW`.
- A vertex at pixel: hex centre +/- size vertically (N above, S below).

Topology (vertex/edge adjacency, hex<->vertex maps, coast) is derived from the layout by `getGraph(layout)`
and cached; it is **not** stored in the game state (the state only keeps ids).

## Layouts
| Layout | Players | Hexes (rows) | Vertices | Edges | Coast edges |
|---|---|---|---|---|---|
| standard | 3-4 | 19 (3-4-5-4-3), radius-2 hexagon | 54 | 72 | 30 |
| large | 5-6 | 30 (3-4-5-6-5-4-3) | 80 | 109 | 38 |
Counts are asserted in `test/board.test.ts` together with Euler (V - E + H = 1) and 6H = 2E - coast.

## Generation (seeded)
Terrains shuffled over the hexes; tokens shuffled over producing hexes until no 6/8 are adjacent;
harbors evenly spaced along the clockwise-sorted coast with shuffled kinds; blocker starts on a waste hex.
