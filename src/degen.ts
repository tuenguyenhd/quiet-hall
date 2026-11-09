// Degen PFP characters: random traits from a seed (like an NFT collection), built from a few low-poly
// blocks with vertex colours. One merged mesh for body+head+gear and two legs = 3 draw calls, no textures,
// no model files. Animation is deliberately choppy (8 fps "stop-motion").
import * as THREE from 'three';
import { own } from './dispose';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- traits ----------
type W<T> = [T, number][];
const SKIN: W<[string, string]> = [
  [['Classic', '#f2c8a0'], 50],
  [['Tan', '#c98d5e'], 40],
  [['Deep', '#7a4b2e'], 35],
  [['Pink', '#ff9ad5'], 7],
  [['Blue', '#6fa8ff'], 7],
  [['Alien', '#8be38b'], 7],
  [['Zombie', '#9fb98a'], 6],
  [['Gold', '#ffcf3f'], 3],
  [['Diamond', '#c6f6ff'], 2],
];
const HEAD: W<string> = [
  ['Cube', 60],
  ['Round', 40],
];
const EYES: W<string> = [
  ['Dots', 40],
  ['Zen', 18],
  ['Pixel Shades', 18],
  ['3D Glasses', 10],
  ['Googly', 10],
  ['Visor', 8],
  ['Laser', 5],
];
const MOUTH: W<string> = [
  ['Smile', 40],
  ['Flat', 30],
  ['Wow', 15],
  ['Beard', 12],
];
const HAT: W<string> = [
  ['None', 26],
  ['Beanie', 18],
  ['Backwards Cap', 15],
  ['Bucket Hat', 9],
  ['Party Hat', 8],
  ['Mohawk', 8],
  ['Headband', 7],
  ['Propeller', 6],
  ['Halo', 5],
  ['Crown', 3],
];
const TOP: W<string> = [
  ['Hoodie', 40],
  ['Tee', 30],
  ['Robe', 12],
  ['Sol Hoodie', 10],
  ['Suit', 6],
];
const ACC: W<string> = [
  ['None', 50],
  ['Gold Chain', 20],
  ['Backpack', 10],
  ['Cape', 7],
  ['Diamond Chain', 4],
];
const NEON = ['#9945ff', '#14f195', '#ff5fa2', '#ffe14d', '#5ad1ff', '#ff7a3d', '#1d1b22', '#f4f0e6', '#e5484d'];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function pick<T>(R: () => number, list: W<T>): [T, number] {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let x = R() * total;
  for (const [v, w] of list) if ((x -= w) <= 0) return [v, w / total];
  return [list[0][0], list[0][1] / total];
}

export interface Traits {
  seed: number;
  skin: string;
  skinName: string;
  head: string;
  eyes: string;
  mouth: string;
  hat: string;
  hatColor: string;
  top: string;
  topColor: string;
  pants: string;
  acc: string;
  /** 1 = common … 4 = legendary, from how unlikely the combo is */
  tier: number;
}

export function rollTraits(seed: number): Traits {
  const R = rng(seed * 2654435761);
  let odds = 1;
  const p = <T>(l: W<T>) => {
    const [v, pr] = pick(R, l);
    odds *= pr;
    return v;
  };
  const [skinName, skin] = p(SKIN);
  const t: Traits = {
    seed,
    skin,
    skinName,
    head: p(HEAD),
    eyes: p(EYES),
    mouth: p(MOUTH),
    hat: p(HAT),
    hatColor: NEON[Math.floor(R() * NEON.length)],
    top: p(TOP),
    topColor: NEON[Math.floor(R() * NEON.length)],
    pants: ['#1d1b22', '#2b3a67', '#5a4a3a', '#f4f0e6', '#3d3d3d'][Math.floor(R() * 5)],
    acc: p(ACC),
    tier: 1,
  };
  const rarity = -Math.log10(odds); // ~3 common … 6+ legendary
  t.tier = rarity > 6 ? 4 : rarity > 5 ? 3 : rarity > 4.2 ? 2 : 1;
  return t;
}

export const TIER = ['', 'Common', 'Rare', 'Epic', 'Legendary'];
export function describeTraits(t: Traits) {
  const bits = [t.skinName !== 'Classic' && t.skinName !== 'Tan' && t.skinName !== 'Deep' ? `${t.skinName} skin` : '', t.eyes !== 'Dots' ? t.eyes : '', t.hat !== 'None' ? t.hat : '', t.top, t.acc !== 'None' ? t.acc : '', t.mouth === 'Beard' ? 'Beard' : ''];
  return bits.filter(Boolean).join(' · ');
}

