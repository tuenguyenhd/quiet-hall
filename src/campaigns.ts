// Sponsored drops: an advertiser's airdrop as a game. Shared by the client (src/near/campaigns.ts) and the Worker
// (worker/economy.ts, worker/index.ts, worker/mcp.ts). No imports beyond plain data modules, so the Worker can use it.
//
// A campaign scatters `drop.count` collectables in one zone of the world. A player who collects `goal` of them
// completes it: a bound NEAR badge receipt (mint_badge) + the sponsor's own claim link or code (shown only to them).
// We never hold or send sponsor tokens. The terms are hashed (configHash) and committed on NEAR (commit_campaign).
//
// Everything that comes from outside (an MCP call, an LLM draft) goes through validateCampaign: never trust it raw.
//
// Socket messages (NEAR edition):
//   client → server  { t: 'cpick', c: <campaign id>, d: <drop index> }
//   client → server  { t: 'cclaim', c }      after a NEAR login: completes a drop whose goal was reached as a guest
//   server → client  { t: 'cpicked', c, d, ok, why?, got, goal, done?, serial?, badge?, claim?: { url?, code? }, login? }
//                    (the answer to cclaim is a 'cpicked' with d = -1; badge + claim come only with done: true)
//   server → all     { t: 'camps', list: PublicCampaign[] }        (on create / end; also in 'welcome' as `camps`)
//   'welcome' also has `cmine`: { [campaign id]: { d: number[] (picked), serial?, badge?, claim? } } (this player only)
// HTTP:  GET /api/near/campaigns → { list: PublicCampaign[] }      POST /api/near/mcp (MCP, x-api-key)
import { BAZAAR, COURT, PUMP, cleanChat } from './layout';
import { VALLEY } from './valley';

/** where a campaign can run: known places only (centre + radius in metres; drops stay inside 0.8 × r) */
export const ZONES = {
  valley: { name: 'Meme Valley', x: VALLEY.x, z: VALLEY.z, r: VALLEY.r },
  court: { name: 'Courtyard', x: COURT.x, z: COURT.z, r: COURT.r },
  pump: { name: 'PumpHall', x: PUMP.x, z: PUMP.z, r: PUMP.r },
  bazaar: { name: 'Market', x: BAZAAR.x, z: BAZAAR.z, r: BAZAAR.r },
  soon: { name: 'Coming Soon', x: -72, z: 100, r: 20 }, // = SOON in src/near/mocks.ts (that file imports three)
} as const;
export type ZoneId = keyof typeof ZONES;

export const CAMPAIGN_LIMITS = {
  count: [5, 40],
  goal: [1, 10],
  supply: [1, 10000],
  /** longest a campaign may run */
  maxDays: 30,
  title: 60,
  blurb: 200,
  name: 32,
  badge: 40,
  code: 64,
  url: 300,
} as const;

export interface Campaign {
  /** 'cmp-<base36 time><4 random>' */
  id: string;
  sponsor: { name: string; account?: string; emoji: string; color: string };
  title: string;
  blurb: string;
  zone: ZoneId;
  drop: { name: string; emoji: string; count: number };
  /** collect this many to complete */
  goal: number;
  /** shown only to a player who completes it (and is logged in with NEAR) */
  reward: { badge: string; claimUrl?: string; code?: string };
  /** most completions */
  supply: number;
  starts: number;
  ends: number;
  status: 'live' | 'ended';
}

/** what every player may see: no claim link or code */
export type PublicCampaign = Omit<Campaign, 'reward'> & {
  reward: { badge: string; hasClaim: boolean };
  completions: number;
  /** sha256 of canonicalCampaign, as committed on NEAR (set by the server's lists) */
  configHash?: string;
};

export function publicCampaign(c: Campaign, completions: number): PublicCampaign {
  return { ...c, reward: { badge: c.reward.badge, hasClaim: !!(c.reward.claimUrl || c.reward.code) }, completions };
}

const clampInt = (v: unknown, [lo, hi]: readonly [number, number], dflt: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
/** short display text: cleanChat (no links, addresses or swear words), then capped */
const text = (v: unknown, max: number) => Array.from(cleanChat(v)).slice(0, max).join('').trim();
/** one emoji (or up to 2 characters of one): anything else falls back */
const emoji = (v: unknown, dflt: string) => {
  const s = typeof v === 'string' ? v.trim() : '';
  const m = s.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u);
  return m ? m[0] : dflt;
};
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '#00ec97');
const httpsUrl = (v: unknown) => {
  if (typeof v !== 'string' || v.length > CAMPAIGN_LIMITS.url) return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
};
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export type Validated = { ok: true; campaign: Campaign; notes: string[] } | { ok: false; why: string };

/**
 * Cleans and clamps anything (an MCP argument, an LLM draft) into a safe Campaign. Out-of-range numbers are clamped
 * and reported in `notes`; missing essentials are refused. `now` and `id` are filled in when absent.
 */
