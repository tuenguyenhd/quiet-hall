// Kettle's Living Market and the Market Cup (NEAR edition). Pure data shared by client, Worker and tests.
// Design: design/gdd/edition-near.md, "Core Rules: NEAR economy" A–E and Formulas. Change numbers here, not in logic.
import { PUMP } from './layout';
import type { Item } from './valley';

/** Kettle's stall inside the Trading Hall (the PumpHall building in the other editions): left side, clear of the board */
export const KETTLE = { x: PUMP.x - 9, z: PUMP.z - 2 };
/** trading is allowed anywhere inside the Trading Hall */
export const TRADE_ZONE = { x: PUMP.x, z: PUMP.z, r: PUMP.r + 2 };

export interface MarketItem {
  item: Item;
  /** base price in Leaves; mid = base × exp(k × gap), clamped to [floor, ceil] × base */
  base: number;
  k: number;
}
export const MARKET: MarketItem[] = [
  { item: 'moon_rock', base: 2, k: 0.01 },
  { item: 'copium_shroom', base: 4, k: 0.015 },
  { item: 'rug_yarn', base: 4, k: 0.015 },
  { item: 'moon_collar', base: 30, k: 0.05 },
];
export const marketItem = (v: unknown) => MARKET.find((m) => m.item === v);

export const PRICE = {
  floor: 0.5,
  ceil: 3,
  /** bid = mid × (1 − spread), ask = mid × (1 + spread) */
  spread: 0.1,
  /** the gap decays toward 0 by this share every game minute */
  decayPerMin: 0.05,
  /** max units in one trade */
  maxUnits: 20,
  /** game minutes between two trades by one player */
  tradeGapMin: 2 / 60,
  /** hourly on-chain price post, in game minutes */
  postEveryMin: 60,
  /** board history kept, game minutes */
  historyMin: 360,
};

export const CUP = {
  /** a round every this many game minutes (3 h) */
  roundMin: 180,
  /** joins close this many game minutes before the end */
  joinCloseMin: 30,
  chips: 200,
  /** units of each item one entrant may trade per round */
  maxUnitsPerItem: 200,
  maxEntrantsPerAddress: 3,
  /** Leaves prizes by place (1-based); everyone else above `start` chips scores `profitPrize` */
  prizes: [100, 60, 60, 30, 30, 30, 30, 30, 30, 30],
  profitPrize: 5,
  /** below this many entrants only the profit prize is paid */
  minEntrantsForPlaces: 3,
  trophies: 3,
};

/** Kettle's apprentices: labelled market makers that keep the board moving. Never enter the Cup. */
export const APPRENTICES = { count: 3, everyMin: 5, maxUnits: 3 };

export const midPrice = (m: MarketItem, gap: number) =>
  Math.min(m.base * PRICE.ceil, Math.max(m.base * PRICE.floor, m.base * Math.exp(m.k * gap)));
export const bidOf = (mid: number) => Math.max(1, Math.floor(mid * (1 - PRICE.spread)));
export const askOf = (mid: number) => Math.ceil(mid * (1 + PRICE.spread));