// ---------- geometry ----------
type G = THREE.BufferGeometry;
const col = (g: G, c: string) => {
  const cc = new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const prep = (g: G, c: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  const out = (g.index ? g.toNonIndexed() : g) as G;
  out.deleteAttribute('uv');
  if (rx || ry || rz) out.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  out.translate(x, y, z);
  return col(out, c);
};
const box = (w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => prep(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
const ball = (r: number, c: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const g = prep(new THREE.IcosahedronGeometry(r, 1), c, 0, 0, 0);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
};
const cone = (r: number, h: number, c: string, x = 0, y = 0, z = 0, seg = 6) => prep(new THREE.ConeGeometry(r, h, seg), c, x, y, z);
const cyl = (r: number, h: number, c: string, x = 0, y = 0, z = 0, rx = 0, seg = 8) => prep(new THREE.CylinderGeometry(r, r, h, seg), c, x, y, z, rx);
const ring = (r: number, t: number, c: string, x: number, y: number, z: number, rx = Math.PI / 2) => prep(new THREE.TorusGeometry(r, t, 4, 10), c, x, y, z, rx);

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const LASER = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.85, toneMapped: false });
const legGeo = new Map<string, G>();

/** Hip height: the torso pivots here; sitting lowers the body by this much. */
export const HIP = 0.42;

/** Build the body (relative to the hip pivot), legs and optional laser beams. */
export function buildDegen(t: Traits) {
  const parts: G[] = [];
  const S = t.skin;
  // torso (y relative to hips)
  const top = t.top === 'Sol Hoodie' ? '#14151f' : t.top === 'Suit' ? '#1d1b22' : t.top === 'Robe' ? '#f2a93b' : t.topColor;
  if (t.top === 'Robe') {
    parts.push(cone(0.38, 0.72, top, 0, 0.3, 0, 7));
    parts.push(box(0.6, 0.08, 0.34, '#c0392b', 0, 0.28, 0, 0, 0, 0.5)); // sash
  } else {
    parts.push(box(0.52, 0.56, 0.32, top, 0, 0.3, 0));
  }
  if (t.top === 'Sol Hoodie') {
    parts.push(box(0.54, 0.05, 0.33, '#9945ff', 0, 0.42, 0));
    parts.push(box(0.54, 0.05, 0.33, '#43b4ca', 0, 0.34, 0));
    parts.push(box(0.54, 0.05, 0.33, '#14f195', 0, 0.26, 0));
  }
  if (t.top === 'Suit') {
    parts.push(box(0.14, 0.4, 0.02, '#f4f0e6', 0, 0.36, 0.165));
    parts.push(box(0.06, 0.3, 0.02, '#e5484d', 0, 0.36, 0.177));
  }
  if (t.top === 'Hoodie' || t.top === 'Sol Hoodie') parts.push(box(0.4, 0.16, 0.12, top, 0, 0.6, -0.17)); // hood
  // arms
  for (const sx of [-1, 1]) {
    parts.push(box(0.14, 0.44, 0.16, top, sx * 0.33, 0.32, 0, 0, 0, sx * 0.12));
    parts.push(box(0.12, 0.12, 0.12, S, sx * 0.36, 0.06, 0.02));
  }
  // head
  const hy = 0.86;
  const hs = 0.5;
  if (t.head === 'Cube') parts.push(box(hs, hs, hs, S, 0, hy, 0));
  else parts.push(ball(0.29, S, 0, hy, 0, 1, 0.95, 1));
  const fz = t.head === 'Cube' ? hs / 2 + 0.005 : 0.27;
  // eyes
  const ink = '#1d1b22';
  if (t.eyes === 'Dots') for (const sx of [-1, 1]) parts.push(box(0.07, 0.09, 0.02, ink, sx * 0.11, hy + 0.04, fz));
  if (t.eyes === 'Zen') for (const sx of [-1, 1]) parts.push(box(0.1, 0.025, 0.02, ink, sx * 0.11, hy + 0.03, fz));
  if (t.eyes === 'Googly')
    for (const sx of [-1, 1]) {
      parts.push(box(0.14, 0.14, 0.03, '#ffffff', sx * 0.11, hy + 0.05, fz));
      parts.push(box(0.06, 0.06, 0.02, ink, sx * 0.11 + 0.02, hy + 0.03, fz + 0.02));
    }
  if (t.eyes === 'Pixel Shades') {
    parts.push(box(0.46, 0.04, 0.03, ink, 0, hy + 0.08, fz + 0.01));
    for (const sx of [-1, 1]) parts.push(box(0.17, 0.1, 0.03, ink, sx * 0.11, hy + 0.03, fz + 0.01));
    parts.push(box(0.04, 0.03, 0.01, '#ffffff', -0.15, hy + 0.05, fz + 0.03));
  }
  if (t.eyes === '3D Glasses') {
    parts.push(box(0.46, 0.04, 0.03, '#f4f0e6', 0, hy + 0.09, fz + 0.01));
    parts.push(box(0.17, 0.11, 0.03, '#e5484d', -0.11, hy + 0.03, fz + 0.01));
    parts.push(box(0.17, 0.11, 0.03, '#5ad1ff', 0.11, hy + 0.03, fz + 0.01));
  }
  if (t.eyes === 'Visor') parts.push(box(0.46, 0.12, 0.05, '#14f195', 0, hy + 0.04, fz + 0.01));
  if (t.eyes === 'Laser') for (const sx of [-1, 1]) parts.push(box(0.09, 0.07, 0.02, '#ff2a2a', sx * 0.11, hy + 0.04, fz));
  // mouth
  if (t.mouth === 'Smile') {
    parts.push(box(0.16, 0.025, 0.02, ink, 0, hy - 0.11, fz));
    for (const sx of [-1, 1]) parts.push(box(0.03, 0.03, 0.02, ink, sx * 0.08, hy - 0.09, fz));
  }
  if (t.mouth === 'Flat') parts.push(box(0.14, 0.025, 0.02, ink, 0, hy - 0.11, fz));
  if (t.mouth === 'Wow') parts.push(box(0.07, 0.08, 0.02, ink, 0, hy - 0.12, fz));
  if (t.mouth === 'Beard') parts.push(box(0.44, 0.16, 0.08, '#4a3326', 0, hy - 0.18, fz - 0.02));
  // hats
  const top_ = hy + (t.head === 'Cube' ? hs / 2 : 0.27);
  const hc = t.hatColor;
  if (t.hat === 'Beanie') {
    parts.push(box(0.54, 0.16, 0.54, hc, 0, top_ + 0.02, 0));
    parts.push(box(0.56, 0.06, 0.56, '#f4f0e6', 0, top_ - 0.06, 0));
  }
  if (t.hat === 'Backwards Cap') {
    parts.push(box(0.54, 0.12, 0.54, hc, 0, top_ + 0.04, 0));
    parts.push(box(0.4, 0.03, 0.24, hc, 0, top_ - 0.01, -0.36));
  }
  if (t.hat === 'Bucket Hat') {
    parts.push(cyl(0.3, 0.16, hc, 0, top_ + 0.06, 0, 0, 8));
    parts.push(cyl(0.42, 0.03, hc, 0, top_ - 0.02, 0, 0, 8));
  }
  if (t.hat === 'Party Hat') parts.push(cone(0.16, 0.36, hc, 0.04, top_ + 0.18, 0, 8));
  if (t.hat === 'Mohawk') for (let i = 0; i < 4; i++) parts.push(box(0.08, 0.16 + (i % 2) * 0.04, 0.1, hc, 0, top_ + 0.08, 0.18 - i * 0.12));
  if (t.hat === 'Headband') {
    parts.push(box(0.54, 0.07, 0.54, hc, 0, top_ - 0.12, 0));
    parts.push(box(0.05, 0.2, 0.05, hc, 0.06, top_ - 0.18, -0.29, 0.4, 0, 0.3));
  }
  if (t.hat === 'Propeller') {
    parts.push(ball(0.2, hc, 0, top_, 0, 1.2, 0.5, 1.2));
    parts.push(box(0.03, 0.12, 0.03, '#1d1b22', 0, top_ + 0.13, 0));
    parts.push(box(0.5, 0.02, 0.07, '#ffe14d', 0, top_ + 0.19, 0));
  }
  if (t.hat === 'Halo') parts.push(ring(0.2, 0.025, '#ffe9a0', 0, top_ + 0.14, 0));
  if (t.hat === 'Crown') {
    parts.push(cyl(0.22, 0.12, '#ffcf3f', 0, top_ + 0.06, 0, 0, 8));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(cone(0.05, 0.12, '#ffcf3f', Math.sin(a) * 0.2, top_ + 0.17, Math.cos(a) * 0.2, 4));
    }
  }
  // accessories
  if (t.acc === 'Gold Chain' || t.acc === 'Diamond Chain') {
    const c = t.acc === 'Gold Chain' ? '#ffcf3f' : '#c6f6ff';
    parts.push(ring(0.17, 0.025, c, 0, 0.55, 0.06, Math.PI / 2 + 0.5));
    parts.push(box(0.08, 0.08, 0.03, c, 0, 0.44, 0.18));
  }
  if (t.acc === 'Backpack') parts.push(box(0.4, 0.42, 0.16, '#ff7a3d', 0, 0.32, -0.24));
  if (t.acc === 'Cape') parts.push(box(0.56, 0.7, 0.03, '#e5484d', 0, 0.2, -0.19, 0.12));

  const torso = new THREE.Mesh(own(mergeGeometries(parts)), MAT);
  torso.castShadow = true;
  parts.forEach((p) => p.dispose());

  // legs (pivot at the hip) — shared geometry per pants colour
  let lg = legGeo.get(t.pants);
  if (!lg) {
    lg = mergeGeometries([box(0.18, 0.38, 0.2, t.pants, 0, -0.19, 0), box(0.2, 0.08, 0.28, '#f4f0e6', 0, -0.38, 0.04)]);
    legGeo.set(t.pants, lg);
  }
  const legs = [-1, 1].map((sx) => {
    const m = new THREE.Mesh(lg, MAT);
    m.position.x = sx * 0.13;
    m.castShadow = true;
    return m;
  });

  let lasers: THREE.Mesh | null = null;
  if (t.eyes === 'Laser') {
    lasers = new THREE.Mesh(
      own(mergeGeometries([-1, 1].map((sx) => prep(new THREE.CylinderGeometry(0.012, 0.03, 3, 5), '#ff2a2a', sx * 0.11, hy + 0.04, fz + 1.5, Math.PI / 2))),
      ) as THREE.BufferGeometry,
      LASER,
    );
  }
  return { torso, legs, lasers };
}

