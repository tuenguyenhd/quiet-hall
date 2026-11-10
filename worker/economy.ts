// Economy Durable Object: Leaves, the bag and daily caps in ONE store, so a craft or a sale is all-or-nothing.
// Design: design/gdd/leaves-economy.md (rules 1–8) and edition-near.md ("NEAR value table").
// One instance ('main'). Every change inserts a row {acct, delta, reason, ref, day, ts} and updates the stored
// balance in the same transaction; the rows are the audit trail.
import { DurableObject } from 'cloudflare:workers';
import { ECONOMY, edition, type EconomyConfig, type Reason } from '../src/economy';
import { GATHER, WISH_REWARD, frenById, nodeById, recipeById, type Fren, type Item } from '../src/valley';
import { APPRENTICES, CUP, MARKET, PRICE, askOf, bidOf, marketItem, midPrice } from '../src/market';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ownerId, type Job, type Mirror } from './mirror';

interface EconEnv {
  EDITION?: string;
  MIRROR?: DurableObjectNamespace<Mirror>;
  OWNER_SECRET?: string;
  /** test hooks: Cup round length and join cut-off in game minutes */
  CUP_ROUND_MIN?: string;
  CUP_JOIN_CLOSE_MIN?: string;
  /** test hook: length of one "game minute" in ms (default 60000). Lets scripts sit for seconds, not minutes. */
  MINUTE_MS?: string;
}

/** one "game minute" in ms: 60000, or MINUTE_MS for tests */
export const minuteMs = (v?: string) => {
  const m = Number(v);
  return Number.isFinite(m) && m >= 50 ? m : 60_000;
};

const DAY_MS = 86_400_000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const prevDay = (d: string) => dayOf(Date.parse(d + 'T00:00:00Z') - DAY_MS);

export interface SitResult {
  paid: number;
  minutes: number;
  streak: number;
  welcome: number;
  balance: number;
}

export interface EconState {
  leaves: number;
  bag: Record<string, number>;
  today: Partial<Record<Reason, number>>;
  streak: number;
}

export class Economy extends DurableObject<EconEnv> {
  private sql: SqlStorage;
  private cfg: EconomyConfig;
  private minuteMs: number;

