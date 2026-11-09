// PumpHall: the "degen" side of the valley, at the end of the south path. A neon dais with candlestick
// sculptures and a big live board (SOL / SKR price, round timer). Tap the board or the pads to play
// the fun-only "up or down?" game. No money, no prizes.
import * as THREE from 'three';
import { add, mat, mesh } from './build';
import { PUMP } from './layout';

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
  board.position.set(0, 0.5, 3.5);
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
    [-3, GREEN, true],
    [3, RED, false],
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
      for (const cd of candles) cd.m.scale.y = cd.base * (1 + 0.08 * Math.sin(t * 1.3 + cd.ph));
      for (const p of pads) (p.material as THREE.MeshBasicMaterial).opacity = p.geometry === padGeo ? 0.45 + 0.2 * Math.sin(t * 3) : 1;
    },
  };
}
