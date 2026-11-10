// NEAR edition: the Market square in the south-east (Kettle's stall, four item stalls, the Market Cup board,
// lamps, an entrance arch and a lamp-lit road from the courtyard). Built only when VITE_EDITION=near: world.ts
// calls it behind NEAR_BUILD, so the other editions never ship it. Trading happens anywhere in TRADE_ZONE.
import * as THREE from 'three';
import { add, mat, mesh, textTexture } from '../build';
import { BAZAAR, COURT, type PlaceInfo } from '../layout';
import { KETTLE } from '../market';
import { ITEMS, type Item } from '../valley';
import type { WorldCtx } from '../world';

/** the Market's entry in the places menu (id 'bazaar': 'market' is the Night Market teaser's id) */
export const BAZAAR_PLACE: PlaceInfo = {
  id: 'bazaar',
  name: 'Market',
  x: BAZAAR.x,
  z: BAZAAR.z,
  r: BAZAAR.r,
  hint: "Kettle's stalls: buy and sell what you gather for Leaves, and join the free Market Cup.",
  view: [BAZAAR.x - 3, BAZAAR.z - BAZAAR.r - 9],
  look: [BAZAAR.x, BAZAAR.z + 2],
};

/** the road from the courtyard's south side to the Market's entrance arch (north side of the square) */
export const BAZAAR_ROAD: [number, number][] = [
  [3, COURT.z + 32],
  [38, 62],
  [70, 76],
  [BAZAAR.x, 84],
  [BAZAAR.x, BAZAAR.z - BAZAAR.r + 4],
];

/** where the market road leaves the PumpHall road: a small sign stands here */
export const BAZAAR_FORK = { x: 6.5, z: COURT.z + 31 };

const TAP = { action: 'near', near: { kind: 'kettle', id: 'kettle' } };