  constructor(ctx: DurableObjectState, env: EconEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.cfg = ECONOMY[edition(env.EDITION)];
    this.minuteMs = minuteMs(env.MINUTE_MS);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS accts(acct TEXT PRIMARY KEY, leaves INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL,
        streak INTEGER NOT NULL DEFAULT 0, streak_day TEXT NOT NULL DEFAULT '', last_sit_end INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS rows(id INTEGER PRIMARY KEY AUTOINCREMENT, acct TEXT NOT NULL, delta INTEGER NOT NULL,
        reason TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', day TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS rows_by_day ON rows(acct, day, reason);
      CREATE TABLE IF NOT EXISTS bag(acct TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY(acct, item));
      CREATE TABLE IF NOT EXISTS nodes(acct TEXT NOT NULL, node TEXT NOT NULL, stock INTEGER NOT NULL, anchor INTEGER NOT NULL, PRIMARY KEY(acct, node));
      CREATE TABLE IF NOT EXISTS picks(acct TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY(acct, day));
      CREATE TABLE IF NOT EXISTS wishes(acct TEXT NOT NULL, fren TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, started INTEGER NOT NULL,
        PRIMARY KEY(acct, fren, day));
      CREATE TABLE IF NOT EXISTS frens(acct TEXT NOT NULL, fren TEXT NOT NULL, serial INTEGER NOT NULL, first_at INTEGER NOT NULL,
        rescues INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(acct, fren));
      CREATE TABLE IF NOT EXISTS drips(acct TEXT NOT NULL, kind TEXT NOT NULL, serial INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(kind, serial));
      CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS market(item TEXT PRIMARY KEY, gap REAL NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS price_hist(ts INTEGER NOT NULL, item TEXT NOT NULL, bid INTEGER NOT NULL, ask INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS price_hist_ts ON price_hist(ts);
      CREATE TABLE IF NOT EXISTS trade_last(acct TEXT PRIMARY KEY, last INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cup_rounds(id TEXT PRIMARY KEY, start INTEGER NOT NULL, end_at INTEGER NOT NULL, setup TEXT NOT NULL,
        setup_hash TEXT NOT NULL, status TEXT NOT NULL, results TEXT, results_hash TEXT);
      CREATE TABLE IF NOT EXISTS cup_entries(round TEXT NOT NULL, acct TEXT NOT NULL, chips INTEGER NOT NULL, trades INTEGER NOT NULL DEFAULT 0,
        joined INTEGER NOT NULL, ip TEXT NOT NULL, owner TEXT NOT NULL, PRIMARY KEY(round, acct));
      CREATE TABLE IF NOT EXISTS cup_bag(round TEXT NOT NULL, acct TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL,
        traded INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(round, acct, item));
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS links(account TEXT PRIMARY KEY, acct TEXT NOT NULL UNIQUE, at INTEGER NOT NULL);
    `);
  }

  // ---------- internals (call only inside transactionSync) ----------

  private balanceOf(acct: string): number {
    const r = this.sql.exec<{ leaves: number }>('SELECT leaves FROM accts WHERE acct = ?', acct).toArray()[0];
    return r?.leaves ?? 0;
  }

  /** creates the account on first touch; returns the welcome Leaves written (0 if not new) */
  private ensure(acct: string, now: number): number {
    const exists = this.sql.exec('SELECT 1 FROM accts WHERE acct = ?', acct).toArray().length > 0;
    if (exists) return 0;
    this.sql.exec('INSERT INTO accts(acct, leaves, created) VALUES (?, 0, ?)', acct, now);
    if (this.cfg.starterLeaves > 0) return this.write(acct, this.cfg.starterLeaves, 'welcome', '', now);
    return 0;
  }

  /** writes one row and moves the balance. Positive deltas respect the pouch cap; returns the delta written. */
  private write(acct: string, delta: number, reason: Reason, ref: string, now: number, day = dayOf(now)): number {
    if (!Number.isInteger(delta) || delta === 0) return 0;
    const bal = this.balanceOf(acct);
    let d = delta;
    if (d > 0 && this.cfg.pouchCap > 0) d = Math.min(d, Math.max(0, this.cfg.pouchCap - bal));
    if (d === 0) return 0;
    if (bal + d < 0) throw new Error('insufficient');
    this.sql.exec('INSERT INTO rows(acct, delta, reason, ref, day, ts) VALUES (?, ?, ?, ?, ?, ?)', acct, d, reason, ref, day, now);
    this.sql.exec('UPDATE accts SET leaves = leaves + ? WHERE acct = ?', d, acct);
    return d;
  }

  private earnedOn(acct: string, day: string, reason: Reason): number {
    const r = this.sql
      .exec<{ s: number | null }>('SELECT SUM(delta) AS s FROM rows WHERE acct = ? AND day = ? AND reason = ? AND delta > 0', acct, day, reason)
      .toArray()[0];
    return r?.s ?? 0;
  }

  /** a capped faucet: writes at most what is left of today's cap */
  private earnCapped(acct: string, amount: number, reason: Reason, ref: string, now: number, day = dayOf(now)): number {
    const cap = reason === 'sit' ? this.cfg.sitCap : this.cfg.caps[reason];
    const left = cap === undefined ? amount : Math.max(0, cap - this.earnedOn(acct, day, reason));
    return this.write(acct, Math.min(amount, left), reason, ref, now, day);
  }

  // ---------- public RPC ----------

  /**
   * Pays a finished sit. Time is measured by the Hall from the server clock; hidden time is subtracted.
   * A sit that crosses 00:00 UTC is split; each part counts against its own day's cap. MIN_SIT is tested on the whole sit.
   * The first paying sit of a UTC day also pays the streak bonus.
   */
  paySit(acct: string, startMs: number, endMs: number, hiddenMs: number): SitResult {
    return this.ctx.storage.transactionSync(() => {
      const now = endMs;
      const welcome = this.ensure(acct, now);
      // never pay the same minutes twice (two devices / two tabs sitting at once): start after the last paid sit
      const last = this.sql.exec<{ e: number }>('SELECT last_sit_end AS e FROM accts WHERE acct = ?', acct).toArray()[0]?.e ?? 0;
      const fullWall = Math.max(0, endMs - startMs);
      if (last > startMs) startMs = Math.min(endMs, last);
      const wall = Math.max(0, endMs - startMs);
      const hiddenShare = fullWall > 0 ? Math.max(0, hiddenMs) * (wall / fullWall) : 0;
      const counted = Math.max(0, wall - hiddenShare);
      if (endMs > last) this.sql.exec('UPDATE accts SET last_sit_end = ? WHERE acct = ?', endMs, acct);
      const minutes = Math.floor(counted / this.minuteMs);
      let paid = 0;
      let streakPaid = 0;
      if (minutes >= this.cfg.minSit && wall > 0) {
        // split at UTC midnights, minutes shared in proportion to wall time in each day
        const parts: { day: string; ms: number }[] = [];
        for (let t = startMs; t < endMs; ) {
          const dayEnd = Math.floor(t / DAY_MS) * DAY_MS + DAY_MS;
          const to = Math.min(endMs, dayEnd);
          parts.push({ day: dayOf(t), ms: to - t });
          t = to;
        }
        let left = minutes;
        parts.forEach((p, i) => {
          const share = i === parts.length - 1 ? left : Math.floor((minutes * p.ms) / wall);
          left -= share;
          paid += this.earnCapped(acct, share, 'sit', '', now, p.day);
        });
        // streak: first paying sit of the end day
        const today = dayOf(endMs);
        const a = this.sql.exec<{ streak: number; streak_day: string }>('SELECT streak, streak_day FROM accts WHERE acct = ?', acct).toArray()[0];
        if (a && a.streak_day !== today) {
          const streak = a.streak_day === prevDay(today) ? a.streak + 1 : 1;
          this.sql.exec('UPDATE accts SET streak = ?, streak_day = ? WHERE acct = ?', streak, today, acct);
          streakPaid = this.write(acct, Math.min(this.cfg.streakStep * streak, this.cfg.streakMax), 'streak', '', now);
        }
      }
      const streak = this.sql.exec<{ streak: number }>('SELECT streak FROM accts WHERE acct = ?', acct).toArray()[0]?.streak ?? 0;
      return { paid: paid + streakPaid, minutes, streak, welcome, balance: this.balanceOf(acct) };
    });
  }

  /** Creates the account (and pays the welcome Leaves) without anything else. */
  touch(acct: string): number {
    return this.ctx.storage.transactionSync(() => {
      this.ensure(acct, Date.now());
      return this.balanceOf(acct);
    });
  }

  // ---------- bag ----------

  private qty(acct: string, item: string): number {
    return this.sql.exec<{ qty: number }>('SELECT qty FROM bag WHERE acct = ? AND item = ?', acct, item).toArray()[0]?.qty ?? 0;
  }

  /** adds items; false if the bag has no free slot for a new item or the stack would overflow */
  private bagAdd(acct: string, item: string, n: number): boolean {
    const have = this.qty(acct, item);
    if (have + n > GATHER.stack) return false;
    if (have === 0) {
      const used = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM bag WHERE acct = ? AND qty > 0', acct).toArray()[0].n;
      if (used >= GATHER.bagSlots) return false;
    }
    this.sql.exec('INSERT INTO bag(acct, item, qty) VALUES (?, ?, ?) ON CONFLICT(acct, item) DO UPDATE SET qty = qty + excluded.qty', acct, item, n);
    return true;
  }

  private has(acct: string, needs: Partial<Record<string, number>>): boolean {
    return Object.entries(needs).every(([item, n]) => this.qty(acct, item) >= (n ?? 0));
  }

  private bagTake(acct: string, needs: Partial<Record<string, number>>) {
    for (const [item, n] of Object.entries(needs)) this.sql.exec('UPDATE bag SET qty = qty - ? WHERE acct = ? AND item = ?', n ?? 0, acct, item);
  }

  private next(counter: string): number {
    this.sql.exec('INSERT INTO counters(name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1', counter);
    return this.sql.exec<{ value: number }>('SELECT value FROM counters WHERE name = ?', counter).toArray()[0].value;
  }

  // ---------- gathering (personal stock per node) ----------

  /**
   * One pick at a node. Personal stock: taking a unit never reduces anyone else's.
   * Regrow keeps partial progress (meme-valley.md, Formulas). Distance is checked by the Hall before calling.
   */
  pick(acct: string, nodeId: string): { ok: boolean; why?: string; item?: Item; stock?: number; next?: number; picked?: number } {
    const node = nodeById(nodeId);
    if (!node) return { ok: false, why: 'unknown node' };
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      const day = dayOf(now);
      this.ensure(acct, now);
      const p = this.sql.exec<{ n: number; last: number }>('SELECT n, last FROM picks WHERE acct = ? AND day = ?', acct, day).toArray()[0];
      if (p && now - p.last < GATHER.pickMs) return { ok: false, why: 'too fast' };
      if (p && p.n >= GATHER.dailyLimit) return { ok: false, why: "You've gathered enough for today. Sit a while?" };
      const regrow = node.regrowMin * this.minuteMs;
      const row = this.sql.exec<{ stock: number; anchor: number }>('SELECT stock, anchor FROM nodes WHERE acct = ? AND node = ?', acct, node.id).toArray()[0];
      let stock = row ? row.stock : node.max;
      let anchor = row ? row.anchor : now;
      if (row && stock < node.max) {
        const grown = Math.floor((now - anchor) / regrow);
        stock = Math.min(node.max, stock + grown);
        anchor = stock === node.max ? now : anchor + grown * regrow;
      }
      if (stock <= 0) return { ok: false, why: 'empty', stock: 0, next: anchor + regrow };
      if (!this.bagAdd(acct, node.item, 1)) return { ok: false, why: 'Your bag is full.' };
      if (stock === node.max) anchor = now;
      stock -= 1;
      this.sql.exec('INSERT OR REPLACE INTO nodes(acct, node, stock, anchor) VALUES (?, ?, ?, ?)', acct, node.id, stock, anchor);
      this.sql.exec(
        'INSERT INTO picks(acct, day, n, last) VALUES (?, ?, 1, ?) ON CONFLICT(acct, day) DO UPDATE SET n = n + 1, last = excluded.last',
        acct,
        day,
        now,
      );
      const picked = this.sql.exec<{ n: number }>('SELECT n FROM picks WHERE acct = ? AND day = ?', acct, day).toArray()[0].n;
      return { ok: true, item: node.item, stock, next: stock < node.max ? anchor + regrow : 0, picked };
    });
  }

  // ---------- wishes and rescues ----------

  /** Grant: takes the wish's materials and opens the 1-minute sit. One rescue per fren per UTC day (NEAR build). */
  startWish(acct: string, frenId: string): { ok: boolean; why?: string } {
    const fren = frenById(frenId);
    if (!fren) return { ok: false, why: 'unknown fren' };
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      const day = dayOf(now);
      this.ensure(acct, now);
      const w = this.sql.exec<{ status: string }>('SELECT status FROM wishes WHERE acct = ? AND fren = ? AND day = ?', acct, fren.id, day).toArray()[0];
      if (w?.status === 'rescued') return { ok: false, why: 'Already helped today.' };
      if (w?.status === 'open') return { ok: true };
      if (!this.has(acct, fren.wish)) return { ok: false, why: 'missing' };
      this.bagTake(acct, fren.wish);
      this.sql.exec('INSERT OR REPLACE INTO wishes(acct, fren, day, status, started) VALUES (?, ?, ?, ?, ?)', acct, fren.id, day, 'open', now);
      return { ok: true };
    });
  }

  /** The granter stood up or walked away before the sit finished: give the materials back. */
  cancelWish(acct: string, frenId: string): boolean {
    const fren = frenById(frenId);
    if (!fren) return false;
    return this.ctx.storage.transactionSync(() => {
      const day = dayOf(Date.now());
      const w = this.sql.exec<{ status: string }>('SELECT status FROM wishes WHERE acct = ? AND fren = ? AND day = ?', acct, fren.id, day).toArray()[0];
      if (w?.status !== 'open') return false;
      for (const [item, n] of Object.entries(fren.wish)) this.bagAdd(acct, item, n ?? 0);
      this.sql.exec('DELETE FROM wishes WHERE acct = ? AND fren = ? AND day = ?', acct, fren.id, day);
      return true;
    });
  }

  /**
   * Completes a rescue for the granter and every co-rescuer, in one transaction. Co-rescuers need no materials.
   * First rescue of a fren ever → it joins the player's frens with the next serial (to be mirrored on NEAR).
   * Every rescue pays the wish reward within the daily cap.
   */
  rescue(granter: string, frenId: string, co: string[]): { acct: string; first: boolean; serial: number; paid: number; co: boolean }[] {
    const fren = frenById(frenId);
    if (!fren) return [];
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      const day = dayOf(now);
      const w = this.sql.exec<{ status: string }>('SELECT status FROM wishes WHERE acct = ? AND fren = ? AND day = ?', granter, fren.id, day).toArray()[0];
      if (w?.status !== 'open') return [];
      const out: { acct: string; first: boolean; serial: number; paid: number; co: boolean }[] = [];
      for (const acct of [granter, ...co.filter((c) => c !== granter)]) {
        this.ensure(acct, now);
        const done = this.sql.exec('SELECT 1 FROM wishes WHERE acct = ? AND fren = ? AND day = ? AND status = ?', acct, fren.id, day, 'rescued').toArray().length;
        if (done) continue;
        this.sql.exec('INSERT OR REPLACE INTO wishes(acct, fren, day, status, started) VALUES (?, ?, ?, ?, ?)', acct, fren.id, day, 'rescued', now);
        const have = this.sql.exec<{ serial: number }>('SELECT serial FROM frens WHERE acct = ? AND fren = ?', acct, fren.id).toArray()[0];
        let first = false;
        let serial = have?.serial ?? 0;
        if (have) this.sql.exec('UPDATE frens SET rescues = rescues + 1 WHERE acct = ? AND fren = ?', acct, fren.id);
        else {
          first = true;
          serial = this.next(`fren:${fren.id}`);
          this.sql.exec('INSERT INTO frens(acct, fren, serial, first_at) VALUES (?, ?, ?, ?)', acct, fren.id, serial, now);
        }
        const paid = this.earnCapped(acct, WISH_REWARD, 'wish', fren.id, now);
        out.push({ acct, first, serial, paid, co: acct !== granter });
      }
      return out;
    });
  }

  // ---------- crafting ----------

  craft(acct: string, recipeId: string): { ok: boolean; why?: string; kind?: string; serial?: number; balance?: number } {
    const r = recipeById(recipeId);
    if (!r) return { ok: false, why: 'unknown recipe' };
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      this.ensure(acct, now);
      if (!this.has(acct, r.needs)) return { ok: false, why: 'missing' };
      if (this.balanceOf(acct) < r.fee) return { ok: false, why: `You need ${r.fee} Leaves. A short sit will do it.` };
      this.bagTake(acct, r.needs);
      if (!this.bagAdd(acct, r.id, 1)) throw new Error('bag full'); // rolls the whole craft back
      this.write(acct, -r.fee, 'craft_fee', r.id, now);
      const serial = this.next(`drip:${r.id}`);
      this.sql.exec('INSERT INTO drips(acct, kind, serial, at) VALUES (?, ?, ?, ?)', acct, r.id, serial, now);
      return { ok: true, kind: r.id, serial, balance: this.balanceOf(acct) };
    });
  }

  /** the player's rescued frens and crafted drip (Rescue Book) */
  book(acct: string): { frens: { fren: Fren; serial: number; rescues: number }[]; drips: { kind: string; serial: number }[] } {
    return {
      frens: this.sql.exec<{ fren: Fren; serial: number; rescues: number }>('SELECT fren, serial, rescues FROM frens WHERE acct = ? ORDER BY first_at', acct).toArray(),
      drips: this.sql.exec<{ kind: string; serial: number }>('SELECT kind, serial FROM drips WHERE acct = ? ORDER BY at', acct).toArray(),
    };
  }

  /** open wish for this player today, if any (for the Hall after a reconnect) */
  openWish(acct: string): string | null {
    return this.sql.exec<{ fren: string }>("SELECT fren FROM wishes WHERE acct = ? AND day = ? AND status = 'open'", acct, dayOf(Date.now())).toArray()[0]?.fren ?? null;
  }

  // ---------- Kettle's Living Market (prices moved by every player's trades) ----------

  private roundLenMs(): number {
    const v = Number(this.env.CUP_ROUND_MIN);
    return (Number.isFinite(v) && v > 0 ? v : CUP.roundMin) * this.minuteMs;
  }
  private joinCloseMs(): number {
    const v = Number(this.env.CUP_JOIN_CLOSE_MIN);
    return (Number.isFinite(v) && v >= 0 ? v : CUP.joinCloseMin) * this.minuteMs;
  }

  /** the item's gap after decay toward 0 since it was last stored */
  private gapNow(item: string, now: number): number {
    const r = this.sql.exec<{ gap: number; updated: number }>('SELECT gap, updated FROM market WHERE item = ?', item).toArray()[0];
    if (!r) return 0;
    const mins = Math.max(0, (now - r.updated) / this.minuteMs);
    return r.gap * Math.pow(1 - PRICE.decayPerMin, mins);
  }
  private setGap(item: string, gap: number, now: number) {
    this.sql.exec('INSERT OR REPLACE INTO market(item, gap, updated) VALUES (?, ?, ?)', item, gap, now);
  }

  /** current quotes for every market item */
  quotes(now = Date.now()): { item: Item; bid: number; ask: number; mid: number }[] {
    return MARKET.map((m) => {
      const mid = midPrice(m, this.gapNow(m.item, now));
      return { item: m.item, bid: bidOf(mid), ask: askOf(mid), mid: Math.round(mid * 100) / 100 };
    });
  }

  /** prices along the curve for n units, one unit at a time; returns the total and the new gap */
  private walk(item: string, side: 'buy' | 'sell', n: number, gap: number): { total: number; gap: number } {
    const m = marketItem(item)!;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const mid = midPrice(m, gap);
      if (side === 'buy') {
        total += askOf(mid);
        gap += 1;
      } else {
        total += bidOf(mid);
        gap -= 1;
      }
    }
    return { total, gap };
  }

  private currentRound(now: number): { id: string; start: number; end: number } {
    const len = this.roundLenMs();
    const start = Math.floor(now / len) * len;
    const iso = new Date(start).toISOString(); // 2026-11-14T03:00:00.000Z → 20261114-030000
    return { id: iso.slice(0, 10).replace(/-/g, '') + '-' + iso.slice(11, 19).replace(/:/g, ''), start, end: start + len };
  }

  /**
   * One trade against Kettle. `cup` trades use the player's Cup chips and Cup bag for the current round;
   * real trades use Leaves and the bag. Both move the same prices.
   */
  trade(acct: string, item: string, side: 'buy' | 'sell', n: number, cup: boolean):
    { ok: boolean; why?: string; total?: number; balance?: number; chips?: number; quotes?: ReturnType<Economy['quotes']> } {
    if (!marketItem(item)) return { ok: false, why: 'unknown item' };
    if (side !== 'buy' && side !== 'sell') return { ok: false, why: 'bad side' };
    if (!Number.isInteger(n) || n < 1 || n > PRICE.maxUnits) return { ok: false, why: `1 to ${PRICE.maxUnits} units` };
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      this.ensure(acct, now);
      const last = this.sql.exec<{ last: number }>('SELECT last FROM trade_last WHERE acct = ?', acct).toArray()[0]?.last ?? 0;
      if (now - last < PRICE.tradeGapMin * this.minuteMs) return { ok: false, why: 'too fast' };
      const gap0 = this.gapNow(item, now);
      const { total, gap } = this.walk(item, side, n, gap0);
      if (cup) {
        const r = this.currentRound(now);
        const e = this.sql.exec<{ chips: number }>('SELECT chips FROM cup_entries WHERE round = ? AND acct = ?', r.id, acct).toArray()[0];
        if (!e) return { ok: false, why: 'Join the Cup first.' };
        if (now >= r.end) return { ok: false, why: 'This round has ended.' };
        const row = this.sql.exec<{ qty: number; traded: number }>('SELECT qty, traded FROM cup_bag WHERE round = ? AND acct = ? AND item = ?', r.id, acct, item).toArray()[0];
        const qty = row?.qty ?? 0;
        const traded = row?.traded ?? 0;
        if (traded + n > CUP.maxUnitsPerItem) return { ok: false, why: `Cup limit: ${CUP.maxUnitsPerItem} units of each item per round` };
        if (side === 'buy' && e.chips < total) return { ok: false, why: 'Not enough chips.' };
        if (side === 'sell' && qty < n) return { ok: false, why: 'You do not hold that many in the Cup.' };
        const dq = side === 'buy' ? n : -n;
        const dc = side === 'buy' ? -total : total;
        this.sql.exec(
          'INSERT INTO cup_bag(round, acct, item, qty, traded) VALUES (?, ?, ?, ?, ?) ON CONFLICT(round, acct, item) DO UPDATE SET qty = qty + ?, traded = traded + ?',
          r.id, acct, item, dq, n, dq, n,
        );
        this.sql.exec('UPDATE cup_entries SET chips = chips + ?, trades = trades + 1 WHERE round = ? AND acct = ?', dc, r.id, acct);
      } else if (side === 'buy') {
        if (this.balanceOf(acct) < total) return { ok: false, why: 'Not enough Leaves.' };
        if (!this.bagAdd(acct, item, n)) return { ok: false, why: 'Your bag is full.' };
        this.write(acct, -total, 'market_buy', item, now);
      } else {
        if (this.qty(acct, item) < n) return { ok: false, why: 'You do not have that many.' };
        const cap = this.cfg.caps.market_sell ?? Infinity;
        if (this.earnedOn(acct, dayOf(now), 'market_sell') + total > cap) return { ok: false, why: `The Market buys at most ${cap} Leaves' worth from you a day.` };
        this.bagTake(acct, { [item]: n });
        this.write(acct, total, 'market_sell', item, now);
      }
      this.setGap(item, gap, now);
      this.sql.exec('INSERT OR REPLACE INTO trade_last(acct, last) VALUES (?, ?)', acct, now);
      const chips = cup
        ? this.sql.exec<{ chips: number }>('SELECT chips FROM cup_entries WHERE round = ? AND acct = ?', this.currentRound(now).id, acct).toArray()[0]?.chips
        : undefined;
      return { ok: true, total, balance: this.balanceOf(acct), chips, quotes: this.quotes(now) };
    });
  }

  // ---------- the Market Cup ----------

  /** Joins the current round: free, needs one paid sit minute ever, at most 3 entrants per network address. */
  async cupJoin(acct: string, ip: string): Promise<{ ok: boolean; why?: string; round?: string; chips?: number; end?: number }> {
    await this.tick();
    const owner = this.linkedAccount(acct) ?? (await ownerId(this.env.OWNER_SECRET || 'dev-only-owner-secret', acct));
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      const r = this.currentRound(now);
      const sat = this.sql.exec("SELECT 1 FROM rows WHERE acct = ? AND reason = 'sit' AND delta > 0 LIMIT 1", acct).toArray().length;
      if (!sat) return { ok: false, why: 'Sit for a minute first. The Cup is for people who have sat in the hall.' };
      if (this.sql.exec('SELECT 1 FROM cup_entries WHERE round = ? AND acct = ?', r.id, acct).toArray().length) return { ok: true, round: r.id, end: r.end };
      if (now > r.end - this.joinCloseMs()) return { ok: false, why: 'Joins close 30 minutes before the end. Next round soon.' };
      const n = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM cup_entries WHERE round = ? AND ip = ?', r.id, ip).toArray()[0].n;
      if (n >= CUP.maxEntrantsPerAddress) return { ok: false, why: 'Too many entrants from this network this round.' };
      this.sql.exec('INSERT INTO cup_entries(round, acct, chips, joined, ip, owner) VALUES (?, ?, ?, ?, ?, ?)', r.id, acct, CUP.chips, now, ip, owner);
      return { ok: true, round: r.id, chips: CUP.chips, end: r.end };
    });
  }

