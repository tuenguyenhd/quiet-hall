// Floating lanterns over the lake: shared live by the hall server; each lasts a set time.
import * as THREE from 'three';
import { WISHES } from './layout';

export interface LanternData {
  id: string;
  wish: number;
  name: string;
  c: number;
  x: number;
  z: number;
  at: number;
  until: number;
  tier: 'free' | 'lantern24' | 'lantern7d';
}

// neon-ish paper colours (degen palette, still soft at night)
const PAPER = ['#ffcf7a', '#ff9ad5', '#9945ff', '#14f195', '#7ad7ff', '#ffe36e', '#ff8a5c', '#c6a6ff'];

let glowTex: THREE.Texture | null = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export class Lanterns {
  group = new THREE.Group();
  private items = new Map<string, { d: LanternData; obj: THREE.Group; seed: number }>();
  private bodyG = new THREE.CylinderGeometry(0.22, 0.17, 0.42, 10, 1, true);
  private capG = new THREE.CylinderGeometry(0.06, 0.24, 0.07, 10);

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  add(d: LanternData) {
    if (this.items.has(d.id)) return;
    const special = d.tier !== 'free';
    const color = new THREE.Color(special ? '#ffd36b' : PAPER[d.c % PAPER.length]);
    const obj = new THREE.Group();
    const body = new THREE.Mesh(
      this.bodyG,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    );
    const cap = new THREE.Mesh(this.capG, new THREE.MeshStandardMaterial({ color: '#5a3d2a' }));
    cap.position.y = 0.24;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(special ? 1.6 : 1.3);
    obj.add(body, cap, halo);
    if (special) obj.scale.setScalar(1.45);
    obj.position.set(d.x, -0.2, d.z);
    obj.userData.action = 'lantern';
    obj.userData.lantern = d;
    this.group.add(obj);
    this.items.set(d.id, { d, obj, seed: Math.random() * 10 });
  }

  set(list: LanternData[]) {
    for (const [id, it] of this.items) if (!list.some((l) => l.id === id)) this.remove(id, it.obj);
    for (const l of list) this.add(l);
  }

  private remove(id: string, obj: THREE.Object3D) {
    this.group.remove(obj);
    this.items.delete(id);
  }

  get count() {
    return this.items.size;
  }

  update(t: number, now: number) {
    for (const [id, it] of this.items) {
      const { d, obj, seed } = it;
      if (now > d.until) {
        this.remove(id, obj);
        continue;
      }
      // rise from the water in the first 4 s, then bob and drift in a slow circle
      const age = (now - d.at) / 1000;
      const rise = Math.min(1, age / 4);
      const fadeOut = Math.min(1, (d.until - now) / 20000);
      obj.position.x = d.x + Math.sin(t * 0.07 + seed) * 0.9;
      obj.position.z = d.z + Math.cos(t * 0.06 + seed) * 0.7;
      obj.position.y = -0.2 + rise * (1.1 + Math.sin(t * 0.9 + seed) * 0.12) + (1 - fadeOut) * 2;
      obj.rotation.y = t * 0.2 + seed;
      obj.scale.setScalar((d.tier !== 'free' ? 2.6 : 1.9) * (0.3 + 0.7 * rise) * fadeOut + 0.001);
    }
  }

  /** Clickable lantern meshes (for tapping to read the wish). */
  get objects() {
    return this.group.children;
  }
}

export function describe(d: LanternData, now: number) {
  const left = Math.max(0, d.until - now);
  const h = Math.floor(left / 3600000);
  const m = Math.ceil((left % 3600000) / 60000);
  const time = h >= 24 ? `${Math.round(h / 24)} days left` : h > 0 ? `${h} h ${m} min left` : `${m} min left`;
  return `“${WISHES[d.wish] ?? ''}”${d.name ? ` · ${d.name}` : ''} · ${time}`;
}
