// Wandering animals: free CC0 models by Quaternius (via poly.pizza), see public/models/CREDITS.md.
// Dogs stroll and sniff around the courtyard and garden; frogs hop along the lake shore.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GARDEN, LAKE } from './layout';
import { cullable } from './bake';

export interface Kind {
  url: string;
  height: number; // metres, standing
  speed: number;
  walk: string;
  idles: string[];
  hop?: boolean;
}
const KINDS: Record<string, Kind> = {
  shiba: { url: '/models/shiba.glb', height: 0.9, speed: 0.9, walk: 'Walk', idles: ['Idle', 'Idle_2', 'Eating', 'Idle_2_HeadLow'] },
  husky: { url: '/models/husky.glb', height: 1.0, speed: 1.0, walk: 'Walk', idles: ['Idle', 'Idle_2', 'Eating'] },
  frog: { url: '/models/frog.glb', height: 0.34, speed: 1.4, walk: 'Frog_Jump', idles: ['Frog_Idle'], hop: true },
};

interface Spawn {
  kind: keyof typeof KINDS;
  home: [number, number];
  roam: number;
}
const SPAWNS: Spawn[] = [
  { kind: 'shiba', home: [-5, 12], roam: 6 },
  { kind: 'husky', home: [7, 14], roam: 6 },
  { kind: 'shiba', home: [GARDEN.x - 2, GARDEN.z + 8], roam: 6 },
  { kind: 'frog', home: [LAKE.x + LAKE.rx * 1.15, LAKE.z + 3], roam: 3 },
  { kind: 'frog', home: [LAKE.x - 2, LAKE.z - LAKE.rz * 1.15], roam: 3 },
  { kind: 'frog', home: [LAKE.x + 4, LAKE.z + LAKE.rz * 1.12], roam: 2.5 },
];

const clip = (clips: THREE.AnimationClip[], name: string) =>
  clips.find((c) => c.name === name) ?? clips.find((c) => c.name.endsWith(`|${name}`)) ?? clips.find((c) => c.name.endsWith(name));

const loader = new GLTFLoader();
const cache = new Map<string, Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>>();

export interface AnimalInst {
  /** wrapper group: position/rotate this one; feet at y = 0 */
  obj: THREE.Group;
  mixer: THREE.AnimationMixer;
  acts: Record<string, THREE.AnimationAction>;
  k: Kind;
}

/** Loads (once) and clones an animal, scaled to `scale` × its normal height, feet on the ground. */
export async function loadAnimal(kind: string, scale = 1): Promise<AnimalInst> {
  const k = KINDS[kind];
  if (!cache.has(k.url)) cache.set(k.url, loader.loadAsync(k.url));
  const g = await cache.get(k.url)!;
  const obj = SkeletonUtils.clone(g.scene);
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
    }
  });
  // normalise size: models come in different units. Pose the skeleton first, or skinned meshes
  // report their raw bind-pose size (hundreds of units) and end up a few millimetres tall.
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      sm.skeleton.update();
      sm.computeBoundingBox();
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const h = box.max.y - box.min.y || 1;
  const f = (k.height * scale) / h;
  obj.scale.multiplyScalar(f);
  obj.position.y = -box.min.y * f;
  cullable(obj);
  const wrap = new THREE.Group();
  wrap.add(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const acts: Record<string, THREE.AnimationAction> = {};
  for (const n of [k.walk, ...k.idles]) {
    const c = clip(g.animations, n);
    if (c) acts[n] = mixer.clipAction(c);
  }
  return { obj: wrap, mixer, acts, k };
}

export function setupAnimals(
  scene: THREE.Scene,
  heightAt: (x: number, z: number) => number,
  walkable: (x: number, z: number) => boolean,
  lowPower: boolean,
) {
  const live: {
    obj: THREE.Object3D;
    mixer: THREE.AnimationMixer;
    k: Kind;
    s: Spawn;
    acts: Record<string, THREE.AnimationAction>;
    cur: THREE.AnimationAction | null;
    target: THREE.Vector2 | null;
    wait: number;
  }[] = [];
  const spawns = lowPower ? SPAWNS.filter((_, i) => i % 2 === 0) : SPAWNS;

  for (const s of spawns) {
    loadAnimal(s.kind)
      .then(({ obj: wrap, mixer, acts, k }) => {
        const [x, z] = s.home;
        wrap.position.set(x, heightAt(x, z), z);
        wrap.rotation.y = Math.random() * Math.PI * 2;
        scene.add(wrap);
        const a = { obj: wrap, mixer, k, s, acts, cur: null as THREE.AnimationAction | null, target: null as THREE.Vector2 | null, wait: Math.random() * 1.5 };
        play(a, k.idles[0]);
        live.push(a);
      })
      .catch(() => {
        /* offline without the model: the world just has fewer animals */
      });
  }

  function play(a: (typeof live)[number], name: string) {
    const next = a.acts[name];
    if (!next || next === a.cur) return;
    next.reset().fadeIn(0.3).play();
    a.cur?.fadeOut(0.3);
    a.cur = next;
  }

  return {
    put: (i: number, x: number, z: number) => { const a = live[i]; if (a) { a.obj.position.set(x, heightAt(x, z), z); a.s = { ...a.s, home: [x, z], roam: 0.5 }; a.target = null; } },
    debug: () => live.map((a) => { const b = new THREE.Box3().setFromObject(a.obj); return [a.s.kind, a.obj.position.toArray().map((v) => +v.toFixed(2)), b.min.toArray().map((v) => +v.toFixed(2)), b.max.toArray().map((v) => +v.toFixed(2)), Object.keys(a.acts), a.target?.toArray(), +a.wait.toFixed(2), a.cur?.getClip().name]; }),
    update(dt: number, focus: THREE.Vector3) {
      for (const a of live) {
        const p = a.obj.position;
        // only animate animals near the player
        if (Math.hypot(p.x - focus.x, p.z - focus.z) > 45) continue;
        a.mixer.update(dt);
        if (!a.target) {
          a.wait -= dt;
          if (a.wait <= 0) {
            const ang = Math.random() * Math.PI * 2;
            const r = a.s.roam * Math.sqrt(Math.random());
            const tx = a.s.home[0] + Math.cos(ang) * r;
            const tz = a.s.home[1] + Math.sin(ang) * r;
            if (a.k.hop || walkable(tx, tz)) {
              a.target = new THREE.Vector2(tx, tz);
              play(a, a.k.walk);
            } else a.wait = 1;
          }
          continue;
        }
        const dx = a.target.x - p.x;
        const dz = a.target.y - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.15) {
          a.target = null;
          a.wait = 3 + Math.random() * 7;
          play(a, a.k.idles[Math.floor(Math.random() * a.k.idles.length)]);
          continue;
        }
        const want = Math.atan2(dx, dz);
        let diff = want - a.obj.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.obj.rotation.y += diff * Math.min(1, dt * 4);
        const step = Math.min(d, a.k.speed * dt) * (Math.abs(diff) < 0.6 ? 1 : 0.3);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        p.y = heightAt(p.x, p.z);
      }
    },
  };
}
