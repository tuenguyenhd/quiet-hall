// Simple humans: CC0 Quaternius "Man" / "Woman" / "Woman in Dress" (poly.pizza), with real walk, idle,
// sit and clap animations. The shirt takes your light colour. Bow is done on the torso bone.
import * as THREE from 'three';
import { own } from './dispose';
import { cullable } from './bake';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const HUMAN_URLS = ['/models/man.glb', '/models/woman.glb', '/models/woman-dress.glb'];
const HEIGHT = 1.62;
/** hip height in the sitting pose, as a share of standing height (measured from the model) */
const SIT_HIP = 0.228;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // models are meshopt-compressed (scripts/optimize-glb.mjs)
const cache = new Map<string, Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>>();
const load = (url: string) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url)!;
};

export class HumanRig {
  root = new THREE.Group();
  /** how far to lower the body when sitting so the hips rest on the seat */
  hipH = SIT_HIP * HEIGHT;
  ready = false;
  private mixer: THREE.AnimationMixer | null = null;
  private acts: Record<string, THREE.AnimationAction> = {};
  private cur: THREE.AnimationAction | null = null;
  private torso: THREE.Bone | null = null;
  private clapUntil = 0;
  private dead = false;

  /** stop animations and free the cloned skeleton + shirt material (Avatar.dispose frees the rest) */
  dispose() {
    this.dead = true;
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
    }
  }

  constructor(variant: number, shirt: string) {
    load(HUMAN_URLS[variant % HUMAN_URLS.length])
      .then((g) => {
        if (this.dead) return;
        const obj = SkeletonUtils.clone(g.scene);
        obj.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (m.isMesh) {
            m.castShadow = true;
            const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mt) => {
              if (/shirt|dress|top/i.test(mt.name)) {
                const c = own((mt as THREE.MeshStandardMaterial).clone());
                c.color.set(shirt);
                return c;
              }
              return mt;
            });
            m.material = Array.isArray(m.material) ? mats : mats[0];
          }
          if ((o as THREE.Bone).isBone && o.name === 'Torso') this.torso = o as THREE.Bone;
        });
        // size from the idle pose (skinned bounds), feet at y = 0
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj, true);
        const k = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
        obj.scale.setScalar(k);
        obj.position.y = -box.min.y * k;
        this.root.add(obj);
        cullable(obj);
        this.mixer = new THREE.AnimationMixer(obj);
        for (const c of g.animations) {
          const key = c.name.replace(/^.*\|/, '').replace(/^(Man|Female)_/, '');
          this.acts[key] = this.mixer.clipAction(c);
        }
        const clap = this.acts.Clapping;
        if (clap) {
          clap.setLoop(THREE.LoopOnce, 1);
          clap.clampWhenFinished = true;
        }
        this.play('Idle');
        this.ready = true;
      })
      .catch(() => {
        /* offline without the model: the avatar ring/aura still shows where you are */
      });
  }

  private play(name: string, fade = 0.35) {
    const a = this.acts[name];
    if (!a || a === this.cur) return;
    a.reset().fadeIn(fade).play();
    this.cur?.fadeOut(fade);
    this.cur = a;
  }

  greet() {
    this.clapUntil = performance.now() + 1700;
  }

  update(dt: number, sitK: number, moving: boolean, bow: number) {
    if (!this.mixer) return;
    if (sitK > 0.15) this.play('Sitting', 0.5);
    else if (moving) this.play('Walk', 0.2);
    else if (performance.now() < this.clapUntil) this.play('Clapping', 0.2);
    else this.play('Idle');
    this.mixer.update(dt);
    if (this.torso && bow > 0) this.torso.rotation.x += bow * 0.9;
  }
}
