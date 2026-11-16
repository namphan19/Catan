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
  shade,
  vertexWorld,
} from './world';
import { makeShieldPlaqueTexture, useCanvasTexture } from './textures';

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

/**
 * Gable roof: a triangular prism with FLAT-shaded slopes (the old version averaged the
 * vertex normals, which melted the roof into a dome from the overview camera), an ink
 * ridge beam along the apex and the drei outline around the whole silhouette.
 */
function Roof({ width, height, depth, color }: { width: number; height: number; depth: number; color: string }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    // ExtrudeGeometry already emits per-face normals; do NOT recompute/average them or the
    // two slopes lose their crease and read as a smooth dome.
    return g;
  }, [width, height, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const roofColor = shade(color, 0.78);
  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={roofColor} roughness={0.92} metalness={0} flatShading />
        <Outlines thickness={0.014} color={INK} />
      </mesh>
      {/* ridge beam: the strong line that makes the gable readable from above */}
      <mesh position={[0, height - 0.012, 0]} castShadow>
        <boxGeometry args={[Math.max(0.03, width * 0.06), 0.028, depth * 1.01]} />
        <meshStandardMaterial color={INK} roughness={1} metalness={0} />
      </mesh>
      {/* eave boards: frame the roof edges against the walls */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, -0.006, (s * depth) / 2]} castShadow>
          <boxGeometry args={[width * 1.02, 0.024, 0.026]} />
          <meshStandardMaterial color={INK} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/** Shield-shaped plaque silhouette (centred on the origin, point at the bottom). */
function shieldShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(w / 2, -h * 0.04);
  s.quadraticCurveTo(w / 2, -h * 0.36, 0, -h / 2);
  s.quadraticCurveTo(-w / 2, -h * 0.36, -w / 2, -h * 0.04);
  s.closePath();
  return s;
}

/**
 * Owner plaque: a small shield mounted FLAT on a building's front (+Z) wall, in front of the
 * wall so it never z-fights and never cuts the roof. Player-colour rim, parchment face, ink
 * emblem glyph. Replaces the old camera-facing white disc that read like a pie chart.
 */
function EmblemPlaque({
  player,
  position,
  height = 0.26,
}: {
  player: PlayerId;
  position: [number, number, number];
  height?: number;
}) {
  const color = playerHex(player);
  const glyph = EMBLEM_GLYPHS[playerEmblem(player)] ?? '•';
  const width = height * (128 / 152);
  const texture = useCanvasTexture(() => makeShieldPlaqueTexture(glyph, color), [glyph, color]);
  const backing = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shieldShape(width * 0.98, height * 0.98), {
      depth: 0.012,
      bevelEnabled: false,
      curveSegments: 8,
    });
    g.translate(0, 0, -0.012);
    return g;
  }, [width, height]);
  useEffect(() => () => backing.dispose(), [backing]);
  return (
    <group position={position}>
      <mesh geometry={backing} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.88} metalness={0} />
      </mesh>
      <mesh position-z={0.005}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          transparent
          alphaTest={0.4}
          roughness={0.95}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}

export function Road3D({ edge, player, graph }: { edge: EdgeId; player: PlayerId; graph: Graph }) {
  const e = edgeWorld(graph, edge);
  const color = playerHex(player);
  const trim = shade(color, 0.62);
  return (
    <group position={[e.mid.x, HEX_TOP + 0.05, e.mid.z]} rotation-y={e.rotY}>
      <Pop>
        <RoundedBox args={[e.len * 0.9, 0.07, 0.21]} radius={0.028} smoothness={2} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.82} metalness={0.02} />
          <Outlines thickness={0.013} color={INK} />
        </RoundedBox>
        {/* centre groove: reads as a plank road instead of a plain bar */}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[e.len * 0.84, 0.012, 0.03]} />
          <meshStandardMaterial color={trim} roughness={1} metalness={0} />
        </mesh>
        {/* two darker edge rails */}
        {[-0.088, 0.088].map((z) => (
          <mesh key={z} position={[0, 0.03, z]}>
            <boxGeometry args={[e.len * 0.9, 0.016, 0.024]} />
            <meshStandardMaterial color={trim} roughness={1} metalness={0} />
          </mesh>
        ))}
      </Pop>
    </group>
  );
}

const PARCHMENT_MAT = '#F3E9D2';
const STONE_MAT = '#D9C79E';
const WOOD_MAT = '#6B4E2E';

