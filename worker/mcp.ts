// MCP server for sponsors and AI agents: POST /api/near/mcp (NEAR edition). Plan: "Sponsored Drops", Design 3.
// Stateless Streamable HTTP, JSON-RPC 2.0, the same shape as the NEAR Builders MCP server:
//   initialize, notifications/initialized (202, no body), ping, tools/list, tools/call.
// Replies are `text/event-stream` ("event: message\ndata: <json>\n\n") when the client accepts it, else JSON.
// Auth: `x-api-key` = a sponsor key (only its sha256 is stored). initialize / tools/list work without one;
// tools/call needs one. Rate-limited per key and per IP.
// Everything a caller sends (and everything an LLM drafts) goes through validateCampaign before it is used.
import type { Economy } from './economy';
import { CAMPAIGN_LIMITS, ZONES, validateCampaign, type Campaign, type ZoneId } from '../src/campaigns';
import { AGENT, POLICY, checkDecision, type Risk } from '../src/agents';
import { CUP, PRICE } from '../src/market';

export const MCP_PROTOCOL = '2025-03-26';
const MAX_BODY = 32_000;
/** calls per minute */
const IP_LIMIT = 120;
const KEY_LIMIT = 60;
/** prompt drafts per key per minute (each may be an LLM call) */
const DRAFT_LIMIT = 10;
/** live campaigns: per sponsor key, and in the whole world (they all ride in every 'welcome') */
const LIVE_PER_KEY = 5;
const LIVE_TOTAL = 20;
const DEFAULT_LLM_DAILY_CAP = 300;
const MAX_PROMPT = 2000;

export interface McpEnv {
  PUBLIC_URL: string;
  NEAR_ACCOUNT?: string;
  /** NEAR AI Cloud key (secret). Unset = the keyword parser drafts campaigns. */
  NEARAI_API_KEY?: string;
  /** OpenAI-compatible base URL (default https://cloud-api.near.ai/v1) */
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  /** 'mock' = never call the LLM (tests, demos without credits) */
  LLM_MODE?: string;
  /** most LLM calls per UTC day (default 300) */
  LLM_DAILY_CAP?: string;
}

export interface McpDeps {
  economy: DurableObjectStub<Economy>;
  /** after create: commit the hash on NEAR (Mirror job camp-<id>) */
  commit(id: string, configHash: string): Promise<void>;
  /** after create / end: push the live list to every player */
  changed(): Promise<void>;
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: unknown; params?: unknown };
type Reply = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const sha256Hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** sponsor keys: 'qhs_' + 32 base62 characters */
export function newSponsorKey(): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  while (out.length < 32) {
    for (const b of crypto.getRandomValues(new Uint8Array(48))) if (b < 248 && out.length < 32) out += abc[b % 62]; // 248 = 4 × 62: no bias
  }
  return `qhs_${out}`;
}
export const sponsorKeyHash = (key: string) => sha256Hex(`qh-sponsor:${key}`);
const KEY_RE = /^qhs_[A-Za-z0-9]{32}$/;
/** player agent keys: 'qha_' + 32 base62. An agent trades its player's Market Cup entry under the player's policy. */
export const newAgentKey = () => newSponsorKey().replace(/^qhs_/, AGENT.keyPrefix);
export const agentKeyHash = (key: string) => sha256Hex(`qh-agent:${key}`);
const AGENT_KEY_RE = /^qha_[A-Za-z0-9]{32}$/;

/** reads a body up to MAX_BODY bytes; null if larger or not JSON */
async function readBody(req: Request): Promise<unknown | null> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return null;
  const t = await req.text();
  if (t.length > MAX_BODY) return null;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

// ---------- tools ----------

const ZONE_FIT: Record<ZoneId, string> = {
  valley: 'Meme Valley: the open gathering meadow. Best for big drops (20–40) and "collect memes" hunts.',
  court: 'Courtyard: the central plaza every player passes on arrival. Most foot traffic, best for small fast drops (5–15).',
  pump: 'PumpHall: the prediction-game hall. Fits trading / degen sponsors (10–20 drops).',
  bazaar: 'Market: the trading square. Fits DeFi, exchanges and trading sponsors (10–20 drops).',
  soon: 'Coming Soon: the district of upcoming features. Fits launches and teasers (5–15 drops).',
};

