// One Durable Object holding small durable records: sign-in nonces, wallet profiles
// (Seeker / supporter), tip orders, and invite counts. Single instance ("main").
import { DurableObject } from 'cloudflare:workers';
import { getBase58Decoder } from '@solana/kit';
import type { Env } from './index';
import { type Currency, associatedTokenAccount, seekerMints, serverRpc, signatureForReference, verifyTip } from './solana';
import { assetOwners, mintSpotAsset, treasurySigner } from './core';
import { LINES, PETS, STONE_COUNT, TREE_COUNT, cleanName } from '../src/layout';

export type OrderKind = 'tip' | 'lantern24' | 'lantern7d' | 'bless24' | 'pet' | 'stone' | 'tree';
/** Fixed prices for items (tips are any amount). Devnet SOL prices are tiny on purpose. */
export const PRICES: Record<Exclude<OrderKind, 'tip'>, { SOL: number; USDC: number }> = {
  lantern24: { SOL: 0.008, USDC: 1.49 },
  lantern7d: { SOL: 0.025, USDC: 3.99 },
  bless24: { SOL: 0.006, USDC: 0.99 },
  pet: { SOL: 0.015, USDC: 2.49 }, // one pet, yours forever
  stone: { SOL: 0.025, USDC: 24 },
  tree: { SOL: 0.04, USDC: 34 },
};
/** SKR price = USDC price × SKR_PER_USDC (set for mainnet from the market; default 50), rounded to whole SKR. */
export function skrRate(env: { SKR_PER_USDC?: string }) {
  const r = Number(env.SKR_PER_USDC);
  return r > 0 ? r : 50;
}
export function itemPrice(kind: Exclude<OrderKind, 'tip'>, currency: Currency, env: { SKR_PER_USDC?: string }) {
  const p = PRICES[kind];
  return currency === 'SKR' ? Math.ceil(p.USDC * skrRate(env)) : p[currency];
}
/** Price table for the app, including SKR when it is switched on. */
export function priceTable(env: { SKR_MINT?: string; SKR_PER_USDC?: string }) {
  return Object.fromEntries(
    Object.entries(PRICES).map(([k, p]) => [k, { ...p, ...(env.SKR_MINT ? { SKR: itemPrice(k as Exclude<OrderKind, 'tip'>, 'SKR', env) } : {}) }]),
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
}

export interface Profile {
  seeker: boolean;
  supporter: boolean;
  mints: string[];
  tips: number;
  checkedAt: number;
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
    return p;
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
    if (!['tip', 'lantern24', 'lantern7d', 'bless24', 'pet', 'stone', 'tree'].includes(kind)) return { error: 'Unknown item' };
    const lim = LIMITS[currency];
    if (kind !== 'tip') amount = itemPrice(kind as Exclude<OrderKind, 'tip'>, currency, this.env);
    else if (!(amount >= lim.min && amount <= lim.max)) return { error: `Amount must be between ${lim.min} and ${lim.max} ${currency}` };
    let spot: number | undefined;
    let name: string | undefined;
    let line: string | undefined;
    if (kind === 'stone' || kind === 'tree') {
      if (!(this.env.TREASURY_KEY || this.env.DEV_NET_SOL) || !this.env.STONE_COLLECTION || !this.env.TREE_COLLECTION) return { error: 'Stones and trees are not on sale yet.' };
      spot = Math.floor(Number(meta.spot));
      const max = kind === 'stone' ? STONE_COUNT : TREE_COUNT;
      if (!(spot >= 0 && spot < max)) return { error: 'No such spot' };
      if (await this.ctx.storage.get(`spot:${kind}:${spot}`)) return { error: 'Someone already owns this one.' };
      const res = await this.ctx.storage.get<{ order: string; until: number }>(`res:${kind}:${spot}`);
      if (res && res.until > Date.now()) return { error: 'Someone is buying this one right now. Try another.' };
      name = cleanName(meta.name);
      line = LINES.includes(String(meta.line)) ? String(meta.line) : LINES[0];
      if (!name) return { error: 'Add a name for your ' + kind };
    }
    let pet: number | undefined;
    let pid: string | undefined;
    if (kind === 'pet') {
      pet = Math.floor(Number(meta.pet));
      if (!(pet >= 1 && pet < PETS.length)) return { error: 'No such pet' };
      pid = typeof meta.pid === 'string' && /^[a-z0-9]{8,16}$/.test(meta.pid) ? meta.pid : undefined;
      if (!pid && !payer) return { error: 'Missing visitor id' };
    }
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
    };
    await this.ctx.storage.put(`o:${o.id}`, o);
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
    if (o.kind === 'pet' && o.pet) await this.givePet(o.pet, o.pid, r.payer);
    const p = await this.getProfile(r.payer);
    p.supporter = true;
    p.tips += 1;
    await this.ctx.storage.put(`p:${r.payer}`, p);
    return { status: 'paid', order: o, profile: p, spot: await this.deliverSpot(o) };
  }

  /** After a stone/tree order is paid: record the owner and mint the NFT to them (retried on later calls if it failed). */
  private async deliverSpot(o: Order): Promise<SpotOwner | undefined> {
    if ((o.kind !== 'stone' && o.kind !== 'tree') || o.spot === undefined || !o.payer) return undefined;
    const key = `spot:${o.kind}:${o.spot}`;
    let rec = await this.ctx.storage.get<SpotOwner>(key);
    if (rec && rec.owner !== o.payer) return rec; // (cannot happen while reserved; kept safe)
    rec = rec ?? { owner: o.payer, name: o.name ?? '', line: o.line ?? '' };
    if (!rec.asset) {
      try {
        const treasury = await treasurySigner((this.env.TREASURY_KEY || this.env.DEV_NET_SOL)!);
        const collection = o.kind === 'stone' ? this.env.STONE_COLLECTION! : this.env.TREE_COLLECTION!;
        const label = o.kind === 'stone' ? 'Stone' : 'Tree';
        const m = await mintSpotAsset({
          rpcUrl: serverRpc(this.env, 'cluster'),
          treasury,
          collection,
          owner: o.payer,
          name: `Quiet Hall ${label} #${o.spot + 1}`,
          uri: `${this.env.PUBLIC_URL}/api/meta/${o.kind}/${o.spot}.json`,
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
    await this.ctx.storage.delete(`res:${o.kind}:${o.spot}`);
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

  async spots(kind: 'stone' | 'tree'): Promise<Record<number, SpotOwner>> {
    const out: Record<number, SpotOwner> = {};
    for (const [k, v] of await this.ctx.storage.list<SpotOwner>({ prefix: `spot:${kind}:` })) out[Number(k.split(':')[2])] = v;
    return out;
  }

  async spot(kind: 'stone' | 'tree', n: number) {
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
  private async givePet(k: number, pid: string | undefined, wallet: string) {
    for (const key of [pid ? `pets:pid:${pid}` : '', `pets:w:${wallet}`]) {
      if (!key) continue;
      const list = (await this.ctx.storage.get<number[]>(key)) ?? [];
      if (!list.includes(k)) await this.ctx.storage.put(key, [...list, k].sort());
    }
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
