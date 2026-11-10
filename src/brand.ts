// "Built on Solana" + "on Seeker" temple banners beside the hall steps.
// Official marks are drawn unaltered (own colours, no stretch, no effects) on a plain dark field with clear space,
// each on its own banner (never combined with the Quiet Hall mark). Unlit material so lighting never tints them.
import * as THREE from 'three';
import { SEEKER_S, SOLANA_MARK, SOLANA_MOBILE_WORDMARK } from './brand-marks';
import { NEAR_BUILD, NEAR_MARK } from './near-mark';

const W = 512;
const H = 1280;
const FIELD = '#120b24';

function base(g: CanvasRenderingContext2D) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = FIELD;
  g.beginPath();
  g.roundRect(0, 0, W, H, 36);
  g.fill();
  // banner tails (cut-out "swallowtail") stay outside the logo area
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(W / 2 - 90, H);
  g.lineTo(W / 2, H - 110);
  g.lineTo(W / 2 + 90, H);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

function text(g: CanvasRenderingContext2D, s: string, y: number, size: number, color: string) {
  g.fillStyle = color;
  g.textAlign = 'center';
  g.font = `400 ${size}px "Lilita One", system-ui, sans-serif`;
  g.fillText(s, W / 2, y);
}

function drawSolana(g: CanvasRenderingContext2D) {
  base(g);
  text(g, 'built on', 210, 64, '#ffffff');
  // logomark, 320 px wide, aspect kept (397.7 x 311.7)
  const s = 320 / 397.7;
  g.save();
  g.translate((W - 320) / 2, 330);
  g.scale(s, s);
  const grad = g.createLinearGradient(360.88, 351.46, 141.21, -69.29); // official gradient axis
  grad.addColorStop(0, '#00FFA3');
  grad.addColorStop(1, '#DC1FFF');
  g.fillStyle = grad;
  for (const d of SOLANA_MARK) g.fill(new Path2D(d));
  g.restore();
  text(g, 'Solana', 790, 96, '#ffffff');
  text(g, 'fast · cheap · on-chain', 870, 34, '#b9b2cc');
}

function drawSeeker(g: CanvasRenderingContext2D) {
  base(g);
  text(g, 'made for', 210, 64, '#ffffff');
  // Seeker S mark: design box (174,347) ~48.5 x 64 -> 240 px tall, aspect kept
  const s = 240 / 64;
  g.save();
  g.translate(W / 2 - (174 + 48.5 / 2) * s, 300 - 347 * s);
  g.scale(s, s);
  g.fillStyle = '#ffffff';
  g.fill(new Path2D(SEEKER_S));
  g.restore();
  text(g, 'Seeker', 680, 96, '#ffffff');
  // "SOLANA ≡ MOBILE" wordmark in its fixed #B4B4B4, box (140.4,671) 119.2 x 10 -> 380 px wide
  const w = 380 / 119.2;
  g.save();
  g.translate((W - 380) / 2 - 140.4 * w, 760 - 671 * w);
  g.scale(w, w);
  g.fillStyle = '#B4B4B4';
  for (const d of SOLANA_MOBILE_WORDMARK) g.fill(new Path2D(d));
  g.restore();
  text(g, 'dApp Store', 900, 40, '#b9b2cc');
}

/** NEAR edition: the NEAR mark, white on the dark field, unaltered and on its own (src/near-mark.ts) */
function nearMark(g: CanvasRenderingContext2D, y: number, size: number) {
  const s = size / 24;
  g.save();
  g.translate((W - size) / 2, y);
  g.scale(s, s);
  g.fillStyle = '#ffffff';
  g.fill(new Path2D(NEAR_MARK));
  g.restore();
}

function drawNearBuilt(g: CanvasRenderingContext2D) {
  base(g);
  text(g, 'built on', 210, 64, '#ffffff');
  nearMark(g, 300, 300);
  text(g, 'NEAR', 760, 96, '#ffffff');
  text(g, 'rescues · crafts · trophies', 840, 32, '#b9b2cc');
}

function drawNearProof(g: CanvasRenderingContext2D) {
  base(g);
  text(g, 'checked on', 210, 64, '#ffffff');
  nearMark(g, 300, 300);
  text(g, 'NEAR', 760, 96, '#ffffff');
  text(g, 'prices · Cup proofs', 840, 32, '#b9b2cc');
}

function bannerTexture(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  draw(g);
  // redraw once the display font is ready (marks are vectors and don't depend on it)
  document.fonts?.load('64px "Lilita One"').then(() => {
    draw(g);
    tex.needsUpdate = true;
  });
  return tex;
}

export function addBrandBanners(
  scene: THREE.Scene,
  obstacles: { x: number; z: number; r: number }[],
  groundY: (x: number, z: number) => number,
  spots: { x: number; z: number; ry: number }[],
) {
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3a28', roughness: 0.8 });
  const poleG = new THREE.CylinderGeometry(0.07, 0.08, 5.6, 8);
  const barG = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6);
  const plane = new THREE.PlaneGeometry(1.5, 3.75);
  const kinds = NEAR_BUILD ? [drawNearBuilt, drawNearProof] : [drawSolana, drawSeeker];
  spots.forEach((p, i) => {
    const g = new THREE.Group();
    g.position.set(p.x, groundY(p.x, p.z), p.z);
    g.rotation.y = p.ry;
    const pole = new THREE.Mesh(poleG, wood);
    pole.position.set(-0.85, 2.8, 0);
    pole.castShadow = true;
    const bar = new THREE.Mesh(barG, wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0.02, 5.25, 0);
    const mat = new THREE.MeshBasicMaterial({ map: bannerTexture(kinds[i % 2]), transparent: true, alphaTest: 0.5, toneMapped: false });
    // two single-sided faces so the back never shows a mirrored logo
    const front = new THREE.Mesh(plane, mat);
    front.position.set(0, 3.3, 0.012);
    const back = new THREE.Mesh(plane, mat);
    back.position.set(0, 3.3, -0.012);
    back.rotation.y = Math.PI;
    g.add(pole, bar, front, back);
    scene.add(g);
    obstacles.push({ x: p.x, z: p.z, r: 0.5 });
  });
}
