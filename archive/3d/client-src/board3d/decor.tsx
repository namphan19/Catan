// 3D terrain dressing: instanced pine trees, sheep, wheat, peaks, bricks and cacti.
//
// Purely decorative — the engine still owns terrain, tokens and production. Every hex is
// seeded from its id so the scatter is stable across re-renders and identical for both
// players. Draw calls stay low: one InstancedMesh per part type, not per hex.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Hex } from '@hexgame/engine';
import { HEX_TOP, hexWorld } from './world';

interface Item {
  x: number;
  z: number;
  rot: number;
  /** 0..1 deterministic roll. */
  r: number;
  color?: string;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic ring scatter: decorations hug the tile edge, the token stays clear. */
function scatter(hexes: Hex[], count: number, salt: number, minR = 0.5, maxR = 0.78): Item[] {
  const out: Item[] = [];
  for (const hex of hexes) {
    const p = hexWorld(hex.id);
    const rand = rng(hash(hex.id) + salt * 7919);
    const base = rand() * Math.PI * 2;
    for (let i = 0; i < count; i += 1) {
      const angle = base + (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.8;
      const radius = minR + rand() * (maxR - minR);
      out.push({
        x: p.x + Math.cos(angle) * radius,
        z: p.z + Math.sin(angle) * radius,
        rot: rand() * Math.PI * 2,
        r: rand(),
      });
    }
  }
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function InstancedField({
  geometry,
  material,
  items,
  y,
  scale,
  castShadow = true,
  receiveShadow = true,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: Item[];
  y: number;
  scale: (it: Item) => [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      _e.set(0, it.rot, 0);
      _q.setFromEuler(_e);
      _p.set(it.x, y, it.z);
      _s.set(...scale(it));
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (it.color) {
        mesh.setColorAt(i, _c.set(it.color));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, y, scale]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  );
}

// ---- shared geometry / material pools (tiny, reused for every board) -------------------
const trunkGeo = new THREE.CylinderGeometry(0.028, 0.04, 0.16, 5);
const trunkMat = new THREE.MeshStandardMaterial({ color: '#5B4632', roughness: 1 });
const canopyLowGeo = new THREE.ConeGeometry(0.19, 0.32, 6).translate(0, 0.16, 0);
const canopyTopGeo = new THREE.ConeGeometry(0.13, 0.26, 6).translate(0, 0.13, 0);
const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.98, flatShading: true });

const sheepBodyGeo = new THREE.SphereGeometry(0.1, 8, 6);
const sheepHeadGeo = new THREE.SphereGeometry(0.045, 7, 6);
const sheepLegGeo = new THREE.CylinderGeometry(0.009, 0.011, 0.075, 4);
const sheepBodyMat = new THREE.MeshStandardMaterial({ color: '#F3E9D2', roughness: 1, flatShading: true });
const sheepHeadMat = new THREE.MeshStandardMaterial({ color: '#5B4B44', roughness: 1, flatShading: true });
const sheepLegMat = new THREE.MeshStandardMaterial({ color: '#4A3B35', roughness: 1 });

const wheatGeo = new THREE.ConeGeometry(0.075, 0.28, 6);
const wheatMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
const furrowGeo = new THREE.BoxGeometry(0.72, 0.016, 0.075);
const furrowMat = new THREE.MeshStandardMaterial({ color: '#A67C2B', roughness: 1 });

// Peak base sits at y=0; its snow cap is baked with the same origin so one uniform
// per-instance scale keeps cap and peak aligned exactly.
const peakGeo = new THREE.ConeGeometry(0.27, 0.36, 5).translate(0, 0.18, 0);
const peakMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
const snowGeo = new THREE.ConeGeometry(0.115, 0.16, 5).translate(0, 0.28, 0);
const snowMat = new THREE.MeshStandardMaterial({ color: '#F3E9D2', roughness: 0.9, flatShading: true });
const rockGeo = new THREE.DodecahedronGeometry(0.075, 0);
const rockMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });

const brickGeo = new THREE.BoxGeometry(0.12, 0.055, 0.075);
const brickMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
const pitGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.022, 12);
const pitMat = new THREE.MeshStandardMaterial({ color: '#5E2812', roughness: 1 });

const cactusGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6);
const cactusMat = new THREE.MeshStandardMaterial({ color: '#6E8C4A', roughness: 1, flatShading: true });

const TREE_GREENS = ['#1F4E33', '#2A5D3D', '#2F6845', '#367349'];

