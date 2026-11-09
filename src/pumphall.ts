// PumpHall: the "degen" side of the valley, at the end of the south path. A neon dais with candlestick
// sculptures and a big live board (SOL / SKR price, round timer). Tap the board or the pads to play
// the fun-only "up or down?" game. No money, no prizes.
import * as THREE from 'three';
import { add, mat, mesh } from './build';
import { PUMP } from './layout';
import { stickerWallTexture } from './stickers';

type Ctx = {
  scene: THREE.Scene;
  terrain: (x: number, z: number) => number;
  obstacles: { x: number; z: number; r: number }[];
  clickables: THREE.Object3D[];
  blockers: ((x: number, z: number) => boolean)[];
};

export interface BoardMarket {
  price: number | null;
  lock: number | null;
  /** ms left in the live round */
  left: number;
  /** ms until picks close for the next round (≤ 0 = closed) */
  closes: number;
}
export type BoardData = Record<'SOL' | 'SKR', BoardMarket>;

const GREEN = '#14f195';
const RED = '#ff4d6d';
const PURPLE = '#9945ff';

const fmtPrice = (p: number | null) => (p == null ? '…' : p >= 10 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toFixed(5));
const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function buildPumpHall(c: Ctx) {
  const g = new THREE.Group();
  const y0 = c.terrain(PUMP.x, PUMP.z);
  g.position.set(PUMP.x, y0, PUMP.z);
  c.scene.add(g);

  // ---------- dais: dark octagon with a neon rim ----------
  const R = PUMP.r - 3;
  const dark = mat('#1d1538', { roughness: 0.7 });
  add(mesh(new THREE.CylinderGeometry(R, R + 0.4, 0.5, 8), dark, 0, 0.25, 0), g, false, true);
  const neonG = new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });
  const neonR = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
  const neonP = new THREE.MeshBasicMaterial({ color: PURPLE, toneMapped: false });
  const rim = mesh(new THREE.TorusGeometry(R + 0.05, 0.08, 6, 8), neonP, 0, 0.52, 0);
  rim.rotation.x = Math.PI / 2;
  rim.rotation.z = Math.PI / 8;
  g.add(rim);

  // ---------- candlestick sculptures around the dais (a little price chart you can walk through) ----------
  const candles: { m: THREE.Mesh; base: number; ph: number }[] = [];
  const bodyGeo = new THREE.BoxGeometry(0.9, 1, 0.9);
  const wickGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = Math.PI * 0.18 + (i / (N - 1)) * Math.PI * 1.64; // open toward the path (north, -z)
    const x = Math.sin(a) * (R - 1.2);
    const z = -Math.cos(a) * (R - 1.2); // a = 0 is north: the gap faces the path
    const up = (i * 7) % 5 < 3;
    const h = 1.6 + ((i * 37) % 23) / 6;
    const m = up ? neonG : neonR;
    const body = mesh(bodyGeo, m, x, 0.5 + 0.6 + h / 2, z);
    body.scale.y = h;
    g.add(body);
    const wick = mesh(wickGeo, m, x, 0.5 + 0.3 + (h + 1.2) / 2, z);
    wick.scale.y = h + 1.2;
    g.add(wick);
    candles.push({ m: body, base: h, ph: i * 0.9 });
    c.obstacles.push({ x: PUMP.x + x, z: PUMP.z + z, r: 0.7 });
  }

  // ---------- the big board (faces the path, north) ----------
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 600;
  const ctx2 = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const board = new THREE.Group();
  board.position.set(0, -0.6, 3.5); // low enough to read under the HUD as you walk in
  board.rotation.y = Math.PI; // face -z (toward the courtyard)
  const frame = mat('#120b24', { roughness: 0.5 });
  add(mesh(new THREE.BoxGeometry(0.35, 7.4, 0.35), frame, -5.4, 3.7, 0), board);
  add(mesh(new THREE.BoxGeometry(0.35, 7.4, 0.35), frame, 5.4, 3.7, 0), board);
  add(mesh(new THREE.BoxGeometry(11.2, 6.2, 0.25), frame, 0, 4.7, -0.05), board);
  const screen = mesh(new THREE.PlaneGeometry(10.4, 6.1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 4.7, 0.09);
  board.add(screen);
  // roof strip with the name
  const top = mesh(new THREE.BoxGeometry(11.6, 0.5, 0.5), neonP, 0, 7.95, 0);
  board.add(top);
  board.userData.action = 'pump';
  g.add(board);
  c.clickables.push(board);
  c.obstacles.push({ x: PUMP.x - 5.4, z: PUMP.z + 3.5, r: 0.5 }, { x: PUMP.x + 5.4, z: PUMP.z + 3.5, r: 0.5 });

  // ---------- UP / DOWN pads in front of the board ----------
  const padGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24);
  const arrowGeo = new THREE.ConeGeometry(0.6, 1.1, 4);
  const pads: THREE.Mesh[] = [];
  for (const [x, col, up] of [
    [3, GREEN, true], // UP on the left as you face the board
    [-3, RED, false],
  ] as const) {
    const pad = mesh(padGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, toneMapped: false }), x, 0.57, -1.5);
    pad.userData.action = 'pump';
    g.add(pad);
    c.clickables.push(pad);
    pads.push(pad);
    const arrow = mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }), x, 2.2, -1.5);
    if (!up) arrow.rotation.x = Math.PI;
    arrow.userData.action = 'pump';
    g.add(arrow);
    c.clickables.push(arrow);
    pads.push(arrow);
  }

  // ---------- big invisible tap target over board + pads (the thin screen was easy to miss) ----------
  const hitM = new THREE.MeshBasicMaterial({ visible: false });
  const hitBox = mesh(new THREE.BoxGeometry(12, 8, 2.5), hitM, 0, 3.6, 3.3); // just the board: tapping the floor in front still walks
  hitBox.userData.action = 'pump';
  g.add(hitBox);
  c.clickables.push(hitBox);

  // ---------- decorations ----------
  const spin: THREE.Object3D[] = [];
  const bob: { o: THREE.Object3D; y: number; ph: number }[] = [];
  const pop = (t: string) => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 160;
    const x = cv.getContext('2d')!;
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    const draw = () => {
      x.fillStyle = '#0c0820';
      x.fillRect(0, 0, 1024, 160);
      x.font = '110px "Lilita One", system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.shadowColor = GREEN;
      x.shadowBlur = 24;
      x.fillStyle = GREEN;
      x.fillText(t, 512, 86);
      tx.needsUpdate = true;
    };
    draw();
    document.fonts?.load('110px "Lilita One"').then(draw);
    return tx;
  };
  // neon gate over the entrance (north edge of the dais)
  {
    const gz = -R - 0.6;
    const postG = new THREE.BoxGeometry(0.6, 7, 0.6);
    for (const x of [-5.2, 5.2]) {
      add(mesh(postG, frame, x, 3.5, gz), g);
      g.add(mesh(new THREE.BoxGeometry(0.16, 7, 0.16), neonP, x, 3.5, gz - 0.34));
      c.obstacles.push({ x: PUMP.x + x, z: PUMP.z + gz, r: 0.6 });
    }
    add(mesh(new THREE.BoxGeometry(12, 1.5, 0.5), frame, 0, 7.4, gz), g);
    const sign = mesh(new THREE.PlaneGeometry(10.8, 1.69), new THREE.MeshBasicMaterial({ map: pop('PUMPHALL'), toneMapped: false }), 0, 7.4, gz - 0.26);
    sign.rotation.y = Math.PI;
    g.add(sign);
    g.add(mesh(new THREE.BoxGeometry(12.2, 0.12, 0.12), neonG, 0, 6.6, gz - 0.3), mesh(new THREE.BoxGeometry(12.2, 0.12, 0.12), neonR, 0, 8.2, gz - 0.3));
  }
  // rocket on a pedestal (back left), with a flickering flame
  let flame: THREE.Mesh;
  {
    const rk = new THREE.Group();
    rk.position.set(-8.6, 0.5, 6.5);
    add(mesh(new THREE.CylinderGeometry(1.3, 1.5, 1.2, 8), dark, 0, 0.6, 0), rk);
    const white = mat('#f4f1ff', { roughness: 0.5 });
    const red = mat('#ff4d6d', { roughness: 0.5 });
    add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 4.2, 16), white, 0, 4.4, 0), rk);
    add(mesh(new THREE.ConeGeometry(0.75, 1.6, 16), red, 0, 7.3, 0), rk);
    const win = mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshBasicMaterial({ color: '#7fd8ff', toneMapped: false }), 0, 5.4, 0.76);
    rk.add(win);
    for (let i = 0; i < 4; i++) {
      const fin = mesh(new THREE.BoxGeometry(0.12, 1.3, 0.9), red, 0, 2.9, 0);
      fin.rotation.y = (i * Math.PI) / 2;
      fin.translateZ(0.9);
      add(fin, rk);
    }
    flame = mesh(new THREE.ConeGeometry(0.55, 1.4, 12), new THREE.MeshBasicMaterial({ color: '#ffb02e', toneMapped: false }), 0, 1.9, 0);
    flame.rotation.x = Math.PI;
    rk.add(flame);
    rk.rotation.z = 0.12;
    g.add(rk);
    c.obstacles.push({ x: PUMP.x - 8.6, z: PUMP.z + 6.5, r: 1.6 });
  }
  // the moon, high behind the board ("to the moon")
  {
    const moon = mesh(new THREE.SphereGeometry(3.2, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff2b8', toneMapped: false }), 6, 17, 14);
    const crater = new THREE.MeshBasicMaterial({ color: '#ead98f', toneMapped: false });
    for (const [x, y, r] of [
      [-1, 1, 0.7],
      [1.2, -0.6, 0.5],
      [-0.2, -1.4, 0.4],
    ])
      moon.add(mesh(new THREE.CircleGeometry(r, 14), crater, x, y, -3.05)).children.at(-1)!.rotation.set(0, Math.PI, 0);
    g.add(moon);
    bob.push({ o: moon, y: 17, ph: 0 });
  }
  // floating SOL coins around the dais
  {
    const face = document.createElement('canvas');
    face.width = face.height = 128;
    const f = face.getContext('2d')!;
    const grad = f.createLinearGradient(0, 128, 128, 0);
    grad.addColorStop(0, PURPLE);
    grad.addColorStop(1, GREEN);
    f.fillStyle = grad;
    f.fillRect(0, 0, 128, 128);
    f.fillStyle = '#0c0820';
    for (const [y, dx] of [
      [36, 8],
      [64, -8],
      [92, 8],
    ]) {
      f.beginPath();
      f.moveTo(30 + dx, y - 9);
      f.lineTo(106 + dx, y - 9);
      f.lineTo(98 - dx, y + 9);
      f.lineTo(22 - dx, y + 9);
      f.fill();
    }
    const ft = new THREE.CanvasTexture(face);
    ft.colorSpace = THREE.SRGBColorSpace;
    const coinM = [new THREE.MeshBasicMaterial({ color: '#2b1d5c', toneMapped: false }), new THREE.MeshBasicMaterial({ map: ft, toneMapped: false }), new THREE.MeshBasicMaterial({ map: ft, toneMapped: false })];
    const coinG = new THREE.CylinderGeometry(0.7, 0.7, 0.14, 24);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const coin = new THREE.Mesh(coinG, coinM);
      coin.position.set(Math.sin(a) * (R + 1.5), 4 + (i % 3) * 1.2, Math.cos(a) * (R + 1.5));
      coin.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.position.copy(coin.position);
      coin.position.set(0, 0, 0);
      holder.add(coin);
      g.add(holder);
      spin.push(holder);
      bob.push({ o: holder, y: holder.position.y, ph: i });
    }
  }
  // blocky bull (green, left) and bear (red, right) guarding the gate
  {
    const beast = (x: number, col: string, bull: boolean) => {
      const b = new THREE.Group();
      b.position.set(x, 0, -R - 2.6);
      b.rotation.y = Math.PI + (x < 0 ? 0.6 : -0.6);
      const m = mat(col, { roughness: 0.6, emissive: col, emissiveIntensity: 0.25 });
      const dk = mat('#160d2e');
      add(mesh(new THREE.BoxGeometry(1.4, 1.1, 2.4), m, 0, 1.5, 0), b);
      for (const [lx, lz] of [
        [-0.45, -0.8],
        [0.45, -0.8],
        [-0.45, 0.8],
        [0.45, 0.8],
      ])
        add(mesh(new THREE.BoxGeometry(0.35, 0.95, 0.35), m, lx, 0.48, lz), b);
      add(mesh(new THREE.BoxGeometry(1, 0.9, 0.9), m, 0, 2.05, 1.4), b);
      add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), dk, -0.25, 2.2, 1.86), b);
      add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), dk, 0.25, 2.2, 1.86), b);
      if (bull) {
        for (const s of [-1, 1]) {
          const horn = mesh(new THREE.ConeGeometry(0.13, 0.7, 8), mat('#fff6d8'), s * 0.62, 2.6, 1.3);
          horn.rotation.z = -s * 0.9;
          add(horn, b);
        }
      } else {
        for (const s of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), m, s * 0.38, 2.6, 1.3), b);
      }
      const plaque = mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: pop(bull ? 'BULL' : 'BEAR'), toneMapped: false }), 0, 0.5, 1.3);
      b.add(plaque);
      g.add(b);
      c.obstacles.push({ x: PUMP.x + x, z: PUMP.z - R - 2.6, r: 1.5 });
    };
    // seen from the path (looking south) +x is on the left: bull left, bear right, beside the gate posts
    beast(7.4, '#14c47f', true);
    beast(-7.4, '#ff4d6d', false);
  }
  // sticker billboards either side of the board (gm, wagmi, Solana + Seeker marks, our mascots)
  {
    const tex2 = stickerWallTexture(1.6, 42, 768);
    for (const x of [-9.6, 9.6]) {
      const bb = new THREE.Group();
      bb.position.set(x, 0.5, 2);
      bb.rotation.y = Math.PI + (x < 0 ? 0.45 : -0.45);
      add(mesh(new THREE.BoxGeometry(0.25, 5, 0.25), frame, 0, 2.5, 0.1), bb);
      add(mesh(new THREE.BoxGeometry(4.2, 2.7, 0.15), frame, 0, 4.4, 0.05), bb);
      // the group is turned to face north, so the picture faces local +z
      bb.add(mesh(new THREE.PlaneGeometry(4, 2.5), new THREE.MeshBasicMaterial({ map: tex2, toneMapped: false }), 0, 4.4, 0.14));
      g.add(bb);
      c.obstacles.push({ x: PUMP.x + x, z: PUMP.z + 2, r: 0.5 });
    }
  }

  // meme wall: the Solana / Seeker stickers, our mascots, gm / wagmi / LFG (moved here from the Quiet Hall)
  {
    const wr = R + 1.6;
    const ww = 7.2;
    const wh = 4.6;
    const angles = [0.42, 0.6, 0.78, 1.22, 1.4, 1.58].map((k) => k * Math.PI); // around the back, open to the gate; the board covers the middle
    angles.forEach((a, i) => {
      const x = Math.sin(a) * wr;
      const z = -Math.cos(a) * wr;
      const w = new THREE.Group();
      w.position.set(x, 0, z); // just outside the dais, on the grass
      w.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); // face the middle of the dais
      add(mesh(new THREE.BoxGeometry(ww + 0.3, wh + 0.3, 0.25), frame, 0, 1.2 + wh / 2, -0.1), w);
      for (const px of [-ww / 2 + 0.3, ww / 2 - 0.3]) add(mesh(new THREE.BoxGeometry(0.25, 1.3, 0.25), frame, px, 0.6, -0.1), w);
      w.add(mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: stickerWallTexture(ww / wh, 11 + i * 12, 1024), toneMapped: false }), 0, 1.2 + wh / 2, 0.04));
      w.add(mesh(new THREE.BoxGeometry(ww + 0.3, 0.1, 0.1), i % 2 ? neonG : neonP, 0, 1.2 + wh + 0.25, 0.05));
      g.add(w);
      for (let k = -1; k <= 1; k++) c.obstacles.push({ x: PUMP.x + x + Math.cos(a) * k * (ww / 3), z: PUMP.z + z + Math.sin(a) * k * (ww / 3), r: 0.9 });
    });
  }

  // ---------- draw the board ----------
  function draw(d: BoardData | null) {
    const W = canvas.width;
    const H = canvas.height;
    const x = ctx2;
    x.fillStyle = '#0c0820';
    x.fillRect(0, 0, W, H);
    // grid
    x.strokeStyle = 'rgba(153,69,255,0.18)';
    x.lineWidth = 2;
    for (let i = 1; i < 10; i++) {
      x.beginPath();
      x.moveTo((i * W) / 10, 0);
      x.lineTo((i * W) / 10, H);
      x.stroke();
    }
    x.textBaseline = 'middle';
    x.font = '64px "Lilita One", system-ui, sans-serif';
    x.fillStyle = GREEN;
    x.textAlign = 'left';
    x.fillText('PUMPHALL', 40, 60);
    x.font = '30px "Lilita One", system-ui, sans-serif';
    x.fillStyle = '#c8b8ff';
    x.textAlign = 'right';
    x.fillText('up or down? · just for fun', W - 40, 62);
    (['SOL', 'SKR'] as const).forEach((k, i) => {
      const y = 175 + i * 185;
      const m = d?.[k];
      x.textAlign = 'left';
      x.font = '56px "Lilita One", system-ui, sans-serif';
      x.fillStyle = '#ffffff';
      x.fillText(k, 40, y);
      x.font = '84px "Lilita One", system-ui, sans-serif';
      const dir = m?.price != null && m.lock != null ? Math.sign(m.price - m.lock) : 0;
      x.fillStyle = dir > 0 ? GREEN : dir < 0 ? RED : '#ffe14d';
      x.fillText(`$${fmtPrice(m?.price ?? null)}`, 190, y);
      x.font = '34px "Lilita One", system-ui, sans-serif';
      x.fillStyle = '#c8b8ff';
      x.fillText(m?.lock != null ? `${dir > 0 ? '▲' : dir < 0 ? '▼' : '='} from $${fmtPrice(m.lock)}` : 'locking…', 190, y + 62);
      x.textAlign = 'right';
      x.fillStyle = '#ffffff';
      x.font = '50px "Lilita One", system-ui, sans-serif';
      x.fillText(m ? fmtLeft(m.left) : '--:--', W - 40, y);
      x.font = '28px "Lilita One", system-ui, sans-serif';
      x.fillStyle = m && m.closes > 0 ? GREEN : '#ff9aa8';
      x.fillText(m ? (m.closes > 0 ? `next round open · ${fmtLeft(m.closes)}` : 'next round: picks closed') : '', W - 40, y + 60);
    });
    x.textAlign = 'center';
    x.font = '30px "Lilita One", system-ui, sans-serif';
    x.fillStyle = '#ffe14d';
    x.fillText('TAP TO PLAY ✦ no money · no prizes · points + leaderboard', W / 2, H - 40);
    tex.needsUpdate = true;
  }
  draw(null);

  return {
    /** redraw the board (call ~1×/s while near) */
    setBoard: draw,
    update(t: number) {
      for (const o of spin) o.rotation.y = t * 1.4;
      for (const b of bob) b.o.position.y = b.y + Math.sin(t * 1.1 + b.ph) * 0.35;
      flame.scale.set(1 + Math.sin(t * 23) * 0.08, 1 + Math.sin(t * 17) * 0.2, 1);
      for (const cd of candles) cd.m.scale.y = cd.base * (1 + 0.08 * Math.sin(t * 1.3 + cd.ph));
      for (const p of pads) (p.material as THREE.MeshBasicMaterial).opacity = p.geometry === padGeo ? 0.45 + 0.2 * Math.sin(t * 3) : 1;
    },
  };
}
