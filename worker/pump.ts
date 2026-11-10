// PumpHall: fun-only "up or down?" price predictions. No money, no prizes: points and a leaderboard.
//
// Rounds sit on the clock: round k of a market runs [k*L, (k+1)*L), L = roundMin. You pick for a round
// while it is "next"; picks close PUMP_CLOSE_MS before it locks. Lock price = price at k*L, close price =
// price at (k+1)*L. "Price at T" = close of the last Coinbase Exchange 1-minute candle that starts before T
// (the last trade before T). Coinbase candles are public history, so anyone can re-check every result with
// the `verify` URL we store. Rounds settle on an alarm ~30 s after they end (candles need a few seconds).
import { DurableObject } from 'cloudflare:workers';
import { edition } from '../src/economy';
import { DUEL, PUMP_CLOSE_MS, PUMP_MARKETS, PUMP_MARKETS_BY_EDITION, cleanPlayerName, defaultName, duelLockAt, duelPoints, eloNext, pumpPoints, type PumpMarket } from '../src/layout';

const len = (m: PumpMarket) => PUMP_MARKETS[m].roundMin * 60000;
const SETTLE_AFTER = 30000; // wait for the closing candle
const VOID_AFTER = 15 * 60000; // no price after this long: the round is void (nobody scores)
const PER_IP_PER_ROUND = 3; // stops one phone from picking both sides with fresh visitor ids
const PID_RE = /^[a-z0-9]{8,16}$/;

export type Dir = 'up' | 'down';
type Res = 'up' | 'down' | 'flat' | 'void';

