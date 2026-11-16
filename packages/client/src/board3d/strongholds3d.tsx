// Strongholds expansion pieces in 3D: wardens (active / inactive), ramparts, capitals,
// the caravan and the toppled-city marker. Purely visual: every piece comes from the engine's
// Pieces/StrongholdsView; this file never decides legality.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Outlines, RoundedBox } from '@react-three/drei';
import {
  TRACKS,
  type HexId,
  type Pieces,
  type StrongholdsView,
  type Track,
  type VertexId,
} from '@hexgame/engine';
import { playerHex } from '../ui/colors';
import { GOLD, HEX_TOP, INK, hexWorld, shade, vertexWorld } from './world';
import { EmblemPlaque, Pop } from './pieces3d';

const STEEL = '#C9CDD4';
const STONE = '#9A958C';
const WOOD = '#6B4E2E';
const DANGER = '#B23A2E';

/** Gem colour that marks which improvement track owns a capital. */
const TRACK_GEM: Record<Track, string> = {
  learning: '#4E7A4A',
  commerce: '#B8862F',
  council: '#5E7186',
};

function Warden3D({
  v,
  owner,
  level,
  active,
}: {
  v: VertexId;
  owner: string;
  level: number;
  active: boolean;
}) {
  const p = vertexWorld(v);
  const color = playerHex(owner);
  const dark = shade(color, 0.55);
  return (
    <group
      position={[p.x, HEX_TOP + 0.01, p.z]}
      userData={{ boschtanPiece: 'warden', v, owner, level, active }}
    >
      <Pop>
        {/* dark miniature base */}
        <mesh position={[0, 0.018, 0]} receiveShadow>
          <cylinderGeometry args={[0.17, 0.19, 0.032, 18]} />
          <meshStandardMaterial color="#4A3B2A" roughness={1} />
        </mesh>
        {active && (
          <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
            <torusGeometry args={[0.195, 0.016, 8, 28]} />
            <meshStandardMaterial
              color={GOLD}
              emissive={GOLD}
              emissiveIntensity={0.7}
              roughness={0.4}
              metalness={0.2}
            />
          </mesh>
        )}
        <group
          position={active ? [0, 0, 0] : [0, -0.03, 0]}
          rotation={active ? [0, 0, 0] : [0.16, 0.35, 0.08]}
          scale={active ? 0.82 : 0.78}
        >
          {[-0.065, 0.065].map((x) => (
            <mesh key={`leg${x}`} position={[x, 0.16, 0]} castShadow>
              <cylinderGeometry args={[0.035, 0.04, 0.22, 6]} />
              <meshStandardMaterial color={dark} roughness={0.95} />
            </mesh>
          ))}
          {[-0.065, 0.065].map((x) => (
            <mesh key={`boot${x}`} position={[x, 0.05, 0.01]} castShadow>
              <boxGeometry args={[0.075, 0.07, 0.11]} />
              <meshStandardMaterial color={INK} roughness={0.9} />
            </mesh>
          ))}
          {/* tunic in the owner's colour */}
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.105, 0.15, 0.26, 8]} />
            <meshStandardMaterial color={color} roughness={0.88} />
            <Outlines thickness={0.012} color={INK} />
          </mesh>
          <mesh position={[0, 0.205, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.14, 0.018, 6, 16]} />
            <meshStandardMaterial color={dark} roughness={0.9} />
          </mesh>
          {/* pauldrons and neck */}
          {[-0.1, 0.1].map((x) => (
            <mesh key={`pauldron${x}`} position={[x, 0.43, 0]} castShadow>
              <sphereGeometry args={[0.065, 9, 7]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.465, 0]} castShadow>
            <cylinderGeometry args={[0.038, 0.045, 0.06, 8]} />
            <meshStandardMaterial color={dark} roughness={0.95} />
          </mesh>
          {/* arms */}
          <mesh position={[-0.13, 0.36, 0.04]} rotation-z={0.45} castShadow>
            <cylinderGeometry args={[0.026, 0.03, 0.2, 6]} />
            <meshStandardMaterial color={dark} roughness={0.95} />
          </mesh>
          <mesh position={[0.12, 0.37, -0.01]} rotation-z={-0.4} castShadow>
            <cylinderGeometry args={[0.026, 0.03, 0.2, 6]} />
            <meshStandardMaterial color={dark} roughness={0.95} />
          </mesh>
          {/* head and helmet */}
          <mesh position={[0, 0.51, 0]} castShadow>
            <sphereGeometry args={[0.075, 10, 8]} />
            <meshStandardMaterial color="#E7C9A3" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.56, 0]} castShadow>
            <cylinderGeometry args={[0.082, 0.09, 0.09, 10]} />
            <meshStandardMaterial color={STEEL} roughness={0.55} metalness={0.4} />
            <Outlines thickness={0.01} color={INK} />
          </mesh>
          <mesh position={[0, 0.625, 0]} castShadow>
            <coneGeometry args={[0.075, 0.11, 10]} />
            <meshStandardMaterial color={shade(color, 0.8)} roughness={0.8} />
          </mesh>
          {/* rank plumes: one gold feather per rank */}
          {Array.from({ length: level }, (_, i) => (
            <mesh
              key={`plume${i}`}
              position={[(i - (level - 1) / 2) * 0.055, 0.71, -0.01]}
              rotation-z={(i - (level - 1) / 2) * 0.25}
              castShadow
            >
              <coneGeometry args={[0.018, 0.08 + level * 0.012, 5]} />
              <meshStandardMaterial
                color={GOLD}
                emissive={GOLD}
                emissiveIntensity={0.35}
                roughness={0.5}
              />
            </mesh>
          ))}
          {/* owner emblem on the shield, held on the left arm */}
          <group position={[-0.115, 0.31, 0.12]} rotation-y={0.16}>
            <EmblemPlaque
              player={owner}
              position={[0, 0, 0]}
              height={0.3}
              color={active ? undefined : '#C7BBA2'}
            />
          </group>
          {/* spear */}
          <group position={[0.17, 0.34, -0.02]} rotation-z={-0.06}>
            <mesh castShadow>
              <cylinderGeometry args={[0.011, 0.013, 0.72, 6]} />
              <meshStandardMaterial color={WOOD} roughness={1} />
            </mesh>
            <mesh position={[0, 0.4, 0]} castShadow>
              <coneGeometry args={[0.028, 0.1, 6]} />
              <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.4} />
            </mesh>
          </group>
        </group>
      </Pop>
    </group>
  );
}