export function buildBazaar(c: WorldCtx) {
  const B = BAZAAR;
  const y0 = c.terrain(B.x, B.z);
  const root = new THREE.Group();
  root.name = 'market';
  const wood = mat('#8f5c40');
  const darkWood = mat('#6b4630');
  const crateM = mat('#b08356');
  const lampM = mat('#fff3d6', { emissive: '#ffd58a', emissiveIntensity: 0.9 });
  const stoneM = mat('#cdc6b6');
  const tap = (o: THREE.Object3D) => {
    Object.assign(o.userData, structuredClone(TAP));
    c.clickables.push(o);
  };
  const board = (lines: string[], w: number, h: number, bg = '#7a5a3f', fg = '#f6efdc') => {
    const face = new THREE.MeshStandardMaterial({ map: textTexture(lines, Math.round(300 * w), Math.round(300 * h), bg, fg), roughness: 0.9 });
    return mesh(new THREE.BoxGeometry(w, h, 0.07), [darkWood, darkWood, darkWood, darkWood, face, face] as unknown as THREE.Material);
  };

  // paved square (a low disc a hair above the flattened ground)
  const pave = mesh(new THREE.CylinderGeometry(11.2, 11.4, 0.08, 28), mat('#dccbab'), B.x, y0 + 0.02, B.z);
  add(pave, root, false, true);
  const ring = mesh(new THREE.TorusGeometry(11.3, 0.12, 4, 40), stoneM, B.x, y0 + 0.07, B.z);
  ring.rotation.x = Math.PI / 2;
  add(ring, root, false, true);

  // ---------- entrance arch (north), facing the road ----------
  {
    const g = new THREE.Group();
    const az = B.z - 11.6;
    g.position.set(B.x, c.terrain(B.x, az), az);
    g.rotation.y = Math.PI; // the lettered face looks north, at people walking in
    for (const sx of [-1, 1]) {
      add(mesh(new THREE.BoxGeometry(0.34, 4, 0.34), wood, sx * 2.6, 2, 0), g);
      c.obstacles.push({ x: B.x + sx * 2.6, z: az, r: 0.4 });
    }
    add(mesh(new THREE.BoxGeometry(6.2, 0.3, 0.5), darkWood, 0, 4.05, 0), g);
    const sign = board(['🛒 Market', 'buy · sell · Market Cup'], 4.4, 1.3);
    sign.position.set(0, 3.15, 0);
    add(sign, g);
    for (const sx of [-1, 1]) add(mesh(new THREE.SphereGeometry(0.2, 8, 6), lampM, sx * 2.6, 4.4, 0), g, false, false);
    root.add(g);
  }

  // ---------- a stall: four posts, a counter, a striped awning ----------
  const stall = (x: number, z: number, ry: number, awning: string, w = 3) => {
    const g = new THREE.Group();
    g.position.set(x, c.terrain(x, z), z);
    g.rotation.y = ry;
    const postG = new THREE.CylinderGeometry(0.07, 0.08, 2.5, 6);
    for (const px of [-w / 2 + 0.1, w / 2 - 0.1]) for (const pz of [-0.6, 0.6]) add(mesh(postG, wood, px, 1.25, pz), g);
    add(mesh(new THREE.BoxGeometry(w, 0.9, 0.9), crateM, 0, 0.45, -0.25), g);
    add(mesh(new THREE.BoxGeometry(w + 0.2, 0.1, 1.1), darkWood, 0, 0.95, -0.25), g);
    const roof = mesh(new THREE.BoxGeometry(w + 0.5, 0.08, 2), mat(awning, { roughness: 0.75 }), 0, 2.6, 0.05);
    roof.rotation.x = -0.22; // tilted down toward the customer side (local -z)
    add(roof, g);
    const valance = mesh(new THREE.BoxGeometry(w + 0.5, 0.32, 0.04), mat('#fff6e6'), 0, 2.5, -0.95);
    add(valance, g);
    root.add(g);
    const hit = mesh(new THREE.BoxGeometry(w + 0.4, 2.8, 2), new THREE.MeshBasicMaterial({ visible: false }), 0, 1.4, 0);
    g.add(hit);
    tap(hit);
    c.obstacles.push({ x, z, r: w / 2 + 0.2 });
    return g;
  };

  // goods on a counter, per item
  const goods = (item: Item, g: THREE.Group) => {
    const top = 1.0;
    if (item === 'moon_rock') {
      const m = mat('#c9c4d6', { emissive: '#9fa6ff', emissiveIntensity: 0.25, flatShading: true });
      for (let i = 0; i < 4; i++) add(mesh(new THREE.DodecahedronGeometry(0.22, 0), m, -0.9 + i * 0.6, top + 0.2, -0.25), g);
    } else if (item === 'copium_shroom') {
      const stem = mat('#f2ead8');
      const cap = mat('#9b5de5', { emissive: '#9b5de5', emissiveIntensity: 0.4, flatShading: true });
      for (let i = 0; i < 4; i++) {
        add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6), stem, -0.9 + i * 0.6, top + 0.13, -0.25), g);
        add(mesh(new THREE.ConeGeometry(0.2, 0.18, 8), cap, -0.9 + i * 0.6, top + 0.33, -0.25), g);
      }
    } else if (item === 'rug_yarn') {
      const m = mat('#e58fb5', { emissive: '#e58fb5', emissiveIntensity: 0.15 });
      for (let i = 0; i < 4; i++) add(mesh(new THREE.SphereGeometry(0.2, 8, 6), m, -0.9 + i * 0.6, top + 0.2, -0.25), g);
    } else {
      const m = mat('#ffcf3f', { emissive: '#b48cff', emissiveIntensity: 0.3, metalness: 0.3, roughness: 0.4 });
      for (let i = 0; i < 3; i++) {
        const t = mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 14), m, -0.6 + i * 0.6, top + 0.24, -0.25);
        t.rotation.x = 0.4;
        add(t, g);
      }
    }
    // a crate of spares beside the counter
    add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), crateM, 1.95, 0.3, -0.7), g);
    // a small name board above the counter, readable from the square
    const sign = board([`${ITEMS[item].emoji} ${ITEMS[item].name}`], 2.2, 0.5);
    sign.position.set(0, 2.05, -0.75);
    sign.rotation.y = Math.PI;
    add(sign, g);
  };
  // west row faces east (+x), east row faces west (-x): customers stand in the middle aisle
  const rows: { item: Item; x: number; z: number; ry: number; col: string }[] = [
    { item: 'moon_rock', x: B.x - 7, z: B.z - 4, ry: Math.PI / 2, col: '#7a87d8' },
    { item: 'copium_shroom', x: B.x - 7, z: B.z + 3, ry: Math.PI / 2, col: '#9b5de5' },
    { item: 'rug_yarn', x: B.x + 7, z: B.z - 4, ry: -Math.PI / 2, col: '#ff8fb8' },
    { item: 'moon_collar', x: B.x + 7, z: B.z + 3, ry: -Math.PI / 2, col: '#ffbf3f' },
  ];
  for (const r of rows) goods(r.item, stall(r.x, r.z, r.ry + Math.PI, r.col));

  // ---------- Kettle's stall (south), the one the 🛒 button walks to ----------
  {
    const g = stall(KETTLE.x, KETTLE.z, 0, '#00ec97', 4);
    const kettle = mesh(new THREE.SphereGeometry(0.42, 12, 8), mat('#444a52', { emissive: '#6f6cff', emissiveIntensity: 0.2, metalness: 0.4, roughness: 0.5 }), 0, 1.38, -0.25);
    kettle.scale.y = 0.85;
    add(kettle, g);
    add(mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.4, 6), mat('#444a52'), 0.45, 1.45, -0.25), g);
    for (let i = 0; i < 3; i++) add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), crateM, -2.6 + (i % 2) * 0.1, 0.3 + (i === 2 ? 0.6 : 0), 0.2 - (i % 2) * 0.7), g);
    const sign = board(["Kettle's stall", 'tap to buy · sell'], 3, 0.8, '#1f3b33', '#e9fff6');
    sign.position.set(0, 3.25, -0.6);
    sign.rotation.y = Math.PI;
    add(sign, g);
  }

  // ---------- Market Cup board, right of the entrance, read on the way in ----------
  {
    const bx = B.x + 5.2;
    const bz = B.z - 8.6;
    const g = new THREE.Group();
    g.position.set(bx, c.terrain(bx, bz), bz);
    g.rotation.y = Math.PI - 0.35;
    for (const sx of [-1, 1]) add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 6), wood, sx * 1.2, 0.7, 0), g);
    const b = board(['🏆 Market Cup', 'free entry · 200 play chips', 'every 3 h · prizes in Leaves'], 3, 1.5, '#2b2350', '#fff6dc');
    b.position.y = 2.1;
    add(b, g);
    root.add(g);
    c.obstacles.push({ x: bx, z: bz, r: 1.4 });
    tap(b);
  }

  // ---------- lamps: around the square and along the road ----------
  const lampPostG = new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6);
  const lampG = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const capG = new THREE.ConeGeometry(0.4, 0.3, 4);
  const lamp = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, c.terrain(x, z), z);
    add(mesh(lampPostG, darkWood, 0, 1.3, 0), g);
    add(mesh(lampG, lampM, 0, 2.75, 0), g, false, false);
    const cap = mesh(capG, darkWood, 0, 3.1, 0);
    cap.rotation.y = Math.PI / 4;
    add(cap, g);
    root.add(g);
    c.obstacles.push({ x, z, r: 0.35 });
  };
  for (const [dx, dz] of [
    [-10, -7],
    [10, -7],
    [-10, 9],
    [10, 9],
  ])
    lamp(B.x + dx, B.z + dz);
  // along the road, alternating sides, every ~13 m (skipping the courtyard end)
  for (let i = 0; i < BAZAAR_ROAD.length - 2; i++) {
    const [ax, az] = BAZAAR_ROAD[i];
    const [bx, bz] = BAZAAR_ROAD[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    for (let s = i === 0 ? 10 : 4; s < len - 3; s += 13) {
      const side = Math.round(s / 13) % 2 ? 1 : -1;
      lamp(ax + ((bx - ax) * s) / len + nx * 2.4 * side, az + ((bz - az) * s) / len + nz * 2.4 * side);
    }
  }

  // two strings of paper lanterns over the aisle, from the arch to Kettle's stall
  {
    const colors = ['#ffcf7a', '#ff9ad5', '#9fe8c8', '#c6a6ff'].map((col) => mat(col, { emissive: col, emissiveIntensity: 0.7 }));
    const g = new THREE.SphereGeometry(0.18, 8, 6);
    for (const sx of [-2.4, 2.4])
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        const z = B.z - 11 + t * 13;
        const sag = Math.sin(t * Math.PI) * 0.5;
        const l = mesh(g, colors[i % 4], B.x + sx, y0 + 4.9 - sag, z);
        l.scale.y = 1.25;
        add(l, root, false, false);
      }
  }

  c.scene.add(root);
  c.themers.push((night) => (lampM.emissiveIntensity = night ? 2 : 0.9));
}