  private scores(round: string, quotes: { item: string; bid: number }[]) {
    const bid = Object.fromEntries(quotes.map((q) => [q.item, q.bid]));
    const entries = this.sql
      .exec<{ acct: string; chips: number; trades: number; joined: number; owner: string }>('SELECT acct, chips, trades, joined, owner FROM cup_entries WHERE round = ?', round)
      .toArray();
    return entries
      .map((e) => {
        let score = e.chips;
        for (const b of this.sql.exec<{ item: string; qty: number }>('SELECT item, qty FROM cup_bag WHERE round = ? AND acct = ?', round, e.acct)) score += b.qty * (bid[b.item] ?? 0);
        return { ...e, score };
      })
      .sort((a, b) => b.score - a.score || a.trades - b.trades || a.joined - b.joined);
  }

  /** live board for a round (owner ids only, never visitor ids) */
  cupBoard(acct?: string): { round: string; start: number; end: number; entrants: number; top: { owner: string; score: number }[]; me?: { chips: number; bag: Record<string, number>; score: number; rank: number } } {
    const now = Date.now();
    const r = this.currentRound(now);
    const ranked = this.scores(r.id, this.quotes(now));
    const out: ReturnType<Economy['cupBoard']> = { round: r.id, start: r.start, end: r.end, entrants: ranked.length, top: ranked.slice(0, 10).map((e) => ({ owner: e.owner, score: e.score })) };
    const i = acct ? ranked.findIndex((e) => e.acct === acct) : -1;
    if (i >= 0) {
      const bag: Record<string, number> = {};
      for (const b of this.sql.exec<{ item: string; qty: number }>('SELECT item, qty FROM cup_bag WHERE round = ? AND acct = ? AND qty > 0', r.id, acct!)) bag[b.item] = b.qty;
      out.me = { chips: ranked[i].chips, bag, score: ranked[i].score, rank: i + 1 };
    }
    return out;
  }

