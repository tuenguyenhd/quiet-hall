// Character pool: pre-downloaded low-poly characters (Sketchfab, CC-BY; see public/chars/CREDITS.md) that the
// Degen dice can draw instead of a generated block character. Same seed -> same character on every device.
// Animation is choppy (8 fps): limbs are swung where the model has a rig or named parts, otherwise the whole
// body bobs/hops/squashes. Models load only when someone actually wears them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import POOL from './chars.json';

export interface PoolChar {
  id: string;
  file: string;
  name: string;
  by: string;
  license: string;
  source: string;
  tier: number;
}
export const CHARS = POOL as PoolChar[];

/** Share of dice rolls that land on a pool character instead of a generated degen. */
const POOL_SHARE = 0.3;
const HEIGHT = 1.55;

function mix(seed: number) {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
/** Which pool character a seed draws, or null for a generated degen. */
export function poolPick(seed: number): PoolChar | null {
  if (!CHARS.length) return null;
  const h = mix(seed);
  if ((h % 1000) / 1000 >= POOL_SHARE) return null;
  return CHARS[Math.floor(h / 1000) % CHARS.length];
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>>();
const load = (url: string) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url)!;
};

type Limb = { o: THREE.Object3D; rest: THREE.Quaternion; side: -1 | 1; kind: 'arm' | 'leg' | 'knee'; down: number };
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Rotate `o` by `angle` about a WORLD axis, starting from its rest pose. */
function worldRotate(o: THREE.Object3D, rest: THREE.Quaternion, axis: THREE.Vector3, angle: number) {
  const parentQ = new THREE.Quaternion();
  o.parent?.getWorldQuaternion(parentQ);
  const qw = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  // local = parent^-1 * qw * parent * rest
  o.quaternion.copy(parentQ.clone().invert().multiply(qw).multiply(parentQ).multiply(rest));
}

/** Tip of a limb in world space (first child's position, or a point below the pivot). */
function tip(o: THREE.Object3D) {
  const c = o.children.find((k) => (k as THREE.Bone).isBone || k.type === 'Object3D' || k.type === 'Group' || (k as THREE.Mesh).isMesh);
  if (c) return c.getWorldPosition(new THREE.Vector3());
  const b = new THREE.Box3().setFromObject(o);
  return b.getCenter(new THREE.Vector3());
}

function findLimbs(root: THREE.Object3D): Limb[] {
  const limbs: Limb[] = [];
  const seen = new Set<string>();
  root.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(root, true).getCenter(new THREE.Vector3());
  root.traverse((o) => {
    // GLTFLoader turns ':' '.' ' ' into '_' (e.g. mixamorig_LeftArm_14, upper_arm_L, l_arm)
    const n = o.name.toLowerCase().replace(/[.: ]/g, '_').replace(/(_\d+)+$/, '');
    let kind: Limb['kind'] | null = null;
    if (/mixamorig_?(left|right)arm$/.test(n) || /^(upper_arm|arm|def-arm)_(l|r)$/.test(n) || /^(left|right)_?arm(up)?$/.test(n) || /^arm_(left|right)$/.test(n) || /^(l|r)_arm$/.test(n)) kind = 'arm';
    else if (/mixamorig_?(left|right)upleg$/.test(n) || /^(thigh|def-leg)_(l|r)$/.test(n) || /^(left|right)_?leg$/.test(n) || /^leg_(left|right|l|r)$/.test(n) || /^(l|r)_leg$/.test(n)) kind = 'leg';
    else if (/mixamorig_?(left|right)leg$/.test(n) || /^lower_leg_(l|r)$/.test(n)) kind = 'knee';
    if (!kind) return;
    const key = kind + n;
    if (seen.has(key)) return;
    seen.add(key);
    const p = o.getWorldPosition(new THREE.Vector3());
    const side: -1 | 1 = p.x < centre.x ? -1 : 1;
    limbs.push({ o, rest: o.quaternion.clone(), side, kind, down: 0 });
  });
  // arms in a T-pose: find the rotation (about the forward axis) that brings the hand down
  for (const l of limbs.filter((x) => x.kind === 'arm')) {
    const before = tip(l.o);
    const pivot = l.o.getWorldPosition(new THREE.Vector3());
    const horizontal = Math.abs(before.x - pivot.x) > Math.abs(before.y - pivot.y) * 1.5;
    if (!horizontal) continue;
    let best = 0;
    let bestY = before.y;
    for (const a of [1.2, -1.2]) {
      worldRotate(l.o, l.rest, Z, a);
      root.updateMatrixWorld(true);
      const y = tip(l.o).y;
      if (y < bestY) {
        bestY = y;
        best = a;
      }
    }
    l.down = best;
    worldRotate(l.o, l.rest, Z, best);
    l.rest = l.o.quaternion.clone();
    root.updateMatrixWorld(true);
  }
  return limbs;
}