function Rampart3D({ v, owner }: { v: VertexId; owner: string }) {
  const p = vertexWorld(v);
  const color = playerHex(owner);
  return (
    <group
      position={[p.x, HEX_TOP + 0.01, p.z]}
      userData={{ boschtanPiece: 'rampart', v, owner }}
    >
      <Pop>
        <mesh position={[0, 0.02, 0.34]} receiveShadow>
          <boxGeometry args={[0.96, 0.04, 0.16]} />
          <meshStandardMaterial color="#6F6A61" roughness={1} />
        </mesh>
        {/* crenellated wall in front of the city */}
        <mesh position={[0, 0.14, 0.34]} castShadow receiveShadow>
          <boxGeometry args={[0.92, 0.2, 0.11]} />
          <meshStandardMaterial color={STONE} roughness={0.95} />
          <Outlines thickness={0.012} color={INK} />
        </mesh>
        {[-0.36, -0.12, 0.12, 0.36].map((x) => (
          <mesh key={x} position={[x, 0.285, 0.34]} castShadow>
            <boxGeometry args={[0.11, 0.09, 0.12]} />
            <meshStandardMaterial color={shade(STONE, 0.92)} roughness={1} />
            <Outlines thickness={0.008} color={INK} />
          </mesh>
        ))}
        {/* short returns toward the city */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.44, 0.11, 0.27]}
            rotation-y={s * 0.55}
            castShadow
          >
            <boxGeometry args={[0.28, 0.16, 0.09]} />
            <meshStandardMaterial color={STONE} roughness={1} />
            <Outlines thickness={0.01} color={INK} />
          </mesh>
        ))}
        {/* owner pennant */}
        <mesh position={[0.22, 0.37, 0.34]} castShadow>
          <cylinderGeometry args={[0.008, 0.01, 0.18, 6]} />
          <meshStandardMaterial color={WOOD} roughness={1} />
        </mesh>
        <mesh
          position={[0.3, 0.43, 0.34]}
          rotation-y={Math.PI / 2}
          scale={[1, 1, 0.08]}
          castShadow
        >
          <coneGeometry args={[0.06, 0.12, 3]} />
          <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
      </Pop>
    </group>
  );
}

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function Capital3D({ v, track }: { v: VertexId; track: Track }) {
  const p = vertexWorld(v);
  const gem = TRACK_GEM[track];
  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(starShape(0.17, 0.072), {
      depth: 0.055,
      bevelEnabled: false,
      curveSegments: 1,
    });
    g.translate(0, 0, -0.0275);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group
      position={[p.x, HEX_TOP + 0.01, p.z]}
      userData={{ boschtanPiece: 'capital', v, track }}
    >
      <Pop>
        {/* pole rising from the keep */}
        <mesh position={[0, 0.82, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.016, 0.44, 6]} />
          <meshStandardMaterial color={WOOD} roughness={1} />
        </mesh>
        {/* two crossed stars so the capital reads from every camera angle */}
        <group position={[0, 1.08, 0]}>
          <mesh geometry={geometry} castShadow>
            <meshStandardMaterial
              color={GOLD}
              emissive={GOLD}
              emissiveIntensity={0.35}
              metalness={0.55}
              roughness={0.35}
            />
            <Outlines thickness={0.01} color={INK} />
          </mesh>
          <mesh geometry={geometry} rotation-y={Math.PI / 2} castShadow>
            <meshStandardMaterial
              color={GOLD}
              emissive={GOLD}
              emissiveIntensity={0.35}
              metalness={0.55}
              roughness={0.35}
            />
            <Outlines thickness={0.01} color={INK} />
          </mesh>
          {/* track gem in the star's centre */}
          <mesh>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial
              color={gem}
              emissive={gem}
              emissiveIntensity={0.4}
              roughness={0.4}
              metalness={0.3}
            />
          </mesh>
        </group>
      </Pop>
    </group>
  );
}