const CAMPAIGN_SCHEMA = {
  type: 'object',
  description: 'A sponsored drop. Out-of-range numbers are clamped (see notes in the result); text is cleaned and capped.',
  properties: {
    sponsor: {
      type: 'object',
      properties: {
        name: { type: 'string', description: `Sponsor name shown in the world (max ${CAMPAIGN_LIMITS.name} chars). Required.` },
        account: { type: 'string', description: 'Optional NEAR account of the sponsor, e.g. "bonk.near".' },
        emoji: { type: 'string', description: 'One emoji for the sponsor sign.' },
        color: { type: 'string', description: 'Brand colour as #rrggbb.' },
      },
      required: ['name'],
    },
    title: { type: 'string', description: `Short title (max ${CAMPAIGN_LIMITS.title}). Optional: generated if absent.` },
    blurb: { type: 'string', description: `One or two sentences for players (max ${CAMPAIGN_LIMITS.blurb}). No links.` },
    zone: { type: 'string', enum: Object.keys(ZONES), description: 'Where the drops appear. See list_zones.' },
    drop: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What players collect, singular, e.g. "BONK meme". Required.' },
        emoji: { type: 'string', description: 'One emoji shown on each drop.' },
        count: { type: 'integer', minimum: CAMPAIGN_LIMITS.count[0], maximum: CAMPAIGN_LIMITS.count[1], description: 'How many drop spots.' },
      },
      required: ['name'],
    },
    goal: { type: 'integer', minimum: CAMPAIGN_LIMITS.goal[0], maximum: CAMPAIGN_LIMITS.goal[1], description: 'Collect this many to complete (≤ drop.count).' },
    reward: {
      type: 'object',
      properties: {
        badge: { type: 'string', description: 'Badge title players earn (a bound NEAR receipt). Required.' },
        claimUrl: { type: 'string', description: 'Optional https:// link shown ONLY to players who complete it (your own claim page).' },
        code: { type: 'string', description: 'Optional code shown ONLY to completers (letters, digits, - _ .).' },
      },
      required: ['badge'],
    },
    supply: { type: 'integer', minimum: CAMPAIGN_LIMITS.supply[0], maximum: CAMPAIGN_LIMITS.supply[1], description: 'Most completions (rewards).' },
    days: { type: 'integer', minimum: 1, maximum: CAMPAIGN_LIMITS.maxDays, description: 'How long it runs, in days (default 3).' },
    starts: { type: 'integer', description: 'Optional start, ms since epoch (default now).' },
    ends: { type: 'integer', description: `Optional end, ms since epoch (at most ${CAMPAIGN_LIMITS.maxDays} days after the start).` },
  },
  required: ['sponsor', 'zone', 'drop', 'reward'],
};

/** tools for a player's own trading agent (x-api-key = a player agent key, made in the game) */
const AGENT_TOOLS = new Set(['get_market', 'get_my_position', 'trade']);

