// Procedural low-poly pieces: roads, settlements, cities, the blocker and the legal-move
// highlights. Every placement comes from the engine's Pieces/highlights props; this file
// never decides legality. Player colours come from ui/colors.ts (same palette as 2D).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Outlines, RoundedBox } from '@react-three/drei';
import type { EdgeId, Graph, Pieces, PlayerId, VertexId } from '@hexgame/engine';
import { EMBLEM_GLYPHS, playerEmblem, playerHex } from '../ui/colors';
import type { Highlights } from '../board/Highlights';
import {
  edgeWorld,
  GOLD,
  HEX_TOP,
  hexCornersXZ,
  hexWorld,
  INK,
  vertexWorld,
} from './world';
import { makeEmblemTexture, useCanvasTexture } from './textures';

const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Drop-in animation for newly placed pieces (respects prefers-reduced-motion). */
function Pop({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(REDUCED_MOTION ? 1 : 0);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 0.3);
    const e = 1 - Math.pow(1 - t.current, 3);
    g.scale.setScalar(0.02 + 0.98 * e);
  });
  return (
    <group ref={ref} scale={REDUCED_MOTION ? 1 : 0.02}>
      {children}
    </group>
  );
}

function usePointerCursor(): void {
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );
}

/** Hover target group: scales up smoothly without per-frame allocation. */
function HoverTarget({
  children,
  max = 1.32,
}: {
  children: ReactNode;
  max?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const cur = useRef(1);
  usePointerCursor();
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const want = hover ? max : 1;
    if (Math.abs(want - cur.current) < 0.001) return;
    cur.current += (want - cur.current) * Math.min(1, dt * 16);
    g.scale.setScalar(cur.current);
  });
  return (
    <group
      ref={ref}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {children}
    </group>
  );
}

function Roof({ width, height, depth, color }: { width: number; height: number; depth: number; color: string }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  }, [width, height, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
      <Outlines thickness={0.012} color={INK} />
    </mesh>
  );
}

