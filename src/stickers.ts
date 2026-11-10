// Sticker-bomb wall art for the hall: the Solana + Seeker marks (official paths), our own mascots
// (Shibu, Froggo, Kitty, Capy, Degen) drawn in code, crypto-culture word stickers and emoji.
// No third-party mascots or project logos (those need permission).
import * as THREE from 'three';
import { SEEKER_ARC, SEEKER_S, SOLANA_MARK } from './brand-marks';
import { NEAR_BUILD, NEAR_MARK } from './near-mark';

const INK = '#160d2e';
const FONT = '"Lilita One", system-ui, sans-serif';
const WORDS = ['gm', 'wagmi', 'LFG', 'gm ser', 'few understand', 'touch grass', 'just breathe', 'hodl calm', 'sit together', 'wen zen', '1000x calm', 'probably nothing', 'ngmi → gmi', 'stay based'];
const EMOJI = ['🚀', '💎', '🙌', '🌕', '⚡', '🍵', '🔥', '🌈', '🧘', '☀️', '🪷', '🏮'];
const PASTEL = ['#ffe14d', '#ff9ad5', '#14f195', '#5ad1ff', '#c6a6ff', '#ffb36b', '#fffaf0'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** white sticker edge + ink outline around whatever `shape` traces */
function sticker(g: CanvasRenderingContext2D, shape: () => void, fill: string | CanvasGradient, size: number) {
  shape();
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.lineWidth = size * 0.05;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
}

function solana(g: CanvasRenderingContext2D, s: number) {
  sticker(g, () => {
    g.beginPath();
    g.roundRect(-s * 0.62, -s * 0.5, s * 1.24, s, s * 0.18);
  }, '#120b24', s);
  const k = (s * 0.9) / 397.7;
  g.save();
  g.translate(-s * 0.45, -s * 0.35);
  g.scale(k, k);
  const gr = g.createLinearGradient(0, 311, 397, 0);
  gr.addColorStop(0, '#9945ff');
  gr.addColorStop(1, '#14f195');
  g.fillStyle = gr;
  for (const d of SOLANA_MARK) g.fill(new Path2D(d));
  g.restore();
}

function seeker(g: CanvasRenderingContext2D, s: number) {
  sticker(g, () => {
    g.beginPath();
    g.arc(0, 0, s * 0.55, 0, Math.PI * 2);
  }, '#0e1b16', s);
  const k = (s * 0.85) / 120;
  g.save();
  g.scale(k, k);
  g.translate(-200, -379);
  g.fillStyle = '#e8ffe3';
  g.fill(new Path2D(SEEKER_S));
  g.strokeStyle = '#14f195';
  g.lineWidth = 6;
  g.stroke(new Path2D(SEEKER_ARC));
  g.restore();
}

/** NEAR edition: the NEAR mark on its own sticker, unaltered (white on black, or black on white) */
function near(g: CanvasRenderingContext2D, s: number, light: boolean) {
  sticker(g, () => {
    g.beginPath();
    g.roundRect(-s * 0.5, -s * 0.5, s, s, s * 0.22);
  }, light ? '#ffffff' : '#000000', s);
  const k = (s * 0.6) / 24;
  g.save();
  g.translate(-s * 0.3, -s * 0.3);
  g.scale(k, k);
  g.fillStyle = light ? '#000000' : '#ffffff';
  g.fill(new Path2D(NEAR_MARK));
  g.restore();
}

function word(g: CanvasRenderingContext2D, s: number, text: string, bg: string) {
  g.font = `400 ${Math.round(s * 0.42)}px ${FONT}`;
  const w = g.measureText(text).width + s * 0.5;
  sticker(g, () => {
    g.beginPath();
    g.roundRect(-w / 2, -s * 0.32, w, s * 0.64, s * 0.32);
  }, bg, s);
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, s * 0.03);
}