function Forest({ hexes }: { hexes: Hex[] }) {
  const items = useMemo(() => scatter(hexes, 7, 11, 0.48, 0.8), [hexes]);
  const canopyScale = (it: Item): [number, number, number] => {
    const s = 0.78 + it.r * 0.42;
    return [s, s, s];
  };
  return (
    <group>
      <InstancedField geometry={trunkGeo} material={trunkMat} items={items} y={HEX_TOP + 0.07} scale={canopyScale} />
      <InstancedField
        geometry={canopyLowGeo}
        material={canopyMat}
        items={items.map((it, i) => ({ ...it, color: TREE_GREENS[i % TREE_GREENS.length] }))}
        y={HEX_TOP + 0.12}
        scale={canopyScale}
      />
      <InstancedField
        geometry={canopyTopGeo}
        material={canopyMat}
        items={items.map((it, i) => ({ ...it, color: TREE_GREENS[(i + 2) % TREE_GREENS.length] }))}
        y={HEX_TOP + 0.24}
        scale={canopyScale}
      />
    </group>
  );
}

function Meadow({ hexes }: { hexes: Hex[] }) {
  const sheep = useMemo(() => scatter(hexes, 4, 23, 0.44, 0.7), [hexes]);
  const bodyScale = (it: Item): [number, number, number] => {
    const s = 0.85 + it.r * 0.35;
    return [1.3 * s, 0.95 * s, 0.9 * s];
  };
  const head = useMemo(
    () =>
      sheep.map((it) => {
        const a = it.rot;
        return { ...it, x: it.x + Math.cos(a) * 0.13, z: it.z + Math.sin(a) * 0.13 };
      }),
    [sheep],
  );
  const legs = useMemo(
    () =>
      sheep.flatMap((it) => {
        const s = 0.85 + it.r * 0.35;
        const ca = Math.cos(it.rot);
        const sa = Math.sin(it.rot);
        return [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => ({
            ...it,
            x: it.x + ca * sx * 0.055 * s - sa * sz * 0.04 * s,
            z: it.z + sa * sx * 0.055 * s + ca * sz * 0.04 * s,
          })),
        );
      }),
    [sheep],
  );
  return (
    <group>
      <InstancedField geometry={sheepBodyGeo} material={sheepBodyMat} items={sheep} y={HEX_TOP + 0.125} scale={bodyScale} />
      <InstancedField geometry={sheepHeadGeo} material={sheepHeadMat} items={head} y={HEX_TOP + 0.135} scale={() => [1, 1, 1]} />
      <InstancedField
        geometry={sheepLegGeo}
        material={sheepLegMat}
        items={legs}
        y={HEX_TOP + 0.035}
        scale={() => [1, 1, 1]}
        castShadow={false}
      />
    </group>
  );
}

function Fields({ hexes }: { hexes: Hex[] }) {
  const sheaves = useMemo(() => scatter(hexes, 6, 37, 0.46, 0.8), [hexes]);
  const furrows = useMemo(
    () =>
      hexes.flatMap((hex) => {
        const p = hexWorld(hex.id);
        const rand = rng(hash(hex.id) + 991);
        const base = rand() * Math.PI;
        return [-0.26, -0.09, 0.09, 0.26].map((dz) => ({
          x: p.x - Math.sin(base) * dz,
          z: p.z + Math.cos(base) * dz,
          rot: base,
          r: rand(),
        }));
      }),
    [hexes],
  );
  return (
    <group>
      <InstancedField
        geometry={furrowGeo}
        material={furrowMat}
        items={furrows}
        y={HEX_TOP + 0.008}
        scale={() => [1, 1, 1]}
        castShadow={false}
      />
      <InstancedField
        geometry={wheatGeo}
        material={wheatMat}
        items={sheaves.map((it, i) => ({ ...it, color: i % 3 === 0 ? '#C9A227' : i % 3 === 1 ? '#E0B84C' : '#D4A63A' }))}
        y={HEX_TOP + 0.15}
        scale={(it) => {
          const s = 0.8 + it.r * 0.45;
          return [s, s, s];
        }}
      />
    </group>
  );
}

function Quarry({ hexes }: { hexes: Hex[] }) {
  const peaks = useMemo(() => scatter(hexes, 2, 51, 0.52, 0.62), [hexes]);
  const caps = useMemo(() => peaks.map((it) => ({ ...it })), [peaks]);
  const rocks = useMemo(() => scatter(hexes, 4, 53, 0.5, 0.78), [hexes]);
  const peakScale = (it: Item): [number, number, number] => {
    const s = 0.8 + it.r * 0.5;
    return [s, s, s];
  };
  return (
    <group>
      <InstancedField
        geometry={peakGeo}
        material={peakMat}
        items={peaks.map((it, i) => ({ ...it, color: i % 2 === 0 ? '#9BA1A7' : '#878D93' }))}
        y={HEX_TOP}
        scale={peakScale}
      />
      <InstancedField
        geometry={snowGeo}
        material={snowMat}
        items={caps}
        y={HEX_TOP}
        scale={peakScale}
      />
      <InstancedField
        geometry={rockGeo}
        material={rockMat}
        items={rocks.map((it, i) => ({ ...it, color: i % 2 === 0 ? '#7E838A' : '#94999F' }))}
        y={HEX_TOP + 0.05}
        scale={(it) => {
          const s = 0.7 + it.r * 0.6;
          return [s, s * 0.8, s];
        }}
      />
    </group>
  );
}

