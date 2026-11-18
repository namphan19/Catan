// 3D terrain: sea slab, instanced hex prisms, number tokens and harbor piers.
// Only presentation — hex/token/harbor data comes straight from the engine's Board.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Board as EngineBoard, Graph, Harbor as HarborData, Hex } from '@hexgame/engine';
import { baseConfig } from '@hexgame/engine';
import { RESOURCE_COLORS, TERRAIN_HEX } from '../ui/colors';
import {
  buildHexGeometry,
  edgeWorld,
  HEX_TOP,
  hexCornersXZ,
  hexWorld,
  SEA_Y,
  type BoardFit,
} from './world';
import { assetUrl } from '../board/assets';
import { harborBadgeCentre, harborGeom, SIZE } from '../board/geom';
import { makeLabelTexture, makeTokenTexture, seaUrl, terrainUrl, useCanvasTexture, useSvgTexture } from './textures';

const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TERRAIN_FALLBACK = '#dcc28b';

/** The prism sides read as thick hand-made tiles (sandy edge), never as dark mud. */
const TILE_SIDE = '#D9C39A';

/** Any CSS colour -> a concrete three colour (canvas textures need hex, not var()). */
const RESOURCE_HEX: Record<string, string> = {
  timber: TERRAIN_HEX.forest,
  clay: TERRAIN_HEX.claypit,
  fiber: TERRAIN_HEX.meadow,
  grain: TERRAIN_HEX.field,
  stone: TERRAIN_HEX.quarry,
  any: '#2d6e9b',
};

