/**
 * Leaves economy numbers, as data (shared by client and Worker).
 *
 * Source of truth for the numbers:
 * - NEAR edition: design/gdd/edition-near.md, "NEAR value table".
 * - Other editions: design/gdd/leaves-economy.md, "Value table".
 * Change values here, not in logic.
 */

export type Edition = 'seeker' | 'near' | 'web3';

/** Reasons a Leaves row can carry. Every row has exactly one. */
export type Reason =
  | 'sit'
  | 'world_sit'
  | 'bell'
  | 'streak'
  | 'wish'
  | 'market_sell'
  | 'cup_prize'
  | 'welcome'
  | 'login_bonus'
  | 'craft_fee'
  | 'market_buy';

export interface EconomyConfig {
  /** shortest paying sit, in (game) minutes */
  minSit: number;
  /** daily cap on `sit` Leaves */
  sitCap: number;
  /** Leaves given once, on the first visit */
  starterLeaves: number;
  /** Leaves given once per wallet account, the first time it logs in (an incentive to log in) */
  loginBonus: number;
  /** streak bonus = min(step × days, max) on the first paying sit of a day */
  streakStep: number;
  streakMax: number;
  /** daily caps on non-sit faucets (Leaves received per UTC day) */
  caps: Partial<Record<Reason, number>>;
  /** balance ceiling; 0 = none */
  pouchCap: number;
  /** a hidden stretch longer than this many (game) minutes ends the sit */
  hideEndsSitMin: number;
}

export const ECONOMY: Record<Edition, EconomyConfig> = {
  near: {
    minSit: 1,
    sitCap: 60,
    starterLeaves: 10,
    loginBonus: 50,
    streakStep: 2,
    streakMax: 30,
    caps: { wish: 20, market_sell: 60, world_sit: 20, bell: 15 },
    pouchCap: 0,
    hideEndsSitMin: 1,
  },
  seeker: {
    minSit: 3,
    sitCap: 60,
    starterLeaves: 0,
    loginBonus: 0,
    streakStep: 2,
    streakMax: 30,
    caps: { wish: 20, market_sell: 10, world_sit: 20, bell: 15 },
    pouchCap: 1000,
    hideEndsSitMin: 1,
  },
  web3: {
    minSit: 3,
    sitCap: 60,
    starterLeaves: 0,
    loginBonus: 0,
    streakStep: 2,
    streakMax: 30,
    caps: { wish: 20, market_sell: 10, world_sit: 20, bell: 15 },
    pouchCap: 1000,
    hideEndsSitMin: 1,
  },
};

export const edition = (v: unknown): Edition => (v === 'near' || v === 'web3' ? v : 'seeker');
