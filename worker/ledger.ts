// One Durable Object holding small durable records: sign-in nonces, wallet profiles
// (Seeker / supporter), tip orders, and invite counts. Single instance ("main").
import { DurableObject } from 'cloudflare:workers';
import { getBase58Decoder } from '@solana/kit';
import type { Env } from './index';
import { type Currency, associatedTokenAccount, seekerMints, serverRpc, signatureForReference, verifyTip } from './solana';
import { assetOwners, mintSpotAsset, treasurySigner } from './core';
import { BANNER_DAYS, LINES, PETS, PRICE_SOL, SPOTS, cleanName, type PricedKind, type SpotKind } from '../src/layout';

export type OrderKind = 'tip' | 'lantern24' | 'lantern7d' | 'bless24' | 'pet' | 'stone' | 'tree' | 'cushion' | 'banner';
type PriceEnv = { SKR_MINT?: string; SKR_PER_USDC?: string; PRICE_SCALE?: string };
/** SKR per US dollar (set for mainnet from the market; default 50). */
export function skrRate(env: { SKR_PER_USDC?: string }) {
  const r = Number(env.SKR_PER_USDC);
  return r > 0 ? r : 50;
}
/** Devnet runs at a fraction of the real price (PRICE_SCALE, e.g. 0.01) so testing costs pennies of test SOL. */
const scaleOf = (env: PriceEnv) => {
  const s = Number(env.PRICE_SCALE);
  return s > 0 && s <= 1 ? s : 1;
};
const sig3 = (n: number) => Number(n.toPrecision(3));
/** Price of one item in `currency`. Anchored in SOL (PRICE_SOL); USDC / SKR follow the live SOL price. */
export function priceIn(kind: PricedKind, currency: Currency, solUsd: number, env: PriceEnv) {
  const sol = PRICE_SOL[kind] * scaleOf(env);
  const usd = sol * solUsd;
  if (currency === 'USDC') return Math.max(0.01, Math.round(usd * 100) / 100);
  if (currency === 'SKR') return Math.max(1, Math.ceil(usd * skrRate(env)));
  return sig3(sol);
}
/** Price table for the app: USD and the matching SOL / USDC (/ SKR when on). */
export function priceTable(env: PriceEnv, solUsd: number) {
  return Object.fromEntries(
    (Object.keys(PRICE_SOL) as PricedKind[]).map((k) => [
      k,
      {
        // what it is worth in dollars today (full price, not the devnet test scale)
        USD: Math.round(PRICE_SOL[k] * solUsd * 100) / 100,
        SOL: priceIn(k, 'SOL', solUsd, env),
        USDC: priceIn(k, 'USDC', solUsd, env),
        ...(env.SKR_MINT ? { SKR: priceIn(k, 'SKR', solUsd, env) } : {}),
      },
    ]),
  );
}

export interface SpotOwner {
  owner: string;
  name: string;
  line: string;
  asset?: string;
  sig?: string;
  mintedAt?: number;
  mintError?: string;
  /** owner changed on chain (sold / transferred) since the purchase */
  movedAt?: number;
  /** rentals (patron banners): shown until this time */
  until?: number;
  order?: string;
}

export interface Profile {
  seeker: boolean;
  supporter: boolean;
  mints: string[];
  tips: number;
  checkedAt: number;
  /** simulated Seeker (devnet test wallet), never stored */
  testSeeker?: boolean;
}

export interface Order {
  id: string;
  reference: string;
  recipient: string;
  currency: Currency;
  amount: number;
  raw: string;
  decimals: number;
  mint?: string;
  recipientAta?: string;
  cluster: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'paid';
  signature?: string;
  payer?: string;
  kind: OrderKind;
  spot?: number;
  name?: string;
  line?: string;
  used?: boolean; // paid lantern already lit
  pet?: number; // which pet (kind 'pet')
  /** legendary pet reservation (supply check) */
  legend?: boolean;
  pid?: string; // visitor id that gets the pet (also kept by wallet)
}