function EmblemBadge({ player, position, scale = 0.25 }: { player: PlayerId; position: [number, number, number]; scale?: number }) {
  const glyph = EMBLEM_GLYPHS[playerEmblem(player)] ?? '•';
  const texture = useCanvasTexture(() => makeEmblemTexture(glyph), [glyph]);
  return (
    <sprite position={position} scale={[scale, scale, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

export function Road3D({ edge, player, graph }: { edge: EdgeId; player: PlayerId; graph: Graph }) {
  const e = edgeWorld(graph, edge);
  const color = playerHex(player);
  return (
    <group position={[e.mid.x, HEX_TOP + 0.055, e.mid.z]} rotation-y={e.rotY}>
      <Pop>
        <RoundedBox args={[e.len * 0.9, 0.075, 0.175]} radius={0.028} smoothness={2} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.85} metalness={0.02} />
          <Outlines thickness={0.013} color={INK} />
        </RoundedBox>
      </Pop>
    </group>
  );
}

function Settlement3D({ v, player }: { v: VertexId; player: PlayerId }) {
  const p = vertexWorld(v);
  const color = playerHex(player);
  return (
    <group position={[p.x, HEX_TOP + 0.01, p.z]}>
      <Pop>
        <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.42, 0.32, 0.38]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
          <Outlines thickness={0.013} color={INK} />
        </mesh>
        <group position={[0, 0.32, 0]}>
          <Roof width={0.52} height={0.25} depth={0.46} color={color} />
        </group>
        <EmblemBadge player={player} position={[0.19, 0.34, 0.22]} scale={0.23} />
      </Pop>
    </group>
  );
}

function City3D({ v, player }: { v: VertexId; player: PlayerId }) {
  const p = vertexWorld(v);
  const color = playerHex(player);
  return (
    <group position={[p.x, HEX_TOP + 0.01, p.z]}>
      <Pop>
        {/* keep */}
        <mesh position={[0.1, 0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.56, 0.36, 0.46]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
          <Outlines thickness={0.014} color={INK} />
        </mesh>
        <group position={[0.1, 0.36, 0]}>
          <Roof width={0.64} height={0.26} depth={0.52} color={color} />
        </group>
        {/* tower */}
        <mesh position={[-0.3, 0.34, -0.04]} castShadow receiveShadow>
          <boxGeometry args={[0.26, 0.68, 0.26]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
          <Outlines thickness={0.014} color={INK} />
        </mesh>
        <mesh position={[-0.3, 0.78, -0.04]} rotation-y={Math.PI / 4} castShadow>
          <coneGeometry args={[0.22, 0.2, 4]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
          <Outlines thickness={0.012} color={INK} />
        </mesh>
        <EmblemBadge player={player} position={[0.26, 0.46, 0.25]} scale={0.22} />
      </Pop>
    </group>
  );
}

export function Blocker3D({ hexId }: { hexId: string }) {
  const p = hexWorld(hexId);
  return (
    <group position={[p.x, HEX_TOP + 0.01, p.z]}>
      <Pop>
        {/* hooded figure: cone robe + sphere head + hood / eyes */}
        <mesh position={[0, 0.31, 0]} castShadow>
          <coneGeometry args={[0.25, 0.62, 9]} />
          <meshStandardMaterial color="#2b2320" roughness={1} metalness={0} />
        </mesh>
        <mesh position={[0, 0.58, 0]} castShadow>
          <sphereGeometry args={[0.135, 12, 10]} />
          <meshStandardMaterial color="#2b2320" roughness={1} />
        </mesh>
        <mesh position={[0, 0.67, 0]} castShadow>
          <coneGeometry args={[0.155, 0.22, 9]} />
          <meshStandardMaterial color="#1d1815" roughness={1} />
        </mesh>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position={[x, 0.58, 0.115]}>
            <sphereGeometry args={[0.018, 6, 6]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.9} />
          </mesh>
        ))}
      </Pop>
    </group>
  );
}

export function Pieces3D({ pieces, graph }: { pieces: Pieces; graph: Graph }) {
  return (
    <group>
      {Object.entries(pieces.roads).map(([e, player]) => (
        <Road3D key={e} edge={e as EdgeId} player={player} graph={graph} />
      ))}
      {Object.entries(pieces.buildings).map(([v, b]) =>
        b.kind === 'city' ? (
          <City3D key={v} v={v as VertexId} player={b.owner} />
        ) : (
          <Settlement3D key={v} v={v as VertexId} player={b.owner} />
        ),
      )}
    </group>
  );
}

interface HighlightProps {
  hl: Highlights;
  graph: Graph;
  onVertex?: (v: VertexId) => void;
  onEdge?: (e: EdgeId) => void;
  onHex?: (h: string) => void;
}

const GOLD_MAT = {
  color: GOLD,
  emissive: GOLD,
  emissiveIntensity: 0.75,
  roughness: 0.4,
  metalness: 0.15,
} as const;

function VertexTarget({ v, onVertex }: { v: VertexId; onVertex?: (v: VertexId) => void }) {
  const p = vertexWorld(v);
  return (
    <HoverTarget>
      <group
        position={[p.x, HEX_TOP + 0.05, p.z]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onVertex?.(v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <mesh rotation-x={-Math.PI / 2}>
          <torusGeometry args={[0.17, 0.028, 8, 24]} />
          <meshStandardMaterial {...GOLD_MAT} />
        </mesh>
        {/* invisible, generous hit disc so taps work on touch and at a distance */}
        <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.25, 20]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </HoverTarget>
  );
}

function EdgeTarget({ e, graph, onEdge }: { e: EdgeId; graph: Graph; onEdge?: (e: EdgeId) => void }) {
  const w = edgeWorld(graph, e);
  return (
    <HoverTarget>
      <group
        position={[w.mid.x, HEX_TOP + 0.065, w.mid.z]}
        rotation-y={w.rotY}
        onClick={(ev: ThreeEvent<MouseEvent>) => {
          ev.stopPropagation();
          onEdge?.(e);
        }}
        onPointerDown={(ev) => ev.stopPropagation()}
      >
        <mesh castShadow>
          <boxGeometry args={[w.len * 0.92, 0.035, 0.11]} />
          <meshStandardMaterial {...GOLD_MAT} />
        </mesh>
        <mesh>
          <boxGeometry args={[w.len * 0.98, 0.09, 0.26]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </HoverTarget>
  );
}

function HexTarget({ id, onHex }: { id: string; onHex?: (h: string) => void }) {
  const p = hexWorld(id);
  const points = useMemo(() => {
    const corners = hexCornersXZ(0, 0, 0.965);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i += 1) {
      pts.push(new THREE.Vector3(corners[i][0], 0, corners[i][1]));
    }
    return pts;
  }, []);
  const lineGeom = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  useEffect(() => () => lineGeom.dispose(), [lineGeom]);
  return (
    <HoverTarget>
      <group
        position={[p.x, HEX_TOP + 0.045, p.z]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onHex?.(id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <lineLoop geometry={lineGeom}>
          <lineBasicMaterial color={GOLD} transparent opacity={0.95} />
        </lineLoop>
        <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
          <circleGeometry args={[0.93, 36]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <circleGeometry args={[0.95, 20]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </HoverTarget>
  );
}

/** Glowing gold rings / bars / rims for exactly the legal targets passed in. */
export function Highlights3D({ hl, graph, onVertex, onEdge, onHex }: HighlightProps) {
  return (
    <group>
      {[...hl.hexes].map((h) => (
        <HexTarget key={`h${h}`} id={h} onHex={onHex} />
      ))}
      {[...hl.edges].map((e) => (
        <EdgeTarget key={`e${e}`} e={e as EdgeId} graph={graph} onEdge={onEdge} />
      ))}
      {[...hl.vertices].map((v) => (
        <VertexTarget key={`v${v}`} v={v as VertexId} onVertex={onVertex} />
      ))}
    </group>
  );
}
