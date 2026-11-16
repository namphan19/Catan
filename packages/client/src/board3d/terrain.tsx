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
import { makeLabelTexture, makeTokenTexture, seaUrl, terrainUrl, useCanvasTexture, useSvgTexture } from './textures';

const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TERRAIN_FALLBACK = '#d9c79e';

/** The prism sides read as thick hand-made tiles (sandy edge), never as dark mud. */
const TILE_SIDE = '#C9AE7E';

/** Any CSS colour -> a concrete three colour (canvas textures need hex, not var()). */
const RESOURCE_HEX: Record<string, string> = {
  timber: TERRAIN_HEX.forest,
  clay: TERRAIN_HEX.claypit,
  fiber: TERRAIN_HEX.meadow,
  grain: TERRAIN_HEX.field,
  stone: TERRAIN_HEX.quarry,
  any: '#3e7ca6',
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
    <mesh position={[p.x, HEX_TOP + 0.032, p.z]} castShadow receiveShadow>
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
  const inner = useMemo(() => coastBand(graph, fit, 0.035, 0.16), [graph, fit]);
  const outer = useMemo(() => coastBand(graph, fit, 0.16, 0.3), [graph, fit]);
  useEffect(
    () => () => {
      inner.dispose();
      outer.dispose();
    },
    [inner, outer],
  );
  return (
    <group position-y={SEA_Y + 0.006}>
      <mesh geometry={inner} renderOrder={1}>
        <meshBasicMaterial color="#A8DCE4" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <mesh geometry={outer} renderOrder={1}>
        <meshBasicMaterial color="#CFEFF2" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Harbor3D({ harbor, graph, fit }: { harbor: HarborData; graph: Graph; fit: BoardFit }) {
  const e = edgeWorld(graph, harbor.edge);
  const dx = e.mid.x - fit.cx;
  const dz = e.mid.z - fit.cz;
  const dl = Math.hypot(dx, dz) || 1;
  const ux = dx / dl;
  const uz = dz / dl;
  const x = e.mid.x + ux * 0.38;
  const z = e.mid.z + uz * 0.38;
  const rotY = -Math.atan2(uz, ux);
  const label = `${harbor.ratio}:1`;
  const ratioTex = useCanvasTexture(() => makeLabelTexture(label), [label]);
  const iconTex = useSvgTexture(assetUrl('harbor', harbor.kind), true);
  const kindColor =
    harbor.kind === 'any' ? '#3e7ca6' : RESOURCE_HEX[harbor.kind] ?? RESOURCE_COLORS[harbor.kind] ?? '#3e7ca6';
  const deckY = HEX_TOP + 0.02;

  return (
    <group position={[x, 0, z]} rotation-y={rotY}>
      {/* pier: individual planks across two long beams */}
      {[-0.17, 0.17].map((bz) => (
        <mesh key={`beam${bz}`} position={[-0.02, HEX_TOP - 0.028, bz]} castShadow receiveShadow>
          <boxGeometry args={[1.02, 0.07, 0.075]} />
          <meshStandardMaterial color="#6B4E2E" roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, i) => {
        const px = -0.38 + i * 0.125;
        return (
          <mesh key={`plank${i}`} position={[px, deckY, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.112, 0.05, 0.46]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#A6743E' : '#966733'} roughness={1} />
          </mesh>
        );
      })}
      {/* edge trim in the harbor's resource colour */}
      <mesh position={[0.54, deckY + 0.03, 0]} castShadow>
        <boxGeometry args={[0.045, 0.035, 0.47]} />
        <meshStandardMaterial color={kindColor} roughness={0.9} />
      </mesh>
      {/* piles down into the water */}
      {[-0.34, 0.48].flatMap((px) =>
        [-0.19, 0.19].map((pz) => (
          <mesh key={`pile${px}${pz}`} position={[px, SEA_Y + 0.18, pz]} castShadow>
            <cylinderGeometry args={[0.036, 0.044, 0.32, 8]} />
            <meshStandardMaterial color="#5B4126" roughness={1} />
          </mesh>
        )),
      )}
      {/* cargo: a barrel, a crate and a sack */}
      <group position={[-0.16, deckY + 0.025, 0.13]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.068, 0.062, 0.13, 12]} />
          <meshStandardMaterial color="#8A5A2B" roughness={1} />
        </mesh>
        <mesh position-y={0.02}>
          <cylinderGeometry args={[0.071, 0.071, 0.02, 12]} />
          <meshStandardMaterial color="#4A3B2A" roughness={1} />
        </mesh>
        <mesh position-y={-0.03}>
          <cylinderGeometry args={[0.066, 0.066, 0.018, 12]} />
          <meshStandardMaterial color="#4A3B2A" roughness={1} />
        </mesh>
      </group>
      <mesh position={[-0.31, deckY + 0.045, -0.12]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.1, 0.14]} />
        <meshStandardMaterial color="#B98B52" roughness={1} />
      </mesh>
      <mesh position={[-0.31, deckY + 0.096, -0.12]}>
        <boxGeometry args={[0.165, 0.012, 0.145]} />
        <meshStandardMaterial color={kindColor} roughness={0.9} />
      </mesh>
      {/* sign: two posts, a crossbar and camera-facing icon + ratio boards */}
      {[-0.15, 0.15].map((pz) => (
        <mesh key={`post${pz}`} position={[0.3, deckY + 0.2, pz]} castShadow>
          <cylinderGeometry args={[0.018, 0.022, 0.4, 8]} />
          <meshStandardMaterial color="#6B4E2E" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0.3, deckY + 0.4, 0]} castShadow>
        <boxGeometry args={[0.045, 0.032, 0.38]} />
        <meshStandardMaterial color="#6B4E2E" roughness={1} />
      </mesh>
      {iconTex && (
        <sprite position={[0.3, deckY + 0.53, 0]} scale={[0.19, 0.19, 1]}>
          <spriteMaterial map={iconTex} transparent depthWrite={false} />
        </sprite>
      )}
      <sprite position={[0.3, deckY + 0.31, 0]} scale={[0.36, 0.135, 1]}>
        <spriteMaterial map={ratioTex} transparent depthWrite={false} />
      </sprite>
      {/* moored boat with a paper sail and a cargo crate in the harbor colour */}
      <group position={[0.62, SEA_Y, 0.47]}>
        <mesh position-y={0.06} scale={[1.7, 0.42, 0.62]} castShadow receiveShadow>
          <sphereGeometry args={[0.17, 12, 8]} />
          <meshStandardMaterial color="#8A5A2B" roughness={1} />
        </mesh>
        <mesh position-y={0.09} scale={[1.5, 0.18, 0.5]}>
          <sphereGeometry args={[0.17, 10, 6]} />
          <meshStandardMaterial color="#5B4126" roughness={1} />
        </mesh>
        <mesh position={[0.02, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.01, 0.36, 6]} />
          <meshStandardMaterial color="#6B4E2E" roughness={1} />
        </mesh>
        <mesh position={[0.09, 0.3, 0]} scale={[1, 1, 0.06]} castShadow>
          <coneGeometry args={[0.105, 0.24, 3]} />
          <meshStandardMaterial color="#F3E9D2" roughness={0.95} side={THREE.DoubleSide} flatShading />
        </mesh>
        <mesh position={[-0.09, 0.14, 0]} castShadow>
          <boxGeometry args={[0.1, 0.06, 0.09]} />
          <meshStandardMaterial color={kindColor} roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

export function Harbors({ board, graph, fit }: { board: EngineBoard; graph: Graph; fit: BoardFit }) {
  return (
    <group>
      {board.harbors.map((h, i) => (
        <Harbor3D key={`${h.edge}-${i}`} harbor={h} graph={graph} fit={fit} />
      ))}
    </group>
  );
}
