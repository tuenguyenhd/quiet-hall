// Tiny pop effects: floating emoji (hearts when you pet someone) and the bless sparkles.
// Cheap: a few sprites per effect, textures cached per emoji, everything removed when done.
import * as THREE from 'three';

const texCache = new Map<string, THREE.Texture>();
function emojiTex(e: string) {
  let t = texCache.get(e);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '48px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, 32, 36);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(e, t);
  return t;
}

interface Pop {
  s: THREE.Sprite;
  vx: number;
  vz: number;
  age: number;
  life: number;
}
const pops: Pop[] = [];

/** A burst of `n` floating emoji rising from `parent` at height y. */
export function popEmoji(parent: THREE.Object3D, emoji: string | string[], n = 5, y = 1) {
  for (let i = 0; i < n; i++) {
    const e = Array.isArray(emoji) ? emoji[i % emoji.length] : emoji;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e), transparent: true, depthWrite: false, fog: false }));
    s.position.set((Math.random() - 0.5) * 0.5, y + Math.random() * 0.2, (Math.random() - 0.5) * 0.5);
    s.scale.setScalar(0.001);
    s.renderOrder = 9;
    parent.add(s);
    pops.push({ s, vx: (Math.random() - 0.5) * 0.5, vz: (Math.random() - 0.5) * 0.5, age: -i * 0.08, life: 1.4 + Math.random() * 0.4 });
  }
}

export function updateEffects(dt: number) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.age += dt;
    if (p.age < 0) continue;
    const k = p.age / p.life;
    if (k >= 1) {
      p.s.removeFromParent();
      p.s.material.dispose();
      pops.splice(i, 1);
      continue;
    }
    p.s.position.x += p.vx * dt;
    p.s.position.z += p.vz * dt;
    p.s.position.y += dt * 0.9;
    p.s.scale.setScalar(0.38 * Math.min(1, k * 6));
    p.s.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
  }
}

let sparkTex: THREE.Texture | null = null;
function spark() {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  // 4-point star with a dark edge so it reads on light ground too
  g.fillStyle = 'rgba(18,11,36,0.55)';
  g.fillRect(14, 1, 4, 30);
  g.fillRect(1, 14, 30, 4);
  g.fillStyle = '#fff';
  g.fillRect(15, 2, 2, 28);
  g.fillRect(2, 15, 28, 2);
  sparkTex = new THREE.CanvasTexture(c);
  return sparkTex;
}

const SPARKS = 12;
/** Bless effect: sparkles orbiting the avatar plus a coloured ring on the ground. One Points draw + one mesh. */
export class BlessFx {
  group = new THREE.Group();
  private pts: THREE.Points;
  private pos = new Float32Array(SPARKS * 3);
  private ringMat: THREE.MeshBasicMaterial;
  constructor(color: string) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: spark(), color, size: 0.34, transparent: true, depthWrite: false, alphaTest: 0.04 }),
    );
    this.pts.frustumCulled = false;
    this.ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.64, 0.74, 40), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.16; // above stepping stones
    this.group.add(this.pts, ring);
  }
  update(t: number) {
    for (let i = 0; i < SPARKS; i++) {
      const a = t * 0.9 + (i / SPARKS) * Math.PI * 2;
      const r = 0.55 + 0.08 * Math.sin(t * 2 + i);
      this.pos[i * 3] = Math.cos(a) * r;
      this.pos[i * 3 + 1] = 0.3 + ((t * 0.35 + i / SPARKS) % 1) * 1.5;
      this.pos[i * 3 + 2] = Math.sin(a) * r;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.ringMat.opacity = 0.6 + 0.25 * Math.sin(t * 2);
  }
  dispose() {
    this.group.removeFromParent();
    this.pts.geometry.dispose();
    (this.pts.material as THREE.Material).dispose();
    this.ringMat.dispose();
    (this.group.children[1] as THREE.Mesh).geometry.dispose();
  }
}