function Settlement3D({ v, player }: { v: VertexId; player: PlayerId }) {
  const p = vertexWorld(v);
  const color = playerHex(player);
  return (
    <group position={[p.x, HEX_TOP + 0.01, p.z]}>
      <Pop>
        {/* stone plinth */}
        <RoundedBox args={[0.5, 0.07, 0.44]} radius={0.02} smoothness={2} position={[0, 0.035, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={STONE_MAT} roughness={1} />
          <Outlines thickness={0.012} color={INK} />
        </RoundedBox>
        {/* plastered walls in the player colour */}
        <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.36, 0.28, 0.34]} />
          <meshStandardMaterial color={color} roughness={0.88} metalness={0} />
          <Outlines thickness={0.012} color={INK} />
        </mesh>
        {/* timber corner posts */}
        {[-0.165, 0.165].map((x) => (
          <mesh key={x} position={[x, 0.21, 0.165]} castShadow>
            <boxGeometry args={[0.028, 0.28, 0.028]} />
            <meshStandardMaterial color={shade(color, 0.55)} roughness={1} />
          </mesh>
        ))}
        {/* gable roof */}
        <group position={[0, 0.35, 0]}>
          <Roof width={0.48} height={0.24} depth={0.42} color={color} />
        </group>
        {/* stone chimney */}
        <mesh position={[0.115, 0.5, 0.06]} castShadow>
          <boxGeometry args={[0.07, 0.17, 0.07]} />
          <meshStandardMaterial color="#B9A67E" roughness={1} />
        </mesh>
        <mesh position={[0.115, 0.588, 0.06]}>
          <boxGeometry args={[0.085, 0.022, 0.085]} />
          <meshStandardMaterial color="#8F7A55" roughness={1} />
        </mesh>
        {/* door and window */}
        <mesh position={[-0.075, 0.14, 0.172]}>
          <boxGeometry args={[0.105, 0.155, 0.014]} />
          <meshStandardMaterial color={PARCHMENT_MAT} roughness={0.95} />
        </mesh>
        <mesh position={[-0.075, 0.14, 0.18]}>
          <boxGeometry args={[0.012, 0.12, 0.006]} />
          <meshStandardMaterial color={WOOD_MAT} roughness={1} />
        </mesh>
        <mesh position={[-0.075, 0.265, 0.172]}>
          <boxGeometry args={[0.075, 0.07, 0.012]} />
          <meshStandardMaterial color={PARCHMENT_MAT} roughness={0.95} />
        </mesh>
        <mesh position={[-0.075, 0.265, 0.18]}>
          <boxGeometry args={[0.01, 0.06, 0.005]} />
          <meshStandardMaterial color={WOOD_MAT} roughness={1} />
        </mesh>
        {/* front wall (z = +0.17) carries the owner plaque, beside the door */}
        <EmblemPlaque player={player} position={[0.105, 0.16, 0.176]} height={0.2} />
      </Pop>
    </group>
  );
}

function City3D({ v, player }: { v: VertexId; player: PlayerId }) {
  const p = vertexWorld(v);
  const color = playerHex(player);
  const roof = shade(color, 0.72);
  const trim = shade(color, 0.56);
  return (
    <group position={[p.x, HEX_TOP + 0.01, p.z]}>
      <Pop>
        {/* broad stone plinth */}
        <RoundedBox args={[0.72, 0.075, 0.58]} radius={0.025} smoothness={2} position={[0, 0.038, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={STONE_MAT} roughness={1} />
          <Outlines thickness={0.013} color={INK} />
        </RoundedBox>
        {/* courtyard wall with merlons */}
        <mesh position={[0, 0.13, 0.24]} castShadow receiveShadow>
          <boxGeometry args={[0.56, 0.12, 0.07]} />
          <meshStandardMaterial color={STONE_MAT} roughness={1} />
          <Outlines thickness={0.01} color={INK} />
        </mesh>
        {[-0.21, -0.07, 0.07, 0.21].map((x) => (
          <mesh key={x} position={[x, 0.205, 0.24]} castShadow>
            <boxGeometry args={[0.075, 0.055, 0.075]} />
            <meshStandardMaterial color={shade(color, 0.88)} roughness={1} />
          </mesh>
        ))}
        {/* main keep */}
        <mesh position={[0.02, 0.26, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 0.36, 0.34]} />
          <meshStandardMaterial color={color} roughness={0.88} metalness={0} />
          <Outlines thickness={0.013} color={INK} />
        </mesh>
        <group position={[0.02, 0.44, 0]}>
          <Roof width={0.5} height={0.24} depth={0.42} color={color} />
        </group>
        {/* corner towers with conical roofs */}
        {[
          { x: -0.31, z: 0.16, h: 0.5 },
          { x: 0.33, z: -0.12, h: 0.44 },
        ].map((t) => (
          <group key={`${t.x}-${t.z}`} position={[t.x, 0, t.z]}>
            <mesh position={[0, t.h / 2 + 0.075, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.1, 0.11, t.h, 10]} />
              <meshStandardMaterial color={shade(color, 0.94)} roughness={0.9} />
              <Outlines thickness={0.012} color={INK} />
            </mesh>
            <mesh position={[0, t.h + 0.075, 0]} castShadow>
              <coneGeometry args={[0.13, 0.2, 10]} />
              <meshStandardMaterial color={roof} roughness={0.92} flatShading />
              <Outlines thickness={0.012} color={INK} />
            </mesh>
            <mesh position={[0, t.h * 0.62 + 0.075, 0.095]}>
              <boxGeometry args={[0.028, 0.09, 0.014]} />
              <meshStandardMaterial color={PARCHMENT_MAT} roughness={1} />
            </mesh>
          </group>
        ))}
        {/* gate and windows on the keep */}
        <mesh position={[-0.06, 0.18, 0.172]}>
          <boxGeometry args={[0.13, 0.19, 0.014]} />
          <meshStandardMaterial color={PARCHMENT_MAT} roughness={0.95} />
        </mesh>
        {[-0.115, -0.06, -0.005].map((x) => (
          <mesh key={x} position={[x, 0.18, 0.18]}>
            <boxGeometry args={[0.012, 0.17, 0.006]} />
            <meshStandardMaterial color={trim} roughness={1} />
          </mesh>
        ))}
        {[-0.09].map((x) => (
          <mesh key={x} position={[x, 0.32, 0.172]}>
            <boxGeometry args={[0.065, 0.075, 0.012]} />
            <meshStandardMaterial color={PARCHMENT_MAT} roughness={0.95} />
          </mesh>
        ))}
        {/* banner on the keep ridge */}
        <mesh position={[0.12, 0.7, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.01, 0.2, 6]} />
          <meshStandardMaterial color={WOOD_MAT} roughness={1} />
        </mesh>
        <mesh position={[0.17, 0.755, 0]} rotation-z={-Math.PI / 2} scale={[1, 1, 0.12]} castShadow>
          <coneGeometry args={[0.05, 0.11, 3]} />
          <meshStandardMaterial color={PARCHMENT_MAT} roughness={0.95} side={THREE.DoubleSide} flatShading />
        </mesh>
        {/* front wall (z = +0.17) carries the owner plaque above the courtyard wall */}
        <EmblemPlaque player={player} position={[0.13, 0.28, 0.176]} height={0.22} />
      </Pop>
    </group>
  );
}

const cloakGeo = (() => {
  const points = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.255, 0),
    new THREE.Vector2(0.26, 0.05),
    new THREE.Vector2(0.21, 0.2),
    new THREE.Vector2(0.16, 0.38),
    new THREE.Vector2(0.13, 0.5),
    new THREE.Vector2(0.12, 0.57),
    new THREE.Vector2(0.001, 0.6),
  ];
  return new THREE.LatheGeometry(points, 9);
})();