export const TOOLS = [
  {
    name: 'get_market',
    description:
      'The Market Cup right now: every item with its buy (ask) and sell (bid) price in play chips, its mid price about an hour ago, ' +
      `the round id and minutes left, and the rules (${PRICE.spread * 100}% spread each side; every trade moves the price; ${CUP.chips} chips to start). ` +
      'Works with a player agent key or a sponsor key.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_my_position',
    description: "Your player's Market Cup position this round (chips, items held, score, rank), their spending policy, and the last decisions made for them.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'trade',
    description:
      "Buys or sells one item in your player's Market Cup entry (joins the round for them if needed). The player's spending policy caps every " +
      'trade (chips per trade, units, chips kept in reserve); a trade over the cap is clamped or refused. Give a short reason: the player sees it.',
    inputSchema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Item id from get_market, e.g. "moon_rock".' },
        side: { type: 'string', enum: ['buy', 'sell'] },
        units: { type: 'integer', minimum: 1, description: 'How many units (clamped by the policy).' },
        reason: { type: 'string', description: 'One short sentence the player will read, e.g. "Moon Rock is 12% below its hourly price".' },
      },
      required: ['item', 'side', 'units', 'reason'],
    },
  },
  {
    name: 'list_zones',
    description: 'Lists the world zones a sponsored drop can run in: id, name, size and what fits there. Call this first if unsure.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'draft_campaign_from_prompt',
    description:
      'Turns a plain-language request (e.g. "drop 20 BONK memes in Meme Valley, collect 3 for a Bonk Hunter badge, claim at https://…") ' +
      'into a validated campaign draft, with notes on anything clamped or guessed and a one-paragraph preview. Writes nothing: ' +
      'review the draft, adjust it, then pass it to create_campaign.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: `What the drop should be: sponsor, what to collect, how many, where, reward, claim link (max ${MAX_PROMPT} chars).` },
        sponsor: { type: 'string', description: 'Optional sponsor name; overrides whatever the prompt implies.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'create_campaign',
    description:
      'Creates a sponsored drop and puts it live for every player at once. The terms are hashed (configHash) and committed on NEAR. ' +
      'Players who collect `goal` drops get a bound NEAR badge receipt plus your claim link / code (shown only to them). ' +
      `Limits: ${LIVE_PER_KEY} live campaigns per sponsor key. Returns {id, configHash, link}.`,
    inputSchema: { type: 'object', properties: { campaign: CAMPAIGN_SCHEMA }, required: ['campaign'] },
  },
  {
    name: 'list_campaigns',
    description: 'Lists campaigns as players see them (no claim links or codes). Default: live ones only.',
    inputSchema: {
      type: 'object',
      properties: {
        include_ended: { type: 'boolean', description: 'Also list ended / expired campaigns (default false).' },
        mine: { type: 'boolean', description: 'Only campaigns created with this sponsor key (default false).' },
      },
    },
  },
  {
    name: 'get_campaign_stats',
    description: 'Stats of one campaign: picks, unique players, completions, supply left, status and configHash.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Campaign id, e.g. "cmp-…".' } }, required: ['id'] },
  },
  {
    name: 'end_campaign',
    description: 'Ends a campaign now: its drops disappear for every player. Only the sponsor key that created it can end it.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Campaign id, e.g. "cmp-…".' } }, required: ['id'] },
  },
];

const ok = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
const fail = (why: string, extra: Record<string, unknown> = {}): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ error: why, ...extra }) }],
  isError: true,
});

const DAY = 86_400_000;
const daysOf = (c: Campaign) => Math.max(1, Math.round((c.ends - c.starts) / DAY));

/** one paragraph a sponsor (or the agent's user) can read before creating it */
export function preview(c: Campaign): string {
  const claim = c.reward.claimUrl || c.reward.code ? ` plus your ${c.reward.claimUrl ? 'claim link' : 'code'} (shown only to them)` : '';
  return (
    `${c.sponsor.name} scatters ${c.drop.count} ${c.drop.name} ${c.drop.emoji} drops across ${ZONES[c.zone].name}. ` +
    `Players who collect ${c.goal} earn the "${c.reward.badge}" badge, a bound NEAR receipt,${claim}. ` +
    `Up to ${c.supply} players can complete it; it runs ${daysOf(c)} day${daysOf(c) === 1 ? '' : 's'}, until ${new Date(c.ends).toISOString().slice(0, 16).replace('T', ' ')} UTC. ` +
    `Claiming needs a NEAR login.`
  );
}

// ---------- prompt → draft ----------

