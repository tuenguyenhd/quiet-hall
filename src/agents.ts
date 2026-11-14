/**
 * Trading agents in the Market Cup (NEAR edition): Biscuit's autopilot, and "bring your own agent" over MCP.
 * Every agent trades a player's Cup entry under a spending policy, through the same market as people, so agents move
 * prices too. Each decision carries a reason that the player sees. Shared by client, Worker and tests.
 * Change numbers here, not in logic.
 */
import { CUP, MARKET, PRICE } from './market';

export type Risk = 'calm' | 'bold';

/** spending policy per risk level: the agent can never exceed these, whatever the AI says */
export const POLICY: Record<Risk, { maxChipsPerTrade: number; maxUnits: number; keepChips: number; label: string }> = {
  calm: { maxChipsPerTrade: 20, maxUnits: 5, keepChips: 80, label: 'Calm: small trades, keeps 80 chips in reserve' },
  bold: { maxChipsPerTrade: 60, maxUnits: 15, keepChips: 20, label: 'Bold: bigger trades, keeps 20 chips in reserve' },
};

export const AGENT = {
  /** Biscuit decides once every this many game minutes */
  everyMin: 5,
  /** AI decisions per player per UTC day (after that, Biscuit uses the plain rules below) */
  aiPerDay: 48,
  /** player agent keys (MCP): 'qha_' + 32 base62 */
  keyPrefix: 'qha_',
  /** agent trades per key per minute over MCP */
  mcpTradesPerMin: 6,
  /** decisions kept per player for the activity log */
  logKeep: 30,
} as const;

export interface Quote {
  item: string;
  bid: number;
  ask: number;
  mid: number;
}
export interface Position {
  chips: number;
  bag: Record<string, number>;
}
export interface Decision {
  action: 'buy' | 'sell' | 'hold';
  item?: string;
  units?: number;
  why: string;
}

/**
 * Checks and clamps a decision against the policy and the position. Returns a decision that is safe to execute
 * (possibly 'hold' with the reason it was refused).
 */
export function checkDecision(d: Partial<Decision> | null, quotes: Quote[], pos: Position, risk: Risk, name = (i: string) => i): Decision {
  const p = POLICY[risk];
  const why = typeof d?.why === 'string' ? d.why.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!d || (d.action !== 'buy' && d.action !== 'sell')) return { action: 'hold', why: why || 'Nothing worth doing right now.' };
  const q = quotes.find((x) => x.item === d.item);
  if (!q || !MARKET.some((m) => m.item === d.item)) return { action: 'hold', why: `Unknown item ${String(d.item).slice(0, 20)}.` };
  let units = Math.max(1, Math.min(Math.floor(Number(d.units) || 1), p.maxUnits, PRICE.maxUnits));
  if (d.action === 'buy') {
    const budget = Math.min(p.maxChipsPerTrade, pos.chips - p.keepChips);
    // walking the book costs a little more than the ask: keep a 15% margin
    units = Math.min(units, Math.floor(budget / (q.ask * 1.15)));
    if (units < 1) return { action: 'hold', why: `Wanted to buy ${name(q.item)}, but the policy keeps ${p.keepChips} chips in reserve.` };
  } else {
    units = Math.min(units, pos.bag[q.item] ?? 0);
    if (units < 1) return { action: 'hold', why: `Wanted to sell ${name(q.item)}, but holds none.` };
  }
  return { action: d.action, item: q.item, units, why: why || `${d.action} ${units} ${name(q.item)}` };
}

/**
 * The plain rules (no AI): buy what is cheapest against its price an hour ago, sell what has risen the most.
 * Used when the AI is off, over its daily budget, or its answer is unusable.
 */
export function ruleDecision(quotes: Quote[], before: Record<string, number>, pos: Position, risk: Risk, name = (i: string) => i): Decision {
  const moves = quotes.map((q) => ({ q, ch: before[q.item] ? (q.mid - before[q.item]) / before[q.item] : 0 }));
  const held = moves.filter((m) => (pos.bag[m.q.item] ?? 0) > 0).sort((a, b) => b.ch - a.ch)[0];
  if (held && held.ch > 0.08) {
    return checkDecision({ action: 'sell', item: held.q.item, units: pos.bag[held.q.item], why: `${name(held.q.item)} is up ${Math.round(held.ch * 100)}% in an hour: taking profit.` }, quotes, pos, risk, name);
  }
  const dip = moves.filter((m) => m.ch < -0.05).sort((a, b) => a.ch - b.ch)[0];
  if (dip) {
    return checkDecision({ action: 'buy', item: dip.q.item, units: POLICY[risk].maxUnits, why: `${name(dip.q.item)} is down ${Math.round(-dip.ch * 100)}% in an hour: buying the dip.` }, quotes, pos, risk, name);
  }
  return { action: 'hold', why: 'Prices are flat. Waiting for a better entry.' };
}

/** the prompt for an AI decision: the market, the position and the policy; the reply is one JSON object */
export function decisionPrompt(quotes: Quote[], before: Record<string, number>, pos: Position, risk: Risk, endsInMin: number, name = (i: string) => i): string {
  const p = POLICY[risk];
  return `You are Biscuit, a shiba pet who trades for your human in the Market Cup, a free trading game with play chips (no real money).
Goal: finish the round with the most value (chips + items at the bid price). Prices move when anyone trades; spread ${Math.round(PRICE.spread * 100)}% each side.
Market now (item id: buy ask / sell bid, mid an hour ago):
${quotes.map((q) => `- ${q.item} (${name(q.item)}): ask ${q.ask}, bid ${q.bid}, an hour ago ${before[q.item] ?? q.mid}`).join('\n')}
You hold: ${pos.chips} chips and ${JSON.stringify(pos.bag)}. The round ends in ${endsInMin} min; you start with ${CUP.chips} chips.
Policy (${risk}): at most ${p.maxChipsPerTrade} chips and ${p.maxUnits} units per trade; keep ${p.keepChips} chips in reserve.
Reply with ONE JSON object only: {"action":"buy"|"sell"|"hold","item":"<item id>","units":<int>,"why":"<one short sentence a player understands>"}`;
}
