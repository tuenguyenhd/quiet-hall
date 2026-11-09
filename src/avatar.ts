import * as THREE from 'three';
import { LIGHT_COUNT } from './layout';
import { LIGHTS, ROBES } from './palette';
import { addSleeves, buildRobe } from './body';
import { HumanRig } from './human';
import { HUMAN_SPECIES, buildCharacter, skinOf } from './species';

// Shared geometry/materials: a small, round, hooded meditator in soft clay style.
const G = {
  robe: new THREE.CapsuleGeometry(0.36, 0.5, 6, 18),
  head: new THREE.SphereGeometry(0.3, 26, 18),
  hood: new THREE.SphereGeometry(0.335, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
  eye: new THREE.CapsuleGeometry(0.017, 0.055, 2, 6),
  cheek: new THREE.SphereGeometry(0.05, 10, 8),
  hands: new THREE.SphereGeometry(0.1, 14, 10),
  foot: new THREE.SphereGeometry(0.11, 12, 8),
  lap: new THREE.SphereGeometry(0.42, 22, 12),
  ring: new THREE.RingGeometry(0.42, 0.62, 40),
  halo: new THREE.RingGeometry(0.74, 0.8, 56),
};
export const GOLD = '#ffcf5a';
const M = {
  skin: new THREE.MeshStandardMaterial({ color: '#f3d7bf', roughness: 0.85 }),
  eye: new THREE.MeshBasicMaterial({ color: '#3b3a33' }),
  cheek: new THREE.MeshStandardMaterial({ color: '#f2b2a0', roughness: 0.9 }),
};

let auraTex: THREE.Texture | null = null;
function getAuraTex() {
  if (auraTex) return auraTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  auraTex = new THREE.CanvasTexture(c);
  return auraTex;
}

export function lerpAngle(a: number, b: number, k: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export type SitState = 'idle' | 'sit';

export class Avatar {
  static heightAt: (x: number, z: number) => number = () => 0;
  /** true where seats are floor cushions (hall, tea house): humans sit on the cushion top there */
  static cushionAt: (x: number, z: number) => boolean = () => false;

  root = new THREE.Group();
  target = new THREE.Vector3();
  targetRy = 0;
  state: SitState = 'idle';
  moving = false;

  private body = new THREE.Group();
  private human: HumanRig | null = null;
  private upper = new THREE.Group();
  private robe: THREE.Object3D;
  private feet: THREE.Mesh[] = [];
  private lap: THREE.Mesh;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private aura: THREE.Sprite;
  private auraMat: THREE.SpriteMaterial;
  private robeMat: THREE.MeshStandardMaterial;
  private walkT = 0;
  private bowT = -1;
  private greetT = -1;
  private sitK = 0;
  private baseRing: number;

  constructor(
    public color: number,
    public isSelf: boolean,
  ) {
    const robeColor = ROBES[color % ROBES.length];
    const light = LIGHTS[color % LIGHTS.length];
    this.robeMat = new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.88 });
    const hoodMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(robeColor).multiplyScalar(0.9),
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    const built = buildRobe(this.robeMat, ROBES[(color + 3) % ROBES.length], light);
    this.robe = built.robe;
    this.body.add(this.robe);

    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(G.foot, hoodMat);
      f.position.set(sx * 0.13, 0.06, 0.12);
      f.scale.set(1, 0.6, 1.3);
      this.feet.push(f);
      this.body.add(f);
    }
    this.lap = new THREE.Mesh(G.lap, this.robeMat);
    this.lap.position.set(0, 0.2, 0.08);
    this.lap.scale.setScalar(0.0001);
    this.lap.castShadow = true;
    this.body.add(this.lap);

    // upper body pivots at the chest so a bow dips the head forward
    this.upper.position.y = 0.85;
    const sp = Math.floor(color / LIGHT_COUNT);
    buildCharacter(sp, this.upper, this.body, robeColor);
    addSleeves(this.upper, this.robeMat, built.sash);
    const hands = new THREE.Mesh(G.hands, sp ? new THREE.MeshStandardMaterial({ color: skinOf(sp), roughness: 0.85 }) : M.skin);
    hands.position.set(0, 0.0, 0.34);
    hands.scale.set(0.9, 1.2, 0.8);
    this.upper.add(hands);
    this.body.add(this.upper);
    this.root.add(this.body);
    // simple humans: a real animated model instead of the robed toy body
    const hv = HUMAN_SPECIES.indexOf(sp);
    if (hv >= 0) {
      this.body.visible = false;
      this.human = new HumanRig(hv === 1 && color % 2 ? 2 : hv, light);
      this.root.add(this.human.root);
    }

    // your light: a soft ring under you, and an aura while sitting
    this.baseRing = isSelf ? 0.85 : 0.55;
    this.ringMat = new THREE.MeshBasicMaterial({
      color: light,
      transparent: true,
      opacity: this.baseRing,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(G.ring, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.root.add(this.ring);

    this.auraMat = new THREE.SpriteMaterial({
      map: getAuraTex(),
      color: light,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.aura = new THREE.Sprite(this.auraMat);
    this.aura.position.y = 0.8;
    this.aura.scale.setScalar(2.6);
    this.root.add(this.aura);
  }

  private halo: THREE.Mesh | null = null;

  /** Verified Seeker owners glow gold; supporters get a thin outer halo. */
  setBadges(gold: boolean, supporter: boolean) {
    const light = gold ? GOLD : LIGHTS[this.color % LIGHTS.length];
    this.ringMat.color.set(light);
    this.auraMat.color.set(light);
    if (gold) {
      this.baseRing = Math.max(this.baseRing, 0.95);
      this.ringMat.opacity = this.baseRing;
    }
    if (supporter && !this.halo) {
      this.halo = new THREE.Mesh(
        G.halo,
        new THREE.MeshBasicMaterial({ color: '#ffe2b0', transparent: true, opacity: 0.55, depthWrite: false }),
      );
      this.halo.rotation.x = -Math.PI / 2;
      this.halo.position.y = 0.035;
      this.root.add(this.halo);
    } else if (!supporter && this.halo) {
      this.halo.removeFromParent();
      this.halo = null;
    }
  }

  /** Highlight someone you know (arrived through your invite link, or invited you). */
  setFriend(on: boolean) {
    this.baseRing = on ? 1 : this.isSelf ? 0.85 : 0.55;
    this.ringMat.opacity = this.baseRing;
    this.ring.scale.setScalar(on ? 1.2 : 1);
  }

  bow() {
    if (this.bowT < 0) this.bowT = 0;
  }

  greet() {
    this.greetT = 0;
    this.human?.greet();
  }

  update(dt: number, t: number) {
    const p = this.root.position;
    if (!this.isSelf) {
      const k = 1 - Math.exp(-dt * 8);
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      this.moving = dx * dx + dz * dz > 0.002;
      p.x += dx * k;
      p.z += dz * k;
      this.root.rotation.y = lerpAngle(this.root.rotation.y, this.targetRy, k);
    }
    const yOff = this.human ? (Avatar.cushionAt(p.x, p.z) ? 0.28 - this.human.hipH : -this.human.hipH) * this.sitK : 0;
    p.y += (Avatar.heightAt(p.x, p.z) + yOff - p.y) * (1 - Math.exp(-dt * 12));

    // sit blend
    const sitTarget = this.state === 'sit' ? 1 : 0;
    this.sitK += (sitTarget - this.sitK) * (1 - Math.exp(-dt * 3));
    const s = this.sitK;
    this.robe.scale.y = 1 - 0.26 * s;
    this.lap.scale.set(1.2 * s + 0.0001, 0.42 * s + 0.0001, 1.0 * s + 0.0001);
    for (const f of this.feet) f.visible = s < 0.5;
    const breath = Math.sin((t * Math.PI * 2) / 10);
    this.upper.position.y = 0.85 - 0.2 * s + breath * 0.012 * s;

    // walk
    if (this.moving && s < 0.2) this.walkT += dt * 10;
    else this.walkT *= Math.exp(-dt * 10);
    const bob = this.moving && s < 0.2 ? Math.abs(Math.sin(this.walkT)) * 0.07 : 0;
    this.body.position.y = -0.18 * s + bob;
    this.body.rotation.z = this.moving ? Math.sin(this.walkT) * 0.05 : 0;

    // bow
    if (this.bowT >= 0) {
      this.bowT += dt;
      this.upper.rotation.x = Math.sin(Math.min(this.bowT / 1.6, 1) * Math.PI) * 0.62;
      if (this.bowT > 1.6) {
        this.bowT = -1;
        this.upper.rotation.x = 0;
      }
    }

    this.human?.update(dt, this.sitK, this.moving && this.sitK < 0.2, this.bowT >= 0 ? Math.sin(Math.min(this.bowT / 1.6, 1) * Math.PI) : 0);

    // greet: a pulse of light
    let flash = 0;
    if (this.greetT >= 0) {
      this.greetT += dt;
      const k = this.greetT / 1.3;
      flash = Math.sin(Math.min(k, 1) * Math.PI) * 0.8;
      this.ring.scale.setScalar(1 + k * 1.6);
      this.ringMat.opacity = this.baseRing * (1 - k) + 0.0;
      if (k >= 1) {
        this.greetT = -1;
        this.ring.scale.setScalar(1);
        this.ringMat.opacity = this.baseRing;
      }
    }
    this.auraMat.opacity = Math.max(s * (0.4 + 0.22 * breath), flash);
  }

  dispose() {
    this.root.removeFromParent();
    this.robeMat.dispose();
    this.ringMat.dispose();
    this.auraMat.dispose();
  }
}
