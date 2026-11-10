// Economy Durable Object: Leaves, the bag and daily caps in ONE store, so a craft or a sale is all-or-nothing.
// Design: design/gdd/leaves-economy.md (rules 1–8) and edition-near.md ("NEAR value table").
// One instance ('main'). Every change inserts a row {acct, delta, reason, ref, day, ts} and updates the stored
// balance in the same transaction; the rows are the audit trail.
import { DurableObject } from 'cloudflare:workers';
import { ECONOMY, edition, type EconomyConfig, type Reason } from '../src/economy';
import { GATHER, WISH_REWARD, frenById, nodeById, recipeById, type Fren, type Item } from '../src/valley';

interface EconEnv {
  EDITION?: string;
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