  round(id: string) {
    const r = this.sql
      .exec<{ id: string; start: number; end_at: number; setup: string; setup_hash: string; status: string; results: string | null; results_hash: string | null }>(
        'SELECT * FROM cup_rounds WHERE id = ?',
        id,
      )
      .toArray()[0];
    return r ?? null;
  }

  // ---------- the tick: apprentices, round open/settle, hourly price post ----------

  private meta(k: string): number {
    return this.sql.exec<{ v: number }>('SELECT v FROM meta WHERE k = ?', k).toArray()[0]?.v ?? 0;
  }
  private setMeta(k: string, v: number) {
    this.sql.exec('INSERT OR REPLACE INTO meta(k, v) VALUES (?, ?)', k, v);
  }

  /** starts the alarm loop if it is not running (called by the Hall on hello) */
  async start(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  async alarm() {
    await this.tick();
    const now = Date.now();
    const nextTick = now + APPRENTICES.everyMin * this.minuteMs;
    const roundEnd = this.currentRound(now).end;
    await this.ctx.storage.setAlarm(Math.max(now + 200, Math.min(nextTick, roundEnd + 50)));
  }

  /** Everything time-driven. Safe to call often; each part runs only when due. */
  async tick(): Promise<{ settled: string[]; committed: string[]; posted: boolean }> {
    const now = Date.now();
    const jobs: Job[] = [];
    const settled: string[] = [];
    const committed: string[] = [];
    // 1. settle every open round that has ended
    for (const r of this.sql.exec<{ id: string; setup: string }>("SELECT id, setup FROM cup_rounds WHERE status = 'open' AND end_at <= ?", now).toArray()) {
      const res = this.settle(r.id, now);
      settled.push(r.id);
      jobs.push({ job: `settle-${r.id}`, method: 'settle_round', args: { round_id: r.id, setup: r.setup, results_hash: res.hash } });
      res.trophies.forEach((owner, i) => jobs.push({ job: `trophy-${r.id}-${i + 1}`, method: 'mint_trophy', args: { owner, round_id: r.id, place: i + 1 } }));
    }
    // 2. open (commit) the current round if not yet
    const cur = this.currentRound(now);
    if (!this.round(cur.id)) {
      const setup = JSON.stringify({ round: cur.id, start: cur.start, end: cur.end, quotes: this.quotes(now), apprenticeSeed: bytesToHex(crypto.getRandomValues(new Uint8Array(16))) });
      const hash = bytesToHex(sha256(new TextEncoder().encode(setup)));
      this.sql.exec("INSERT INTO cup_rounds(id, start, end_at, setup, setup_hash, status) VALUES (?, ?, ?, ?, ?, 'open')", cur.id, cur.start, cur.end, setup, hash);
      committed.push(cur.id);
      jobs.unshift({ job: `commit-${cur.id}`, method: 'commit_round', args: { round_id: cur.id, setup_hash: hash } });
    }
    // 3. Kettle's apprentices: small labelled trades so the board never freezes (seeded by the round, not by players)
    const lastA = this.meta('apprentice');
    if (now - lastA >= APPRENTICES.everyMin * this.minuteMs) {
      this.setMeta('apprentice', now);
      const setup = JSON.parse(this.round(cur.id)!.setup) as { apprenticeSeed: string };
      for (let i = 0; i < APPRENTICES.count; i++) {
        const h = sha256(new TextEncoder().encode(`${setup.apprenticeSeed}:${Math.floor(now / (APPRENTICES.everyMin * this.minuteMs))}:${i}`));
        const m = MARKET[h[0] % MARKET.length];
        const side = h[1] % 2 ? 'buy' : 'sell';
        const units = 1 + (h[2] % APPRENTICES.maxUnits);
        const gap = this.gapNow(m.item, now);
        this.setGap(m.item, side === 'buy' ? gap + units : gap - units, now);
      }
      for (const q of this.quotes(now)) this.sql.exec('INSERT INTO price_hist(ts, item, bid, ask) VALUES (?, ?, ?, ?)', now, q.item, q.bid, q.ask);
      this.sql.exec('DELETE FROM price_hist WHERE ts < ?', now - PRICE.historyMin * this.minuteMs);
    }
    // 4. hourly on-chain price post
    const hour = Math.floor(now / (PRICE.postEveryMin * this.minuteMs));
    let posted = false;
    if (hour > this.meta('posted_hour')) {
      this.setMeta('posted_hour', hour);
      jobs.push({ job: `prices-${hour}`, method: 'post_prices', args: { hour, quotes: this.quotes(now).map(({ item, bid, ask }) => ({ item, bid, ask })) } });
      posted = true;
    }
    if (jobs.length && this.env.MIRROR) await this.env.MIRROR.get(this.env.MIRROR.idFromName('main')).enqueue(jobs);
    return { settled, committed, posted };
  }

  /** Settles a round: scores at closing bids, Leaves prizes (best placing per day), results file + hash, trophy owners. */
  private settle(id: string, now: number): { hash: string; trophies: string[] } {
    return this.ctx.storage.transactionSync(() => {
      const closing = this.quotes(now);
      const ranked = this.scores(id, closing);
      const places = ranked.length >= CUP.minEntrantsForPlaces;
      const entries = ranked.map((e, i) => {
        let prize = places && i < CUP.prizes.length ? CUP.prizes[i] : 0;
        if (!prize && e.score > CUP.chips) prize = CUP.profitPrize;
        // one prize per player per UTC day: only the part above what they already won today is paid
        const already = this.earnedOn(e.acct, dayOf(now), 'cup_prize');
        const paid = prize > already ? this.write(e.acct, prize - already, 'cup_prize', id, now) : 0;
        return { rank: i + 1, owner: e.owner, score: e.score, trades: e.trades, prize, paid };
      });
      const results = JSON.stringify({ round: id, closing: closing.map(({ item, bid }) => ({ item, bid })), entries: entries.map(({ rank, owner, score, trades, prize }) => ({ rank, owner, score, trades, prize })) });
      const hash = bytesToHex(sha256(new TextEncoder().encode(results)));
      this.sql.exec("UPDATE cup_rounds SET status = 'settled', results = ?, results_hash = ? WHERE id = ?", results, hash, id);
      return { hash, trophies: places ? entries.slice(0, CUP.trophies).map((e) => e.owner) : [] };
    });
  }

  // ---------- NEAR account links (log in with a NEAR wallet) ----------

  /**
   * Links a verified NEAR account to a visitor. One account ↔ one visitor. If the account is already linked to
   * another visitor (another device), that visitor id is returned so this device can switch to it (progress restored).
   */
  link(acct: string, account: string): { acct: string; account: string; switched: boolean; bonus: number } {
    return this.ctx.storage.transactionSync(() => {
      const prev = this.sql.exec<{ acct: string }>('SELECT acct FROM links WHERE account = ?', account).toArray()[0];
      if (prev) return { acct: prev.acct, account, switched: prev.acct !== acct, bonus: 0 };
      const mine = this.sql.exec<{ account: string }>('SELECT account FROM links WHERE acct = ?', acct).toArray()[0];
      if (mine) return { acct, account: mine.account, switched: false, bonus: 0 }; // this visitor is already linked to another account
      this.ensure(acct, Date.now());
      const now = Date.now();
      this.sql.exec('INSERT INTO links(account, acct, at) VALUES (?, ?, ?)', account, acct, now);
      // first login of this wallet account: a one-time bonus (one account links once, so it cannot repeat)
      const bonus = this.cfg.loginBonus > 0 ? this.write(acct, this.cfg.loginBonus, 'login_bonus', account, now) : 0;
      return { acct, account, switched: false, bonus };
    });
  }

  linkedAccount(acct: string): string | null {
    return this.sql.exec<{ account: string }>('SELECT account FROM links WHERE acct = ?', acct).toArray()[0]?.account ?? null;
  }

  history(): { ts: number; item: string; bid: number; ask: number }[] {
    return this.sql.exec<{ ts: number; item: string; bid: number; ask: number }>('SELECT ts, item, bid, ask FROM price_hist ORDER BY ts').toArray();
  }

  state(acct: string): EconState {
    const now = Date.now();
    const day = dayOf(now);
    const leaves = this.balanceOf(acct);
    const bag: Record<string, number> = {};
    for (const r of this.sql.exec<{ item: string; qty: number }>('SELECT item, qty FROM bag WHERE acct = ? AND qty > 0', acct)) bag[r.item] = r.qty;
    const today: Partial<Record<Reason, number>> = {};
    for (const r of this.sql.exec<{ reason: Reason; s: number }>(
      'SELECT reason, SUM(delta) AS s FROM rows WHERE acct = ? AND day = ? AND delta > 0 GROUP BY reason',
      acct,
      day,
    ))
      today[r.reason] = r.s;
    const streak = this.sql.exec<{ streak: number }>('SELECT streak FROM accts WHERE acct = ?', acct).toArray()[0]?.streak ?? 0;
    return { leaves, bag, today, streak };
  }

  /** Audit: does every stored balance equal the sum of its rows, and is none negative? */
  audit(): { accounts: number; mismatched: number; negative: number } {
    const accounts = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM accts').toArray()[0].n;
    const mismatched = this.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM accts a LEFT JOIN (SELECT acct, SUM(delta) AS s FROM rows GROUP BY acct) r ON r.acct = a.acct
         WHERE a.leaves != COALESCE(r.s, 0)`,
      )
      .toArray()[0].n;
    const negative = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM accts WHERE leaves < 0').toArray()[0].n;
    return { accounts, mismatched, negative };
  }
}
