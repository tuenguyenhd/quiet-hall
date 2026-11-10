// Client-only edition facts (Vite build flags). The Worker reads env.EDITION instead.
import { NEAR_BUILD } from './near-mark';
import { PUMP_MARKETS_BY_EDITION, type PumpMarket } from './layout';

/** PumpHall markets in this build: Bitcoin + NEAR in the NEAR edition, SOL + SKR in the Seeker edition */
export const CLIENT_PUMP_MARKETS: PumpMarket[] = PUMP_MARKETS_BY_EDITION[NEAR_BUILD ? 'near' : 'seeker'];