const ZONE_WORDS: [RegExp, ZoneId][] = [
  [/\bcoming\s+soon\b/i, 'soon'],
  [/\bmeme\s*valley\b/i, 'valley'],
  [/\bpump\s*hall\b|\bpumphall\b/i, 'pump'],
  [/\bcourt\s*yard\b|\bcourtyard\b/i, 'court'],
  [/\bbazaar\b|\bmarket(?:place)?\b/i, 'bazaar'],
  [/\bvalley\b/i, 'valley'],
  [/\bcourt\b|\bplaza\b/i, 'court'],
  [/\bpump\b/i, 'pump'],
  [/\bsoon\b/i, 'soon'],
];
const STOP = new Set(
  'A An And The For In On At To Of Drop Drops Collect Find Gather Pick Scatter Hide Place Spawn Put Make Create Run Give Get Earn Win With Each Every Players Player Meme Memes Valley Courtyard Court Pump Hall PumpHall Market Bazaar Coming Soon Badge Claim Supply First Up Max Limit Days Day Hours Week Please Let Lets I We Our My Your This That It Then Who Only Free'.split(
    ' ',
  ),
);
const num = (re: RegExp, s: string) => {
  const m = re.exec(s);
  return m ? Number(m[1].replace(/[,_]/g, '')) : undefined;
};
const singular = (w: string) => (/[^s]s$/i.test(w) && w.length > 3 ? w.slice(0, -1) : w);

