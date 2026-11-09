// Pets: a small CC0 animal that follows its owner around and sits beside them when they sit.
// Free for everyone; everyone in the hall sees your pet. Tap a pet to give it a pat (hearts).
import * as THREE from 'three';
import { loadAnimal, type AnimalInst } from './animals';
import { lerpAngle } from './avatar';
import { popEmoji } from './effects';
import { disposeOwned } from './dispose';
import { PETS } from './layout';

/** size relative to the wandering animals (pets are a bit smaller, frogs a bit bigger) */
const SCALE: Record<string, number> = { shiba: 0.62, husky: 0.6, frog: 0.9, turtle: 0.85 };
/**
 * Which clip a pet plays when walking / standing / sitting. '' = no clip: a choppy code waddle / bob /
 * squash instead (degen style). `turn`: the model faces away from +z and needs turning (radians).
 */
const CLIPS: Record<string, { walk: string; idle: string; sit: string; turn?: number }> = {
  shiba: { walk: 'Walk', idle: 'Idle', sit: 'Idle_2_HeadLow' },
  husky: { walk: 'Walk', idle: 'Idle', sit: 'Idle_2_HeadLow' },
  frog: { walk: 'Frog_Jump', idle: 'Frog_Idle', sit: 'Frog_Idle' },
  turtle: { walk: 'StretchingPose', idle: 'StretchingPose', sit: 'HidingPose' }, // hides in its shell
  slime: { walk: 'idle', idle: 'idle', sit: 'idle' },
  hamster: { walk: 'Take 001', idle: 'Take 001', sit: 'Take 001' },
  teddy: { walk: 'Run', idle: 'Idle', sit: 'sitting' },
  sharpei: { walk: 'walking_cycle', idle: 'standing_idle', sit: 'sitting_idle' },
  bulldog: { walk: '', idle: '', sit: 'Sitting' },
  stripe: { walk: '', idle: '', sit: '' },
  dragon: { walk: '', idle: '', sit: '' },
  chick: { walk: 'Take 001', idle: 'Take 001', sit: 'Take 001' },
  tiger: { walk: 'walk', idle: 'idle', sit: 'idle' },
  duck: { walk: 'ArmatureAction', idle: 'ArmatureAction', sit: 'ArmatureAction' },
  penguin: { walk: '', idle: '', sit: '' },
  axolotl: { walk: '', idle: '', sit: '' },
};

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
        inst.obj.rotation.y = CLIPS[this.key]?.turn ?? 0;
        this.root.add(inst.obj);
        this.play(CLIPS[this.key]?.idle ?? '');
      })
      .catch(() => {
        /* offline: no pet model */
      });
  }

  private play(name: string) {
    const next = name ? this.inst?.acts[name] : undefined;
    if (next === this.cur || (!next && !this.cur)) return;
    if (next) next.reset().fadeIn(0.25).play();
    this.cur?.fadeOut(0.25);
    this.cur = next ?? null;
  }
  private t = 0;

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
    // beside you and a little ahead (behind you = between you and the camera = off-screen on a phone)
    const [side, back] = sitting ? [0.95, -0.15] : [0.9, -0.3];
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
      // resting: turn to look at you (you see its face / profile, not its back)
      const face = Math.atan2(o.position.x - p.x, o.position.z - p.z);
      this.root.rotation.y = lerpAngle(this.root.rotation.y, face, 1 - Math.exp(-dt * 3));
    }
    let y = this.heightAt(p.x, p.z);
    if (this.hopT >= 0) {
      this.hopT += dt;
      y += Math.sin(Math.min(this.hopT / 0.45, 1) * Math.PI) * 0.35;
      if (this.hopT > 0.45) this.hopT = -1;
    }
    p.y = y;
    if (!this.inst || !near) return;
    const c = CLIPS[this.key] ?? { walk: '', idle: '', sit: '' };
    const moving = d > 0.3;
    const name = moving ? c.walk : sitting ? c.sit : c.idle;
    this.play(name);
    this.inst.mixer.update(dt);
    // no clip for this state: choppy 8 fps code animation on the model (waddle / bob / squash)
    this.t += dt;
    const f = Math.floor(this.t * 8);
    const m = this.inst.obj;
    if (!name) {
      m.rotation.z = moving ? (f % 2 ? 0.14 : -0.14) : 0;
      m.position.y = moving ? (f % 2 ? 0.04 : 0) : !sitting && f % 16 < 8 ? 0.012 : 0;
      m.scale.set(1, sitting ? 0.82 : 1, 1);
    } else if (m.rotation.z || m.position.y || m.scale.y !== 1) {
      m.rotation.z = 0;
      m.position.y = 0;
      m.scale.set(1, 1, 1);
    }
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
