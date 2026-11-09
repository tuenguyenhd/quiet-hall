// Shared world layout (pure data, no three.js) so the client, tests and the server agree on spots.

// The world was doubled in width (4x the area) on 2026-11-09: places sit twice as far out and are ~1.35x bigger.
export const LAKE = { x: -90, z: 50, rx: 18, rz: 13 };
export const GARDEN = { x: 80, z: 44, w: 18, d: 11 }; // raked bed centre + size
export const GROVE = { x: -90, z: -56, r: 15 };
export const TEA = { x: 80, z: -44, w: 7, d: 6, h: 0.45 };
export const LOOKOUT = { x: 0, z: -140, r: 22, h: 9 };
/** Main hall: centre z, half width, half depth, floor height. Front edge at z = -10. */
export const HALL = { z: -26, hw: 22, hd: 16, h: 0.9 };
/** Courtyard in front of the hall (where you arrive). */
export const COURT = { x: 0, z: 14, r: 22 };
export const BELL = { x: 30, z: 4 };
export const BOUNDS = 164;
/** Far rim where the ground rises into hills. */
export const RIM = 176;

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
/** Cushions in the Main Hall (the first 24, nearest the altar, are the Founder Cushions). */
export const HALL_CUSHIONS = 48;

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
  { id: 'hall', name: 'Main Hall', x: 0, z: HALL.z, r: 24, hint: 'Tap a cushion to sit with others.', view: [0, HALL.z + HALL.hd - 4], look: [0, HALL.z] },
  { id: 'court', name: 'Courtyard', x: COURT.x, z: COURT.z, r: COURT.r, hint: 'Paths lead to the lake, the garden, the grove and the tea house.', view: [0, COURT.z + 26], look: [0, COURT.z - 10] },
  { id: 'lake', name: 'Lake', x: LAKE.x, z: LAKE.z, r: 23, hint: 'Sit at the end of the dock and listen to the water.', view: view(LAKE.x, LAKE.z, 20, -8), look: [LAKE.x, LAKE.z] },
  { id: 'garden', name: 'Stone Garden', x: GARDEN.x, z: GARDEN.z, r: 16, hint: 'Sit on a bench and follow the raked lines.', view: view(GARDEN.x, GARDEN.z, 0, 13.5), look: [GARDEN.x, GARDEN.z] },
  { id: 'grove', name: 'Maple Grove', x: GROVE.x, z: GROVE.z, r: 16, hint: 'Rest on the bench or the swing under the maples.', view: view(GROVE.x, GROVE.z, -3.4, 0.8), look: [GROVE.x - 14, GROVE.z + 2] },
  { id: 'tea', name: 'Tea House', x: TEA.x, z: TEA.z, r: 8, hint: 'Sit by the low table. The kettle is warm.', view: view(TEA.x, TEA.z, -7, 0.8), look: [TEA.x, TEA.z] },
  { id: 'lookout', name: 'Lookout', x: LOOKOUT.x, z: LOOKOUT.z, r: 15, hint: 'One rock above the whole valley. Sit and watch the trees and the sky.', view: [0, LOOKOUT.z - 6], look: [0, -30] },
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
    const r = GROVE.r * (0.4 + 0.58 * Math.sqrt(i / (TREE_COUNT - 1)));
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
/** All pets cost the same. `legend` (optional) = limited supply, numbered #n / supply. None are limited now. */
export const PETS: readonly { key: string; name: string; emoji: string; legend?: number }[] = [
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
];

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

/**
 * Prices anchored in SOL (what Seeker owners hold). USDC / SKR amounts follow the live SOL price.
 * Ladder by scarcity and visibility: temporary < unlimited permanent < 108 stones < 64 trees < 6 banners < 24 cushions.
 */
export const PRICE_SOL = {
  bless24: 0.015,
  lantern24: 0.02,
  lantern7d: 0.06,
  pet: 0.035,
  stone: 0.25,
  tree: 0.4,
  banner: 0.75, // per 30 days
  cushion: 2,
} as const;
export type PricedKind = keyof typeof PRICE_SOL;

/** Scarce things you can own (or rent) at a fixed place in the world. */
export const SPOTS = {
  stone: { count: 108, label: 'Stone', place: 'Stone Garden', nft: true },
  tree: { count: 64, label: 'Tree', place: 'Maple Grove', nft: true },
  cushion: { count: 24, label: 'Founder Cushion', place: 'Main Hall', nft: true },
  banner: { count: 6, label: 'Patron Banner', place: 'Hall front', nft: false },
} as const;
export type SpotKind = keyof typeof SPOTS;
/** Patron banners are rented: this many days per payment. */
export const BANNER_DAYS = 30;

/** "Coming soon" areas at the edge of the world (fenced off, with a sign). Shared so scenery stays clear of them. */
export const TEASERS = [
  {
    id: 'island',
    emoji: '🏝',
    name: 'Lotus Island',
    x: LAKE.x - LAKE.rx * 0.5,
    z: LAKE.z - LAKE.rz * 0.25,
    r: 4,
    text: 'Lotus Island opens in Season 2: lotus lanterns, a floating tea deck and 108 lotus spots. Founders and Patrons hear first.',
  },
  {
    id: 'shrine',
    emoji: '⛩',
    name: 'Sky Shrine',
    x: LOOKOUT.x,
    z: LOOKOUT.z - LOOKOUT.r - 6,
    r: 6,
    text: 'The Sky Shrine stairway is being built: a sunrise sit above the clouds for the whole hall. Coming soon.',
  },
  {
    id: 'market',
    emoji: '🏮',
    name: 'Night Market',
    x: 112,
    z: 0,
    r: 10,
    text: 'The Night Market is being set up: stalls for pets, lanterns and frens from other Solana projects. Coming soon.',
  },
] as const;
