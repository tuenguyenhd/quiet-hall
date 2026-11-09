// The places around the hall: Lake, Stone Garden (108 stone spots), Maple Grove (64 tree spots), Tea House, Lookout.
import * as THREE from 'three';
import { add, mat, mesh } from './build';
import { GARDEN, GROVE, LAKE, LOOKOUT, TEA, stoneSpots, treeSpots } from './layout';
import { waterMaterial } from './water';
import type { WorldCtx } from './world';

type Owned = Map<number, { name: string; line: string }>;

function labelSprite(title: string, line: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(250,247,240,0.92)';
  g.beginPath();
  g.roundRect(8, 8, 496, 144, 28);
  g.fill();
  g.fillStyle = '#3f4237';
  g.textAlign = 'center';
  g.font = '600 52px "Zen Old Mincho", serif';
  g.fillText(title.slice(0, 22), 256, 72);
  g.fillStyle = '#6f7364';
  g.font = '500 34px "Zen Maru Gothic", sans-serif';
  g.fillText(line.slice(0, 30), 256, 122);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.9, 0.6, 1);
  return s;
}

export function buildPlaces(ctx: WorldCtx & { focus: THREE.Vector3 }) {
  const { scene, R, terrain, obstacles, lowPower } = ctx;
  const wood = mat('#8f6446');
  const woodLight = mat('#b08860');
  const stoneM = mat('#bdb7a7');
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  /** invisible hit volume so seats are easy to tap */
  const hitBox = (w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    return m;
  };
  const bench = (x: number, z: number, ry: number, place: string, id: string) => {
    const g = new THREE.Group();
    g.position.set(x, terrain(x, z), z);
    g.rotation.y = ry;
    add(mesh(new THREE.BoxGeometry(1.7, 0.08, 0.5), woodLight, 0, 0.45, 0), g);
    add(mesh(new THREE.BoxGeometry(1.7, 0.4, 0.07), woodLight, 0, 0.75, -0.24), g);
    for (const sx of [-0.7, 0.7]) add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.42), wood, sx, 0.22, 0), g);
    const hit = hitBox(1.8, 1, 0.8);
    hit.position.y = 0.5;
    g.add(hit);
    scene.add(g);
    ctx.addSeat({ id, x, y: terrain(x, z) + 0.45, z, ry, place }, hit);
  };

  // =================== LAKE ===================
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 72), waterMaterial());
  water.rotation.x = -Math.PI / 2;
  water.scale.set(LAKE.rx * 1.08, LAKE.rz * 1.08, 1);
  water.position.set(LAKE.x, -0.2, LAKE.z);
  water.renderOrder = 1;
  scene.add(water);
  const wU = (water.material as THREE.ShaderMaterial).uniforms;
  ctx.updaters.push((t) => (wU.time.value = t));
  ctx.themers.push((night) => {
    wU.sky.value.set(night ? '#3a4560' : '#e9ece4');
    wU.deep.value.set(night ? '#1f3340' : '#4f7f86');
    wU.shallow.value.set(night ? '#3c5a62' : '#9cc3b8');
    wU.sunCol.value.set(night ? '#c9d6ff' : '#fff4dc');
  });
  const lakeE = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  ctx.blockers.push((x, z) => lakeE(x, z) < 1.02);

  // dock: from the shore (towards the courtyard) out over the water
  const dockStart = v3(LAKE.x + LAKE.rx * 1.0, 0, LAKE.z - LAKE.rz * 0.42);
  const dir = new THREE.Vector3(LAKE.x - dockStart.x, 0, LAKE.z - dockStart.z).normalize();
  const DOCK_LEN = 9.5;
  const dockRy = Math.atan2(dir.x, dir.z);
  const dock = new THREE.Group();
  dock.position.copy(dockStart);
  dock.rotation.y = dockRy;
  const plankG = new THREE.BoxGeometry(1.7, 0.08, 0.26);
  for (let s = 0; s < DOCK_LEN; s += 0.3) add(mesh(plankG, woodLight, (R() - 0.5) * 0.03, 0.32, s), dock);
  for (let s = 0.4; s < DOCK_LEN; s += 1.8)
    for (const sx of [-0.8, 0.8]) add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), wood, sx, -0.25, s), dock);
  scene.add(dock);
  const dockHit = hitBox(1.8, 1, 1.2);
  dockHit.position.set(0, 0.8, DOCK_LEN - 0.6);
  dock.add(dockHit);
  const endPos = dockStart.clone().addScaledVector(dir, DOCK_LEN - 0.6);
  ctx.addSeat({ id: 'lake-dock', x: endPos.x, y: 0.36, z: endPos.z, ry: dockRy, place: 'lake' }, dockHit);
  ctx.surfaces.push((x, z) => {
    const dx = x - dockStart.x;
    const dz = z - dockStart.z;
    const along = dx * dir.x + dz * dir.z;
    const side = Math.abs(dx * dir.z - dz * dir.x);
    return along > -0.2 && along < DOCK_LEN && side < 0.85 ? 0.36 : null;
  });

  // shore boulders you can sit on
  for (const [i, a] of [2.2, 4.3].entries()) {
    const x = LAKE.x + Math.cos(a) * LAKE.rx * 1.18;
    const z = LAKE.z + Math.sin(a) * LAKE.rz * 1.18;
    const y0 = terrain(x, z);
    const b = mesh(new THREE.DodecahedronGeometry(0.75, 1), mat('#a6a291', { flatShading: true }), x, y0 + 0.15, z);
    b.scale.set(1.3, 0.62, 1.1);
    add(b, scene);
    ctx.addSeat({ id: `lake-rock-${i}`, x, y: y0 + 0.58, z, ry: Math.atan2(LAKE.x - x, LAKE.z - z), place: 'lake' }, b);
  }
  // lily pads + flowers
  const padM = mat('#7c9b66');
  for (let i = 0; i < 22; i++) {
    const a = R() * Math.PI * 2;
    const r = 0.35 + R() * 0.5;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * r;
    const z = LAKE.z + Math.sin(a) * LAKE.rz * r;
    const pad = mesh(new THREE.CircleGeometry(0.25 + R() * 0.22, 14, 0.4, Math.PI * 1.8), padM, x, -0.17, z);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = R() * 6;
    add(pad, scene, false, false);
    if (R() < 0.35) add(mesh(new THREE.SphereGeometry(0.09, 10, 8), mat('#f4c9d4'), x, -0.1, z), scene, false, false);
  }
  // reeds around the far shore
  const reedN = lowPower ? 140 : 300;
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.025, 1, 4), mat('#7d8f55'), reedN);
  for (let i = 0; i < reedN; i++) {
    const a = 1.6 + R() * 3.4; // keep the dock side open
    const k = 0.98 + R() * 0.12;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * k;
    const z = LAKE.z + Math.sin(a) * LAKE.rz * k;
    const s = 0.6 + R() * 0.8;
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.2, 0, (R() - 0.5) * 0.2));
    reeds.setMatrixAt(i, m4.compose(v3(x, terrain(x, z) + 0.45 * s, z), q, v3(1, s, 1)));
  }
  add(reeds, scene);

  // =================== STONE GARDEN ===================
  const bedTex = (() => {
    const c = document.createElement('canvas');
    c.width = 1300;
    c.height = 800;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e8dfc9';
    g.fillRect(0, 0, c.width, c.height);
    const rocks = [
      [330, 330, 95],
      [880, 250, 70],
      [760, 560, 120],
    ];
    const inRock = (x: number, y: number) => rocks.some(([rx, ry, rr]) => Math.hypot(x - rx, y - ry) < rr + 120);
    g.lineWidth = 5;
    for (let y = 10; y < c.height; y += 16) {
      for (let x = 0; x < c.width; x += 6) {
        if (inRock(x, y)) continue;
        g.strokeStyle = 'rgba(150,135,105,0.32)';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 6, y);
        g.stroke();
      }
    }
    for (const [rx, ry, rr] of rocks)
      for (let r = rr + 14; r < rr + 120; r += 16) {
        g.strokeStyle = 'rgba(150,135,105,0.34)';
        g.beginPath();
        g.arc(rx, ry, r, 0, Math.PI * 2);
        g.stroke();
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { t, rocks };
  })();
  const bed = mesh(new THREE.PlaneGeometry(GARDEN.w, GARDEN.d), new THREE.MeshStandardMaterial({ map: bedTex.t, roughness: 1 }), GARDEN.x, 0.05, GARDEN.z);
  bed.rotation.x = -Math.PI / 2;
  add(bed, scene, false, true);
  for (const [sx, sz, w, d] of [
    [0, -1, GARDEN.w + 0.4, 0.2],
    [0, 1, GARDEN.w + 0.4, 0.2],
    [-1, 0, 0.2, GARDEN.d],
    [1, 0, 0.2, GARDEN.d],
  ])
    add(mesh(new THREE.BoxGeometry(w, 0.16, d), wood, GARDEN.x + (sx * GARDEN.w) / 2, 0.08, GARDEN.z + (sz * GARDEN.d) / 2), scene);
  for (const [rx, ry, rr] of bedTex.rocks) {
    const x = GARDEN.x - GARDEN.w / 2 + (rx / 1300) * GARDEN.w;
    const z = GARDEN.z - GARDEN.d / 2 + (ry / 800) * GARDEN.d;
    const s = (rr / 1300) * GARDEN.w;
    const rock = mesh(new THREE.DodecahedronGeometry(1, 1), mat('#8e8b7f', { flatShading: true }), x, s * 0.35, z);
    rock.scale.set(s * 1.1, s * 0.9, s);
    rock.rotation.y = R() * 3;
    add(rock, scene);
    const moss = mesh(new THREE.CylinderGeometry(s * 1.25, s * 1.3, 0.06, 20), mat('#7f9663'), x, 0.07, z);
    add(moss, scene, false, true);
  }
  ctx.blockers.push((x, z) => Math.abs(x - GARDEN.x) < GARDEN.w / 2 && Math.abs(z - GARDEN.z) < GARDEN.d / 2);
  const benchZ = GARDEN.z + GARDEN.d / 2 + 3.6;
  [-4.5, 0, 4.5].forEach((dx, i) => bench(GARDEN.x + dx, benchZ, Math.PI, 'garden', `garden-bench-${i}`));

  // 108 stone spots
  const sSpots = stoneSpots();
  const stoneInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.36, 0.16, 9), mat('#ffffff', { flatShading: true }), sSpots.length);
  const plain = new THREE.Color('#b8b3a5');
  const ownedCol = new THREE.Color('#e3cf9e');
  sSpots.forEach((s, i) => {
    q.setFromAxisAngle(up, i * 1.7);
    stoneInst.setMatrixAt(i, m4.compose(v3(s.x, terrain(s.x, s.z) + 0.07, s.z), q, v3(1 + (i % 3) * 0.08, 1, 0.85)));
    stoneInst.setColorAt(i, plain);
  });
  stoneInst.userData.action = 'spot';
  stoneInst.userData.kind = 'stone';
  add(stoneInst, scene);
  ctx.clickables.push(stoneInst);

  // =================== MAPLE GROVE ===================
  const tSpots = treeSpots();
  const tN = tSpots.length;
  const mTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.17, 3.0, 7), mat('#6e4f3c'), tN);
  const crowns = [0, 1, 2].map(() => new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat('#ffffff', { flatShading: true }), tN));
  const autumn = ['#c8553d', '#d9783a', '#e3a13f', '#b8433a', '#d66a3c'].map((c) => new THREE.Color(c));
  const treeScale = new Float32Array(tN).fill(1);
  const placeTree = (i: number) => {
    const s = tSpots[i];
    const y0 = terrain(s.x, s.z);
    const k = treeScale[i] * (0.8 + ((i * 37) % 10) / 40);
    q.setFromAxisAngle(up, i);
    mTrunk.setMatrixAt(i, m4.compose(v3(s.x, y0 + 1.5 * k, s.z), q, v3(k, k, k)));
    const offs = [
      [0, 3.6, 0, 0.85],
      [0.45, 3.2, 0.25, 0.62],
      [-0.4, 3.3, -0.3, 0.66],
    ];
    crowns.forEach((c, j) => {
      const [ox, oy, oz, cs] = offs[j];
      c.setMatrixAt(i, m4.compose(v3(s.x + ox * k, y0 + oy * k, s.z + oz * k), q, v3(cs * k, cs * k * 0.85, cs * k)));
      c.setColorAt(i, autumn[(i + j) % autumn.length]);
    });
  };
  for (let i = 0; i < tN; i++) {
    placeTree(i);
    obstacles.push({ x: tSpots[i].x, z: tSpots[i].z, r: 0.35 });
  }
  mTrunk.userData.action = 'spot';
  mTrunk.userData.kind = 'tree';
  for (const c of crowns) {
    c.userData.action = 'spot';
    c.userData.kind = 'tree';
  }
  add(mTrunk, scene);
  for (const c of crowns) add(c, scene);
  ctx.clickables.push(mTrunk, ...crowns);

  // leaf carpet + falling leaves
  const carpetN = lowPower ? 350 : 800;
  const carpet = new THREE.InstancedMesh(new THREE.CircleGeometry(0.09, 5), mat('#ffffff', { side: THREE.DoubleSide }), carpetN);
  for (let i = 0; i < carpetN; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * (GROVE.r + 1.5);
    const x = GROVE.x + Math.cos(a) * r;
    const z = GROVE.z + Math.sin(a) * r;
    q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, R() * 6));
    carpet.setMatrixAt(i, m4.compose(v3(x, terrain(x, z) + 0.02, z), q, v3(1, 1, 1)));
    carpet.setColorAt(i, autumn[Math.floor(R() * autumn.length)]);
  }
  add(carpet, scene, false, true);
  const fallN = lowPower ? 60 : 140;
  const fallPos = new Float32Array(fallN * 3);
  const fallSeed = new Float32Array(fallN);
  for (let i = 0; i < fallN; i++) {
    fallPos.set([GROVE.x + (R() - 0.5) * 20, R() * 4, GROVE.z + (R() - 0.5) * 20], i * 3);
    fallSeed[i] = R() * 10;
  }
  const fallGeo = new THREE.BufferGeometry();
  fallGeo.setAttribute('position', new THREE.BufferAttribute(fallPos, 3));
  scene.add(new THREE.Points(fallGeo, new THREE.PointsMaterial({ color: '#d9763a', size: 0.12, transparent: true, opacity: 0.9 })));
  ctx.updaters.push((t, dt) => {
    const p = fallGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fallN; i++) {
      let y = p.getY(i) - dt * (0.35 + (fallSeed[i] % 1) * 0.25);
      let x = p.getX(i) + Math.sin(t * 1.3 + fallSeed[i]) * dt * 0.5;
      if (y < 0.05) {
        y = 3.5 + (fallSeed[i] % 1);
        x = GROVE.x + (Math.sin(fallSeed[i] * 99 + t) * 0.5) * 18;
      }
      p.setXYZ(i, x, y, p.getZ(i) + Math.cos(t * 0.9 + fallSeed[i]) * dt * 0.3);
    }
    p.needsUpdate = true;
  });
  // bench + swing in the clearing
  bench(GROVE.x, GROVE.z + 1.5, 0, 'grove', 'grove-bench');
  {
    const sx = GROVE.x + 0.4;
    const sz = GROVE.z - 1.6;
    const g = new THREE.Group();
    g.position.set(sx, terrain(sx, sz), sz);
    for (const ox of [-0.9, 0.9]) add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 8), wood, ox, 1.2, 0), g);
    add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.95, 8), wood, 0, 2.4, 0).rotateZ(Math.PI / 2), g);
    const seatG = new THREE.Group();
    seatG.position.y = 2.4;
    for (const ox of [-0.35, 0.35]) add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.95, 4), mat('#d9cfb8'), ox, -0.98, 0), seatG);
    add(mesh(new THREE.BoxGeometry(0.9, 0.06, 0.38), woodLight, 0, -1.95, 0), seatG);
    g.add(seatG);
    const hit = hitBox(1.2, 1.2, 0.8);
    hit.position.y = 0.6;
    g.add(hit);
    scene.add(g);
    ctx.addSeat({ id: 'grove-swing', x: sx, y: terrain(sx, sz) + 0.45, z: sz, ry: Math.PI, place: 'grove' }, hit);
    ctx.updaters.push((t) => (seatG.rotation.x = Math.sin(t * 1.1) * 0.06));
    obstacles.push({ x: sx - 0.9, z: sz, r: 0.2 }, { x: sx + 0.9, z: sz, r: 0.2 });
  }

  // =================== TEA HOUSE ===================
  {
    const g = new THREE.Group();
    g.position.set(TEA.x, 0, TEA.z);
    const y0 = terrain(TEA.x, TEA.z);
    add(mesh(new THREE.BoxGeometry(TEA.w, TEA.h, TEA.d), mat('#9b7352'), 0, y0 + TEA.h / 2, 0), g);
    add(mesh(new THREE.BoxGeometry(0.9, 0.22, 2.2), mat('#9b7352'), -TEA.w / 2 - 0.45, y0 + 0.11, 0), g);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.7, 10), mat('#7a4a34'), sx * (TEA.w / 2 - 0.3), y0 + TEA.h + 1.35, sz * (TEA.d / 2 - 0.3)), g);
        obstacles.push({ x: TEA.x + sx * (TEA.w / 2 - 0.3), z: TEA.z + sz * (TEA.d / 2 - 0.3), r: 0.3 });
      }
    const roofM = mat('#4b5551', { roughness: 0.8 });
    add(mesh(new THREE.BoxGeometry(TEA.w + 1.6, 0.18, TEA.d + 1.6), roofM, 0, y0 + TEA.h + 2.75, 0), g);
    const r = mesh(new THREE.ConeGeometry(1, 1, 4), roofM, 0, y0 + TEA.h + 2.85 + 0.9, 0);
    r.rotation.y = Math.PI / 4;
    r.scale.set(6.4, 1.8, 5.6);
    add(r, g);
    // low table, kettle, cups
    const top = y0 + TEA.h;
    add(mesh(new THREE.BoxGeometry(1.5, 0.08, 1.0), mat('#6b4a33'), 0, top + 0.34, 0), g);
    for (const sx of [-0.65, 0.65]) for (const sz of [-0.4, 0.4]) add(mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), mat('#6b4a33'), sx, top + 0.15, sz), g);
    const kettle = mesh(new THREE.SphereGeometry(0.16, 16, 12), mat('#3e3b36', { metalness: 0.4, roughness: 0.5 }), 0, top + 0.5, 0);
    kettle.scale.y = 0.8;
    add(kettle, g);
    for (const [cx, cz] of [
      [-0.45, -0.25],
      [0.45, 0.25],
    ])
      add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 10), mat('#efe7d6'), cx, top + 0.42, cz), g);
    obstacles.push({ x: TEA.x, z: TEA.z, r: 0.9 });
    // hanging lanterns
    const lampM = mat('#fff3d6', { emissive: '#ffcf7a', emissiveIntensity: 1.1 });
    for (const sx of [-1, 1]) add(mesh(new THREE.SphereGeometry(0.2, 12, 10), lampM, sx * (TEA.w / 2 - 0.3), top + 2.2, TEA.d / 2 - 0.3), g, false, false);
    ctx.themers.push((night) => (lampM.emissiveIntensity = night ? 2.4 : 1.1));
    // cushions around the table (seats)
    const seatsAt: [number, number, number][] = [
      [-1.25, 0, Math.PI / 2],
      [1.25, 0, -Math.PI / 2],
      [0, -1.05, 0],
      [0, 1.05, Math.PI],
    ];
    seatsAt.forEach(([sx, sz, ry], i) => {
      const cg = new THREE.Group();
      cg.position.set(sx, top, sz);
      add(mesh(new THREE.BoxGeometry(0.75, 0.1, 0.75), mat('#7a5a6a'), 0, 0.05, 0), cg);
      const hit = hitBox(0.9, 0.8, 0.9);
      hit.position.y = 0.4;
      cg.add(hit);
      g.add(cg);
      ctx.addSeat({ id: `tea-${i}`, x: TEA.x + sx, y: top + 0.1, z: TEA.z + sz, ry, place: 'tea' }, hit);
    });
    scene.add(g);
    ctx.surfaces.push((x, z) => {
      if (Math.abs(x - TEA.x) <= TEA.w / 2 && Math.abs(z - TEA.z) <= TEA.d / 2) return y0 + TEA.h;
      if (x < TEA.x - TEA.w / 2 && x > TEA.x - TEA.w / 2 - 0.9 && Math.abs(z - TEA.z) < 1.1) return y0 + 0.22;
      return null;
    });
    // steam
    const steam: THREE.Sprite[] = [];
    const steamMat = new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(steamMat.clone());
      s.position.set(TEA.x + 0.12, top + 0.6, TEA.z);
      scene.add(s);
      steam.push(s);
    }
    ctx.updaters.push((t) => {
      steam.forEach((s, i) => {
        const k = (t * 0.25 + i / steam.length) % 1;
        s.position.y = top + 0.6 + k * 1.1;
        s.position.x = TEA.x + 0.12 + Math.sin(t + i) * 0.08 * k;
        s.scale.setScalar(0.12 + k * 0.35);
        (s.material as THREE.SpriteMaterial).opacity = 0.32 * (1 - k);
      });
    });
  }

  // =================== LOOKOUT ===================
  // a high rock that looks back over the whole valley: hall, lake, garden
  {
    const x = LOOKOUT.x;
    const z = LOOKOUT.z - 1;
    const y0 = terrain(x, z);
    const rock = mesh(new THREE.CylinderGeometry(0.9, 1.15, 0.5, 9), mat('#9e9b8d', { flatShading: true }), x, y0 + 0.15, z);
    add(rock, scene);
    ctx.addSeat({ id: 'lookout-rock', x, y: y0 + 0.4, z, ry: 0, place: 'lookout' }, rock);
    // cairn: each stone sits on the one below (squashed spheres, half-height = 0.6 × radius)
    let cy = terrain(x + 2.4, z - 0.6) - 0.04;
    for (let i = 0; i < 5; i++) {
      const s = 0.32 - i * 0.05;
      const h = 0.6 * s;
      cy += h;
      const c = mesh(new THREE.SphereGeometry(s, 10, 8), stoneM, x + 2.4 + (i % 2 ? 0.03 : -0.02), cy, z - 0.6);
      c.scale.y = 0.6;
      c.rotation.y = i * 0.9;
      add(c, scene);
      cy += h - 0.03; // tiny overlap so nothing floats
    }
    obstacles.push({ x: x + 2.4, z: z - 0.6, r: 0.4 });
    const pine = new THREE.Group();
    pine.position.set(x - 2.8, terrain(x - 2.8, z - 1.2), z - 1.2);
    pine.rotation.z = 0.18;
    add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.6, 7), mat('#6e4f3c'), 0, 1.3, 0), pine);
    for (const [y, r] of [
      [2.4, 1.2],
      [3.1, 0.9],
      [3.7, 0.6],
    ])
      add(mesh(new THREE.ConeGeometry(r, 1.0, 7), mat('#55704f', { flatShading: true }), 0.25, y, 0), pine);
    scene.add(pine);
    obstacles.push({ x: x - 2.8, z: z - 1.2, r: 0.4 });
  }

  // =================== ownership display (stones + trees) ===================
  const labels = new Map<string, THREE.Sprite>();
  const setOwned = (kind: 'stone' | 'tree', owned: Owned) => {
    for (const [k, s] of labels)
      if (k.startsWith(kind)) {
        scene.remove(s);
        labels.delete(k);
      }
    if (kind === 'stone') {
      sSpots.forEach((_, i) => stoneInst.setColorAt(i, owned.has(i) ? ownedCol : plain));
      stoneInst.instanceColor!.needsUpdate = true;
    } else {
      for (let i = 0; i < tN; i++) {
        treeScale[i] = owned.has(i) ? 1.3 : 1;
        placeTree(i);
      }
      mTrunk.instanceMatrix.needsUpdate = true;
      for (const c of crowns) c.instanceMatrix.needsUpdate = true;
    }
    for (const [i, o] of owned) {
      const s = kind === 'stone' ? sSpots[i] : tSpots[i];
      if (!s) continue;
      const l = labelSprite(o.name, o.line);
      l.position.set(s.x, terrain(s.x, s.z) + (kind === 'stone' ? 0.9 : 3.8), s.z);
      l.visible = false;
      scene.add(l);
      labels.set(`${kind}-${i}`, l);
    }
  };
  // show name plates only when you are close
  ctx.updaters.push(() => {
    for (const l of labels.values()) l.visible = l.position.distanceTo(ctx.focus) < 7;
  });

  return { setOwned, stoneSpots: sSpots, treeSpots: tSpots };
}
