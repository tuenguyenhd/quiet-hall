// "Coming soon" areas at the edge of the world: they show the map will grow (Season 2) without being playable yet.
// Each one is fenced off with a rope and has a sign you can tap for what's coming.
import * as THREE from 'three';
import { add, mat, mesh, textTexture } from './build';
import { LAKE, TEASERS } from './layout';

type Ctx = {
  scene: THREE.Scene;
  terrain: (x: number, z: number) => number;
  obstacles: { x: number; z: number; r: number }[];
  clickables: THREE.Object3D[];
  blockers: ((x: number, z: number) => boolean)[];
};

const wood = mat('#8f6446');
const red = mat('#e5484d', { roughness: 0.6 });
const ropeM = mat('#e9d7a8');
const stone = mat('#bdb7a7', { flatShading: true });

/** sign board with a 🚧 strip; tapping it shows the teaser text */
function teaserSign(c: Ctx, x: number, z: number, ry: number, id: string, lines: string[]) {
  const g = new THREE.Group();
  g.position.set(x, c.terrain(x, z), z);
  g.rotation.y = ry;
  add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.3, 8), wood, -0.9, 1.15, 0), g);
  add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.3, 8), wood, 0.9, 1.15, 0), g);
  const tex = textTexture(lines, 720, 340, '#2a1a5e', '#ffe14d');
  const face = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const board = mesh(new THREE.BoxGeometry(2.3, 1.1, 0.08), [wood, wood, wood, wood, face, face] as unknown as THREE.Material, 0, 1.8, 0.05);
  add(board, g);
  // hazard stripe under the board
  const stripe = document.createElement('canvas');
  stripe.width = 256;
  stripe.height = 32;
  const sg = stripe.getContext('2d')!;
  for (let i = -2; i < 18; i++) {
    sg.fillStyle = i % 2 ? '#160d2e' : '#ffcf3f';
    sg.beginPath();
    sg.moveTo(i * 16, 32);
    sg.lineTo(i * 16 + 16, 0);
    sg.lineTo(i * 16 + 32, 0);
    sg.lineTo(i * 16 + 16, 32);
    sg.fill();
  }
  const st = new THREE.CanvasTexture(stripe);
  st.colorSpace = THREE.SRGBColorSpace;
  add(mesh(new THREE.BoxGeometry(2.3, 0.22, 0.09), new THREE.MeshBasicMaterial({ map: st, toneMapped: false }), 0, 1.13, 0.05), g);
  g.userData.action = 'teaser';
  g.userData.teaser = id;
  c.scene.add(g);
  c.clickables.push(g);
  c.obstacles.push({ x, z, r: 0.5 });
}

/** a rope barrier between two points (posts + sagging rope) */
function rope(c: Ctx, ax: number, az: number, bx: number, bz: number) {
  const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 2.2));
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const y = c.terrain(x, z);
    add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 6), wood, x, y + 0.5, z), c.scene);
    c.obstacles.push({ x, z, r: 0.3 });
    const top = new THREE.Vector3(x, y + 0.85, z);
    if (prev) {
      const mid = prev.clone().add(top).multiplyScalar(0.5);
      mid.y -= 0.12;
      const curve = new THREE.QuadraticBezierCurve3(prev, mid, top);
      add(mesh(new THREE.TubeGeometry(curve, 8, 0.03, 5), ropeM), c.scene, false, false);
    }
    prev = top;
  }
}

/** torii gate (two red posts + two beams) */
function torii(parent: THREE.Object3D, x: number, y: number, z: number, s: number, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(s);
  for (const sx of [-1, 1]) add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.2, 10), red, sx * 1.3, 1.6, 0), g);
  add(mesh(new THREE.BoxGeometry(3.8, 0.28, 0.36), red, 0, 3.3, 0), g);
  add(mesh(new THREE.BoxGeometry(3.2, 0.18, 0.24), red, 0, 2.6, 0), g);
  parent.add(g);
  return g;
}