function emoji(g: CanvasRenderingContext2D, s: number, e: string, bg: string) {
  sticker(g, () => {
    g.beginPath();
    g.arc(0, 0, s * 0.45, 0, Math.PI * 2);
  }, bg, s);
  g.font = `${Math.round(s * 0.55)}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, 0, s * 0.04);
}

/** our mascots' faces, drawn with shapes */
function fren(g: CanvasRenderingContext2D, s: number, kind: number) {
  const r = s * 0.42;
  const head = (col: string) =>
    sticker(g, () => {
      g.beginPath();
      g.ellipse(0, 0, r * (kind === 1 ? 1.25 : 1), r * (kind === 1 ? 0.85 : 1), 0, 0, Math.PI * 2);
    }, col, s);
  const dot = (x: number, y: number, rr: number, col = INK) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, rr, 0, Math.PI * 2);
    g.fill();
  };
  const ears = (col: string) => {
    g.fillStyle = col;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * r * 0.85, -r * 0.35);
      g.lineTo(sx * r * 0.55, -r * 1.25);
      g.lineTo(sx * r * 0.2, -r * 0.8);
      g.closePath();
      g.lineWidth = s * 0.04;
      g.strokeStyle = INK;
      g.stroke();
      g.fill();
    }
  };
  if (kind === 0) {
    // Shibu: orange, cream muzzle, pixel shades
    ears('#e08a3c');
    head('#e08a3c');
    g.fillStyle = '#fbe8cf';
    g.beginPath();
    g.ellipse(0, r * 0.35, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    dot(0, r * 0.15, r * 0.12);
    g.fillStyle = INK;
    g.fillRect(-r * 0.75, -r * 0.3, r * 1.5, r * 0.12);
    g.fillRect(-r * 0.7, -r * 0.3, r * 0.55, r * 0.32);
    g.fillRect(r * 0.15, -r * 0.3, r * 0.55, r * 0.32);
  } else if (kind === 1) {
    // Froggo: wide green head, eyes on top, big smile
    head('#7cc56a');
    for (const sx of [-1, 1]) {
      dot(sx * r * 0.5, -r * 0.7, r * 0.32, '#7cc56a');
      dot(sx * r * 0.5, -r * 0.7, r * 0.22, '#fff');
      dot(sx * r * 0.5, -r * 0.66, r * 0.11);
    }
    g.strokeStyle = '#5a2a2e';
    g.lineWidth = s * 0.04;
    g.beginPath();
    g.arc(0, 0, r * 0.7, 0.2, Math.PI - 0.2);
    g.stroke();
  } else if (kind === 2) {
    // Kitty: grey, pointy ears, green eyes
    ears('#b9b3c9');
    head('#b9b3c9');
    for (const sx of [-1, 1]) {
      dot(sx * r * 0.38, -r * 0.05, r * 0.16, '#c6f25a');
      g.fillStyle = INK;
      g.fillRect(sx * r * 0.38 - r * 0.03, -r * 0.2, r * 0.06, r * 0.3);
    }
    dot(0, r * 0.3, r * 0.08, '#f6b4c4');
  } else if (kind === 3) {
    // Capy: brown, big snout, orange on top
    head('#a3743f');
    g.fillStyle = '#7c5530';
    g.beginPath();
    g.ellipse(0, r * 0.35, r * 0.6, r * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    for (const sx of [-1, 1]) dot(sx * r * 0.45, -r * 0.2, r * 0.1);
    dot(0, -r * 1.05, r * 0.3, '#ff9a1f');
  } else {
    // Degen: block head, laser eyes
    sticker(g, () => {
      g.beginPath();
      g.roundRect(-r * 0.85, -r * 0.9, r * 1.7, r * 1.8, r * 0.15);
    }, '#e9b48a', s);
    g.fillStyle = INK;
    g.fillRect(-r * 0.85, -r * 0.9, r * 1.7, r * 0.45);
    for (const sx of [-1, 1]) {
      dot(sx * r * 0.38, 0, r * 0.13, '#ff2a2a');
      g.strokeStyle = 'rgba(255,42,42,0.9)';
      g.lineWidth = r * 0.12;
      g.beginPath();
      g.moveTo(sx * r * 0.38, 0);
      g.lineTo(sx * r * 0.38 + sx * r * 1.6, r * 0.5);
      g.stroke();
    }
    g.fillStyle = INK;
    g.fillRect(-r * 0.3, r * 0.45, r * 0.6, r * 0.1);
  }
}

/** A sticker-bombed wall texture; `aspect` = width / height of the surface. */
export function stickerWallTexture(aspect: number, seed: number, px = 1536) {
  const W = px;
  const H = Math.round(px / aspect);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const draw = () => {
    const R = rng(seed);
    g.fillStyle = '#f3ead8';
    g.fillRect(0, 0, W, H);
    const unit = Math.min(H * 0.32, W * 0.12);
    const cols = Math.ceil(W / (unit * 1.05));
    const rows = Math.ceil(H / (unit * 0.95));
    let n = 0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const s = unit * (0.75 + R() * 0.55);
        g.save();
        g.translate((x + 0.5 + (R() - 0.5) * 0.5) * (W / cols), (y + 0.5 + (R() - 0.5) * 0.4) * (H / rows));
        g.rotate((R() - 0.5) * 0.7);
        const pick = n++ % 9;
        if (pick === 0) (NEAR_BUILD ? near(g, s * 0.9, false) : solana(g, s * 1.1));
        else if (pick === 4) (NEAR_BUILD ? near(g, s * 0.8, true) : seeker(g, s));
        else if (pick === 1 || pick === 6) fren(g, s, Math.floor(R() * 5));
        else if (pick === 2 || pick === 7) word(g, s * 0.9, WORDS[Math.floor(R() * WORDS.length)], PASTEL[Math.floor(R() * PASTEL.length)]);
        else emoji(g, s * 0.85, EMOJI[Math.floor(R() * EMOJI.length)], PASTEL[Math.floor(R() * PASTEL.length)]);
        g.restore();
      }
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  document.fonts?.load(`400 60px ${FONT}`).then(() => {
    draw();
    t.needsUpdate = true;
  });
  return t;
}
