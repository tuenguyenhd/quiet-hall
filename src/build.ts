// Small helpers shared by the world and the places.
import * as THREE from 'three';

export function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export const mat = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...o });

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  return me;
}

/** Adds `o` to `parent`, setting shadow flags on every mesh inside. */
export function add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D, cast = true, recv = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = recv;
    }
  });
  parent.add(o);
  return o;
}

// cheap smooth value noise (deterministic)
function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, z: number) => noise(x, z) * 0.6 + noise(x * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, z * 4.3) * 0.1;

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from point to segment (2D). */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Canvas-text board for signposts. Text shrinks to fit the widest line; redrawn once the font has loaded. */
export function textTexture(lines: string[], w = 512, h = 128, bg = '#7a5a3f', fg = '#f6efdc', family = '"Lilita One", system-ui, sans-serif') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rowH = h / lines.length;
  const draw = () => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let y = 10; y < h; y += 18) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + 4);
      g.stroke();
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fs = Math.round(rowH * 0.58);
    const setFont = () => (g.font = `400 ${fs}px ${family}`);
    setFont();
    while (fs > 12 && Math.max(...lines.map((l) => g.measureText(l).width)) > w * 0.86) {
      fs -= 2;
      setFont();
    }
    lines.forEach((l, i) => g.fillText(l, w / 2, rowH * (i + 0.53)));
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  document.fonts?.load(`400 ${Math.round(rowH * 0.58)}px ${family}`).then(() => {
    draw();
    t.needsUpdate = true;
  });
  return t;
}
