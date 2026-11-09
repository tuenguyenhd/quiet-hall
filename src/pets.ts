// Pets: a small CC0 animal that follows its owner around and sits beside them when they sit.
// Free for everyone; everyone in the hall sees your pet. Tap a pet to give it a pat (hearts).
import * as THREE from 'three';
import { loadAnimal, type AnimalInst } from './animals';
import { lerpAngle } from './avatar';
import { popEmoji } from './effects';
import { disposeOwned } from './dispose';
import { PETS } from './layout';

/** size relative to the wandering animals (pets are a bit smaller, frogs a bit bigger) */
const SCALE: Record<string, number> = { shiba: 0.62, husky: 0.6, frog: 0.9 };
/** idle clip to use while the owner sits */
const SIT: Record<string, string> = { shiba: 'Idle_2_HeadLow', husky: 'Idle_2', frog: 'Frog_Idle' };

export class Pet {
  root = new THREE.Group();
  private inst: AnimalInst | null = null;
  private cur: THREE.AnimationAction | null = null;
  private hopT = -1;
  private dead = false;
  readonly key: string;

  constructor(
    readonly kind: number,
    private owner: THREE.Object3D,
    private heightAt: (x: number, z: number) => number,
  ) {
    this.key = PETS[kind]?.key ?? 'none';
    this.root.userData.pet = this;
    // start beside the owner
    this.root.position.copy(owner.position);
    this.root.position.x += 0.9;
    loadAnimal(this.key, SCALE[this.key] ?? 0.6)
      .then((inst) => {
        if (this.dead) return;
        this.inst = inst;
        this.root.add(inst.obj);
        this.play(inst.k.idles[0]);
      })
      .catch(() => {
        /* offline: no pet model */
      });
  }

  private play(name: string) {
    const next = this.inst?.acts[name];
    if (!next || next === this.cur) return;
    next.reset().fadeIn(0.25).play();
    this.cur?.fadeOut(0.25);
    this.cur = next;
  }

  /** a pat: little hop + hearts */
  pat() {
    this.hopT = 0;
    popEmoji(this.root, ['❤️', '💖', '✨'], 5, 0.6);
  }

  update(dt: number, sitting: boolean, near: boolean) {
    const o = this.owner;
    const p = this.root.position;
    // where to be: beside-and-behind when walking, right next to them when sitting
    const ry = o.rotation.y;
    const [side, back] = sitting ? [0.95, -0.15] : [0.75, 0.7];
    const tx = o.position.x + Math.cos(ry) * -side - Math.sin(ry) * back;
    const tz = o.position.z + Math.sin(ry) * side - Math.cos(ry) * back;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 9) {
      p.set(tx, this.heightAt(tx, tz), tz); // owner teleported (sat down far away, reconnect…)
    } else if (d > 0.12) {
      const speed = Math.min(6, 1.2 + d * 1.6);
      const step = Math.min(d, speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
    } else {
      this.root.rotation.y = lerpAngle(this.root.rotation.y, ry, 1 - Math.exp(-dt * 3));
    }
    let y = this.heightAt(p.x, p.z);
    if (this.hopT >= 0) {
      this.hopT += dt;
      y += Math.sin(Math.min(this.hopT / 0.45, 1) * Math.PI) * 0.35;
      if (this.hopT > 0.45) this.hopT = -1;
    }
    p.y = y;
    if (!this.inst || !near) return;
    this.play(d > 0.3 ? this.inst.k.walk : sitting ? SIT[this.key] ?? this.inst.k.idles[0] : this.inst.k.idles[0]);
    this.inst.mixer.update(dt);
  }

  dispose() {
    this.dead = true;
    if (this.inst) {
      this.inst.mixer.stopAllAction();
      this.inst.mixer.uncacheRoot(this.inst.mixer.getRoot());
    }
    this.root.removeFromParent();
    disposeOwned(this.root); // cloned skeletons (bone textures)
  }
}