/** ISO week key, e.g. 2026-W46 (weekly board resets Monday 00:00 UTC) */
export function weekKey(ms = Date.now()) {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const wk = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

export function verifyUrl(m: PumpMarket, at: number) {
  const s = Math.floor(at / 1000);
  return `https://api.exchange.coinbase.com/products/${PUMP_MARKETS[m].product}/candles?granularity=60&start=${s - 900}&end=${s}`;
}

/** public tag shown next to names (so two "Calm Otter 42" can be told apart); reveals nothing about the pid */
async function tagOf(pid: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('qh-pump:' + pid)));
  return [...h.slice(0, 2)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Live {
  price: number;
  at: number;
}

export class Pump extends DurableObject {
  private live = new Map<PumpMarket, Live>();
  /** lock prices of live rounds nobody picked (memory only, `${m}:${k}`) */
  private locks = new Map<string, number>();
  private sql: SqlStorage;

  /** the markets this edition plays (Seeker: SOL, SKR; NEAR: Bitcoin, NEAR) */
  private markets: PumpMarket[];

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.markets = PUMP_MARKETS_BY_EDITION[edition((env as { EDITION?: string } | undefined)?.EDITION)];
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rounds (m TEXT, k INTEGER, lock REAL, close REAL, res TEXT, up INTEGER DEFAULT 0, down INTEGER DEFAULT 0, PRIMARY KEY (m, k))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS picks (m TEXT, k INTEGER, pid TEXT, ip TEXT, dir TEXT, at INTEGER, won INTEGER, pts INTEGER DEFAULT 0, PRIMARY KEY (m, k, pid))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (pid TEXT PRIMARY KEY, name TEXT, tag TEXT, pts INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, best INTEGER DEFAULT 0, wk TEXT DEFAULT '', wpts INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS picks_ip ON picks (m, k, ip)`);
    // PvP duels (points only). a = challenger, b = opponent; b always holds the opposite call.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS duels (id TEXT PRIMARY KEY, m TEXT, a TEXT, b TEXT, adir TEXT, len INTEGER, lock_at INTEGER, end_at INTEGER, rated INTEGER, status TEXT, lock REAL, close REAL, res TEXT, apts INTEGER DEFAULT 0, bpts INTEGER DEFAULT 0, ra0 INTEGER, rb0 INTEGER, ra1 INTEGER, rb1 INTEGER, created INTEGER)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS duels_open ON duels (status, end_at)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS dplayers (pid TEXT PRIMARY KEY, rating INTEGER DEFAULT ${DUEL.ratingStart}, rated INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, draws INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, best INTEGER DEFAULT 0, pts INTEGER DEFAULT 0, wk TEXT DEFAULT '', wpts INTEGER DEFAULT 0, first_at INTEGER)`);
  }

  // ---------- prices ----------
  /** Coinbase 1-minute candles ending at `at` (newest first: [time, low, high, open, close, volume]) */
  private async candles(m: PumpMarket, at: number): Promise<number[][] | null> {
    try {
      const r = await fetch(verifyUrl(m, at), { headers: { 'User-Agent': 'QuietHall-PumpHall/1.0', Accept: 'application/json' } });
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j) ? (j as number[][]) : null;
    } catch {
      return null;
    }
  }

  /** price at time `at` (ms, on a minute boundary): close of the newest candle that starts before it */
  async priceAt(m: PumpMarket, at: number): Promise<number | null> {
    const c = await this.candles(m, at);
    if (!c) return null;
    const s = Math.floor(at / 1000);
    const before = c.filter((x) => Array.isArray(x) && x[0] < s && Number.isFinite(x[4])).sort((a, b) => b[0] - a[0]);
    return before.length ? before[0][4] : null;
  }

  /** live price for the board (Coinbase ticker, cached 5 s) */
  private async livePrice(m: PumpMarket): Promise<Live | null> {
    const c = this.live.get(m);
    if (c && Date.now() - c.at < 5000) return c;
    try {
      const r = await fetch(`https://api.exchange.coinbase.com/products/${PUMP_MARKETS[m].product}/ticker`, { headers: { 'User-Agent': 'QuietHall-PumpHall/1.0' } });
      const j = (await r.json()) as { price?: string };
      const price = Number(j.price);
      if (!r.ok || !Number.isFinite(price) || price <= 0) return c ?? null;
      const v = { price, at: Date.now() };
      this.live.set(m, v);
      return v;
    } catch {
      return c ?? null;
    }
  }

  // ---------- rounds ----------
  private round(m: PumpMarket, k: number) {
    return this.sql.exec<{ lock: number | null; close: number | null; res: string | null; up: number; down: number }>(`SELECT lock, close, res, up, down FROM rounds WHERE m = ? AND k = ?`, m, k).toArray()[0];
  }

  /** settle every finished round that has picks; returns when the next settle is due (ms) or 0 */
  async settle(now = Date.now()): Promise<number> {
    let next = 0;
    const due = this.sql.exec<{ m: PumpMarket; k: number }>(`SELECT m, k FROM rounds WHERE res IS NULL ORDER BY k`).toArray();
    for (const { m, k } of due) {
      if (!PUMP_MARKETS[m]) continue;
      const L = len(m);
      const lockAt = k * L;
      const endAt = lockAt + L;
      if (now < endAt + SETTLE_AFTER) {
        next = next ? Math.min(next, endAt + SETTLE_AFTER) : endAt + SETTLE_AFTER;
        continue;
      }
      let lock = this.round(m, k)?.lock ?? null;
      if (lock == null) {
        lock = await this.priceAt(m, lockAt);
        if (lock != null) this.sql.exec(`UPDATE rounds SET lock = ? WHERE m = ? AND k = ?`, lock, m, k);
      }
      const close = await this.priceAt(m, endAt);
      if (lock == null || close == null) {
        if (now > endAt + VOID_AFTER) this.finish(m, k, lock, close, 'void');
        else next = next ? Math.min(next, now + 30000) : now + 30000;
        continue;
      }
      this.finish(m, k, lock, close, close > lock ? 'up' : close < lock ? 'down' : 'flat');
    }
    // duels: same oracle, their own clock
    const open = this.sql.exec<{ id: string; m: PumpMarket; lock_at: number; end_at: number }>(`SELECT id, m, lock_at, end_at FROM duels WHERE status = 'on' ORDER BY end_at`).toArray();
    for (const d of open) {
      const due = d.end_at + SETTLE_AFTER;
      if (now < due) {
        next = next ? Math.min(next, due) : due;
        continue;
      }
      const lock = PUMP_MARKETS[d.m] ? await this.priceAt(d.m, d.lock_at) : null;
      const close = PUMP_MARKETS[d.m] ? await this.priceAt(d.m, d.end_at) : null;
      if (lock == null || close == null) {
        if (now > d.end_at + VOID_AFTER) this.finishDuel(d.id, lock, close, 'void');
        else next = next ? Math.min(next, now + 30000) : now + 30000;
        continue;
      }
      this.finishDuel(d.id, lock, close, close > lock ? 'up' : close < lock ? 'down' : 'flat');
    }
    return next;
  }

  // ---------- duels ----------
  private dplayer(pid: string, now = Date.now()) {
    this.sql.exec(`INSERT INTO dplayers (pid, first_at) VALUES (?, ?) ON CONFLICT(pid) DO NOTHING`, pid, now);
    return this.sql.exec<{ rating: number; rated: number; streak: number; wk: string; wpts: number; first_at: number }>(`SELECT rating, rated, streak, wk, wpts, first_at FROM dplayers WHERE pid = ?`, pid).one();
  }

  /** Rated unless: same network, this pair already had DUEL.pairRatedPerDay rated duels today (UTC), or either player is brand new. */
  private ratedFor(a: string, b: string, sameIp: boolean, now = Date.now()) {
    if (sameIp) return { rated: false, why: 'same network' };
    const day = now - (now % 86400000);
    const n = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM duels WHERE rated = 1 AND status != 'cancel' AND created >= ? AND ((a = ? AND b = ?) OR (a = ? AND b = ?))`, day, a, b, b, a).one().n;
    if (n >= DUEL.pairRatedPerDay) return { rated: false, why: 'daily limit for this pair' };
    const firsts = this.sql.exec<{ first_at: number }>(`SELECT first_at FROM dplayers WHERE pid IN (?, ?)`, a, b).toArray();
    const youngest = firsts.length < 2 ? now : Math.max(...firsts.map((f) => f.first_at ?? now));
    if (now - youngest < DUEL.newAccountMs) return { rated: false, why: 'new player' };
    return { rated: true, why: '' };
  }

  /** invite preview (no writes besides first-seen) */
  async duelPreview(a: string, b: string, sameIp: boolean) {
    if (!PID_RE.test(a) || !PID_RE.test(b) || a === b) return { rated: false, why: 'no visitor id' };
    const now = Date.now();
    this.dplayer(a, now);
    this.dplayer(b, now);
    return this.ratedFor(a, b, sameIp, now);
  }

  async createDuel(o: { a: string; an: unknown; as: number; b: string; bn: unknown; bs: number; adir: Dir; m: PumpMarket; lenMin: number; sameIp: boolean }) {
    if (!PID_RE.test(o.a) || !PID_RE.test(o.b) || o.a === o.b) return { error: 'Both players need a visitor id' };
    if (!PUMP_MARKETS[o.m] || !this.markets.includes(o.m)) return { error: 'Unknown market' };
    if (o.adir !== 'up' && o.adir !== 'down') return { error: 'Call up or down' };
    if (!DUEL.lens.includes(o.lenMin)) return { error: 'Unknown round length' };
    const now = Date.now();
    const busy = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM duels WHERE status = 'on' AND end_at > ? AND (a IN (?, ?) OR b IN (?, ?))`, now - SETTLE_AFTER, o.a, o.b, o.a, o.b).one().n;
    if (busy) return { error: 'One of you is already in a duel' };
    const lockAt = duelLockAt(now);
    const endAt = lockAt + o.lenMin * 60000;
    const id = crypto.randomUUID().slice(0, 8);
    let rated = false;
    this.ctx.storage.transactionSync(() => {
      for (const [pid, n, sd] of [[o.a, o.an, o.as], [o.b, o.bn, o.bs]] as const) {
        this.sql.exec(`INSERT INTO players (pid, name, tag) VALUES (?, ?, '') ON CONFLICT(pid) DO UPDATE SET name = excluded.name`, pid, cleanPlayerName(n) || defaultName(sd));
        this.dplayer(pid, now);
      }
      rated = this.ratedFor(o.a, o.b, o.sameIp, now).rated;
      this.sql.exec(`INSERT INTO duels (id, m, a, b, adir, len, lock_at, end_at, rated, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'on', ?)`, id, o.m, o.a, o.b, o.adir, o.lenMin * 60000, lockAt, endAt, rated ? 1 : 0, now);
    });
    // tags for players created here (the pick path sets them too)
    for (const pid of [o.a, o.b]) this.sql.exec(`UPDATE players SET tag = ? WHERE pid = ? AND tag = ''`, await tagOf(pid), pid);
    await this.wake(endAt + SETTLE_AFTER);
    return { id, lockAt, endAt, rated };
  }

  /** before the lock only; after it, a duel always stands */
  async cancelDuel(id: string, pid: string) {
    const d = this.sql.exec<{ a: string; b: string; lock_at: number; status: string }>(`SELECT a, b, lock_at, status FROM duels WHERE id = ?`, id).toArray()[0];
    if (!d || d.status !== 'on' || (pid !== d.a && pid !== d.b)) return { ok: false };
    if (Date.now() >= d.lock_at) return { ok: false, locked: true };
    this.sql.exec(`UPDATE duels SET status = 'cancel' WHERE id = ?`, id);
    return { ok: true };
  }

  private finishDuel(id: string, lock: number | null, close: number | null, res: Res) {
    this.ctx.storage.transactionSync(() => {
      const d = this.sql.exec<{ a: string; b: string; adir: Dir; rated: number; end_at: number }>(`SELECT a, b, adir, rated, end_at FROM duels WHERE id = ? AND status = 'on'`, id).toArray()[0];
      if (!d) return;
      const wk = weekKey(d.end_at);
      const pa = this.dplayer(d.a);
      const pb = this.dplayer(d.b);
      const decided = res === 'up' || res === 'down';
      const aWon = decided && d.adir === res;
      const bWon = decided && !aWon;
      const rated = d.rated === 1;
      const apts = rated && aWon ? duelPoints(pa.streak) : 0;
      const bpts = rated && bWon ? duelPoints(pb.streak) : 0;
      let ra1 = pa.rating;
      let rb1 = pb.rating;
      if (rated && res !== 'void') {
        const s = res === 'flat' ? 0.5 : aWon ? 1 : 0;
        ra1 = eloNext(pa.rating, pb.rating, s, pa.rated);
        rb1 = eloNext(pb.rating, pa.rating, 1 - s, pb.rated);
      }
      const upd = (pid: string, p: typeof pa, won: boolean, lost: boolean, pts: number, r1: number) => {
        const sameWeek = p.wk === wk;
        const streak = !rated ? p.streak : won ? p.streak + 1 : decided ? 0 : p.streak;
        this.sql.exec(
          `UPDATE dplayers SET rating = ?, rated = rated + ?, wins = wins + ?, losses = losses + ?, draws = draws + ?, streak = ?, best = MAX(best, ?), pts = pts + ?, wk = ?, wpts = ? WHERE pid = ?`,
          r1,
          rated && res !== 'void' ? 1 : 0,
          won ? 1 : 0,
          lost ? 1 : 0,
          decided ? 0 : 1,
          streak,
          streak,
          pts,
          wk,
          (sameWeek ? p.wpts : 0) + pts,
          pid,
        );
      };
      upd(d.a, pa, aWon, bWon, apts, ra1);
      upd(d.b, pb, bWon, aWon, bpts, rb1);
      this.sql.exec(`UPDATE duels SET status = 'done', lock = ?, close = ?, res = ?, apts = ?, bpts = ?, ra0 = ?, rb0 = ?, ra1 = ?, rb1 = ? WHERE id = ?`, lock, close, res, apts, bpts, pa.rating, pb.rating, ra1, rb1, id);
    });
  }

  /** my recent duels, from my side */
  private myDuels(pid: string) {
    if (!PID_RE.test(pid)) return [];
    const rows = this.sql
      .exec<{ id: string; m: PumpMarket; a: string; b: string; adir: Dir; len: number; lock_at: number; end_at: number; rated: number; status: string; lock: number | null; close: number | null; res: Res | null; apts: number; bpts: number; ra0: number | null; rb0: number | null; ra1: number | null; rb1: number | null; an: string | null; at: string | null; bn: string | null; bt: string | null }>(
        `SELECT d.*, pa.name AS an, pa.tag AS at, pb.name AS bn, pb.tag AS bt FROM duels d LEFT JOIN players pa ON pa.pid = d.a LEFT JOIN players pb ON pb.pid = d.b WHERE (d.a = ? OR d.b = ?) AND d.status != 'cancel' ORDER BY d.created DESC LIMIT 10`,
        pid,
        pid,
      )
      .toArray();
    return rows.map((d) => {
      const isA = d.a === pid;
      const dir: Dir = isA ? d.adir : d.adir === 'up' ? 'down' : 'up';
      const decided = d.res === 'up' || d.res === 'down';
      return {
        id: d.id,
        m: d.m,
        dir,
        opp: isA ? d.bn : d.an,
        oppTag: isA ? d.bt : d.at,
        lockAt: d.lock_at,
        endAt: d.end_at,
        rated: d.rated === 1,
        status: d.status,
        lock: d.lock,
        close: d.close,
        res: d.res,
        won: d.status !== 'done' ? null : decided ? (dir === d.res ? 1 : 0) : -1,
        pts: isA ? d.apts : d.bpts,
        r0: isA ? d.ra0 : d.rb0,
        r1: isA ? d.ra1 : d.rb1,
        verifyLock: verifyUrl(d.m, d.lock_at),
        verifyClose: verifyUrl(d.m, d.end_at),
      };
    });
  }

  private duelBoard(pid: string, wk: string) {
    const rows = this.sql
      .exec<{ pid: string; name: string; tag: string; wpts: number; rating: number; wins: number; losses: number }>(
        `SELECT d.pid, p.name, p.tag, d.wpts, d.rating, d.wins, d.losses FROM dplayers d JOIN players p ON p.pid = d.pid WHERE d.wk = ? AND d.wpts > 0 ORDER BY d.wpts DESC, d.rating DESC LIMIT 20`,
        wk,
      )
      .toArray();
    const me = PID_RE.test(pid)
      ? this.sql.exec<{ rating: number; rated: number; wins: number; losses: number; draws: number; streak: number; best: number; pts: number; wk: string; wpts: number }>(`SELECT rating, rated, wins, losses, draws, streak, best, pts, wk, wpts FROM dplayers WHERE pid = ?`, pid).toArray()[0]
      : undefined;
    return {
      duel_board: rows.map(({ pid: p, ...r }) => ({ name: r.name, tag: r.tag, pts: r.wpts, rating: r.rating, wins: r.wins, losses: r.losses, you: p === pid })),
      duel_me: me ? { ...me, wpts: me.wk === wk ? me.wpts : 0 } : null,
    };
  }

  /** test hook (test rooms only): settle a duel now with given prices */
  async testSettleDuel(id: string, lock: number, close: number, rated = false) {
    if (rated) this.sql.exec(`UPDATE duels SET rated = 1 WHERE id = ?`, id); // local tests share one IP
    this.finishDuel(id, lock, close, close > lock ? 'up' : close < lock ? 'down' : 'flat');
    return { ok: true };
  }

  /** test hook (test rooms only): age every player past the new-player window */
  async testAgePlayers() {
    this.sql.exec(`UPDATE dplayers SET first_at = ?`, Date.now() - DUEL.newAccountMs - 1000);
    return { ok: true };
  }

  private finish(m: PumpMarket, k: number, lock: number | null, close: number | null, res: Res) {
    const wk = weekKey(len(m) * (k + 1));
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE rounds SET lock = ?, close = ?, res = ? WHERE m = ? AND k = ?`, lock, close, res, m, k);
      if (res === 'void' || res === 'flat') {
        this.sql.exec(`UPDATE picks SET won = -1 WHERE m = ? AND k = ?`, m, k);
        return;
      }
      const picks = this.sql.exec<{ pid: string; dir: Dir }>(`SELECT pid, dir FROM picks WHERE m = ? AND k = ?`, m, k).toArray();
      for (const p of picks) {
        const pl = this.sql.exec<{ streak: number; wk: string; wpts: number }>(`SELECT streak, wk, wpts FROM players WHERE pid = ?`, p.pid).toArray()[0];
        if (!pl) continue;
        const won = p.dir === res;
        const pts = won ? pumpPoints(pl.streak) : 0;
        const sameWeek = pl.wk === wk;
        this.sql.exec(
          `UPDATE players SET pts = pts + ?, wins = wins + ?, losses = losses + ?, streak = ?, best = MAX(best, ?), wk = ?, wpts = ? WHERE pid = ?`,
          pts,
          won ? 1 : 0,
          won ? 0 : 1,
          won ? pl.streak + 1 : 0,
          won ? pl.streak + 1 : 0,
          wk,
          (sameWeek ? pl.wpts : 0) + pts,
          p.pid,
        );
        this.sql.exec(`UPDATE picks SET won = ?, pts = ? WHERE m = ? AND k = ? AND pid = ?`, won ? 1 : 0, pts, m, k, p.pid);
      }
    });
  }

  async alarm() {
    const next = await this.settle();
    if (next) await this.ctx.storage.setAlarm(next);
  }

  private async wake(at: number) {
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > at) await this.ctx.storage.setAlarm(at);
  }

  // ---------- API ----------
  async pick(pid: string, ip: string, nameIn: unknown, seed: number, m: PumpMarket, k: number, dir: Dir) {
    if (!PID_RE.test(pid)) return { error: 'No visitor id' };
    if (!PUMP_MARKETS[m] || !this.markets.includes(m)) return { error: 'Unknown market' };
    if (dir !== 'up' && dir !== 'down') return { error: 'Pick up or down' };
    const now = Date.now();
    const L = len(m);
    const nextK = Math.floor(now / L) + 1; // only the next round is open
    if (k !== nextK) return { error: 'That round is not open' };
    if (now > k * L - PUMP_CLOSE_MS) return { error: 'Picks are closed for this round' };
    if (this.sql.exec(`SELECT 1 FROM picks WHERE m = ? AND k = ? AND pid = ?`, m, k, pid).toArray().length) return { error: 'You already picked this round' };
    const fromIp = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM picks WHERE m = ? AND k = ? AND ip = ?`, m, k, ip).one().n;
    if (fromIp >= PER_IP_PER_ROUND) return { error: 'Too many picks from this network this round' };
    const name = cleanPlayerName(nameIn) || defaultName(seed);
    const tag = await tagOf(pid);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`INSERT INTO players (pid, name, tag) VALUES (?, ?, ?) ON CONFLICT(pid) DO UPDATE SET name = excluded.name`, pid, name, tag);
      this.sql.exec(`INSERT INTO rounds (m, k) VALUES (?, ?) ON CONFLICT(m, k) DO NOTHING`, m, k);
      this.sql.exec(`UPDATE rounds SET ${dir === 'up' ? 'up = up + 1' : 'down = down + 1'} WHERE m = ? AND k = ?`, m, k);
      this.sql.exec(`INSERT INTO picks (m, k, pid, ip, dir, at) VALUES (?, ?, ?, ?, ?, ?)`, m, k, pid, ip, dir, now);
    });
    await this.wake((k + 1) * L + SETTLE_AFTER);
    return { ok: true, m, k, dir };
  }

  async state(pid: string) {
    const now = Date.now();
    // settle lazily too (the alarm may be a little behind)
    const next = await this.settle(now);
    if (next) await this.wake(next);
    const wk = weekKey(now);
    const markets: Record<string, unknown> = {};
    for (const m of this.markets) {
      const L = len(m);
      const cur = Math.floor(now / L); // live round (locked)
      const nxt = cur + 1; // open for picks
      const live = await this.livePrice(m);
      const rc = this.round(m, cur);
      // the live round's lock price: stored once known (the board shows it while the round runs)
      let lock = rc?.lock ?? this.locks.get(`${m}:${cur}`) ?? null;
      if (lock == null && now > cur * L + 5000) {
        lock = await this.priceAt(m, cur * L);
        if (lock != null) {
          if (rc) this.sql.exec(`UPDATE rounds SET lock = ? WHERE m = ? AND k = ?`, lock, m, cur);
          if (this.locks.size > 50) this.locks.clear();
          this.locks.set(`${m}:${cur}`, lock);
        }
      }
      const rn = this.round(m, nxt);
      const mine = (k: number) =>
        PID_RE.test(pid) ? (this.sql.exec<{ dir: Dir; won: number | null; pts: number }>(`SELECT dir, won, pts FROM picks WHERE m = ? AND k = ? AND pid = ?`, m, k, pid).toArray()[0] ?? null) : null;
      const past = this.sql
        .exec<{ k: number; lock: number; close: number; res: Res; up: number; down: number }>(`SELECT k, lock, close, res, up, down FROM rounds WHERE m = ? AND res IS NOT NULL ORDER BY k DESC LIMIT 6`, m)
        .toArray()
        .map((r) => ({ ...r, start: r.k * L, end: (r.k + 1) * L, verifyLock: verifyUrl(m, r.k * L), verifyClose: verifyUrl(m, (r.k + 1) * L), mine: mine(r.k) }));
      markets[m] = {
        roundMin: PUMP_MARKETS[m].roundMin,
        price: live?.price ?? null,
        priceAt: live?.at ?? null,
        live: { k: cur, start: cur * L, end: nxt * L, lock, up: rc?.up ?? 0, down: rc?.down ?? 0, mine: mine(cur), verifyLock: verifyUrl(m, cur * L) },
        next: { k: nxt, start: nxt * L, end: (nxt + 1) * L, closesAt: nxt * L - PUMP_CLOSE_MS, up: rn?.up ?? 0, down: rn?.down ?? 0, mine: mine(nxt) },
        past,
      };
    }
    const board = (col: 'pts' | 'wpts', where: string, ...args: unknown[]) =>
      this.sql
        .exec<{ name: string; tag: string; pts: number; wins: number; losses: number; best: number; pid: string }>(
          `SELECT name, tag, ${col} AS pts, wins, losses, best, pid FROM players WHERE ${col} > 0 ${where} ORDER BY ${col} DESC, wins DESC LIMIT 20`,
          ...args,
        )
        .toArray()
        .map(({ pid: p, ...r }) => ({ ...r, you: p === pid }));
    const me = PID_RE.test(pid) ? this.sql.exec<{ name: string; tag: string; pts: number; wins: number; losses: number; streak: number; best: number; wk: string; wpts: number }>(`SELECT name, tag, pts, wins, losses, streak, best, wk, wpts FROM players WHERE pid = ?`, pid).toArray()[0] : undefined;
    const rank = (col: 'pts' | 'wpts', v: number, where = '', ...args: unknown[]) =>
      v > 0 ? 1 + this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM players WHERE ${col} > ? ${where}`, v, ...args).one().n : null;
    const wpts = me && me.wk === wk ? me.wpts : 0;
    return {
      now,
      week: wk,
      closeMs: PUMP_CLOSE_MS,
      source: 'Coinbase Exchange public 1-minute candles',
      markets,
      week_board: board('wpts', 'AND wk = ?', wk),
      all_board: board('pts', ''),
      me: me ? { name: me.name, tag: me.tag, pts: me.pts, wpts, wins: me.wins, losses: me.losses, streak: me.streak, best: me.best, rank: rank('pts', me.pts), wrank: rank('wpts', wpts, 'AND wk = ?', wk) } : null,
      duels: this.myDuels(pid),
      history: this.history(pid),
      ...this.duelBoard(pid, wk),
    };
  }

  /** a player's own picks, newest first, with each round's prices and result (play history) */
  private history(pid: string) {
    if (!PID_RE.test(pid)) return [];
    const ms = this.markets.map(() => '?').join(',');
    return this.sql
      .exec<{ m: PumpMarket; k: number; dir: Dir; won: number | null; pts: number; at: number; lock: number | null; close: number | null; res: Res | null }>(
        `SELECT p.m AS m, p.k AS k, p.dir AS dir, p.won AS won, p.pts AS pts, p.at AS at, r.lock AS lock, r.close AS close, r.res AS res
         FROM picks p LEFT JOIN rounds r ON r.m = p.m AND r.k = p.k WHERE p.pid = ? AND p.m IN (${ms}) ORDER BY p.at DESC LIMIT 30`,
        pid,
        ...this.markets,
      )
      .toArray()
      .map((r) => ({ ...r, start: r.k * len(r.m), end: (r.k + 1) * len(r.m), verifyClose: verifyUrl(r.m, (r.k + 1) * len(r.m)) }));
  }

  /** test hook (local/devnet test rooms only): settle a round with given prices */
  async testSettle(m: PumpMarket, k: number, lock: number, close: number) {
    this.finish(m, k, lock, close, close > lock ? 'up' : close < lock ? 'down' : 'flat');
    return { ok: true };
  }
}