const NONCE_TTL = 10 * 60000;
const ORDER_TTL = 10 * 60000;
const SEEKER_RECHECK = 60 * 60000;
const LIMITS = { SOL: { min: 0.001, max: 10, decimals: 9 }, USDC: { min: 0.5, max: 500, decimals: 6 }, SKR: { min: 10, max: 1000000, decimals: 6 } } as const;

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export class Ledger extends DurableObject<Env> {
  /** At most `max` actions per key per minute (simple abuse limit). */
  private async limited(key: string, max: number) {
    const k = `rl:${key}:${Math.floor(Date.now() / 60000)}`;
    const n = ((await this.ctx.storage.get<number>(k)) ?? 0) + 1;
    await this.ctx.storage.put(k, n);
    if (n === 1) await this.ensureAlarm();
    return n > max;
  }

  private async ensureAlarm() {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 60000);
  }

  async alarm() {
    // 1) recover paid-but-unconfirmed orders (payment found by its reference key), give up after 30 min
    const pend = await this.ctx.storage.list<number>({ prefix: 'pending:' });
    for (const [k, at] of pend) {
      const id = k.slice('pending:'.length);
      if (Date.now() - at > 30 * 60000) {
        await this.ctx.storage.delete(k);
        continue;
      }
      // back off: check at about 1, 2, 4, 8, 16 and 29 minutes (not every minute), so unpaid orders cost few RPC calls
      const min = Math.floor((Date.now() - at) / 60000);
      if (![1, 2, 4, 8, 16, 29].includes(min)) continue;
      const r = await this.confirmOrder(id).catch(() => null);
      if (r?.status === 'paid' && (!r.spot || r.spot.asset)) await this.ctx.storage.delete(k);
    }
    if ((await this.ctx.storage.list({ prefix: 'pending:', limit: 1 })).size) await this.ctx.storage.setAlarm(Date.now() + 60000);
    // sweep old rate-limit counters and expired nonces
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const rl = await this.ctx.storage.list<number>({ prefix: 'rl:' });
    const del: string[] = [];
    for (const k of rl.keys()) if (Number(k.split(':').pop()) < minute - 2) del.push(k);
    // unpaid orders older than a day are dropped (paid ones are kept as receipts)
    const orders = await this.ctx.storage.list<Order>({ prefix: 'o:' });
    for (const [k, o] of orders) if (o.status !== 'paid' && now - o.createdAt > 86400000) del.push(k);
    const nonces = await this.ctx.storage.list<number>({ prefix: 'nonce:' });
    for (const [k, t] of nonces) if (now - t > NONCE_TTL) del.push(k);
    for (let i = 0; i < del.length; i += 128) await this.ctx.storage.delete(del.slice(i, i + 128));
  }

  /** RPC relay limit: 60 calls per IP per minute. */
  async limitedIp(ip: string) {
    return this.limited(`rpc:${ip}`, 60);
  }

  async newNonce(ip: string): Promise<string | null> {
    if (await this.limited(`nonce:${ip}`, 20)) return null;
    const n = hex(rand(12));
    await this.ctx.storage.put(`nonce:${n}`, Date.now());
    return n;
  }

  async useNonce(n: string): Promise<boolean> {
    const t = await this.ctx.storage.get<number>(`nonce:${n}`);
    if (!t) return false;
    await this.ctx.storage.delete(`nonce:${n}`);
    return Date.now() - t < NONCE_TTL;
  }

  private async getProfile(addr: string): Promise<Profile> {
    return (await this.ctx.storage.get<Profile>(`p:${addr}`)) ?? { seeker: false, supporter: false, mints: [], tips: 0, checkedAt: 0 };
  }

  async profile(addr: string, recheck = false): Promise<Profile> {
    const p = await this.getProfile(addr);
    if (recheck || Date.now() - p.checkedAt > SEEKER_RECHECK) {
      try {
        const mints = await seekerMints(serverRpc(this.env, 'mainnet'), addr);
        p.mints = mints;
        p.seeker = mints.length > 0;
        p.checkedAt = Date.now();
        await this.ctx.storage.put(`p:${addr}`, p);
        // remember which wallet each SGT was last seen on (one device = one Seeker perk later)
        for (const m of mints) await this.ctx.storage.put(`sgt:${m}`, addr);
      } catch {
        /* RPC hiccup: keep the last known status */
      }
    }
    // devnet testing without a Seeker: wallets in SEEKER_TEST_WALLETS count as Seeker owners (ignored on mainnet)
    if (!p.seeker && this.isTestSeeker(addr)) return { ...p, seeker: true, testSeeker: true };
    return p;
  }

  private isTestSeeker(addr: string) {
    if (this.env.SOLANA_CLUSTER === 'mainnet') return false;
    return (this.env.SEEKER_TEST_WALLETS ?? '')
      .split(',')
      .map((s) => s.trim())
      .includes(addr);
  }

  async createOrder(
    ip: string,
    currency: string,
    amount: number,
    payer: string | null,
    meta: { kind?: string; spot?: number; name?: string; line?: string; pet?: number; pid?: string } = {},
  ): Promise<Order | { error: string }> {
    if (await this.limited(`order:${ip}`, 10)) return { error: 'Too many requests. Try again in a minute.' };
    if (currency !== 'SOL' && currency !== 'USDC' && currency !== 'SKR') return { error: 'Unsupported currency' };
    if (currency === 'SKR' && !this.env.SKR_MINT) return { error: 'SKR payments are not on yet.' };
    const kind = (meta.kind ?? 'tip') as OrderKind;
    if (!['tip', 'lantern24', 'lantern7d', 'bless24', 'pet', 'stone', 'tree', 'cushion', 'banner'].includes(kind)) return { error: 'Unknown item' };
    const lim = LIMITS[currency];
    let spot: number | undefined;
    let name: string | undefined;
    let line: string | undefined;
    let pet: number | undefined;
    let pid: string | undefined;
    let legend = false;
    if (kind === 'pet') {
      pet = Math.floor(Number(meta.pet));
      if (!(pet >= 1 && pet < PETS.length)) return { error: 'No such pet' };
      pid = typeof meta.pid === 'string' && /^[a-z0-9]{8,16}$/.test(meta.pid) ? meta.pid : undefined;
      if (!pid && !payer) return { error: 'Missing visitor id' };
      const supply = PETS[pet].legend;
      if (supply) {
        legend = true;
        const left = supply - (await this.legendTaken(pet));
        if (left <= 0) return { error: `All ${supply} ${PETS[pet].name}s are adopted.` };
      }
    }
    if (kind in SPOTS) {
      const sk = kind as SpotKind;
      if (SPOTS[sk].nft && !(this.env.TREASURY_KEY || this.env.DEV_NET_SOL) ) return { error: 'Not on sale yet.' };
      if (SPOTS[sk].nft && !this.collectionOf(sk)) return { error: `${SPOTS[sk].label}s are not on sale yet.` };
      spot = Math.floor(Number(meta.spot));
      if (!(spot >= 0 && spot < SPOTS[sk].count)) return { error: 'No such spot' };
      const held = await this.ctx.storage.get<SpotOwner>(`spot:${kind}:${spot}`);
      if (held && (!held.until || held.until > Date.now())) return { error: sk === 'banner' ? 'This banner is taken. Try another one.' : 'Someone already owns this one.' };
      const res = await this.ctx.storage.get<{ order: string; until: number }>(`res:${kind}:${spot}`);
      if (res && res.until > Date.now()) return { error: 'Someone is buying this one right now. Try another.' };
      name = cleanName(meta.name);
      line = LINES.includes(String(meta.line)) ? String(meta.line) : LINES[0];
      if (!name) return { error: 'Add a name for your ' + SPOTS[sk].label.toLowerCase() };
    }
    if (kind !== 'tip') amount = priceIn(kind as PricedKind, currency, await this.solUsd(), this.env);
    else if (!(amount >= lim.min && amount <= lim.max)) return { error: `Amount must be between ${lim.min} and ${lim.max} ${currency}` };
    const raw = BigInt(Math.round(amount * 10 ** lim.decimals)).toString();
    const now = Date.now();
    const mint = currency === 'USDC' ? this.env.USDC_MINT : currency === 'SKR' ? this.env.SKR_MINT : undefined;
    const o: Order = {
      id: hex(rand(8)),
      reference: getBase58Decoder().decode(rand(32)), // random public key, Solana Pay "reference"
      recipient: this.env.TIP_RECIPIENT,
      currency,
      amount,
      raw,
      decimals: lim.decimals,
      mint,
      recipientAta: mint ? await associatedTokenAccount(this.env.TIP_RECIPIENT, mint) : undefined,
      cluster: this.env.SOLANA_CLUSTER,
      createdAt: now,
      expiresAt: now + ORDER_TTL,
      status: 'pending',
      payer: payer ?? undefined,
      kind,
      spot,
      name,
      line,
      pet,
      pid,
      legend: legend || undefined,
    };
    await this.ctx.storage.put(`o:${o.id}`, o);
    if (legend && pet) await this.ctx.storage.put(`legres:${pet}:${o.id}`, o.expiresAt);
    if (spot !== undefined) await this.ctx.storage.put(`res:${kind}:${spot}`, { order: o.id, until: o.expiresAt });
    // remember it so the alarm can confirm it even if the buyer closes the app mid-payment
    await this.ctx.storage.put(`pending:${o.id}`, now);
    await this.ensureAlarm();
    return o;
  }

  async confirmOrder(id: string, signature?: string): Promise<{ status: string; order?: Order; reason?: string; profile?: Profile; spot?: SpotOwner }> {
    const o = await this.ctx.storage.get<Order>(`o:${id}`);
    if (!o) return { status: 'unknown' };
    if (o.status === 'paid') return { status: 'paid', order: o, spot: await this.deliverSpot(o) };
    let sig = typeof signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature) ? signature : null;
    if (!sig) sig = await signatureForReference(serverRpc(this.env, 'cluster'), o.reference).catch(() => null);
    if (!sig) return { status: Date.now() > o.expiresAt + ORDER_TTL ? 'expired' : 'pending' };
    if (await this.ctx.storage.get(`sig:${sig}`)) return { status: 'pending', reason: 'signature_used' };
    const r = await verifyTip(serverRpc(this.env, 'cluster'), sig, o).catch((e) => ({ ok: false as const, reason: String(e) }));
    if (!r.ok) return { status: 'pending', reason: r.reason };
    o.status = 'paid';
    o.signature = sig;
    o.payer = r.payer;
    await this.ctx.storage.put(`o:${o.id}`, o);
    await this.ctx.storage.put(`sig:${sig}`, o.id);
    await this.ctx.storage.delete(`pending:${o.id}`);
    if (o.kind === 'pet' && o.pet) await this.givePet(o.pet, o.pid, r.payer, o.id);
    const p = await this.getProfile(r.payer);
    p.supporter = true;
    p.tips += 1;
    await this.ctx.storage.put(`p:${r.payer}`, p);
    return { status: 'paid', order: o, profile: p, spot: await this.deliverSpot(o) };
  }

  /** After a stone/tree order is paid: record the owner and mint the NFT to them (retried on later calls if it failed). */
  private async deliverSpot(o: Order): Promise<SpotOwner | undefined> {
    if (!(o.kind in SPOTS) || o.spot === undefined || !o.payer) return undefined;
    const sk = o.kind as SpotKind;
    const key = `spot:${sk}:${o.spot}`;
    let rec = await this.ctx.storage.get<SpotOwner>(key);
    if (sk === 'banner') {
      // rented: 30 days from payment (a later rent by the same order is a no-op)
      if (!rec || rec.order !== o.id) {
        rec = { owner: o.payer, name: o.name ?? '', line: o.line ?? '', until: Date.now() + BANNER_DAYS * 86400000, order: o.id };
        await this.ctx.storage.put(key, rec);
      }
      await this.ctx.storage.delete(`res:${sk}:${o.spot}`);
      return rec;
    }
    if (rec && rec.owner !== o.payer && !rec.movedAt) return rec; // (cannot happen while reserved; kept safe)
    rec = rec ?? { owner: o.payer, name: o.name ?? '', line: o.line ?? '' };
    if (!rec.asset) {
      try {
        const treasury = await treasurySigner((this.env.TREASURY_KEY || this.env.DEV_NET_SOL)!);
        const m = await mintSpotAsset({
          rpcUrl: serverRpc(this.env, 'cluster'),
          treasury,
          collection: this.collectionOf(sk)!,
          owner: o.payer,
          name: `Quiet Hall ${SPOTS[sk].label} #${o.spot + 1}`,
          uri: `${this.env.PUBLIC_URL}/api/meta/${sk}/${o.spot}.json`,
        });
        rec.asset = m.asset;
        rec.sig = m.sig;
        rec.mintedAt = Date.now();
        delete rec.mintError;
      } catch (e) {
        rec.mintError = String(e).slice(0, 200);
      }
    }
    await this.ctx.storage.put(key, rec);
    await this.ctx.storage.delete(`res:${sk}:${o.spot}`);
    return rec;
  }

  /**
   * Refresh stone/tree owners from chain, so marketplace sales and transfers show the new holder.
   * Throttled: at most every 5 min (or every 20 s when `force`). Returns how many owners changed.
   */
  async syncOwners(force = false): Promise<number> {
    const last = (await this.ctx.storage.get<number>('sync:at')) ?? 0;
    if (Date.now() - last < (force ? 20000 : 5 * 60000)) return 0;
    await this.ctx.storage.put('sync:at', Date.now());
    const recs = await this.ctx.storage.list<SpotOwner>({ prefix: 'spot:' });
    const withAsset = [...recs].filter(([, r]) => r.asset);
    if (!withAsset.length) return 0;
    let owners: Map<string, string>;
    try {
      owners = await assetOwners(serverRpc(this.env, 'cluster'), withAsset.map(([, r]) => r.asset!));
    } catch {
      return 0; // RPC hiccup: try again next time
    }
    let changed = 0;
    for (const [k, r] of withAsset) {
      const now = owners.get(r.asset!);
      if (now && now !== r.owner) {
        r.owner = now;
        r.movedAt = Date.now();
        await this.ctx.storage.put(k, r);
        changed++;
      }
    }
    return changed;
  }

  async spots(kind: SpotKind): Promise<Record<number, SpotOwner>> {
    const out: Record<number, SpotOwner> = {};
    const now = Date.now();
    for (const [k, v] of await this.ctx.storage.list<SpotOwner>({ prefix: `spot:${kind}:` })) if (!v.until || v.until > now) out[Number(k.split(':')[2])] = v;
    return out;
  }

  async spot(kind: SpotKind, n: number) {
    return (await this.ctx.storage.get<SpotOwner>(`spot:${kind}:${n}`)) ?? null;
  }

  /** A paid lantern order can light exactly one lantern. Returns its tier or null. */
  async useLanternOrder(id: string): Promise<'lantern24' | 'lantern7d' | null> {
    const o = await this.ctx.storage.get<Order>(`o:${id}`);
    if (!o || o.status !== 'paid' || o.used || (o.kind !== 'lantern24' && o.kind !== 'lantern7d')) return null;
    o.used = true;
    await this.ctx.storage.put(`o:${o.id}`, o);
    return o.kind;
  }

  /** Record a bought pet for the visitor id and the paying wallet (so it comes back after signing in elsewhere). */
  private async givePet(k: number, pid: string | undefined, wallet: string, orderId?: string) {
    for (const key of [pid ? `pets:pid:${pid}` : '', `pets:w:${wallet}`]) {
      if (!key) continue;
      const list = (await this.ctx.storage.get<number[]>(key)) ?? [];
      if (!list.includes(k)) await this.ctx.storage.put(key, [...list, k].sort());
    }
    // legendary: number it (#n of supply), once per owner
    if (PETS[k]?.legend && !(await this.ctx.storage.get(`petno:${k}:w:${wallet}`))) {
      const n = ((await this.ctx.storage.get<number>(`legsold:${k}`)) ?? 0) + 1;
      await this.ctx.storage.put(`legsold:${k}`, n);
      await this.ctx.storage.put(`petno:${k}:w:${wallet}`, n);
      if (pid) await this.ctx.storage.put(`petno:${k}:p:${pid}`, n);
    }
    if (orderId) await this.ctx.storage.delete(`legres:${k}:${orderId}`);
  }

  /** Legendary pets sold plus ones being paid for right now (so the last few can't be oversold). */
  private async legendTaken(k: number) {
    const sold = (await this.ctx.storage.get<number>(`legsold:${k}`)) ?? 0;
    let held = 0;
    for (const [key, until] of await this.ctx.storage.list<number>({ prefix: `legres:${k}:` })) {
      if (until > Date.now()) held++;
      else await this.ctx.storage.delete(key);
    }
    return sold + held;
  }

  /** {pet: {sold, supply}} for every legendary pet */
  async legends() {
    const out: Record<number, { sold: number; supply: number }> = {};
    for (const [i, p] of PETS.entries()) if (p.legend) out[i] = { sold: (await this.ctx.storage.get<number>(`legsold:${i}`)) ?? 0, supply: p.legend };
    return out;
  }

  /** your legendary numbers {pet: n} */
  async petNumbers(pid: string, wallet: string) {
    const out: Record<number, number> = {};
    for (const [i, p] of PETS.entries()) {
      if (!p.legend) continue;
      const n = (wallet && (await this.ctx.storage.get<number>(`petno:${i}:w:${wallet}`))) || (pid && (await this.ctx.storage.get<number>(`petno:${i}:p:${pid}`)));
      if (n) out[i] = n;
    }
    return out;
  }

  /** NFT collection for a spot kind (unset = not on sale) */
  collectionOf(kind: SpotKind) {
    return { stone: this.env.STONE_COLLECTION, tree: this.env.TREE_COLLECTION, cushion: this.env.CUSHION_COLLECTION, banner: undefined }[kind];
  }

  /** Live SOL/USD (Jupiter price API), cached 5 min; falls back to the last known price, then 150. */
  async solUsd(): Promise<number> {
    const c = await this.ctx.storage.get<{ p: number; at: number }>('solusd');
    if (c && Date.now() - c.at < 5 * 60000) return c.p;
    try {
      const r = await fetch('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', { signal: AbortSignal.timeout(4000) });
      const j = (await r.json()) as Record<string, { usdPrice?: number }>;
      const p = Number(j['So11111111111111111111111111111111111111112']?.usdPrice);
      if (p > 1 && p < 100000) {
        await this.ctx.storage.put('solusd', { p, at: Date.now() });
        return p;
      }
    } catch {
      /* keep the last price */
    }
    return c?.p ?? 150;
  }

  /** Pets owned by this visitor id and/or signed-in wallet. */
  async ownedPets(pid: string, wallet: string): Promise<number[]> {
    const a = pid ? ((await this.ctx.storage.get<number[]>(`pets:pid:${pid}`)) ?? []) : [];
    const b = wallet ? ((await this.ctx.storage.get<number[]>(`pets:w:${wallet}`)) ?? []) : [];
    return [...new Set([...a, ...b])].sort();
  }

  /** A paid blessing order can be used exactly once. */
  async useBlessOrder(id: string): Promise<boolean> {
    const o = await this.ctx.storage.get<Order>(`o:${id}`);
    if (!o || o.status !== 'paid' || o.used || o.kind !== 'bless24') return false;
    o.used = true;
    await this.ctx.storage.put(`o:${o.id}`, o);
    return true;
  }

  /** Free daily item (lantern / bless): once per visitor and at most 3 per network per UTC day, across all rooms. */
  async useFree(kind: 'lantern' | 'bless', who: string, ip: string): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const kp = `free:${kind}:${who}:${day}`;
    const ki = `freeip:${kind}:${ip}:${day}`;
    const n = (await this.ctx.storage.get<number>(ki)) ?? 0;
    if ((await this.ctx.storage.get(kp)) || n >= 3) return false;
    await this.ctx.storage.put(kp, 1);
    await this.ctx.storage.put(ki, n + 1);
    return true;
  }

  /** Counts distinct friends who arrived through `host`'s link (one per network, so one phone can't farm it). */
  async recordInvite(host: string, friend: string, ip: string): Promise<number> {
    const k = `inv:${host}`;
    const list = (await this.ctx.storage.get<string[]>(k)) ?? [];
    const ipKey = `invip:${host}:${ip}`;
    if (await this.ctx.storage.get(ipKey)) return list.length;
    await this.ctx.storage.put(ipKey, 1);
    if (!list.includes(friend) && list.length < 100) {
      // a friend only counts once, for the first person who invited them
      if (!(await this.ctx.storage.get(`invby:${friend}`))) {
        list.push(friend);
        await this.ctx.storage.put(k, list);
        await this.ctx.storage.put(`invby:${friend}`, host);
      }
    }
    return list.length;
  }

  async invites(pid: string): Promise<number> {
    return ((await this.ctx.storage.get<string[]>(`inv:${pid}`)) ?? []).length;
  }
}