/** Avatar rig with the same shape as HumanRig: choppy 8 fps animation. */
export class DegenRig {
  root = new THREE.Group();
  hipH = HIP;
  traits: Traits;
  private hip = new THREE.Group();
  private torso: THREE.Mesh;
  private legs: THREE.Mesh[];
  private lasers: THREE.Mesh | null;
  private t = 0;
  private hopUntil = 0;

  constructor(seed: number) {
    this.traits = rollTraits(seed);
    const b = buildDegen(this.traits);
    this.torso = b.torso;
    this.legs = b.legs;
    this.lasers = b.lasers;
    this.hip.position.y = HIP;
    this.hip.add(this.torso, ...this.legs);
    if (this.lasers) this.torso.add(this.lasers);
    this.root.add(this.hip);
  }

  greet() {
    this.hopUntil = performance.now() + 900;
  }

  dispose() {
    /* torso + laser geometry are tagged `own`; Avatar.dispose frees them */
  }

  update(dt: number, sitK: number, moving: boolean, bow: number) {
    this.t += dt;
    const f = Math.floor(this.t * 8); // stop-motion frame
    const sit = sitK > 0.4;
    const hop = performance.now() < this.hopUntil;
    for (const [i, l] of this.legs.entries()) {
      l.rotation.x = sit ? -Math.PI / 2 : moving ? (f % 2 === i ? 0.55 : -0.55) : 0;
    }
    let y = HIP;
    if (moving && !sit) y += f % 2 ? 0.05 : 0;
    if (hop && !sit) y += f % 2 ? 0.22 : 0.05;
    if (!moving && !sit && !hop) this.torso.scale.y = f % 16 < 8 ? 1 : 0.97; // choppy breathing
    else this.torso.scale.y = 1;
    this.hip.position.y = y;
    this.torso.rotation.x = bow > 0 ? Math.round(bow * 4) / 4 * 0.7 : sit && f % 32 < 2 ? 0.05 : 0;
    this.torso.rotation.y = hop ? (f % 2 ? 0.3 : -0.3) : 0;
    if (this.lasers) this.lasers.visible = !sit || f % 24 < 12;
  }
}
