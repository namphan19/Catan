// 3D board view — a drop-in alternative to the 2D SVG <Board/>.
//
// Props are identical to Board's: layout, board, pieces, highlights and the three pick
// callbacks. Legality comes exclusively from the highlights GameTable derives from
// getLegalActions; this file never decides what is legal. The whole module (three.js,
// fiber, drei) is loaded with React.lazy from BoardSwitch so 2D users never download it.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { EdgeId, Graph, HexId, VertexId } from '@hexgame/engine';
import type { BoardProps } from '../board/Board';
import { EMPTY_HIGHLIGHTS, type Highlights } from '../board/Highlights';
import { useI18n } from '../i18n';
import { getBoardGraph } from '../board/geom';
import { boardFit, edgeWorld, HEX_TOP, vertexWorld, hexWorld, type BoardFit, type WorldXZ } from './world';
import { Harbors, NumberTokens, SeaPlane, TerrainField } from './terrain';
import { Blocker3D, Highlights3D, Pieces3D } from './pieces3d';
import type { Boschtan3DApi } from './testApi';

export interface Board3DProps extends BoardProps {
  /** Called when WebGL is unavailable/lost so the wrapper can switch back to 2D + toast. */
  onFallback?: (reason: 'context-lost' | 'error') => void;
}

const E2E_ENABLED =
  import.meta.env.MODE !== 'production' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e'));

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
}

function CameraRig({
  fit,
  resetKey,
  controls,
}: {
  fit: BoardFit;
  resetKey: number;
  controls: MutableRefObject<OrbitLike | null>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.35, camera.aspect));
    const elev = (50 * Math.PI) / 180; // camera ~50 degrees above the board
    // A flat board is foreshortened by sin(elevation): its screen height is much smaller
    // than a sphere fit would reserve, so fit the projected plane instead of the sphere.
    const planeHalfV = fit.radius * Math.sin(elev);
    const dist = Math.max(planeHalfV / Math.tan(vHalf), fit.radius / Math.tan(hHalf)) * 1.12;
    camera.position.set(fit.cx, dist * Math.sin(elev), fit.cz + dist * Math.cos(elev));
    camera.near = Math.max(0.05, dist / 120);
    camera.far = Math.max(120, dist * 9);
    camera.updateProjectionMatrix();
    camera.lookAt(fit.cx, 0, fit.cz);
    const c = controls.current;
    if (c) {
      c.target.set(fit.cx, 0, fit.cz);
      c.update();
    }
  }, [camera, fit, resetKey, size.width, size.height]);

  const minDistance = fit.radius * 0.55;
  const maxDistance = fit.radius * 4;

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning={false}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={Math.PI / 9}
      // Never go under the board.
      maxPolarAngle={(78 * Math.PI) / 180}
      rotateSpeed={0.65}
      zoomSpeed={0.8}
      panSpeed={0.7}
    />
  );
}

function Lights({ fit }: { fit: BoardFit }) {
  const scene = useThree((s) => s.scene);
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(fit.cx, 0, fit.cz);
    l.target.updateMatrixWorld();
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [fit, scene]);

  const bound = fit.radius + 3;
  return (
    <>
      <ambientLight intensity={0.62} color="#fff0d2" />
      <hemisphereLight args={['#f6e7c8', '#8a6d3b', 0.45]} />
      <directionalLight
        ref={light}
        position={[fit.cx + 9, 18, fit.cz + 11]}
        intensity={1.75}
        color="#ffe2b0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-camera-left={-bound}
        shadow-camera-right={bound}
        shadow-camera-top={bound}
        shadow-camera-bottom={-bound}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight position={[fit.cx - 10, 8, fit.cz - 8]} intensity={0.35} color="#cfe0ef" />
    </>
  );
}