export class PoolRig {
  root = new THREE.Group();
  hipH = HEIGHT * 0.32;
  char: PoolChar;
  private body = new THREE.Group();
  private limbs: Limb[] = [];
  private t = 0;
  private hopUntil = 0;
  private baseY = 0;
  private dead = false;

  dispose() {
    this.dead = true; // skeletons are freed by Avatar.dispose (disposeOwned); materials are shared per model
  }

  constructor(char: PoolChar) {
    this.char = char;
    this.root.add(this.body);
    load(char.file)
      .then((g) => {
        if (this.dead) return;
        const obj = SkeletonUtils.clone(g.scene);
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.frustumCulled = false;
          for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
            const map = (mt as THREE.MeshStandardMaterial).map;
            // keep pixel-art skins crisp
            if (map?.image && (map.image as { width: number }).width <= 128) {
              map.magFilter = THREE.NearestFilter;
              map.minFilter = THREE.NearestFilter;
              map.needsUpdate = true;
            }
          }
        });
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj, true);
        const k = HEIGHT / Math.max(0.001, box.max.y - box.min.y);
        const wrap = new THREE.Group();
        wrap.add(obj);
        wrap.scale.setScalar(k);
        const c = box.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -box.min.y, -c.z);
        this.body.add(wrap);
        this.root.updateMatrixWorld(true);
        this.limbs = findLimbs(obj);
      })
      .catch(() => {
        /* offline: the ring/aura still shows where this person is */
      });
  }

  greet() {
    this.hopUntil = performance.now() + 900;
  }

  update(dt: number, sitK: number, moving: boolean, bow: number) {
    this.t += dt;
    const f = Math.floor(this.t * 8);
    const sit = sitK > 0.4;
    const hop = performance.now() < this.hopUntil;
    const step = f % 2 ? 1 : -1;
    let swung = false;
    for (const l of this.limbs) {
      let a = 0;
      if (l.kind === 'leg') a = sit ? -1.35 : moving ? 0.5 * step * l.side : 0;
      else if (l.kind === 'knee') a = sit ? 1.35 : 0;
      else a = moving && !sit ? -0.45 * step * l.side : 0;
      worldRotate(l.o, l.rest, X, a);
      if (l.kind === 'leg') swung = true;
    }
    // whole-body fallback (and extra degen bounce)
    let y = this.baseY;
    if (moving && !sit) y += f % 2 ? 0.06 : 0;
    if (hop && !sit) y += f % 2 ? 0.25 : 0.05;
    this.body.position.y = y;
    this.body.rotation.z = moving && !sit && !swung ? (f % 2 ? 0.08 : -0.08) : 0;
    this.body.rotation.y = hop ? (f % 2 ? 0.3 : -0.3) : 0;
    this.body.rotation.x = bow > 0 ? (Math.round(bow * 4) / 4) * 0.6 : 0;
    // no legs to fold: squash a little when sitting
    this.body.scale.y = sit && !swung ? 0.8 : !moving && !sit && f % 16 >= 8 ? 0.98 : 1;
  }
}
