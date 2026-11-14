// NEAR Intents (1Click API): real solver quotes for the game's "real market" board, Biscuit and MCP agents.
// Quotes are `dry: true`: nothing is deposited or swapped, no key is needed. NEAR Intents has no testnet, so this
// reads mainnet prices; the game itself stays on testnet with play chips.
const BASE = 'https://1click.chaindefuser.com';
/** assets shown on the board: symbol → 1Click asset id */
export const INTENT_ASSETS: Record<string, { id: string; decimals: number }> = {
  NEAR: { id: 'nep141:wrap.near', decimals: 24 },
  USDC: { id: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6 },
};
const SHOW = ['wNEAR', 'BTC', 'ETH', 'SOL'];

export interface IntentsBoard {
  at: number;
  source: 'near-intents' | 'sample';
  /** USD prices NEAR Intents lists for a few assets */
  prices: { symbol: string; usd: number }[];
  /** one real dry quote: 1 NEAR → USDC */
  swap: { from: string; to: string; amountIn: string; amountOut: string; seconds: number } | null;
}

const SAMPLE: IntentsBoard = {
  at: 0,
  source: 'sample',
  prices: [{ symbol: 'NEAR', usd: 3.36 }, { symbol: 'BTC', usd: 67000 }, { symbol: 'ETH', usd: 2500 }, { symbol: 'SOL', usd: 150 }],
  swap: { from: 'NEAR', to: 'USDC', amountIn: '1.0', amountOut: '3.34', seconds: 12 },
};

let cache: IntentsBoard | null = null;
const TTL = 60_000;

/** one dry quote from NEAR Intents solvers. amount is in whole units of `from`. */
export async function intentsQuote(from: string, to: string, amount: number): Promise<{ ok: true; amountIn: string; amountOut: string; seconds: number } | { ok: false; why: string }> {
  const a = INTENT_ASSETS[from];
  const b = INTENT_ASSETS[to];
  if (!a || !b || a === b) return { ok: false, why: `Pairs: ${Object.keys(INTENT_ASSETS).join(', ')}.` };
  if (!(amount > 0) || amount > 1e6) return { ok: false, why: 'amount must be between 0 and 1,000,000.' };
  const raw = BigInt(Math.round(amount * 1e6)) * 10n ** BigInt(a.decimals - 6);
  try {
    const r = await fetch(`${BASE}/v0/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: a.id, depositType: 'INTENTS', destinationAsset: b.id,
        amount: raw.toString(), refundTo: 'relay.near', refundType: 'INTENTS', recipient: 'relay.near', recipientType: 'INTENTS',
        deadline: new Date(Date.now() + 3_600_000).toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { quote?: { amountInFormatted: string; amountOutFormatted: string; timeEstimate: number }; message?: string };
    if (!r.ok || !j.quote) return { ok: false, why: `NEAR Intents: ${String(j.message ?? r.status).slice(0, 80)}` };
    return { ok: true, amountIn: j.quote.amountInFormatted, amountOut: j.quote.amountOutFormatted, seconds: j.quote.timeEstimate };
  } catch (e) {
    return { ok: false, why: `NEAR Intents did not answer: ${String((e as Error)?.message ?? e).slice(0, 60)}` };
  }
}

async function refresh(): Promise<IntentsBoard> {
  const [tokens, q] = await Promise.all([
    fetch(`${BASE}/v0/tokens`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json()) as Promise<{ symbol: string; blockchain: string; price: number }[]>,
    intentsQuote('NEAR', 'USDC', 1),
  ]);
  const prices = SHOW.map((s) => {
    const t = tokens.find((x) => x.symbol === s && x.price > 0);
    return t ? { symbol: s === 'wNEAR' ? 'NEAR' : s, usd: Number(t.price.toFixed(t.price > 100 ? 0 : 2)) } : null;
  }).filter((x): x is { symbol: string; usd: number } => !!x);
  cache = { at: Date.now(), source: 'near-intents', prices, swap: q.ok ? { from: 'NEAR', to: 'USDC', amountIn: q.amountIn, amountOut: q.amountOut, seconds: q.seconds } : null };
  return cache;
}

/**
 * The board, cached for a minute. Never slows the game down: a stale board is returned at once (and refreshed for
 * the next caller); with nothing cached it waits at most 2.5 s, then answers with a labelled sample.
 * `mock` (tests) never calls out.
 */
export async function intentsBoard(mock: boolean): Promise<IntentsBoard> {
  if (mock) return { ...SAMPLE, at: Date.now() };
  if (cache && Date.now() - cache.at < TTL) return cache;
  const fresh = refresh().catch(() => null);
  if (cache) return cache;
  const got = await Promise.race([fresh, new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
  return got ?? { ...SAMPLE, at: Date.now() };
}

export const intentsLine = (b: IntentsBoard) =>
  `${b.prices.map((p) => `${p.symbol} $${p.usd}`).join(', ')}${b.swap ? `; a real solver quote: ${b.swap.amountIn} ${b.swap.from} swaps to ${b.swap.amountOut} ${b.swap.to} in about ${b.swap.seconds} s` : ''}`;
