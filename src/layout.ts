// Shared world layout (pure data, no three.js) so the client, tests and the server agree on spots.

export const LAKE = { x: -45, z: 25, rx: 13, rz: 9.5 };
export const GARDEN = { x: 40, z: 22, w: 13, d: 8 }; // raked bed centre + size
export const GROVE = { x: -45, z: -28, r: 11 };
export const TEA = { x: 40, z: -22, w: 7, d: 6, h: 0.45 };
export const LOOKOUT = { x: 0, z: -70, r: 15, h: 6 };
/** Main hall: centre z, half width, half depth, floor height. Front edge at z = -5. */
export const HALL = { z: -13, hw: 11, hd: 8, h: 0.7 };
export const BELL = { x: 15, z: 2 };
export const BOUNDS = 82;
/** Far rim where the ground rises into hills. */
export const RIM = 88;

/** Characters you can walk as (free pick; original designs). Network colour index = species * 8 + light. */
export const SPECIES = [
  { id: 'monk', name: 'Monk', emoji: '🧘' },
  { id: 'shiba', name: 'Shibu', emoji: '🐕' },
  { id: 'frog', name: 'Froggo', emoji: '🐸' },
  { id: 'cat', name: 'Kitty', emoji: '🐱' },
  { id: 'capy', name: 'Capy', emoji: '🦫' },
  { id: 'guy', name: 'Guy', emoji: '🧑' },
  { id: 'girl', name: 'Girl', emoji: '👩' },
  { id: 'degen', name: 'Degen', emoji: '🎲' },
] as const;
/** Order on the welcome card (humans first; index into SPECIES). */
export const SPECIES_ORDER = [7, 0, 1, 2, 3, 4]; // Guy/Girl (5, 6) kept for old saves, not offered
export const LIGHT_COUNT = 8;

export const STONE_COUNT = 108;
export const TREE_COUNT = 64;

export interface PlaceInfo {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  hint: string;
  /** a good spot to stand and what to look at (for ?at= and screenshots) */
  view: [number, number];
  look: [number, number];
}

const view = (x: number, z: number, dx: number, dz: number) => [x + dx, z + dz] as [number, number];
export const PLACES: PlaceInfo[] = [
  { id: 'hall', name: 'Main Hall', x: 0, z: HALL.z, r: 13, hint: 'Tap a cushion to sit with others.', view: [0, -3], look: [0, HALL.z] },
  { id: 'court', name: 'Courtyard', x: 0, z: 6, r: 11, hint: 'Paths lead to the lake, the garden, the grove and the tea house.', view: [0, 22], look: [0, -2] },
  { id: 'lake', name: 'Lake', x: LAKE.x, z: LAKE.z, r: 17, hint: 'Sit at the end of the dock and listen to the water.', view: view(LAKE.x, LAKE.z, 14.5, -6), look: [LAKE.x, LAKE.z] },
  { id: 'garden', name: 'Stone Garden', x: GARDEN.x, z: GARDEN.z, r: 12, hint: 'Sit on a bench and follow the raked lines.', view: view(GARDEN.x, GARDEN.z, 0, 10.5), look: [GARDEN.x, GARDEN.z] },
  { id: 'grove', name: 'Maple Grove', x: GROVE.x, z: GROVE.z, r: 12, hint: 'Rest on the bench or the swing under the maples.', view: view(GROVE.x, GROVE.z, -2.6, 0.6), look: [GROVE.x - 12, GROVE.z + 2] },
  { id: 'tea', name: 'Tea House', x: TEA.x, z: TEA.z, r: 7, hint: 'Sit by the low table. The kettle is warm.', view: view(TEA.x, TEA.z, -6.2, 0.8), look: [TEA.x, TEA.z] },
  { id: 'lookout', name: 'Lookout', x: LOOKOUT.x, z: LOOKOUT.z, r: 11, hint: 'One rock above the whole valley. Sit and watch the trees and the sky.', view: [0, LOOKOUT.z - 5], look: [0, -16] },
];

export function placeAt(x: number, z: number): PlaceInfo | null {
  let best: PlaceInfo | null = null;
  let bd = Infinity;
  for (const p of PLACES) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r && d / p.r < bd) {
      bd = d / p.r;
      best = p;
    }
  }
  return best;
}