export function SeaPlane({ fit }: { fit: BoardFit }) {
  const texture = useSvgTexture(seaUrl());
  const size = Math.max(60, fit.radius * 9);
  const repeats = Math.max(12, Math.round(size / 1.25));

  useEffect(() => {
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeats, repeats);
    texture.needsUpdate = true;
  }, [texture, repeats]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: texture,
      color: '#ffffff',
      roughness: 0.6,
      metalness: 0.08,
    });
    return m;
  }, [texture]);
  useEffect(() => () => material.dispose(), [material]);

  // Gentle shimmer: scroll the tile pattern. No allocations; skipped for reduced motion.
  useFrame((_, dt) => {
    if (!texture || REDUCED_MOTION) return;
    texture.offset.x = (texture.offset.x + dt * 0.004) % 1;
    texture.offset.y = (texture.offset.y + dt * 0.0025) % 1;
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={SEA_Y} receiveShadow>
      <planeGeometry args={[size, size]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function TerrainGroup({
  terrain,
  hexes,
  geometry,
}: {
  terrain: string;
  hexes: Hex[];
  geometry: THREE.BufferGeometry;
}) {
  const texture = useSvgTexture(terrainUrl(terrain));
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0, side: THREE.FrontSide }),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(TILE_SIDE),
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    ],
    [texture],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Matrix4(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    hexes.forEach((h, i) => {
      const p = hexWorld(h.id);
      tmp.makeTranslation(p.x, 0, p.z);
      mesh.setMatrixAt(i, tmp);
      // Subtle brightness variation per tile (0.94..1.04).
      const n = (h.id.charCodeAt(2) + h.id.length * 5 + i * 11) % 11;
      tint.setScalar(0.94 + n * 0.01);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    // `materials` is in the deps on purpose: the terrain SVG texture loads async, which
    // replaces the material array and makes R3F rebuild the InstancedMesh (matrices reset).
    // Re-apply every instance matrix after that rebuild.
  }, [hexes, tmp, tint, materials]);

  if (hexes.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, materials, hexes.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

/** All hex prisms, grouped per terrain so one instanced draw covers each texture. */
export function TerrainField({ board }: { board: EngineBoard }) {
  const geometry = useMemo(buildHexGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const groups = useMemo(() => {
    const out = new Map<string, Hex[]>();
    for (const h of board.hexes) {
      const list = out.get(h.terrain);
      if (list) list.push(h);
      else out.set(h.terrain, [h]);
    }
    return [...out.entries()];
  }, [board.hexes]);

  return (
    <group>
      {groups.map(([terrain, hexes]) => (
        <TerrainGroup key={terrain} terrain={terrain} hexes={hexes} geometry={geometry} />
      ))}
      <HexInkLines hexes={board.hexes} />
    </group>
  );
}

/** Thin ink outline on every hex top (the 2D board's 2 px stroke, in 3D). */
function HexInkLines({ hexes }: { hexes: Hex[] }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const h of hexes) {
      const p = hexWorld(h.id);
      const corners = hexCornersXZ(p.x, p.z, 0.945);
      for (let i = 0; i < 6; i += 1) {
        const a = corners[i];
        const b = corners[(i + 1) % 6];
        positions.push(a[0], HEX_TOP + 0.006, a[1], b[0], HEX_TOP + 0.006, b[1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [hexes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#3b2f2f" transparent opacity={0.85} />
    </lineSegments>
  );
}

function Token3D({ hex }: { hex: Hex }) {
  const n = hex.token as number;
  const hot = (baseConfig.hotNumbers ?? []).includes(n);
  const texture = useCanvasTexture(() => makeTokenTexture(n, hot), [n, hot]);
  const p = hexWorld(hex.id);
  // A real chip with thickness, not a painted decal: parchment rim + printed top.
  return (
    // CylinderGeometry maps the cap texture's "up" to local +x; turn the chip a quarter so the
    // number reads upright from the default camera (which looks towards -z).
    <mesh position={[p.x, HEX_TOP + 0.032, p.z]} rotation-y={Math.PI / 2} castShadow receiveShadow>
      <cylinderGeometry args={[0.325, 0.335, 0.052, 36]} />
      <meshStandardMaterial attach="material-0" color="#E4D3AE" roughness={1} metalness={0} />
      <meshStandardMaterial attach="material-1" map={texture} roughness={0.92} metalness={0} />
      <meshStandardMaterial attach="material-2" color="#C9AE7E" roughness={1} metalness={0} />
    </mesh>
  );
}

export function NumberTokens({ hexes }: { hexes: Hex[] }) {
  return (
    <group>
      {hexes
        .filter((h) => h.token != null)
        .map((h) => (
          <Token3D key={h.id} hex={h} />
        ))}
    </group>
  );
}

/** Sandy shallow-water bands hugging every coast edge (the bright halo around the island). */
function coastBand(graph: Graph, fit: BoardFit, from: number, to: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const e of graph.coast) {
    const g = edgeWorld(graph, e);
    const dx = g.b.x - g.a.x;
    const dz = g.b.z - g.a.z;
    const len = Math.hypot(dx, dz) || 1;
    let nx = -dz / len;
    let nz = dx / len;
    const mx = g.mid.x - fit.cx;
    const mz = g.mid.z - fit.cz;
    if (nx * mx + nz * mz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const ax = g.a.x + nx * from;
    const az = g.a.z + nz * from;
    const bx = g.b.x + nx * from;
    const bz = g.b.z + nz * from;
    const cx = g.b.x + nx * to;
    const cz = g.b.z + nz * to;
    const dx2 = g.a.x + nx * to;
    const dz2 = g.a.z + nz * to;
    positions.push(ax, 0, az, bx, 0, bz, cx, 0, cz, ax, 0, az, cx, 0, cz, dx2, 0, dz2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

export function SeaFoam({ graph, fit }: { graph: Graph; fit: BoardFit }) {
  // A real beach: warm sand right at the coast, a pale foam line, then turquoise shallows.
  const sand = useMemo(() => coastBand(graph, fit, 0.02, 0.12), [graph, fit]);
  const foam = useMemo(() => coastBand(graph, fit, 0.12, 0.19), [graph, fit]);
  const shallow = useMemo(() => coastBand(graph, fit, 0.19, 0.28), [graph, fit]);
  useEffect(
    () => () => {
      sand.dispose();
      foam.dispose();
      shallow.dispose();
    },
    [sand, foam, shallow],
  );
  return (
    <group position-y={SEA_Y + 0.006}>
      <mesh geometry={sand} renderOrder={1}>
        <meshBasicMaterial color="#E6D2A0" transparent opacity={0.98} depthWrite={false} />
      </mesh>
      <mesh geometry={foam} renderOrder={1}>
        <meshBasicMaterial color="#DDF1E8" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh geometry={shallow} renderOrder={1}>
        <meshBasicMaterial color="#9FD8DC" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

type XZ = { x: number; z: number };
const px2w = (p: { x: number; y: number }): XZ => ({ x: p.x / SIZE, z: p.y / SIZE });

/** A plank walkway from `a` to `b` (world XZ), resting on two beams with piles in the water. */
function Pier3D({ a, b }: { a: XZ; b: XZ }) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const rotY = -Math.atan2(b.z - a.z, b.x - a.x);
  const n = Math.max(3, Math.round(len / 0.1));
  const deckY = HEX_TOP - 0.04;
  return (
    <group position={[(a.x + b.x) / 2, 0, (a.z + b.z) / 2]} rotation-y={rotY}>
      {[-0.07, 0.07].map((bz) => (
        <mesh key={`beam${bz}`} position={[0, deckY - 0.04, bz]} castShadow receiveShadow>
          <boxGeometry args={[len, 0.05, 0.035]} />
          <meshStandardMaterial color="#6B4E2E" roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={`plank${i}`} position={[-len / 2 + (i + 0.5) * (len / n), deckY, 0]} castShadow receiveShadow>
          <boxGeometry args={[(len / n) * 0.86, 0.03, 0.2]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#A6743E' : '#966733'} roughness={1} />
        </mesh>
      ))}
      {[-len / 2 + 0.08, len / 2 - 0.06].flatMap((px) =>
        [-0.08, 0.08].map((pz) => (
          <mesh key={`pile${px}${pz}`} position={[px, (SEA_Y + deckY) / 2 - 0.02, pz]} castShadow>
            <cylinderGeometry args={[0.022, 0.026, deckY - SEA_Y + 0.06, 6]} />
            <meshStandardMaterial color="#5B4126" roughness={1} />
          </mesh>
        )),
      )}
    </group>
  );
}

/**
 * Harbor out in the sea (same layout as the SVG board, geom.ts harborGeom): two piers from the
 * coast edge's corners to a dock, a boat moored at the dock, and a floating marker beyond it
 * (camera-facing icon above the ratio). The coast itself stays free for roads and settlements.
 */
function Harbor3D({ harbor, graph }: { harbor: HarborData; graph: Graph }) {
  const h = harborGeom(graph, harbor.edge);
  const dock = px2w(h.dock);
  const n = { x: h.n.x, z: h.n.y };
  const t = { x: h.t.x, z: h.t.y };
  const badge = px2w(harborBadgeCentre(h, 34, 34, 6));
  const rotY = -Math.atan2(t.z, t.x);
  const label = `${harbor.ratio}:1`;
  const ratioTex = useCanvasTexture(() => makeLabelTexture(label), [label]);
  const iconTex = useSvgTexture(assetUrl('harbor', harbor.kind), true);
  const kindColor =
    harbor.kind === 'any' ? '#2d6e9b' : RESOURCE_HEX[harbor.kind] ?? RESOURCE_COLORS[harbor.kind] ?? '#2d6e9b';
  const deckY = HEX_TOP - 0.02;
  const dockW = 0.62;
  const dockD = 0.26;
  // boat beside the dock, on the outer side
  const boat = { x: dock.x + n.x * 0.3 + t.x * 0.28, z: dock.z + n.z * 0.3 + t.z * 0.28 };

  return (
    <group>
      <Pier3D a={px2w(h.pierFromA)} b={px2w(h.pierToA)} />
      <Pier3D a={px2w(h.pierFromB)} b={px2w(h.pierToB)} />
      {/* dock platform; the outer trim shows the harbor's resource colour */}
      <group position={[dock.x, 0, dock.z]} rotation-y={rotY}>
        <mesh position={[0, deckY, 0]} castShadow receiveShadow>
          <boxGeometry args={[dockW, 0.045, dockD]} />
          <meshStandardMaterial color="#8A5A2B" roughness={1} />
        </mesh>
        {/* local +Z of this group points along -n or +n depending on the edge winding: trim both long sides */}
        {[-dockD / 2, dockD / 2].map((z) => (
          <mesh key={`trim${z}`} position={[0, deckY + 0.03, z]} castShadow>
            <boxGeometry args={[dockW, 0.02, 0.03]} />
            <meshStandardMaterial color={kindColor} roughness={0.9} />
          </mesh>
        ))}
        {[-dockW / 2 + 0.04, dockW / 2 - 0.04].flatMap((x) =>
          [-dockD / 2 + 0.03, dockD / 2 - 0.03].map((z) => (
            <mesh key={`p${x}${z}`} position={[x, (SEA_Y + deckY) / 2, z]} castShadow>
              <cylinderGeometry args={[0.028, 0.032, deckY - SEA_Y + 0.12, 8]} />
              <meshStandardMaterial color="#5B4126" roughness={1} />
            </mesh>
          )),
        )}
        {/* cargo: a crate in the harbor colour and a barrel */}
        <mesh position={[-0.16, deckY + 0.06, 0]} castShadow>
          <boxGeometry args={[0.11, 0.08, 0.1]} />
          <meshStandardMaterial color={kindColor} roughness={0.9} />
        </mesh>
        <mesh position={[0.14, deckY + 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.045, 0.1, 10]} />
          <meshStandardMaterial color="#8A5A2B" roughness={1} />
        </mesh>
      </group>
      {/* moored boat with a paper sail */}
      <group position={[boat.x, SEA_Y, boat.z]} rotation-y={rotY}>
        <mesh position-y={0.06} scale={[1.5, 0.4, 0.6]} castShadow receiveShadow>
          <sphereGeometry args={[0.15, 12, 8]} />
          <meshStandardMaterial color="#8A5A2B" roughness={1} />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.01, 0.32, 6]} />
          <meshStandardMaterial color="#6B4E2E" roughness={1} />
        </mesh>
        <mesh position={[0.06, 0.26, 0]} scale={[1, 1, 0.06]} castShadow>
          <coneGeometry args={[0.09, 0.2, 3]} />
          <meshStandardMaterial color="#F3E9D2" roughness={0.95} side={THREE.DoubleSide} flatShading />
        </mesh>
      </group>
      {/* floating marker beyond the dock: buoy + camera-facing icon over the ratio */}
      <group position={[badge.x, 0, badge.z]}>
        <mesh position-y={SEA_Y + 0.03}>
          <cylinderGeometry args={[0.1, 0.12, 0.08, 16]} />
          <meshStandardMaterial color={kindColor} roughness={0.8} />
        </mesh>
        {/* sized to read at the default camera distance (about as large as a number token) */}
        {iconTex && (
          <sprite position={[0, SEA_Y + 1.12, 0]} scale={[0.5, 0.5, 1]} renderOrder={4}>
            <spriteMaterial map={iconTex} transparent depthWrite={false} />
          </sprite>
        )}
        {/* the camera looks down at an angle, so the stack is foreshortened: keep a wide gap and
            draw the ratio last so the icon can never cover it */}
        <sprite position={[0, SEA_Y + 0.4, 0]} scale={[0.82, 0.31, 1]} renderOrder={5}>
          <spriteMaterial map={ratioTex} transparent depthWrite={false} depthTest={false} />
        </sprite>
      </group>
    </group>
  );
}

export function Harbors({ board, graph, fit }: { board: EngineBoard; graph: Graph; fit: BoardFit }) {
  return (
    <group>
      {board.harbors.map((h, i) => (
        <Harbor3D key={`${h.edge}-${i}`} harbor={h} graph={graph} />
      ))}
    </group>
  );
}