export function buildTeasers(c: Ctx) {
  const T = Object.fromEntries(TEASERS.map((t) => [t.id, t])) as Record<string, (typeof TEASERS)[number]>;

  // ---------- Lotus Island: a small island in the lake with a torii gate, unreachable for now ----------
  {
    const t = T.island;
    const y = c.terrain(t.x, t.z);
    const isle = mesh(new THREE.CylinderGeometry(t.r, t.r + 0.8, 1.6, 16), mat('#7a9a64', { flatShading: true }), t.x, y + 0.1, t.z);
    add(isle, c.scene);
    torii(c.scene, t.x, y + 0.9, t.z, 0.9, Math.PI / 2);
    // lotus pads + buds around it
    const pad = mat('#5f9a4d');
    const bud = mat('#ff9ad5', { emissive: '#ff5fa2', emissiveIntensity: 0.3 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const px = t.x + Math.cos(a) * (t.r + 2 + (i % 3));
      const pz = t.z + Math.sin(a) * (t.r + 2 + (i % 2));
      const p = mesh(new THREE.CircleGeometry(0.6, 12, 0.3, Math.PI * 1.8), pad, px, y + 0.4, pz);
      p.rotation.x = -Math.PI / 2;
      add(p, c.scene, false, true);
      if (i % 2 === 0) add(mesh(new THREE.ConeGeometry(0.18, 0.4, 6), bud, px, y + 0.6, pz), c.scene);
    }
    // sign on the near (east) shore
    // the sign stands on the east shore where the lake path arrives, facing the path
    teaserSign(c, LAKE.x + LAKE.rx + 3.5, LAKE.z - LAKE.rz * 0.55 - 4, Math.PI / 2 - 0.25, 'island', [`${t.emoji} ${t.name}`, 'coming soon · Season 2']);
  }

  // ---------- Sky Shrine: a stairway climbing toward a torii on the rim, roped off ----------
  {
    const t = T.shrine;
    const y0 = c.terrain(t.x, t.z + 3);
    for (let i = 0; i < 14; i++) {
      const z = t.z + 2 - i * 1.1;
      const step = mesh(new THREE.BoxGeometry(3.4, 0.35, 1.2), stone, t.x, y0 + 0.2 + i * 0.42, z);
      add(step, c.scene);
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 14; i += 4) add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 6), red, t.x + sx * 1.9, y0 + 0.8 + i * 0.42, t.z + 2 - i * 1.1), c.scene);
    torii(c.scene, t.x, y0 + 6, t.z - 14, 1.6);
    rope(c, t.x - 2.4, t.z + 3.4, t.x + 2.4, t.z + 3.4);
    teaserSign(c, t.x + 3.6, t.z + 4.2, 0, 'shrine', [`${t.emoji} ${t.name}`, 'coming soon']);
    c.blockers.push((x, z) => Math.abs(x - t.x) < 2.2 && z < t.z + 3.4 && z > t.z - 16);
  }

  // ---------- Night Market: half-built stalls with tarps, crates and paper lanterns, roped off ----------
  {
    const t = T.market;
    const tarps = ['#9945ff', '#14f195', '#ff5fa2', '#ffcf3f'].map((col) => mat(col, { side: THREE.DoubleSide, roughness: 0.7 }));
    const lantern = mat('#ffcf7a', { emissive: '#ffb347', emissiveIntensity: 1.2 });
    const crate = mat('#a8794f');
    for (let i = 0; i < 4; i++) {
      const sx = t.x - 4.5 + (i % 2) * 9;
      const sz = t.z - 3.5 + Math.floor(i / 2) * 7;
      const y = c.terrain(sx, sz);
      const g = new THREE.Group();
      g.position.set(sx, y, sz);
      g.rotation.y = i % 2 ? -0.2 : 0.2;
      for (const px of [-1.3, 1.3]) for (const pz of [-0.9, 0.9]) add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 6), wood, px, 1.2, pz), g);
      add(mesh(new THREE.BoxGeometry(2.8, 0.12, 1.2), wood, 0, 0.9, 0.6), g); // counter
      if (i !== 3) {
        // tarp roof (one stall still without)
        const roof = mesh(new THREE.PlaneGeometry(3.2, 2.4), tarps[i], 0, 2.5, 0);
        roof.rotation.x = -Math.PI / 2 + 0.25;
        add(roof, g);
        for (const lx of [-1, 0, 1]) add(mesh(new THREE.SphereGeometry(0.16, 8, 6), lantern, lx, 2.15, 1.05), g, false, false);
      } else {
        // scaffolding on the unfinished stall
        for (const h of [0.8, 1.6, 2.4]) add(mesh(new THREE.BoxGeometry(2.8, 0.06, 0.06), wood, 0, h, -0.9), g);
      }
      for (let k = 0; k < 2; k++) add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), crate, -0.9 + k * 0.6, 0.25, 1.5), g);
      c.scene.add(g);
      c.obstacles.push({ x: sx, z: sz, r: 1.6 });
    }
    rope(c, t.x - t.r, t.z - t.r * 0.8, t.x - t.r, t.z + t.r * 0.8);
    teaserSign(c, t.x - t.r - 1.2, t.z + t.r * 0.8 + 1.5, -Math.PI / 2, 'market', [`${t.emoji} ${t.name}`, 'coming soon']);
    c.blockers.push((x, z) => x > t.x - t.r && Math.abs(z - t.z) < t.r * 0.85);
  }
}