function ClayPits({ hexes }: { hexes: Hex[] }) {
  const bricks = useMemo(
    () =>
      hexes.flatMap((hex) => {
        const p = hexWorld(hex.id);
        const rand = rng(hash(hex.id) + 331);
        const base = rand() * Math.PI * 2;
        const piles = [0, Math.PI].map((a) => ({
          x: p.x + Math.cos(base + a) * 0.55,
          z: p.z + Math.sin(base + a) * 0.55,
        }));
        return piles.flatMap((pile) =>
          [0, 1, 2].flatMap((row) =>
            [0, 1].map((col) => ({
              x: pile.x + (col - 0.5) * 0.13 + row * 0.04,
              z: pile.z + row * 0.06,
              rot: base,
              r: rand(),
            })),
          ),
        );
      }),
    [hexes],
  );
  const pits = useMemo(
    () =>
      hexes.flatMap((hex) => {
        const p = hexWorld(hex.id);
        const rand = rng(hash(hex.id) + 337);
        const base = rand() * Math.PI * 2;
        return [{ x: p.x + Math.cos(base) * 0.6, z: p.z + Math.sin(base) * 0.6, rot: 0, r: rand() }];
      }),
    [hexes],
  );
  return (
    <group>
      <InstancedField geometry={pitGeo} material={pitMat} items={pits} y={HEX_TOP + 0.011} scale={() => [1, 1, 1]} castShadow={false} />
      <InstancedField
        geometry={brickGeo}
        material={brickMat}
        items={bricks.map((it, i) => ({ ...it, color: i % 2 === 0 ? '#C97A45' : '#D98E4A' }))}
        y={HEX_TOP + 0.045}
        scale={() => [1, 1, 1]}
      />
    </group>
  );
}

function Cactus({ x, z, rot, scale }: { x: number; z: number; rot: number; scale: number }) {
  return (
    <group position={[x, HEX_TOP, z]} rotation-y={rot} scale={scale}>
      <mesh geometry={cactusGeo} material={cactusMat} position={[0, 0.15, 0]} castShadow receiveShadow />
      <mesh geometry={cactusGeo} material={cactusMat} position={[-0.075, 0.13, 0]} rotation-z={Math.PI / 3} scale={[0.55, 0.6, 0.55]} castShadow />
      <mesh geometry={cactusGeo} material={cactusMat} position={[0.075, 0.19, 0]} rotation-z={-Math.PI / 3} scale={[0.5, 0.55, 0.5]} castShadow />
    </group>
  );
}

function Waste({ hexes }: { hexes: Hex[] }) {
  const items = useMemo(() => scatter(hexes, 2, 71, 0.5, 0.66), [hexes]);
  const rocks = useMemo(() => scatter(hexes, 3, 73, 0.48, 0.76), [hexes]);
  return (
    <group>
      {items.map((it, i) => (
        <Cactus key={i} x={it.x} z={it.z} rot={it.rot} scale={0.85 + it.r * 0.35} />
      ))}
      <InstancedField
        geometry={rockGeo}
        material={rockMat}
        items={rocks.map((it, i) => ({ ...it, color: i % 2 === 0 ? '#B3A06F' : '#C4B080' }))}
        y={HEX_TOP + 0.045}
        scale={(it) => {
          const s = 0.6 + it.r * 0.5;
          return [s, s * 0.75, s];
        }}
      />
    </group>
  );
}

/** Terrain decorations for every hex, grouped by terrain so the scatter stays tidy. */
export function TerrainDecor({ hexes }: { hexes: Hex[] }) {
  const groups = useMemo(() => {
    const out = new Map<string, Hex[]>();
    for (const h of hexes) {
      const list = out.get(h.terrain);
      if (list) list.push(h);
      else out.set(h.terrain, [h]);
    }
    return out;
  }, [hexes]);

  return (
    <group>
      {groups.has('forest') && <Forest hexes={groups.get('forest')!} />}
      {groups.has('meadow') && <Meadow hexes={groups.get('meadow')!} />}
      {groups.has('field') && <Fields hexes={groups.get('field')!} />}
      {groups.has('quarry') && <Quarry hexes={groups.get('quarry')!} />}
      {groups.has('claypit') && <ClayPits hexes={groups.get('claypit')!} />}
      {groups.has('waste') && <Waste hexes={groups.get('waste')!} />}
    </group>
  );
}