export function Blocker3D({ hexId }: { hexId: string }) {
  const p = hexWorld(hexId);
  return (
    <group position={[p.x, HEX_TOP + 0.01, p.z]}>
      <Pop>
        {/* dark base disc so the figure reads as a game miniature */}
        <mesh position={[0, 0.016, 0]} receiveShadow>
          <cylinderGeometry args={[0.3, 0.32, 0.032, 18]} />
          <meshStandardMaterial color="#4A3B2A" roughness={1} />
        </mesh>
        {/* hooded cloak: lathe profile with flat-shaded folds */}
        <mesh geometry={cloakGeo} position={[0, 0.03, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#2B2320" roughness={1} metalness={0} flatShading />
        </mesh>
        {/* head + pointed hood */}
        <mesh position={[0, 0.62, 0]} castShadow>
          <sphereGeometry args={[0.135, 10, 8]} />
          <meshStandardMaterial color="#2B2320" roughness={1} />
        </mesh>
        <mesh position={[0, 0.72, 0]} castShadow>
          <coneGeometry args={[0.165, 0.24, 9]} />
          <meshStandardMaterial color="#1D1815" roughness={1} flatShading />
        </mesh>
        {/* shadowed face with glowing eyes */}
        <mesh position={[0, 0.62, 0.1]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial color="#100D0C" roughness={1} />
        </mesh>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position={[x, 0.625, 0.16]}>
            <sphereGeometry args={[0.017, 6, 6]} />
            <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={1.1} />
          </mesh>
        ))}
        {/* belt rope */}
        <mesh position={[0, 0.28, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.175, 0.015, 6, 18]} />
          <meshStandardMaterial color="#6B4E2E" roughness={1} />
        </mesh>
        {/* staff with lantern */}
        <group position={[-0.26, 0.4, 0.06]} rotation-z={0.16}>
          <mesh castShadow>
            <cylinderGeometry args={[0.014, 0.018, 0.78, 6]} />
            <meshStandardMaterial color="#6B4E2E" roughness={1} />
          </mesh>
          <mesh position={[0, 0.33, 0]} rotation-z={Math.PI / 2} castShadow>
            <torusGeometry args={[0.055, 0.014, 6, 10, Math.PI]} />
            <meshStandardMaterial color="#6B4E2E" roughness={1} />
          </mesh>
          <group position={[0, 0.16, 0.06]}>
            <mesh>
              <boxGeometry args={[0.1, 0.12, 0.1]} />
              <meshStandardMaterial color="#2B2320" roughness={1} />
            </mesh>
            <mesh position={[0, -0.005, 0.052]}>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={1.4} />
            </mesh>
            <mesh position={[0, 0.068, 0]}>
              <boxGeometry args={[0.12, 0.018, 0.12]} />
              <meshStandardMaterial color="#1D1815" roughness={1} />
            </mesh>
          </group>
        </group>
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
