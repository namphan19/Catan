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
  shade,
  type BoardFit,
} from './world';
import { makeLabelTexture, makeTokenTexture, seaUrl, terrainUrl, useCanvasTexture, useSvgTexture } from './textures';

const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TERRAIN_FALLBACK = '#d9c79e';

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
      roughness: 0.72,
      metalness: 0.05,
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
  const base = TERRAIN_HEX[terrain] ?? TERRAIN_FALLBACK;
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.96, metalness: 0, side: THREE.FrontSide }),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(shade(base, 0.58)),
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    ],
    [texture, base],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Matrix4(), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    hexes.forEach((h, i) => {
      const p = hexWorld(h.id);
      tmp.makeTranslation(p.x, 0, p.z);
      mesh.setMatrixAt(i, tmp);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // `materials` is in the deps on purpose: the terrain SVG texture loads async, which
    // replaces the material array and makes R3F rebuild the InstancedMesh (matrices reset).
    // Re-apply every instance matrix after that rebuild.
  }, [hexes, tmp, materials]);

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
  return (
    <mesh position={[p.x, HEX_TOP + 0.014, p.z]} rotation-x={-Math.PI / 2} receiveShadow>
      <circleGeometry args={[0.33, 40]} />
      <meshStandardMaterial map={texture} roughness={0.9} metalness={0} polygonOffset polygonOffsetFactor={-2} />
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

function Harbor3D({ harbor, graph, fit }: { harbor: HarborData; graph: Graph; fit: BoardFit }) {
  const e = edgeWorld(graph, harbor.edge);
  const dx = e.mid.x - fit.cx;
  const dz = e.mid.z - fit.cz;
  const dl = Math.hypot(dx, dz) || 1;
  const ux = dx / dl;
  const uz = dz / dl;
  const x = e.mid.x + ux * 0.48;
  const z = e.mid.z + uz * 0.48;
  const rotY = -Math.atan2(uz, ux);
  const label = `${harbor.ratio}:1`;
  const texture = useCanvasTexture(() => makeLabelTexture(label), [label]);
  const kindColor =
    harbor.kind === 'any' ? '#3e7ca6' : RESOURCE_HEX[harbor.kind] ?? RESOURCE_COLORS[harbor.kind] ?? '#3e7ca6';

  return (
    <group position={[x, 0, z]} rotation-y={rotY}>
      {/* pier deck + piles */}
      <mesh position={[0, HEX_TOP + 0.015, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.075, 0.34]} />
        <meshStandardMaterial color="#8a6d3b" roughness={1} metalness={0} />
      </mesh>
      {[-0.24, 0.24].map((px) => (
        <mesh key={px} position={[px, HEX_TOP - 0.06, 0.13]} castShadow>
          <cylinderGeometry args={[0.032, 0.038, 0.24, 8]} />
          <meshStandardMaterial color="#6b4f2a" roughness={1} />
        </mesh>
      ))}
      {/* harbor kind plaque on the pier */}
      <mesh position={[0.16, HEX_TOP + 0.065, 0]} castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.035, 20]} />
        <meshStandardMaterial color={kindColor} roughness={0.9} />
      </mesh>
      {/* ratio label sprite: always faces the camera */}
      <sprite position={[0.02, HEX_TOP + 0.52, 0]} scale={[0.74, 0.28, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
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
