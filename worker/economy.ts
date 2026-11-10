// Economy Durable Object: Leaves, the bag and daily caps in ONE store, so a craft or a sale is all-or-nothing.
// Design: design/gdd/leaves-economy.md (rules 1–8) and edition-near.md ("NEAR value table").
// One instance ('main'). Every change inserts a row {acct, delta, reason, ref, day, ts} and updates the stored
// balance in the same transaction; the rows are the audit trail.
import { DurableObject } from 'cloudflare:workers';
import { ECONOMY, edition, type EconomyConfig, type Reason } from '../src/economy';

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
