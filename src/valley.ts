// Meme Valley, NEAR build: pure data shared by client, Worker and tests.
// Design: design/gdd/meme-valley.md and edition-near.md ("frozen scope"). Change numbers here, not in logic.
// Placement: north-east of the Tea House (the world is a disc of radius BOUNDS; the Lookout already sits at its north edge).

export const VALLEY = { x: 100, z: -90, r: 22 };
/** the Gate: signpost, workbench, starter Moon Rocks and Shibby */
export const GATE = { x: 84, z: -74 };
export const WORKBENCH = { x: 80, z: -78 };
/** a small pond (Wen Moon Lake) and the cave mouth (Copium Caves) */
export const POND = { x: 104, z: -84, r: 5 };
export const CAVES = { x: 114, z: -102, r: 7 };

export type Item = 'moon_rock' | 'rug_yarn' | 'copium_shroom' | 'moon_collar';
export const ITEMS: Record<Item, { name: string; emoji: string }> = {
  moon_rock: { name: 'Moon Rock', emoji: '🪨' },
  rug_yarn: { name: 'Rug Yarn', emoji: '🧶' },
  copium_shroom: { name: 'Copium Shroom', emoji: '🍄' },
  moon_collar: { name: 'Moon Collar', emoji: '📿' },
};

export interface Node {
  id: string;
  item: Exclude<Item, 'moon_collar'>;
  x: number;
  z: number;
  /** personal stock ceiling */
  max: number;
  /** game minutes per unit of regrowth */
  regrowMin: number;
}
export const NODES: Node[] = [
  { id: 'gate-rock-1', item: 'moon_rock', x: 87, z: -78, max: 4, regrowMin: 5 },
  { id: 'gate-rock-2', item: 'moon_rock', x: 81, z: -72, max: 4, regrowMin: 5 },
  { id: 'gate-yarn', item: 'rug_yarn', x: 78, z: -82, max: 3, regrowMin: 8 },
  { id: 'pond-rock-1', item: 'moon_rock', x: 98, z: -80, max: 4, regrowMin: 5 },
  { id: 'pond-rock-2', item: 'moon_rock', x: 110, z: -86, max: 4, regrowMin: 5 },
  { id: 'cave-shroom-1', item: 'copium_shroom', x: 108, z: -100, max: 3, regrowMin: 8 },
  { id: 'cave-shroom-2', item: 'copium_shroom', x: 112, z: -108, max: 3, regrowMin: 8 },
  { id: 'cave-shroom-3', item: 'copium_shroom', x: 120, z: -98, max: 3, regrowMin: 8 },
  { id: 'cave-shroom-4', item: 'copium_shroom', x: 116, z: -94, max: 3, regrowMin: 8 },
];
export const nodeById = (id: unknown) => NODES.find((n) => n.id === id);

export type Fren = 'shibby' | 'froggo';
export interface FrenInfo {
  id: Fren;
  name: string;
  x: number;
  z: number;
  /** the wish: materials + sit beside it for `sitMin` game minutes */
  wish: Partial<Record<Item, number>>;
  sitMin: number;
  line: string;
  /** index into PETS: the model a rescued fren uses when it follows you */
  pet: number;
}
/** NEAR build: both frens are always present (edition-near.md, FRENS_PRESENT) */
export const FRENS: FrenInfo[] = [
  { id: 'shibby', name: 'Shibby', x: 90, z: -80, wish: { moon_rock: 2 }, sitMin: 1, line: 'wen home? I lost my map... bring me 2 Moon Rocks and sit with me a while?', pet: 1 },
  { id: 'froggo', name: 'Froggo', x: 106, z: -90, wish: { copium_shroom: 1 }, sitMin: 1, line: 'it is so loud out here. one Copium Shroom and a quiet minute, please.', pet: 3 },
];
export const frenById = (id: unknown) => FRENS.find((f) => f.id === id);

export interface Recipe {
  id: 'moon_collar';
  name: string;
  needs: Partial<Record<Item, number>>;
  fee: number;
  slot: 'neck';
}
export const RECIPES: Recipe[] = [{ id: 'moon_collar', name: 'Moon Collar', needs: { moon_rock: 3, rug_yarn: 1 }, fee: 10, slot: 'neck' }];
export const recipeById = (id: unknown) => RECIPES.find((r) => r.id === id);

export const GATHER = {
  /** metres: how close you must stand to a node / fren / workbench (server adds TOLERANCE) */
  reach: 2.5,
  coRescueRadius: 3,
  tolerance: 1,
  /** real ms between two picks by one player (server-timed) */
  pickMs: 1000,
  dailyLimit: 40,
  bagSlots: 24,
  stack: 20,
};
export const WISH_REWARD = 10;

export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