/** 108 stone spots in two rings around the raked bed (deterministic). */
export function stoneSpots(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const [off, n] of [
    [1.3, 54],
    [2.4, 54],
  ] as const) {
    const hw = GARDEN.w / 2 + off;
    const hd = GARDEN.d / 2 + off;
    const per = 4 * (hw + hd);
    for (let i = 0; i < n; i++) {
      let s = ((i + (off > 2 ? 0.5 : 0)) / n) * per;
      let x: number;
      let z: number;
      if (s < 2 * hw) [x, z] = [-hw + s, -hd];
      else if ((s -= 2 * hw) < 2 * hd) [x, z] = [hw, -hd + s];
      else if ((s -= 2 * hd) < 2 * hw) [x, z] = [hw - s, hd];
      else [x, z] = [-hw, hd - (s - 2 * hw)];
      out.push({ x: GARDEN.x + x, z: GARDEN.z + z });
    }
  }
  return out;
}

/** 64 tree spots in a sunflower pattern around the grove clearing (deterministic). */
export function treeSpots(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < TREE_COUNT; i++) {
    const r = 4.4 + 6.4 * Math.sqrt(i / (TREE_COUNT - 1));
    const a = i * 2.39996323;
    out.push({ x: GROVE.x + Math.cos(a) * r, z: GROVE.z + Math.sin(a) * r });
  }
  return out;
}

/** Preset lantern wishes (no free text to moderate). Shared by app and server. */
export const WISHES = ['peace', 'thank you', 'for Mom', 'for Dad', 'for a friend', 'healing', 'new beginnings', 'I miss you', 'gm', 'wagmi'];
/** Preset lines for stones and trees. */
export const LINES = ['in loving memory', 'happy birthday', 'thank you', 'for my family', 'stay calm', 'gm, always', 'we made it', 'just breathe'];

/** A name on a lantern / stone / tree: letters, spaces, apostrophes, hyphens; max 16 characters. */
export function cleanName(s: unknown) {
  if (typeof s !== 'string') return '';
  const t = s
    .normalize('NFC')
    .replace(/[^\p{L}\p{M} '\-]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1') // no "zalgo" stacks: at most 2 marks per letter
    .replace(/^\p{M}+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(t).slice(0, 16).join('').trim(); // cut by characters, never inside a surrogate pair
}

/** Pets that follow you (bought once, yours forever; everyone sees them). Index 0 = no pet. Shared by app and server. */
export const PETS = [
  { key: 'none', name: 'No pet', emoji: '✕' },
  { key: 'shiba', name: 'Shiba', emoji: '🐕' },
  { key: 'husky', name: 'Husky', emoji: '🐺' },
  { key: 'frog', name: 'Frog', emoji: '🐸' },
  { key: 'turtle', name: 'Turtle', emoji: '🐢' },
  { key: 'slime', name: 'Ice Slime', emoji: '🍦' },
  { key: 'hamster', name: 'Hamster', emoji: '🐹' },
  { key: 'teddy', name: 'Teddy', emoji: '🧸' },
  { key: 'sharpei', name: 'Shar Pei', emoji: '🐶' },
  { key: 'bulldog', name: 'Bulldog', emoji: '🐕' },
  { key: 'stripe', name: 'Stripe', emoji: '🐱' },
  { key: 'dragon', name: 'Baby Dragon', emoji: '🐉' },
  { key: 'chick', name: 'Chick', emoji: '🐣' },
  { key: 'tiger', name: 'Tiger', emoji: '🐯' },
  { key: 'duck', name: 'Chip Duck', emoji: '🦆' },
  { key: 'penguin', name: 'Penguin', emoji: '🐧' },
  { key: 'axolotl', name: 'Axolotl', emoji: '🦎' },
] as const;

/** Blessings from the resident frens (index = fren). Free 1 h once a day; paid 24 h. Cosmetic only. */
export const BLESS = [
  { fren: 'Shibu', color: '#ffb347', word: 'much bless' },
  { fren: 'Froggo', color: '#14f195', word: 'pond bless' },
  { fren: 'Capy', color: '#ff9a1f', word: 'chill bless' },
  { fren: 'Kitty', color: '#ff9ad5', word: 'nap bless' },
  { fren: 'Shibu jr', color: '#ffe36e', word: 'smol bless' },
  { fren: 'Old Monk', color: '#c6a6ff', word: 'wise bless' },
  { fren: 'Froggo II', color: '#7ad7ff', word: 'grove bless' },
] as const;
/** Free taste: 1 minute (verified Seeker owners: 10 minutes). Paid: 24 h. */
export const BLESS_FREE_MS = 60000;
export const FREE_SEEKER_MS = 600000;
/** Free lantern: 1 minute (Seeker owners 10 min). */
export const LANTERN_FREE_MS = 60000;
export const BLESS_PAID_MS = 86400000;