export function validateCampaign(raw: unknown, now = Date.now(), newId?: string): Validated {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const notes: string[] = [];
  const sponsorName = text(r.sponsor?.name ?? r.sponsorName, CAMPAIGN_LIMITS.name);
  if (!sponsorName) return { ok: false, why: 'sponsor.name is required' };
  const zone = (typeof r.zone === 'string' ? r.zone.toLowerCase() : '') as ZoneId;
  if (!(zone in ZONES)) return { ok: false, why: `zone must be one of: ${Object.keys(ZONES).join(', ')}` };
  const dropName = text(r.drop?.name, CAMPAIGN_LIMITS.name);
  if (!dropName) return { ok: false, why: 'drop.name is required (what players collect, e.g. "BONK meme")' };
  const badge = text(r.reward?.badge, CAMPAIGN_LIMITS.badge);
  if (!badge) return { ok: false, why: 'reward.badge is required (the badge title players earn)' };

  const count = clampInt(r.drop?.count, CAMPAIGN_LIMITS.count, 20);
  if (Number(r.drop?.count) !== count) notes.push(`drop.count set to ${count} (allowed ${CAMPAIGN_LIMITS.count.join('–')})`);
  let goal = clampInt(r.goal, CAMPAIGN_LIMITS.goal, 3);
  if (goal > count) goal = count;
  if (Number(r.goal) !== goal) notes.push(`goal set to ${goal}`);
  const supply = clampInt(r.supply, CAMPAIGN_LIMITS.supply, 500);
  if (Number(r.supply) !== supply) notes.push(`supply set to ${supply}`);

  const starts = Number.isFinite(Number(r.starts)) && Number(r.starts) > 0 ? Math.max(now, Number(r.starts)) : now;
  const days = clampInt(r.days, [1, CAMPAIGN_LIMITS.maxDays], 3);
  let ends = Number.isFinite(Number(r.ends)) && Number(r.ends) > starts ? Number(r.ends) : starts + days * 86400000;
  if (ends > starts + CAMPAIGN_LIMITS.maxDays * 86400000) {
    ends = starts + CAMPAIGN_LIMITS.maxDays * 86400000;
    notes.push(`ends capped at ${CAMPAIGN_LIMITS.maxDays} days`);
  }

  const claimUrl = httpsUrl(r.reward?.claimUrl);
  if (r.reward?.claimUrl && !claimUrl) notes.push('reward.claimUrl dropped: it must be a full https:// link');
  const code = typeof r.reward?.code === 'string' ? r.reward.code.replace(/[^\w\-.]/g, '').slice(0, CAMPAIGN_LIMITS.code) || undefined : undefined;
  const account = typeof r.sponsor?.account === 'string' && ACCOUNT_RE.test(r.sponsor.account) && r.sponsor.account.length <= 64 ? r.sponsor.account : undefined;

  const id =
    typeof r.id === 'string' && /^cmp-[a-z0-9]{6,20}$/.test(r.id) ? r.id : (newId ?? `cmp-${now.toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`);
  const title = text(r.title, CAMPAIGN_LIMITS.title) || `${sponsorName}: collect ${goal} ${dropName}`;
  const blurb = text(r.blurb, CAMPAIGN_LIMITS.blurb) || `Find ${goal} ${dropName} in ${ZONES[zone].name} to earn the ${badge} badge.`;
  return {
    ok: true,
    notes,
    campaign: {
      id,
      sponsor: { name: sponsorName, ...(account ? { account } : {}), emoji: emoji(r.sponsor?.emoji, emoji(r.drop?.emoji, '🎁')), color: color(r.sponsor?.color) },
      title,
      blurb,
      zone,
      drop: { name: dropName, emoji: emoji(r.drop?.emoji, '🎁'), count },
      goal,
      reward: { badge, ...(claimUrl ? { claimUrl } : {}), ...(code ? { code } : {}) },
      supply,
      starts,
      ends,
      status: r.status === 'ended' ? 'ended' : 'live',
    },
  };
}

/** canonical JSON (sorted keys) of the terms: what configHash hashes and what is committed on NEAR */
export function canonicalCampaign(c: Campaign): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  const { status: _s, ...terms } = c;
  return JSON.stringify(sort(terms));
}

/** FNV-1a: a small, stable hash for deterministic placement (not security) */
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The drop spots of a campaign: deterministic from its id, so the client and the server agree without storing them.
 * Spread on a sunflower spiral inside 0.8 × the zone radius, rotated by the id, at least ~2.5 m apart for typical counts.
 */
export function dropsOf(c: Pick<Campaign, 'id' | 'zone' | 'drop'>): { x: number; z: number }[] {
  const z = ZONES[c.zone];
  const n = c.drop.count;
  const rot = (fnv(c.id) / 0xffffffff) * Math.PI * 2;
  const R = z.r * 0.8;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const rr = R * Math.sqrt((i + 0.5) / n);
    const a = rot + i * golden;
    out.push({ x: +(z.x + Math.cos(a) * rr).toFixed(2), z: +(z.z + Math.sin(a) * rr).toFixed(2) });
  }
  return out;
}

export const isLive = (c: Pick<Campaign, 'status' | 'starts' | 'ends'>, now = Date.now()) => c.status === 'live' && now >= c.starts && now < c.ends;