/** Camera/projection + pixel sampling hooks for Playwright (never shipped to players). */
function TestProbe({
  enabled,
  fit,
  graph,
  hl,
  controls,
}: {
  enabled: boolean;
  fit: BoardFit;
  graph: Graph;
  hl: Highlights;
  controls: MutableRefObject<OrbitLike | null>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  void fit;
  const point = useCallback(
    (id: string): WorldXZ => {
      if (id.startsWith('v:')) return vertexWorld(id as VertexId);
      if (id.startsWith('e:')) return edgeWorld(graph, id as EdgeId).mid;
      return hexWorld(id as HexId);
    },
    [graph],
  );

  useEffect(() => {
    if (!enabled) return;
    const api: Boschtan3DApi = {
      project(id: string) {
        const p = point(id);
        const v = new THREE.Vector3(p.x, HEX_TOP + 0.06, p.z).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return {
          x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
          visible: v.z < 1 && v.z > -1,
        };
      },
      targets() {
        return {
          vertices: [...hl.vertices].map(String),
          edges: [...hl.edges].map(String),
          hexes: [...hl.hexes].map(String),
        };
      },
      debug() {
        const out: Array<Record<string, unknown>> = [];
        scene.traverse((o) => {
          const m = o as THREE.InstancedMesh;
          if (!m.isInstancedMesh) return;
          const mat = Array.isArray(m.material) ? m.material : [m.material];
          out.push({
            count: m.count,
            visible: m.visible,
            matrices: Array.from(m.instanceMatrix.array.slice(0, 16)),
            materials: mat.map((x) => ({
              type: x.type,
              map: Boolean((x as THREE.MeshStandardMaterial).map),
              color: (x as THREE.MeshStandardMaterial).color?.getHexString(),
            })),
          });
        });
        return out;
      },
      focus(id: string, distance?: number) {
        const p = point(id);
        const d = distance ?? Math.max(4.5, fit.radius * 0.55);
        const elev = (42 * Math.PI) / 180;
        camera.position.set(p.x, d * Math.sin(elev), p.z + d * Math.cos(elev));
        camera.lookAt(p.x, 0, p.z);
        const c = controls.current;
        if (c) {
          c.target.set(p.x, 0, p.z);
          c.update();
        }
        return true;
      },
      sample() {
        const src = gl.domElement;
        const w = 192;
        const h = 120;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { w, h, nonBlank: 0, distinct: 0 };
        ctx.drawImage(src, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const counts = new Map<number, number>();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 8) continue;
          const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        let top = 0;
        for (const n of counts.values()) if (n > top) top = n;
        let nonBlank = 0;
        for (const n of counts.values()) nonBlank += n;
        return { w, h, nonBlank: nonBlank - top, distinct: counts.size };
      },
    };
    window.__boschtan3d = api;
    return () => {
      if (window.__boschtan3d === api) delete window.__boschtan3d;
    };
  }, [enabled, camera, gl, scene, point, hl, controls, fit]);

  return null;
}

function OnCreated({ onLost }: { onLost: (reason: 'context-lost' | 'error') => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      onLost('context-lost');
    };
    el.addEventListener('webglcontextlost', lost, false);
    return () => el.removeEventListener('webglcontextlost', lost, false);
  }, [gl, onLost]);
  return null;
}

export default function Board3D(props: Board3DProps) {
  const { layout, board, pieces, highlights, onVertex, onEdge, onHex, onMiss, onFallback } = props;
  const { t } = useI18n();
  const hl = highlights ?? EMPTY_HIGHLIGHTS;
  const fit = useMemo(() => boardFit(layout), [layout]);
  const graph = useMemo(() => getBoardGraph(layout), [layout]);
  const [resetKey, setResetKey] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const controls = useRef<OrbitLike | null>(null);

  const fallback = useCallback(
    (reason: 'context-lost' | 'error') => {
      onFallback?.(reason);
    },
    [onFallback],
  );

  return (
    <div
      ref={wrapRef}
      className="board3d-wrap"
      role="application"
      aria-label={t('board_view3d')}
      data-board-view="3d"
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
        camera={{ fov: 40, near: 0.2, far: 260, position: [0, 18, 14] }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(new THREE.Color('#efe3c6'), 1);
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          scene.background = new THREE.Color('#efe3c6');
        }}
      >
        <CameraRig fit={fit} resetKey={resetKey} controls={controls} />
        <Lights fit={fit} />
        <SeaPlane fit={fit} />
        <TerrainField board={board} />
        <NumberTokens hexes={board.hexes} />
        <Harbors board={board} graph={graph} fit={fit} />
        <Pieces3D pieces={pieces} graph={graph} />
        <Blocker3D hexId={board.blocker} />
        <Highlights3D hl={hl} graph={graph} onVertex={onVertex} onEdge={onEdge} onHex={onHex} />
        {/* Clicking open sea cancels a pending pick, like clicking the SVG sea in 2D. */}
        <mesh
          rotation-x={-Math.PI / 2}
          position-y={-0.24}
          onClick={(e) => {
            if (e.delta <= 5) onMiss?.();
          }}
        >
          <planeGeometry args={[fit.radius * 12, fit.radius * 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <OnCreated onLost={fallback} />
        <TestProbe enabled={E2E_ENABLED} fit={fit} graph={graph} hl={hl} controls={controls} />
      </Canvas>
      <div className="board-zoom">
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setResetKey((k) => k + 1)}
          aria-label={t('board_reset')}
          title={t('board_reset')}
        >
          ⤢
        </button>
      </div>
    </div>
  );
}
