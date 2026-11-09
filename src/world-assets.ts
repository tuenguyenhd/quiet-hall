// Real CC0 nature models (Quaternius via poly.pizza, see public/models/CREDITS.md) dressed over the
// procedural world. Each model is drawn as instanced meshes (one draw call per sub-mesh, however many copies).
// The procedural cones/rocks stay until a model loads, so the world still works offline or on a slow link.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface Placement {
  x: number;
  y: number;
  z: number;
  s: number; // scale multiplier
  ry: number;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // models are meshopt-compressed (scripts/optimize-glb.mjs)
/** culling cell size (m) for instanced scenery */
const CELL = 32;
const cache = new Map<string, Promise<THREE.Object3D>>();
const load = (url: string) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then((g) => g.scene));
  return cache.get(url)!;
};

/** Instance a model at many placements. `height` = target height in metres at s = 1. */
export async function instanceModel(scene: THREE.Scene, url: string, height: number, at: Placement[], opts: { shadows?: boolean; tint?: THREE.Color } = {}) {
  if (!at.length) return [];
  const root = await load(url);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const k = height / Math.max(0.001, box.max.y - box.min.y);
  // normalise: centre on x/z, feet at y = 0, scaled to `height`
  const norm = new THREE.Matrix4()
    .makeScale(k, k, k)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  const out: THREE.InstancedMesh[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  // split placements into ~CELL m cells: each cell gets its own instanced meshes with a tight bounding
  // sphere, so trees behind the camera are culled instead of the whole forest being drawn from everywhere
  const cells = new Map<string, Placement[]>();
  for (const p of at) {
    const key = `${Math.floor(p.x / CELL)}:${Math.floor(p.z / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(p);
  }
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material; local: THREE.Matrix4 }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (opts.tint && mat.color) mat.color.multiply(opts.tint);
    parts.push({ geo: mesh.geometry, mat, local: norm.clone().multiply(mesh.matrixWorld) });
  });
  for (const list of cells.values()) {
    for (const part of parts) {
      const inst = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.ry);
        m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s)).multiply(part.local);
        inst.setMatrixAt(i, m4);
      });
      inst.castShadow = !!opts.shadows;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      scene.add(inst);
      out.push(inst);
    }
  }
  return out;
}

export interface DressCtx {
  scene: THREE.Scene;
  R: () => number;
  lowPower: boolean;
  terrain: (x: number, z: number) => number;
  /** true where nothing should be placed (paths, places, hall, views) */
  blocked: (x: number, z: number, pad?: number) => boolean;
  pathDist: (x: number, z: number) => number;
  trees: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number }[];
  coneTrees: THREE.InstancedMesh[];
  coneRocks: THREE.Object3D[];
  tea: { x: number; z: number; w: number; d: number };
  grove: { x: number; z: number; r: number };
  lookout: { x: number; z: number };
}

export function dressWorld(c: DressCtx) {
  const { R, terrain } = c;
  const ry = () => R() * Math.PI * 2;
  const swap = (old: THREE.Object3D[]) => () => old.forEach((o) => (o.visible = false));
  const ok = () => {};

  // detailed pines replace the cheap cone trees only in the middle of the world (where people walk);
  // far trees stay cones, so the triangle count stays phone-friendly
  const nearR = c.lowPower ? 26 : 38;
  const near = c.trees.map((t, i) => ({ t, i })).filter(({ t }) => Math.hypot(t.x, t.z) < nearR);
  instanceModel(
    c.scene,
    '/models/pine.glb',
    5.2,
    near.map(({ t }) => ({ x: t.x, y: terrain(t.x, t.z) - 0.05, z: t.z, s: 0.7 + t.s * 0.45, ry: ry() })),
    { shadows: false }, // instanced shadows draw every copy again: too costly on phones
  ).then(() => {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of c.coneTrees) {
      for (const { i } of near) m.setMatrixAt(i, zero);
      m.instanceMatrix.needsUpdate = true;
    }
  }, ok);

  // rocks
  instanceModel(
    c.scene,
    '/models/rock.glb',
    1.0,
    c.rocks.map((r) => ({ x: r.x, y: terrain(r.x, r.z) - 0.1, z: r.z, s: 0.5 + r.s * 0.9, ry: ry() })),
    { shadows: !c.lowPower },
  ).then(swap(c.coneRocks), ok);

  // bushes along the paths (red maple shrubs + flowering bushes)
  const scatter = (n: number, minD: number, maxD: number, pad: number) => {
    const out: Placement[] = [];
    for (let i = 0; i < n * 12 && out.length < n; i++) {
      const a = R() * Math.PI * 2;
      const r = 16 + R() * 140;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const pd = c.pathDist(x, z);
      if (pd < minD || pd > maxD || c.blocked(x, z, pad)) continue;
      out.push({ x, y: terrain(x, z) - 0.05, z, s: 0.75 + R() * 0.6, ry: ry() });
    }
    return out;
  };
  const bushN = c.lowPower ? 32 : 70;
  const bushes = scatter(bushN, 2.6, 9, -3.2);
  instanceModel(c.scene, '/models/bush-red.glb', 0.9, bushes.filter((_, i) => i % 3 === 0), { shadows: false }).catch(ok);
  instanceModel(c.scene, '/models/bush-flower.glb', 0.85, bushes.filter((_, i) => i % 3 !== 0), { shadows: false }).catch(ok);
  instanceModel(c.scene, '/models/flowers.glb', 0.35, scatter(c.lowPower ? 18 : 44, 1.6, 5, -3.6), { shadows: false }).catch(ok);

  // bamboo stand behind the tea house
  const bamboo: Placement[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = c.tea.x + c.tea.w / 2 + 2.2 + R() * 2.5;
    const z = c.tea.z - c.tea.d / 2 - 1 + t * (c.tea.d + 2);
    bamboo.push({ x, y: terrain(x, z), z, s: 0.8 + R() * 0.5, ry: ry() });
  }
  instanceModel(c.scene, '/models/bamboo.glb', 4.2, bamboo, { shadows: false }).catch(ok);

  // a few big red maples at the grove edge and one by the lookout path: hero trees
  // (behind the grove, away from the viewpoints and paths, so the camera never ends up inside one)
  const heroes: Placement[] = [
    [c.grove.x - c.grove.r - 3.5, c.grove.z + 3],
    [c.grove.x - 5, c.grove.z - c.grove.r - 3.5],
    [c.grove.x - c.grove.r - 1, c.grove.z - 7],
    [c.lookout.x - 9, c.lookout.z + 2],
  ].map(([x, z]) => ({ x, y: terrain(x, z) - 0.05, z, s: 0.9 + R() * 0.3, ry: ry() }));
  instanceModel(c.scene, '/models/maple-red.glb', 6.5, c.lowPower ? heroes.slice(0, 2) : heroes, { shadows: false }).catch(ok);
}