/** Deterministic keyword parser: the mock / fallback drafter. Output still goes through validateCampaign. */
export function keywordDraft(prompt: string, sponsor?: string): { raw: Record<string, unknown>; guesses: string[] } {
  const p = prompt.replace(/\s+/g, ' ').trim();
  const guesses: string[] = [];
  const N = '(\\d[\\d,_]*)';
  const count = num(new RegExp(`\\b(?:drop|drops|scatter|place|hide|spawn|put|spread)\\s+${N}`, 'i'), p) ?? num(new RegExp(`${N}\\s+(?:drops|spots|pieces)\\b`, 'i'), p);
  const goal = num(new RegExp(`\\b(?:collect|find|gather|pick(?:\\s+up)?|grab|catch)\\s+(?:any\\s+)?${N}`, 'i'), p);
  const supply =
    num(new RegExp(`\\b(?:supply(?:\\s+of)?|first|max(?:imum)?(?:\\s+of)?|limit(?:ed)?(?:\\s+to)?|up\\s+to|only)\\s+${N}`, 'i'), p) ??
    num(new RegExp(`${N}\\s+(?:winners|rewards|claims|completions|players|badges|people)\\b`, 'i'), p);
  const days = num(/\b(\d{1,2})\s*(?:-\s*)?days?\b/i, p) ?? (/\b(?:a|one)\s+week\b/i.test(p) ? 7 : /\b(\d)\s*weeks?\b/i.test(p) ? 7 * Number(/\b(\d)\s*weeks?\b/i.exec(p)![1]) : undefined);

  let zone: ZoneId | undefined;
  for (const [re, z] of ZONE_WORDS) if (re.test(p)) {
    zone = z;
    break;
  }
  if (!zone) {
    zone = 'valley';
    guesses.push('zone: none named, using Meme Valley');
  }

  // sponsor: given, else $TICKER / an ALL-CAPS ticker, else the first capitalised word that is not a common word
  let name = sponsor?.trim();
  if (!name) {
    const ticker = /\$([A-Za-z][A-Za-z0-9]{1,9})\b/.exec(p)?.[1] ?? /\b([A-Z][A-Z0-9]{1,9})\b/.exec(p.replace(/https?:\/\/\S+/g, ''))?.[1];
    if (ticker) name = ticker.toUpperCase();
    else {
      const words = p.replace(/https?:\/\/\S+/g, '').match(/\b[A-Z][a-zA-Z0-9]+\b/g) ?? [];
      name = words.find((w) => !STOP.has(w));
    }
    if (!name) {
      name = 'Sponsor';
      guesses.push('sponsor: none found in the prompt, set sponsor.name');
    }
  }

  // what is collected: the words after the drop count ("drop 20 BONK memes in …")
  const what = new RegExp(`\\b(?:drop|drops|scatter|place|hide|spawn|put|spread)\\s+\\d[\\d,_]*\\s+([^,.;:!?]+?)(?=\\s+(?:in|at|on|across|around|inside|for|to|over|near|,)\\b|[,.;:!?]|$)`, 'i').exec(p)?.[1];
  const words = (what ?? '').replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, ' ').trim().split(/\s+/).filter(Boolean);
  let dropName = words.slice(0, 4).map(singular).join(' ');
  if (!dropName) {
    dropName = `${name} token`;
    guesses.push(`drop.name: guessed "${dropName}"`);
  }

  const badge =
    /\b(?:for|earn|earns|get|gets|win|wins|receive|receives|unlock|unlocks)\s+(?:an?\s+|the\s+)?["“']?([^,.;"”']{2,40}?)["”']?\s+badge\b/i.exec(p)?.[1] ??
    /\bbadge\s+(?:called|named|titled)?\s*["“']([^"”']{2,40})["”']/i.exec(p)?.[1] ??
    /\bbadge\s+(?:called|named|titled)\s+([^,.;]{2,40})/i.exec(p)?.[1];
  let badgeName = badge?.trim();
  if (!badgeName) {
    badgeName = `${name} Hunter`;
    guesses.push(`reward.badge: guessed "${badgeName}"`);
  }
  const claimUrl = /https:\/\/[^\s"'<>]+/i.exec(p)?.[0].replace(/[.,;:!?)\]]+$/, '');
  const code = /\bcode\s*(?:is|:|=)?\s*["“']?([A-Za-z0-9][A-Za-z0-9_\-.]{2,63})/i.exec(p.replace(/https?:\/\/\S+/g, ''))?.[1]?.replace(/[.]+$/, '');
  const emoji = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u.exec(p)?.[0];
  const color = /#[0-9a-fA-F]{6}\b/.exec(p)?.[0];
  return {
    raw: {
      sponsor: { name, ...(emoji ? { emoji } : {}), ...(color ? { color } : {}) },
      zone,
      drop: { name: dropName, ...(emoji ? { emoji } : {}), ...(count !== undefined ? { count } : {}) },
      ...(goal !== undefined ? { goal } : {}),
      reward: { badge: badgeName, ...(claimUrl ? { claimUrl } : {}), ...(code && !/^(is|for|the)$/i.test(code) ? { code } : {}) },
      ...(supply !== undefined ? { supply } : {}),
      ...(days !== undefined ? { days } : {}),
    },
    guesses,
  };
}

const SYSTEM_PROMPT = `You turn an advertiser's request into a "sponsored drop" for Quiet Hall, a small 3D world on NEAR.
Players walk around a zone, collect drops, and on reaching the goal earn a badge (a bound NEAR receipt) and the sponsor's claim link or code.
Reply with ONE JSON object only, no prose, no code fences, with this shape:
{"sponsor":{"name":string,"emoji":string,"color":"#rrggbb"},"title":string,"blurb":string,
 "zone":${Object.keys(ZONES).map((z) => `"${z}"`).join('|')},
 "drop":{"name":string (singular, what players collect),"emoji":string,"count":integer ${CAMPAIGN_LIMITS.count.join('-')}},
 "goal":integer ${CAMPAIGN_LIMITS.goal.join('-')},"reward":{"badge":string,"claimUrl"?:"https://...","code"?:string},
 "supply":integer ${CAMPAIGN_LIMITS.supply.join('-')},"days":integer 1-${CAMPAIGN_LIMITS.maxDays}}
Zones: ${Object.entries(ZONES).map(([id, z]) => `${id} = ${z.name}`).join('; ')}.
Use only facts from the request; copy any https link and code exactly; leave out claimUrl/code if none is given.
Title max ${CAMPAIGN_LIMITS.title} chars, blurb max ${CAMPAIGN_LIMITS.blurb} chars with no links. Defaults: count 20, goal 3, supply 500, days 3, zone valley.`;

/** pulls the first JSON object out of an LLM reply (fences, <think> blocks and prose around it are ignored) */
export function parseLlmJson(text: string): Record<string, unknown> | null {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const j = JSON.parse(t.slice(a, b + 1));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

async function llmDraft(env: McpEnv, prompt: string): Promise<Record<string, unknown> | string> {
  const base = (env.LLM_BASE_URL || 'https://cloud-api.near.ai/v1').replace(/\/+$/, '');
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.NEARAI_API_KEY}` },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) return `LLM HTTP ${r.status}`;
    const j = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = j.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? parseLlmJson(content) : null;
    return parsed ?? 'LLM reply was not a JSON object';
  } catch (e) {
    return `LLM call failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`;
  }
}

// ---------- the endpoint ----------

interface Caller {
  ip: string;
  keyHash: string | null;
  sponsor: string | null;
  /** a player agent key's owner */
  agent: { acct: string; label: string; hash: string } | null;
}

async function callTool(env: McpEnv, deps: McpDeps, who: Caller, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const E = deps.economy;
  if (name === 'get_market' && (who.agent || who.sponsor)) {
    const [quotes, before, board] = await Promise.all([E.quotes(), E.midsBefore(), E.cupBoard()]);
    return ok({
      round: { id: board.round, endsInMin: Math.max(0, Math.round((board.end - Date.now()) / 60_000)), entrants: board.entrants },
      items: quotes.map((q) => ({ item: q.item, ask: q.ask, bid: q.bid, mid: q.mid, midHourAgo: before[q.item] ?? q.mid })),
      rules: { startChips: CUP.chips, spread: PRICE.spread, maxUnitsPerTrade: PRICE.maxUnits, note: 'Play chips only; no real money. Every trade moves the price.' },
    });
  }
  if (AGENT_TOOLS.has(name)) {
    if (!who.agent) return fail('This tool needs a player agent key (qha_…): a player makes one in the game (Biscuit > Bring your own agent).');
    if (await E.rateLimited(`mcp-agent:${who.agent.hash}`, KEY_LIMIT)) return fail('Too many calls with this key. Wait a minute.');
    const acct = who.agent.acct;
    if (name === 'get_my_position') {
      const [st, board] = await Promise.all([E.agentState(acct), E.cupBoard(acct)]);
      return ok({ inCup: !!st.position, position: board.me ?? null, policy: { risk: st.risk, ...POLICY[st.risk] }, recent: st.log.slice(0, 8) });
    }
    // trade
    if (await E.rateLimited(`mcp-agent-trade:${who.agent.hash}`, AGENT.mcpTradesPerMin)) return fail('Too many trades with this key. Wait a minute.');
    const side = args.side === 'buy' || args.side === 'sell' ? args.side : null;
    if (!side) return fail('side must be "buy" or "sell".');
    let pos = await E.position(acct);
    if (!pos) {
      const j = await E.cupJoin(acct, `agent:${acct}`);
      if (!j.ok) return fail(`Could not join the Market Cup: ${j.why}`);
      pos = await E.position(acct);
      if (!pos) return fail('Could not join the Market Cup.');
    }
    const st = await E.agentState(acct);
    const quotes = (await E.quotes()).map(({ item, bid, ask, mid }) => ({ item, bid, ask, mid }));
    const d = checkDecision({ action: side, item: String(args.item ?? ''), units: Number(args.units), why: String(args.reason ?? '') }, quotes, pos, st.risk as Risk);
    if (d.action === 'hold') {
      await E.agentTrade(acct, d, `agent:${who.agent.label}`);
      return fail(`Refused by the policy: ${d.why}`);
    }
    const r = await E.agentTrade(acct, d, `agent:${who.agent.label}`);
    if (!r.ok) return fail(`Trade refused: ${r.why}`);
    return ok({ done: { side, item: d.item, units: d.units, chips: r.total }, chipsLeft: r.chips ?? null, clamped: d.units !== Number(args.units) ? `units clamped to ${d.units} by the policy` : undefined });
  }
  if (!who.keyHash || !who.sponsor) return fail('This tool needs a sponsor key: send it in the x-api-key header.');
  if (await E.rateLimited(`mcp-key:${who.keyHash}`, KEY_LIMIT)) return fail('Too many calls with this key. Wait a minute.');
  if (name === 'list_zones') {
    return ok({
      zones: Object.entries(ZONES).map(([id, z]) => ({ id, name: z.name, radius: z.r, fits: ZONE_FIT[id as ZoneId] })),
      limits: { dropCount: CAMPAIGN_LIMITS.count, goal: CAMPAIGN_LIMITS.goal, supply: CAMPAIGN_LIMITS.supply, maxDays: CAMPAIGN_LIMITS.maxDays },
    });
  }

  if (name === 'draft_campaign_from_prompt') {
    const prompt = typeof args.prompt === 'string' ? args.prompt.slice(0, MAX_PROMPT) : '';
    if (!prompt.trim()) return fail('prompt is required: describe the drop in plain words.');
    const sponsor = typeof args.sponsor === 'string' ? args.sponsor.slice(0, 64) : undefined;
    if (await E.rateLimited(`mcp-draft:${who.keyHash}`, DRAFT_LIMIT)) return fail('Too many drafts with this key. Wait a minute.');
    const notes: string[] = [];
    let source: 'llm' | 'keywords' = 'keywords';
    let raw: Record<string, unknown> | null = null;
    if (env.LLM_MODE !== 'mock' && env.NEARAI_API_KEY && env.LLM_MODEL) {
      const cap = Number(env.LLM_DAILY_CAP) > 0 ? Number(env.LLM_DAILY_CAP) : DEFAULT_LLM_DAILY_CAP;
      if (await E.rateLimited('day:llm', cap, DAY)) notes.push('The daily AI drafting budget is used up: drafted with the keyword parser.');
      else {
        const r = await llmDraft(env, prompt);
        if (typeof r === 'string') notes.push(`${r}: drafted with the keyword parser.`);
        else {
          raw = r;
          source = 'llm';
        }
      }
    }
    const kw = keywordDraft(prompt, sponsor);
    if (!raw) {
      raw = kw.raw;
      notes.push(...kw.guesses);
    } else if (sponsor) raw.sponsor = { ...((raw.sponsor as object) ?? {}), name: sponsor };
    let v = validateCampaign(raw);
    if (!v.ok && source === 'llm') {
      notes.push(`The AI draft was unusable (${v.why}): drafted with the keyword parser.`);
      source = 'keywords';
      notes.push(...kw.guesses);
      v = validateCampaign(kw.raw);
    }
    if (!v.ok) return fail(`Could not draft a valid campaign: ${v.why}`, { notes });
    const { id: _id, status: _s, ...draft } = v.campaign;
    return ok({ draft: { ...draft, days: daysOf(v.campaign) }, notes: [...notes, ...v.notes], preview: preview(v.campaign), source, next: 'Review, then call create_campaign {campaign: draft}.' });
  }

  if (name === 'create_campaign') {
    const input = args.campaign && typeof args.campaign === 'object' ? (args.campaign as Record<string, unknown>) : null;
    if (!input) return fail('campaign is required (an object, see the inputSchema or draft_campaign_from_prompt).');
    // the server picks the id and the status: a caller can never overwrite or pre-end another campaign
    const v = validateCampaign({ ...input, id: undefined, status: 'live' });
    if (!v.ok) return fail(`Invalid campaign: ${v.why}`);
    if ((await E.liveCampaignCount(who.keyHash)) >= LIVE_PER_KEY) return fail(`This key already has ${LIVE_PER_KEY} live campaigns: end one first.`);
    if ((await E.liveCampaignCount()) >= LIVE_TOTAL) return fail('The world is full of drops right now. Try again later.');
    const { id, configHash } = await E.createCampaign(v.campaign, who.keyHash);
    await deps.commit(id, configHash);
    await deps.changed();
    return ok({
      id,
      configHash,
      link: `${env.PUBLIC_URL}/?at=${v.campaign.zone}`,
      live: v.campaign.starts <= Date.now(),
      chain: { contract: env.NEAR_ACCOUNT ?? null, job: `camp-${id}`, method: 'commit_campaign' },
      campaign: v.campaign,
      notes: v.notes,
      preview: preview(v.campaign),
    });
  }

  if (name === 'list_campaigns') {
    return ok({ list: await E.listCampaigns(args.include_ended !== true, args.mine === true ? who.keyHash : undefined) });
  }

  const id = typeof args.id === 'string' ? args.id.slice(0, 40) : '';
  if (name === 'get_campaign_stats') {
    const s = await E.campaignStats(id);
    return s ? ok(s) : fail('No such campaign.');
  }
  if (name === 'end_campaign') {
    const r = await E.endCampaign(id, who.keyHash);
    if (!r.ok) return fail(r.why ?? 'Could not end it.');
    await deps.changed();
    return ok({ id, ended: true });
  }
  return fail(`Unknown tool: ${name}`);
}

async function handleOne(env: McpEnv, deps: McpDeps, who: Caller, m: Rpc): Promise<Reply | null> {
  const isNote = m.id === undefined || m.id === null;
  const id = isNote ? null : (m.id as string | number);
  const err = (code: number, message: string): Reply => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return isNote ? null : err(-32600, 'Invalid Request');
  if (isNote) return null; // notifications/initialized, notifications/cancelled, …: nothing to answer
  const params = m.params && typeof m.params === 'object' ? (m.params as Record<string, unknown>) : {};
  switch (m.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: 'Quiet Hall MCP', version: '1.0.0' },
          instructions:
            'Quiet Hall is a small open world on NEAR. Use these tools to run "sponsored drops": collectables in a world zone; ' +
            'players who collect enough earn a bound NEAR badge and your claim link. Start with draft_campaign_from_prompt, ' +
            'review the draft, then create_campaign. Calling tools needs a sponsor key in the x-api-key header. ' +
            'Players can also connect their own trading agent with a player agent key (qha_…): get_market, get_my_position and trade ' +
            "act on that player's Market Cup entry under their spending policy.",
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      if (!TOOLS.some((t) => t.name === name)) return err(-32602, `Unknown tool: ${name}`);
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {};
      try {
        return { jsonrpc: '2.0', id, result: await callTool(env, deps, who, name, args) };
      } catch (e) {
        return { jsonrpc: '2.0', id, result: fail(`Server error: ${String((e as Error)?.message ?? e).slice(0, 160)}`) };
      }
    }
    default:
      return err(-32601, `Method not found: ${m.method}`);
  }
}

/** POST /api/near/mcp */
export async function handleMcp(req: Request, env: McpEnv, deps: McpDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Use POST (stateless Streamable HTTP; no SSE stream).' }), { status: 405, headers: { allow: 'POST', 'content-type': 'application/json' } });
  const sse = (req.headers.get('accept') ?? '').includes('text/event-stream');
  const reply = (body: unknown, status = 200) =>
    sse
      ? new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, { status, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })
      : Response.json(body, { status });
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
  if (await deps.economy.rateLimited(`mcp-ip:${ip}`, IP_LIMIT)) return reply({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests. Wait a minute.' } }, 429);
  const body = await readBody(req);
  if (body === null) return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `Request too large (max ${MAX_BODY} bytes).` } }, 413);
  if (body === undefined) return reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);

  const key = req.headers.get('x-api-key')?.trim() ?? '';
  const keyHash = KEY_RE.test(key) ? await sponsorKeyHash(key) : null;
  const sponsor = keyHash ? await deps.economy.sponsorOf(keyHash) : null;
  const aHash = AGENT_KEY_RE.test(key) ? await agentKeyHash(key) : null;
  const owner = aHash ? await deps.economy.agentKeyOwner(aHash) : null;
  const who: Caller = { ip, keyHash: sponsor ? keyHash : null, sponsor, agent: owner && aHash ? { ...owner, hash: aHash } : null };

  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]).slice(0, 20) as Rpc[];
  const out: Reply[] = [];
  for (const m of msgs) {
    const r = await handleOne(env, deps, who, m);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202 });
  return reply(batch ? out : out[0]);
}
