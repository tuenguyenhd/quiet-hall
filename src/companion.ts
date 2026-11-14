/**
 * The AI companion (NEAR edition): your one pet, Biscuit, talks back and gives Market Cup trading tips.
 * Runs on NEAR AI Cloud (OpenAI-compatible). Shared by client and Worker. Change numbers here, not in logic.
 *
 * Guardrails:
 * - a free daily trial per player;
 * - after the trial, an AI Pass (paid in NEAR);
 * - a global daily cap on calls;
 * - short inputs and outputs;
 * - a per-player rate limit;
 * - tips cover the in-game Cup only (play chips), never real tokens.
 */

export const COMPANION = {
  /** the one pet; the other frens you rescue are skins (faces) for it */
  name: 'Biscuit',
  /** free replies per player per UTC day (the trial) */
  freePerDay: 10,
  /** AI Pass: price in NEAR and how long it lasts */
  passNear: 1,
  passDays: 30,
  /** a Pass holder still has a daily ceiling (cost guard) */
  passPerDay: 200,
  /** most characters the player can send, and how many past turns are kept */
  maxIn: 240,
  maxTurns: 4,
  /** reply length cap (tokens and characters) */
  maxTokens: 400,
  maxOut: 600,
  /** most messages per player per minute */
  perMinute: 8,
} as const;

/** skins: the rescued frens are faces for the one companion. `pet` = index into PETS. */
export const SKINS = [
  { pet: 1, fren: 'shibby', name: 'Doge', emoji: '🐕' },
  { pet: 3, fren: 'froggo', name: 'Frog', emoji: '🐸' },
] as const;

export interface CompanionContext {
  skin: string;
  nick: string | null;
  bag: Record<string, number>;
  quotes: { item: string; bid: number; ask: number; mid: number }[];
  /** mid price about an hour ago, per item (for the trend) */
  before: Record<string, number>;
  cup: { chips: number; bag: Record<string, number>; score: number; rank: number; endsInMin: number } | null;
  /** the player asked for a trading tip (quick button) */
  tip: boolean;
  /** other things to do now: live sponsored drops, frens still lost, the autopilot (when the market is not worth it) */
  tasks?: string[];
  /** Biscuit's own autopilot, if on: risk and its last decision */
  autopilot?: string | null;
}

export function systemPrompt(c: CompanionContext): string {
  const q = c.quotes.map((x) => `${x.item}: buy ${x.ask} / sell ${x.bid} chips (an hour ago ${c.before[x.item] ?? x.mid})`).join('; ');
  const cup = c.cup
    ? `They are in the Market Cup: ${c.cup.chips} chips, holding ${JSON.stringify(c.cup.bag)}, score ${c.cup.score}, rank #${c.cup.rank}, round ends in ${c.cup.endsInMin} min.`
    : 'They are not in a Market Cup round right now (joining is free at the Market, south-east).';
  return `You are ${COMPANION.name}, a calm, warm shiba pet in Quiet Hall, a cozy 3D world where traders rest after a trading day. You wear your ${c.skin} face today.
You talk to ${c.nick ?? 'your human'}. Speak like a gentle pet friend: short, kind, a little playful. Reply in the language they write in. At most 3 short sentences.
You also help with the in-game Market Cup, a free 3-hour trading game with 200 play chips. Players move prices; the top 3 win trophies on NEAR. Items: Moon Rock, Rug Yarn, Copium Shroom.
Market now: ${q}.
${cup}
Their bag: ${JSON.stringify(c.bag)}.
${c.autopilot ? `You are also trading for them on autopilot (${c.autopilot}).` : 'Your autopilot is off: they can turn on "Let Biscuit trade" below the chat (needs a NEAR login).'}
${c.tasks?.length ? `Other things to do right now: ${c.tasks.join('; ')}. When the market is flat or they don't want to trade, suggest one of these and say you'll watch the market for them.` : ''}
Rules: tips are only about this game's play chips and items. Never give advice about real tokens, coins, stocks or money; if asked, say you only know the Cup and suggest a rest. Never invent prices; use the numbers above. Never ask for keys, seed phrases or money. If they seem stressed, suggest sitting a minute in the Quiet Hall.${c.tip ? '\nThey tapped "Trading tip": give one concrete Cup idea (which item, buy or sell, why from the numbers) in 2 sentences.' : ''}`;
}

/** deterministic reply for tests and when the AI is off (LLM_MODE=mock or no key) */
export function mockReply(c: CompanionContext, text: string): string {
  if (c.tip || /trad|buy|sell|cup|price/i.test(text)) {
    const best = c.quotes.slice().sort((a, b) => a.mid - (c.before[a.item] ?? a.mid) - (b.mid - (c.before[b.item] ?? b.mid)))[0];
    return best ? `*sniffs the Market* ${best.item} is cheapest vs an hour ago (buy ${best.ask}). Maybe a small buy in the Cup, then rest. 🐾` : '*yawns* The Market is quiet. Rest a little? 🐾';
  }
  return `*wags tail* I'm here. Want to sit a minute in the Quiet Hall with me? 🐾`;
}

/** trims the history the client sends: alternating user / assistant turns, capped */
export function cleanHistory(raw: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const t of raw.slice(-COMPANION.maxTurns)) {
    const u = typeof t?.u === 'string' ? t.u.slice(0, COMPANION.maxIn) : '';
    const a = typeof t?.a === 'string' ? t.a.slice(0, COMPANION.maxOut) : '';
    if (u && a) out.push({ role: 'user', content: u }, { role: 'assistant', content: a });
  }
  return out;
}