function Caravan3D({ hex, owner }: { hex: HexId; owner: string }) {
  const c = hexWorld(hex);
  const color = playerHex(owner);
  return (
    <group
      position={[c.x - 0.5, HEX_TOP + 0.02, c.z + 0.25]}
      rotation-y={-0.35}
      userData={{ boschtanPiece: 'caravan', hex, owner }}
    >
      <Pop>
        <RoundedBox
          args={[0.34, 0.08, 0.22]}
          radius={0.02}
          smoothness={2}
          position={[0, 0.09, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={WOOD} roughness={0.95} />
          <Outlines thickness={0.01} color={INK} />
        </RoundedBox>
        <RoundedBox
          args={[0.3, 0.16, 0.2]}
          radius={0.075}
          smoothness={3}
          position={[0, 0.21, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#F3E9D2" roughness={0.95} />
          <Outlines thickness={0.01} color={INK} />
        </RoundedBox>
        <mesh position={[0, 0.09, 0.112]}>
          <boxGeometry args={[0.28, 0.07, 0.012]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
        {[-0.12, 0.12].map((z) => (
          <mesh key={z} position={[0, 0.08, z]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.03, 12]} />
            <meshStandardMaterial color="#4A3B2A" roughness={1} />
          </mesh>
        ))}
        {/* the caravan is worth a VP: a small gold coin on the canopy */}
        <mesh position={[0, 0.31, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.018, 12]} />
          <meshStandardMaterial color={GOLD} metalness={0.5} roughness={0.35} />
        </mesh>
        {/* tall pennant: keeps the wagon findable when a city hides the cart */}
        <mesh position={[0.12, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.01, 0.66, 6]} />
          <meshStandardMaterial color={WOOD} roughness={1} />
        </mesh>
        <mesh
          position={[0.19, 0.83, 0]}
          rotation-y={Math.PI / 2}
          scale={[1, 1, 0.08]}
          castShadow
        >
          <coneGeometry args={[0.07, 0.14, 3]} />
          <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
      </Pop>
    </group>
  );
}

function Toppled3D({ v }: { v: VertexId }) {
  const p = vertexWorld(v);
  return (
    <group
      position={[p.x + 0.34, HEX_TOP + 0.01, p.z - 0.24]}
      userData={{ boschtanPiece: 'toppled', v }}
    >
      <Pop>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.016, 0.5, 6]} />
          <meshStandardMaterial color="#4A3B2A" roughness={1} />
        </mesh>
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[0.045, 0.2, 0.045]} />
          <meshStandardMaterial
            color={DANGER}
            emissive="#7A1F18"
            emissiveIntensity={0.35}
            roughness={0.7}
          />
        </mesh>
        <mesh position={[0, 0.44, 0]} castShadow>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshStandardMaterial
            color={DANGER}
            emissive="#7A1F18"
            emissiveIntensity={0.35}
            roughness={0.7}
          />
        </mesh>
      </Pop>
    </group>
  );
}

export function Strongholds3D({ pieces, sh }: { pieces: Pieces; sh: StrongholdsView }) {
  return (
    <group>
      {sh.ramparts.map((v) => {
        const owner = pieces.buildings[v]?.owner;
        return owner ? <Rampart3D key={`r${v}`} v={v} owner={owner} /> : null;
      })}
      {TRACKS.map((track) => {
        const cap = sh.capitals[track];
        return cap ? <Capital3D key={`c${track}`} v={cap.v} track={track} /> : null;
      })}
      {sh.toppled.map((v) => (
        <Toppled3D key={`t${v}`} v={v} />
      ))}
      {sh.caravan && <Caravan3D hex={sh.caravan.hex} owner={sh.caravan.owner} />}
      {Object.entries(pieces.occupants ?? {}).map(([v, o]) =>
        o.kind === 'warden' ? (
          <Warden3D
            key={`w${v}`}
            v={v as VertexId}
            owner={o.owner}
            level={o.level}
            active={o.active}
          />
        ) : null,
      )}
    </group>
  );
}
