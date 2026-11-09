import * as THREE from 'three';
import { C } from './palette';
import { add, fbm, mat, mesh, rng, segDist, smoothstep, textTexture } from './build';
import { addBrandBanners } from './brand';
import { dressWorld } from './world-assets';
import { BELL, BOUNDS, GARDEN, GROVE, HALL, LAKE, LOOKOUT, PLACES, RIM, TEA, placeAt, type PlaceInfo } from './layout';
import { buildPlaces } from './places';

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export interface Seat {
  id: string;
  pos: THREE.Vector3; // where you sit (y = seat height)
  ry: number; // facing
  place: string;
}

export type Theme = 'day' | 'night';

/** Everything places add to the world. */
export interface WorldCtx {
  scene: THREE.Scene;
  R: () => number;
  lowPower: boolean;
  obstacles: Obstacle[];
  clickables: THREE.Object3D[];
  seats: Seat[];
  ground: THREE.Object3D[];
  terrain(x: number, z: number): number;
  /** extra walkable surfaces (dock, platforms, benches): return a height or null */
  surfaces: ((x: number, z: number) => number | null)[];
  /** places you cannot walk (water, raked sand) */
  blockers: ((x: number, z: number) => boolean)[];
  updaters: ((t: number, dt: number) => void)[];
  themers: ((night: boolean) => void)[];
  /** the player's position (updated every frame) */
  focus: THREE.Vector3;
  addSeat(seat: Omit<Seat, 'pos'> & { x: number; y: number; z: number }, hit: THREE.Object3D): Seat;
}

export interface World {
  ground: THREE.Object3D[];
  clickables: THREE.Object3D[];
  obstacles: Obstacle[];
  seats: Seat[];
  places: PlaceInfo[];
  spawn: THREE.Vector3;
  bellPos: THREE.Vector3;
  bowlPos: THREE.Vector3;
  bounds: number;
  heightAt(x: number, z: number): number;
  walkable(x: number, z: number): boolean;
  placeAt(x: number, z: number): PlaceInfo | null;
  setOwned(kind: 'stone' | 'tree', owned: Map<number, { name: string; line: string }>): void;
  swingBell(): void;
  setTheme(theme: Theme): void;
  update(t: number, dt: number, focus: THREE.Vector3): void;
  /** the place module's hooks (stones/trees ownership display) */
  spots: { setOwned(kind: 'stone' | 'tree', owned: Map<number, { name: string; line: string }>): void };
}

const HZ = HALL.z;
const HW = HALL.hw;
const HD = HALL.hd;
const H = HALL.h;

// Paths: courtyard to every place (also used to keep grass and trees off them)
export const PATHS: [number, number][][] = [
  [
    [0, 24],
    [0, HZ + HD + 1.4],
  ],
  [
    [-2, 4],
    [-16, 11],
    [LAKE.x + 13.5, LAKE.z - 5.6],
  ],
  [
    [2, 5],
    [18, 12],
    [GARDEN.x - 7.8, GARDEN.z - 0.5],
  ],
  [
    [-HW - 0.8, -6],
    [-24, -16],
    [GROVE.x + 7, GROVE.z + 3.5],
  ],
  [
    [HW + 0.8, -6],
    [24, -14],
    [TEA.x - 3.6, TEA.z + 0.5],
  ],
  [
    [-HW - 0.8, -17],
    [-13, -32],
    [-6, -50],
    [0, LOOKOUT.z + 9.5],
  ],
];

export function pathDist(x: number, z: number) {
  let d = Infinity;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  return d;
}

const lakeE = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
const inHall = (x: number, z: number, pad = 0) => Math.abs(x) <= HW + pad && z >= HZ - HD - pad && z <= HZ + HD + pad;

/** Ground height: flat where people gather, gentle swells elsewhere, a hill at the lookout, a rim far out. */
function terrain(x: number, z: number) {
  const r = Math.hypot(x, z);
  let flat = 1;
  flat = Math.min(flat, smoothstep(2, 5, pathDist(x, z)));
  flat = Math.min(flat, smoothstep(10, 15, Math.hypot(x, z - 2)));
  flat = Math.min(flat, smoothstep(1, 6, Math.hypot(Math.max(Math.abs(x) - HW, 0), Math.max(Math.abs(z - HZ) - HD, 0))));
  for (const p of PLACES) if (p.id !== 'lookout') flat = Math.min(flat, smoothstep(p.r * 0.75, p.r * 1.15, Math.hypot(x - p.x, z - p.z)));
  let h = (fbm(x * 0.07, z * 0.07) - 0.5) * 1.6 * flat;
  h += 7 * smoothstep(RIM, RIM + 14, r);
  const dl = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z);
  h += LOOKOUT.h * smoothstep(LOOKOUT.r, 2.5, dl);
  const e = lakeE(x, z);
  h -= 0.75 * smoothstep(1.18, 0.75, e);
  return h;
}

export function buildWorld(scene: THREE.Scene, shadows: boolean, lowPower: boolean): World {
  const R = rng(7);
  const obstacles: Obstacle[] = [];
  const clickables: THREE.Object3D[] = [];
  const seats: Seat[] = [];

  scene.background = new THREE.Color('#ffd9c4');
  scene.fog = new THREE.Fog('#ffd9c4', 60, 260);

  // ---------- sky dome ----------
  const skyU = {
    top: { value: new THREE.Color('#7f86f5') },
    horizon: { value: new THREE.Color('#ffd9c4') },
    sunDir: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() },
    sunCol: { value: new THREE.Color('#fff1d0') },
    aurora: { value: 0 },
    time: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(330, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyU,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, horizon, sunDir, sunCol; uniform float aurora, time; varying vec3 vDir;
        void main(){ float h = max(vDir.y, 0.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          // night: soft purple-green aurora bands (Solana colours)
          float ang = atan(vDir.x, vDir.z);
          float band = sin(ang * 3.0 + time * 0.05 + sin(ang * 7.0 + time * 0.11) * 0.6) * 0.5 + 0.5;
          float alt = smoothstep(0.08, 0.3, h) * (1.0 - smoothstep(0.35, 0.75, h));
          vec3 auro = mix(vec3(0.6, 0.27, 1.0), vec3(0.08, 0.95, 0.58), band);
          col += auro * alt * pow(band, 2.0) * 0.55 * aurora;
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunCol * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(col, 1.0); }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ---------- light (the sun follows the player so shadows stay sharp near you) ----------
  const hemi = new THREE.HemisphereLight('#fff6e6', '#8b9b7a', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d6', 1.9);
  const sunOffset = new THREE.Vector3(18, 26, 22);
  sun.position.copy(sunOffset);
  if (shadows) {
    sun.castShadow = true;
    const s = lowPower ? 1024 : 2048;
    sun.shadow.mapSize.set(s, s);
    const c = sun.shadow.camera;
    c.left = -26;
    c.right = 26;
    c.top = 26;
    c.bottom = -26;
    c.near = 1;
    c.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun, sun.target);

  // ---------- ground (vertex-coloured terrain) ----------
  const G = 220;
  const seg = lowPower ? 120 : 170;
  const gGeo = new THREE.PlaneGeometry(G, G, seg, seg);
  gGeo.rotateX(-Math.PI / 2);
  const pos = gGeo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color('#93a777');
  const grassB = new THREE.Color('#b4bf92');
  const dirt = new THREE.Color('#cdbf9f');
  const sand = new THREE.Color('#d9ccab');
  const rock = new THREE.Color('#a9a796');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrain(x, z));
    tmp.copy(grassA).lerp(grassB, fbm(x * 0.15, z * 0.15));
    tmp.lerp(dirt, 1 - smoothstep(0.9, 1.6, pathDist(x, z)));
    tmp.lerp(sand, 1 - smoothstep(8.3, 9.5, Math.hypot(x, z - 1.5)));
    const e = lakeE(x, z);
    tmp.lerp(sand, smoothstep(1.35, 1.05, e) * 0.9);
    tmp.lerp(new THREE.Color('#8a9a86'), smoothstep(0.95, 0.7, e));
    tmp.lerp(rock, smoothstep(4.5, 2, Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z)) * 0.7);
    tmp.lerp(new THREE.Color('#b7814f'), smoothstep(GROVE.r + 1, GROVE.r - 2, Math.hypot(x - GROVE.x, z - GROVE.z)) * 0.35);
    cols.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  gGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, mat('#ffffff', { vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  const surfaces: WorldCtx['surfaces'] = [];
  const blockers: WorldCtx['blockers'] = [];
  const updaters: WorldCtx['updaters'] = [];
  const themers: WorldCtx['themers'] = [];
  const groundList: THREE.Object3D[] = [ground];

  const seatHeights: { x: number; z: number; y: number }[] = [];
  const ctx: WorldCtx = {
    scene,
    R,
    lowPower,
    obstacles,
    clickables,
    seats,
    ground: groundList,
    terrain,
    surfaces,
    blockers,
    updaters,
    themers,
    focus: new THREE.Vector3(),
    addSeat(s, hit) {
      const seat: Seat = { id: s.id, pos: new THREE.Vector3(s.x, s.y, s.z), ry: s.ry, place: s.place };
      seats.push(seat);
      hit.userData.action = 'seat';
      hit.userData.seat = seat;
      clickables.push(hit);
      if (s.y > terrain(s.x, s.z) + 0.05) seatHeights.push({ x: s.x, z: s.z, y: s.y });
      return seat;
    },
  };

  // ---------- path stones on the main path ----------
  const stoneMat = mat(C.stone);
  for (let z = 22.5; z > HZ + HD + 1.2; z -= 1.15) {
    const r = 0.45 + R() * 0.17;
    const s = mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.1, 9), stoneMat, (R() - 0.5) * 0.4, 0.05, z);
    s.rotation.y = R() * Math.PI;
    s.scale.z = 0.8 + R() * 0.3;
    add(s, scene, false, true);
  }

  // ---------- hall (big, two-tier roof, neon trim) ----------
  const hall = new THREE.Group();
  const floor = mesh(new THREE.BoxGeometry(HW * 2, H, HD * 2), mat(C.stone), 0, H / 2, HZ);
  add(floor, hall);
  groundList.push(floor);
  const STEP_W = 6;
  add(mesh(new THREE.BoxGeometry(STEP_W, H * 0.66, 0.8), mat(C.stone), 0, H * 0.33, HZ + HD + 0.4), hall);
  add(mesh(new THREE.BoxGeometry(STEP_W, H * 0.33, 0.8), mat(C.stone), 0, H * 0.16, HZ + HD + 1.2), hall);
  const plaster = mat(C.plaster);
  const wood = mat(C.wood);
  const pillar = mat(C.pillar);
  const roofMat = mat(C.roof, { roughness: 0.8 });
  const COL_H = 5.6;
  add(mesh(new THREE.BoxGeometry(HW * 2 - 0.4, COL_H, 0.3), plaster, 0, H + COL_H / 2, HZ - HD + 0.15), hall);
  const moonMat = mat('#fff6df', { emissive: '#ffe7b0', emissiveIntensity: 0.55 });
  add(mesh(new THREE.CircleGeometry(2.3, 56), moonMat, 0, H + 3.2, HZ - HD + 0.31), hall, false, false);
  add(mesh(new THREE.TorusGeometry(2.33, 0.1, 8, 56), wood, 0, H + 3.2, HZ - HD + 0.32), hall);
  for (let x = -HW; x <= HW; x += 0.9) obstacles.push({ x, z: HZ - HD + 0.1, r: 0.55 });
  for (const sx of [-1, 1]) {
    add(mesh(new THREE.BoxGeometry(0.25, 1.0, HD * 2 - 1), wood, sx * (HW - 0.15), H + 0.5, HZ - 0.5), hall);
    for (let z = HZ - HD + 0.5; z <= HZ + HD - 1.2; z += 0.9) obstacles.push({ x: sx * (HW - 0.15), z, r: 0.5 });
  }
  const colG = new THREE.CylinderGeometry(0.32, 0.38, COL_H, 14);
  const colX = [-HW + 0.45, -HW / 2 - 0.3, -2.4, 2.4, HW / 2 + 0.3, HW - 0.45];
  for (const x of colX) {
    add(mesh(colG, pillar, x, H + COL_H / 2, HZ + HD - 0.4), hall);
    obstacles.push({ x, z: HZ + HD - 0.4, r: 0.6 });
  }
  for (const x of [colX[0], colX[5]]) add(mesh(colG, pillar, x, H + COL_H / 2, HZ - HD + 0.45), hall);
  for (const x of [colX[0], colX[5]]) add(mesh(colG, pillar, x, H + COL_H / 2, HZ), hall);
  const beamY = H + COL_H + 0.2;
  add(mesh(new THREE.BoxGeometry(HW * 2 + 0.8, 0.5, 0.55), wood, 0, beamY, HZ + HD - 0.4), hall);
  add(mesh(new THREE.BoxGeometry(HW * 2 + 0.8, 0.5, 0.55), wood, 0, beamY, HZ - HD + 0.45), hall);
  for (const sx of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.55, 0.5, HD * 2), wood, sx * colX[5], beamY, HZ), hall);
  // neon strip under the front beam (Solana gradient) + a glowing "gm" plaque
  const neonTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 4;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, '#9945ff');
    gr.addColorStop(0.5, '#43b4ca');
    gr.addColorStop(1, '#14f195');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const neonMat = new THREE.MeshBasicMaterial({ map: neonTex, toneMapped: false });
  add(mesh(new THREE.BoxGeometry(HW * 2 + 0.6, 0.09, 0.09), neonMat, 0, beamY - 0.3, HZ + HD - 0.1), hall, false, false);
  add(mesh(new THREE.BoxGeometry(HW * 2 + 0.6, 0.09, 0.09), neonMat, 0, beamY + 0.32, HZ + HD - 0.1), hall, false, false);
  const plaqueTex = textTexture(['gm ✦ quiet hall'], 1024, 200, '#120b24', '#14f195');
  const plaque = mesh(new THREE.BoxGeometry(5.2, 1.0, 0.12), [wood, wood, wood, wood, new THREE.MeshBasicMaterial({ map: plaqueTex }), wood] as unknown as THREE.Material, 0, beamY + 0.95, HZ + HD - 0.3);
  add(plaque, hall, false, false);
  add(mesh(new THREE.BoxGeometry(5.5, 1.3, 0.06), neonMat, 0, beamY + 0.95, HZ + HD - 0.38), hall, false, false);
  // two-tier roof
  add(mesh(new THREE.BoxGeometry(HW * 2 + 3, 0.28, HD * 2 + 3), roofMat, 0, beamY + 0.4, HZ), hall);
  const roof = mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofMat, 0, beamY + 0.55 + 1.6, HZ);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set((HW + 2.2) * 1.414, 3.2, (HD + 2.2) * 1.414);
  add(roof, hall);
  const roof2 = mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofMat, 0, beamY + 3.4, HZ);
  roof2.rotation.y = Math.PI / 4;
  roof2.scale.set(HW * 0.75, 2.6, HD * 0.75);
  add(roof2, hall);
  const tipG = new THREE.ConeGeometry(0.28, 1.3, 6);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const tip = mesh(tipG, roofMat, sx * (HW + 1.5), beamY + 0.7, HZ + sz * (HD + 1.5));
      tip.rotation.z = -sx * 0.9;
      tip.rotation.x = sz * 0.9;
      add(tip, hall);
    }
  const inner = new THREE.PointLight('#ffd7a0', lowPower ? 9 : 14, 22, 2);
  inner.position.set(0, H + 3.6, HZ - 2);
  hall.add(inner);

  // singing bowl
  const bowlGroup = new THREE.Group();
  bowlGroup.position.set(0, H, HZ - HD + 2.6);
  add(mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.28, 28), mat('#7a3b2e'), 0, 0.14, 0), bowlGroup);
  const bowlPts = [
    [0.001, 0],
    [0.3, 0],
    [0.5, 0.08],
    [0.62, 0.25],
    [0.66, 0.42],
    [0.62, 0.43],
    [0.58, 0.27],
    [0.46, 0.12],
    [0.001, 0.07],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  add(mesh(new THREE.LatheGeometry(bowlPts, 40), mat(C.bronze, { metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }), 0, 0.28, 0), bowlGroup);
  bowlGroup.userData.action = 'bowl';
  hall.add(bowlGroup);
  clickables.push(bowlGroup);
  obstacles.push({ x: 0, z: HZ - HD + 2.6, r: 1.0 });

  // hall cushions = seats
  const zafuG = new THREE.CylinderGeometry(0.42, 0.45, 0.24, 22);
  const zabuG = new THREE.BoxGeometry(1.1, 0.06, 1.1);
  const zafuM = mat(C.cushion);
  const zabuM = mat(C.mat);
  let ci = 0;
  for (const z of [HZ - 2.2, HZ + 0.2, HZ + 2.6, HZ + 5])
    for (const x of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) {
      const g = new THREE.Group();
      g.position.set(x, H, z);
      add(mesh(zabuG, zabuM, 0, 0.03, 0), g, false, true);
      add(mesh(zafuG, zafuM, 0, 0.18, 0), g);
      hall.add(g);
      ctx.addSeat({ id: `hall-${ci++}`, x, y: H, z, ry: Math.PI, place: 'hall' }, g);
    }
  scene.add(hall);

  // ---------- lanterns along the main path ----------
  const lampMat = mat('#fff3d6', { emissive: C.lamp, emissiveIntensity: 0.9 });
  const lantern = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, terrain(x, z), z);
    add(mesh(new THREE.BoxGeometry(0.55, 0.16, 0.55), stoneMat, 0, 0.08, 0), g);
    add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.9, 8), stoneMat, 0, 0.6, 0), g);
    add(mesh(new THREE.BoxGeometry(0.46, 0.42, 0.46), lampMat, 0, 1.25, 0), g, false, false);
    const cap = mesh(new THREE.ConeGeometry(0.45, 0.36, 4), stoneMat, 0, 1.64, 0);
    cap.rotation.y = Math.PI / 4;
    add(cap, g);
    scene.add(g);
    obstacles.push({ x, z, r: 0.45 });
  };
  for (const z of [19, 14.5, 10, 5.5, 1]) for (const sx of [-1, 1]) lantern(sx * 2.4, z);

  // ---------- bell pavilion ----------
  const pav = new THREE.Group();
  pav.position.set(BELL.x, 0, BELL.z);
  const pavBase = mesh(new THREE.CylinderGeometry(2.2, 2.35, 0.25, 8), stoneMat, 0, 0.125, 0);
  add(pavBase, pav);
  groundList.push(pavBase);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.4, 10), pillar, sx * 1.4, 1.95, sz * 1.4), pav);
      obstacles.push({ x: BELL.x + sx * 1.4, z: BELL.z + sz * 1.4, r: 0.35 });
    }
  add(mesh(new THREE.BoxGeometry(4.1, 0.18, 4.1), roofMat, 0, 3.72, 0), pav);
  const pRoof = mesh(new THREE.ConeGeometry(1, 1, 4), roofMat, 0, 3.82 + 0.7, 0);
  pRoof.rotation.y = Math.PI / 4;
  pRoof.scale.set(3.2, 1.4, 3.2);
  add(pRoof, pav);
  add(mesh(new THREE.BoxGeometry(3.0, 0.16, 0.16), wood, 0, 3.55, 0), pav);
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 3.5, 0);
  const bellPts = [
    [0.001, 0],
    [0.34, 0],
    [0.47, -0.12],
    [0.52, -0.5],
    [0.58, -1.0],
    [0.7, -1.28],
    [0.66, -1.32],
    [0.001, -1.24],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  add(mesh(new THREE.LatheGeometry(bellPts, 36), mat(C.bronzeDark, { metalness: 0.6, roughness: 0.4 }), 0, -0.05, 0), bellPivot);
  pav.add(bellPivot);
  const striker = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 8), wood, 1.25, 2.85, 0);
  striker.rotation.z = Math.PI / 2;
  add(striker, pav);
  pav.userData.action = 'bell';
  scene.add(pav);
  clickables.push(pav);
  let swing = 0;

  // ---------- signposts ----------
  const sign = (x: number, z: number, ry: number, lines: string[]) => {
    const g = new THREE.Group();
    g.position.set(x, terrain(x, z), z);
    g.rotation.y = ry;
    add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.9, 8), wood, 0, 0.95, 0), g);
    const board = mesh(new THREE.BoxGeometry(1.5, 0.5 * lines.length, 0.06), [
      wood,
      wood,
      wood,
      wood,
      new THREE.MeshStandardMaterial({ map: textTexture(lines, 512, 170 * lines.length), roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: textTexture(lines, 512, 170 * lines.length), roughness: 0.9 }),
    ] as unknown as THREE.Material, 0, 1.55, 0.06);
    add(board, g);
    scene.add(g);
    obstacles.push({ x, z, r: 0.3 });
  };
  sign(-4.6, 6.4, -0.5, ['← Lake']);
  sign(4.8, 7.4, 0.5, ['Garden →']);
  sign(-HW - 2, -3, -0.6, ['← Maple Grove', '↑ Lookout']);
  sign(HW + 2, -3, 0.6, ['Tea House →']);

  // ---------- "built on Solana" / "made for Seeker" banners flanking the hall steps ----------
  addBrandBanners(scene, obstacles, terrain, [
    { x: -4.8, z: HZ + HD + 2.2, ry: 0 },
    { x: 4.8, z: HZ + HD + 2.2, ry: 0 },
  ]);

  // ---------- places ----------
  const spots = buildPlaces(ctx);

  // ---------- pines + rocks outside the places ----------
  const blocked = (x: number, z: number, pad = 0) =>
    pathDist(x, z) < 4.2 + pad ||
    inHall(x, z, 3 + pad) ||
    Math.hypot(x - BELL.x, z - BELL.z) < 4.5 + pad ||
    Math.hypot(x, z - 1.5) < 10.5 + pad ||
    lakeE(x, z) < 1.35 ||
    PLACES.some((p) => p.id !== 'court' && p.id !== 'hall' && Math.hypot(x - p.x, z - p.z) < p.r + 4 + pad) ||
    PLACES.some((p) => Math.hypot(x - p.view[0], z - p.view[1]) < 9) ||
    (segDist(x, z, LOOKOUT.x, LOOKOUT.z, 0, -22) < 10 && z < -23); // keep the lookout's view of the hall open

  const treeN = lowPower ? 170 : 280;
  const trees: { x: number; z: number; s: number; c: number }[] = [];
  for (let i = 0; i < treeN * 5 && trees.length < treeN; i++) {
    const a = R() * Math.PI * 2;
    const r = 16 + R() * 82;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (blocked(x, z)) continue;
    trees.push({ x, z, s: 0.8 + R() * 1.0, c: Math.floor(R() * 4) });
    if (r < BOUNDS + 2) obstacles.push({ x, z, r: 0.45 });
  }
  const greens = ['#5c7756', '#6a895f', '#536c4d', '#78976a'].map((c) => new THREE.Color(c));
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 1.2, 6), mat('#7b5a43'), trees.length);
  const layers = [
    { g: new THREE.ConeGeometry(1.3, 1.8, 7), y: 1.6 },
    { g: new THREE.ConeGeometry(1.0, 1.5, 7), y: 2.45 },
    { g: new THREE.ConeGeometry(0.68, 1.2, 7), y: 3.2 },
  ].map((l) => ({ ...l, m: new THREE.InstancedMesh(l.g, mat('#ffffff', { flatShading: true }), trees.length) }));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  trees.forEach((t, i) => {
    const y0 = terrain(t.x, t.z);
    q.setFromAxisAngle(up, t.x * 3.1);
    const sc = new THREE.Vector3(t.s, t.s, t.s);
    trunk.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, y0 + 0.6 * t.s, t.z), q, sc));
    for (const l of layers) {
      l.m.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, y0 + l.y * t.s, t.z), q, sc));
      l.m.setColorAt(i, greens[t.c]);
    }
  });
  add(trunk, scene);
  for (const l of layers) add(l.m, scene);

  const rocks: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 700 && rocks.length < 90; i++) {
    const a = R() * Math.PI * 2;
    const r = 10 + R() * 74;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (blocked(x, z, -1.2)) continue;
    rocks.push({ x, z, s: 0.3 + R() * 1.0 });
  }
  const rockM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 1), mat(C.stoneDark, { flatShading: true }), rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(R(), R() * 6, R()));
    rockM.setMatrixAt(i, m4.compose(new THREE.Vector3(r.x, terrain(r.x, r.z) + 0.1 * r.s, r.z), q, new THREE.Vector3(r.s * 1.2, r.s * 0.65, r.s)));
    if (r.s > 0.7) obstacles.push({ x: r.x, z: r.z, r: r.s * 0.6 });
  });
  add(rockM, scene);

  // ---------- real CC0 models over the procedural stand-ins ----------
  dressWorld({
    scene,
    R,
    lowPower,
    terrain,
    blocked,
    pathDist,
    trees,
    rocks,
    coneTrees: [trunk, ...layers.map((l) => l.m)],
    coneRocks: [rockM],
    tea: TEA,
    grove: GROVE,
    lookout: LOOKOUT,
  });

  // ---------- grass tufts (instanced, wind sway in the shader) ----------
  const grassN = lowPower ? 2200 : 6500;
  const blade = new THREE.BufferGeometry();
  {
    const v: number[] = [];
    const c: number[] = [];
    const base = new THREE.Color('#6f8a5b');
    const tip = new THREE.Color('#c9d39f');
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI + 0.3;
      const ox = Math.cos(a) * 0.06;
      const oz = Math.sin(a) * 0.06;
      const lean = 0.08 * (b % 2 ? 1 : -1);
      const hgt = 0.32 + (b % 3) * 0.08;
      v.push(-0.025 + ox, 0, oz, 0.025 + ox, 0, oz, ox + lean, hgt, oz + lean * 0.5);
      c.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    blade.computeVertexNormals();
  }
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const windU = { value: 0 };
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float k = position.y * 2.4;
        transformed.x += sin(uTime * 1.6 + ip.x * 0.35 + ip.z * 0.21) * 0.07 * k;
        transformed.z += cos(uTime * 1.2 + ip.z * 0.31) * 0.05 * k;
        #endif`,
      );
  };
  const grass = new THREE.InstancedMesh(blade, grassMat, grassN);
  let gi = 0;
  const gcol = new THREE.Color();
  for (let i = 0; i < grassN * 6 && gi < grassN; i++) {
    const a = R() * Math.PI * 2;
    const r = 3 + Math.sqrt(R()) * 80;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (pathDist(x, z) < 1.4 || inHall(x, z, 1) || Math.hypot(x, z - 1.5) < 9.6 || lakeE(x, z) < 1.12) continue;
    if (Math.abs(x - GARDEN.x) < GARDEN.w / 2 + 0.6 && Math.abs(z - GARDEN.z) < GARDEN.d / 2 + 0.6) continue;
    if (Math.abs(x - TEA.x) < TEA.w / 2 + 0.5 && Math.abs(z - TEA.z) < TEA.d / 2 + 0.5) continue;
    if (Math.hypot(x - BELL.x, z - BELL.z) < 2.6) continue;
    const s = 0.7 + R() * 0.9;
    q.setFromAxisAngle(up, R() * 6.28);
    grass.setMatrixAt(gi, m4.compose(new THREE.Vector3(x, terrain(x, z), z), q, new THREE.Vector3(s, s * (0.8 + R() * 0.5), s)));
    gcol.setHSL(0.22 + R() * 0.05, 0.25, 0.75 + R() * 0.25);
    grass.setColorAt(gi, gcol);
    gi++;
  }
  grass.count = gi;
  grass.receiveShadow = true;
  scene.add(grass);

  // little wild flowers near paths
  const flowerN = lowPower ? 240 : 540;
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), mat('#ffffff', { emissive: '#222', emissiveIntensity: 0.15 }), flowerN);
  const fCols = ['#f7f3e8', '#f2c6cf', '#f4dd7c', '#c9b8ef'].map((c) => new THREE.Color(c));
  let fi = 0;
  for (let i = 0; i < flowerN * 8 && fi < flowerN; i++) {
    const a = R() * Math.PI * 2;
    const r = 6 + R() * 74;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const pd = pathDist(x, z);
    if (pd < 1.5 || pd > 5 || inHall(x, z, 1) || lakeE(x, z) < 1.2 || Math.hypot(x, z - 1.5) < 9.6) continue;
    flowers.setMatrixAt(fi, m4.compose(new THREE.Vector3(x, terrain(x, z) + 0.28, z), q.identity(), new THREE.Vector3(1, 0.7, 1)));
    flowers.setColorAt(fi, fCols[Math.floor(R() * fCols.length)]);
    fi++;
  }
  flowers.count = fi;
  scene.add(flowers);

  // ---------- distant mountains ----------
  const mtnM = mat(C.mountain, { flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.3;
    const r = 170 + R() * 40;
    const h = 50 + R() * 55;
    const m = mesh(new THREE.ConeGeometry(40 + R() * 25, h, 6), mtnM, Math.sin(a) * r, h / 2 - 2, Math.cos(a) * r);
    m.rotation.y = R() * 3;
    scene.add(m);
  }

  // ---------- floating light motes + stars ----------
  const moteN = lowPower ? 90 : 160;
  const motePos = new Float32Array(moteN * 3);
  const moteSeed = new Float32Array(moteN);
  for (let i = 0; i < moteN; i++) {
    const a = R() * Math.PI * 2;
    const r = 2 + R() * 30;
    motePos[i * 3] = Math.sin(a) * r;
    motePos[i * 3 + 1] = 0.3 + R() * 5;
    motePos[i * 3 + 2] = Math.cos(a) * r - 2;
    moteSeed[i] = R() * 10;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  scene.add(
    new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({ color: '#fff3c4', size: 0.09, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
    ),
  );
  const starPos = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const a = R() * Math.PI * 2;
    const e = 0.12 + R() * 1.3;
    starPos[i * 3] = Math.cos(e) * Math.sin(a) * 300;
    starPos[i * 3 + 1] = Math.sin(e) * 300;
    starPos[i * 3 + 2] = Math.cos(e) * Math.cos(a) * 300;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#fff8e6', size: 1.4, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9 }));
  stars.visible = false;
  scene.add(stars);
  let lampBase = 0.85;

  const heightAt = (x: number, z: number) => {
    if (inHall(x, z)) return H;
    if (Math.abs(x) <= STEP_W / 2 && z > HZ + HD && z < HZ + HD + 1.6) return H * (1 - (z - (HZ + HD)) / 1.6);
    if (Math.hypot(x - BELL.x, z - BELL.z) < 2.2) return 0.25;
    for (const s of surfaces) {
      const y = s(x, z);
      if (y !== null) return y;
    }
    for (const s of seatHeights) if (Math.abs(x - s.x) < 0.35 && Math.abs(z - s.z) < 0.35) return s.y;
    return terrain(x, z);
  };
  const walkable = (x: number, z: number) => {
    if (Math.hypot(x, z) > BOUNDS) return false;
    for (const s of surfaces) if (s(x, z) !== null) return true; // dock, platforms override water
    return !blockers.some((b) => b(x, z));
  };

  return {
    ground: groundList,
    clickables,
    obstacles,
    seats,
    places: PLACES,
    spawn: new THREE.Vector3(0, 0, 20),
    bellPos: new THREE.Vector3(BELL.x, 0, BELL.z),
    bowlPos: new THREE.Vector3(0, H, HZ - HD + 2.4),
    bounds: BOUNDS,
    heightAt,
    walkable,
    placeAt,
    spots,
    setOwned: (k, o) => spots.setOwned(k, o),
    swingBell() {
      swing = 1;
    },
    setTheme(theme) {
      const night = theme === 'night';
      const horizon = night ? '#231a46' : '#ffd9c4';
      skyU.horizon.value.set(horizon);
      skyU.top.value.set(night ? '#0a0820' : '#7f86f5');
      skyU.sunCol.value.set(night ? '#c9d6ff' : '#fff1d0');
      skyU.aurora.value = night ? 1 : 0;
      (scene.background as THREE.Color).set(horizon);
      const fog = scene.fog as THREE.Fog;
      fog.color.set(horizon);
      fog.near = night ? 35 : 60;
      fog.far = night ? 180 : 260;
      hemi.color.set(night ? '#a99fe0' : '#fff0f0');
      hemi.groundColor.set(night ? '#2a3326' : '#8b9b7a');
      hemi.intensity = night ? 0.8 : 1.25;
      sun.color.set(night ? '#a9bcff' : '#fff0d6');
      sun.intensity = night ? 0.45 : 1.9;
      inner.intensity = (lowPower ? 9 : 14) * (night ? 2.2 : 1);
      moonMat.emissiveIntensity = night ? 1.3 : 0.55;
      lampBase = night ? 2.0 : 0.85;
      stars.visible = night;
      for (const f of themers) f(night);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', horizon);
    },
    update(t, dt, focus) {
      ctx.focus.copy(focus);
      sky.position.copy(focus);
      // keep the shadow area centred on the player (snapped to avoid shimmering)
      const sx = Math.round(focus.x / 2) * 2;
      const sz = Math.round(focus.z / 2) * 2;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + sunOffset.x, sunOffset.y, sz + sunOffset.z);
      windU.value = t;
      skyU.time.value = t;
      swing *= Math.exp(-dt * 0.5);
      bellPivot.rotation.z = Math.sin(t * 4.2) * 0.13 * swing;
      lampMat.emissiveIntensity = lampBase + Math.sin(t * 1.3) * 0.06 + Math.sin(t * 3.7) * 0.03;
      const p = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < moteN; i++) {
        let y = p.getY(i) + dt * (0.08 + (moteSeed[i] % 1) * 0.1);
        if (y > 6) y = 0.3;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 0.5 + moteSeed[i]) * dt * 0.08);
      }
      p.needsUpdate = true;
      for (const u of updaters) u(t, dt);
    },
  };
}
