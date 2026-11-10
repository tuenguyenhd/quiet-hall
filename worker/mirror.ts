// Mirror Durable Object: the ONLY writer to the NEAR items contract.
// Design: design/gdd/edition-near.md, "Core Rules: chain design" (rules 4–7) and Edge Cases.
// - Jobs are queued with a unique job id; the contract rejects a used job id, so a retry can never mint twice.
// - One transaction in flight at a time, driven by an alarm; up to MAX_BATCH function calls per transaction.
// - Play never waits for this: the server bag is the source of truth, the chain is a receipt.
// - With no NEAR_PRIVATE_KEY (or NEAR_MIRROR_MODE=mock) every job is marked 'mock' and nothing is sent.
import { DurableObject } from 'cloudflare:workers';
import { Account, JsonRpcProvider, KeyPairSigner, actions } from 'near-api-js';
import { ed25519 } from '@noble/curves/ed25519.js';

export interface MirrorEnv {
  NEAR_ACCOUNT?: string;
  NEAR_RPC?: string;
  /** comma-separated fallback RPC URLs, tried in order when the main one fails */
  NEAR_RPC_FALLBACKS?: string;
  /** game account key, "ed25519:..." (secret) */
  NEAR_PRIVATE_KEY?: string;
  /** 'testnet' (default when a key is set) or 'mock' */
  NEAR_MIRROR_MODE?: string;
}

export type JobMethod = 'mint_fren' | 'mint_drip' | 'mint_trophy' | 'post_prices' | 'commit_round' | 'settle_round';
export interface Job {
  job: string;
  method: JobMethod;
  args: Record<string, unknown>;
}
type Status = 'queued' | 'done' | 'mock' | 'parked';

const MAX_BATCH = 8;
const MAX_TRIES = 5;
const GAS_PER_CALL = 30_000_000_000_000n; // 30 Tgas
const FIRST_DELAY_MS = 1_000;

/**
 * The player's NEAR owner id: a real implicit account id (hex of an ed25519 public key) derived from a server
 * secret and the private visitor id, so the visitor id is never revealed and the id is stable across visits.
 */
export async function ownerId(secret: string, pid: string): Promise<string> {
  const ikm = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveBits']);
  const seed = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('quiet-hall-owner-v1'), info: new TextEncoder().encode(pid) },
      ikm,
      256,
    ),
  );
  return [...ed25519.getPublicKey(seed)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Mirror extends DurableObject<MirrorEnv> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: MirrorEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS jobs(job TEXT PRIMARY KEY, method TEXT NOT NULL, args TEXT NOT NULL, status TEXT NOT NULL,
        tries INTEGER NOT NULL DEFAULT 0, single INTEGER NOT NULL DEFAULT 0, next INTEGER NOT NULL, tx TEXT, err TEXT,
        created INTEGER NOT NULL, done_at INTEGER);
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status, next);
    `);
  }

  private mode(): 'mock' | 'testnet' {
    return this.env.NEAR_MIRROR_MODE === 'mock' || !this.env.NEAR_PRIVATE_KEY || !this.env.NEAR_ACCOUNT ? 'mock' : 'testnet';
  }

  /** Queues jobs (a job id already queued or done is ignored). Never blocks play. */
  async enqueue(jobs: Job[]): Promise<number> {
    const now = Date.now();
    let added = 0;
    for (const j of jobs) {
      if (!j.job || j.job.length > 64) continue;
      const r = this.sql.exec(
        'INSERT OR IGNORE INTO jobs(job, method, args, status, next, created) VALUES (?, ?, ?, ?, ?, ?)',
        j.job,
        j.method,
        JSON.stringify(j.args),
        'queued',
        now,
        now,
      );
      added += r.rowsWritten > 0 ? 1 : 0;
    }
    if (added) await this.wake(FIRST_DELAY_MS);
    return added;
  }

  private async wake(inMs: number) {
    const at = Date.now() + inMs;
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || cur > at) await this.ctx.storage.setAlarm(at);
  }

  private mark(job: string, status: Status, fields: { tx?: string | null; err?: string | null } = {}) {
    this.sql.exec('UPDATE jobs SET status = ?, tx = ?, err = ?, done_at = ? WHERE job = ?', status, fields.tx ?? null, fields.err ?? null, Date.now(), job);
  }

  private retry(job: string, tries: number, err: string) {
    const t = tries + 1;
    if (t >= MAX_TRIES) return this.mark(job, 'parked', { err });
    const backoff = 2_000 * 2 ** t;
    this.sql.exec('UPDATE jobs SET tries = ?, next = ?, err = ? WHERE job = ?', t, Date.now() + backoff, err, job);
  }

  async alarm() {
    const now = Date.now();
    const due = this.sql
      .exec<{ job: string; method: JobMethod; args: string; tries: number; single: number }>(
        "SELECT job, method, args, tries, single FROM jobs WHERE status = 'queued' AND next <= ? ORDER BY created LIMIT ?",
        now,
        MAX_BATCH,
      )
      .toArray();
    if (due.length) {
      // a job flagged `single` (its batch hit a used job id) goes alone
      const batch = due[0].single ? [due[0]] : due.filter((d) => !d.single);
      await this.send(batch);
    }
    const next = this.sql.exec<{ n: number | null }>("SELECT MIN(next) AS n FROM jobs WHERE status = 'queued'").toArray()[0]?.n;
    if (next != null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 250, next));
  }

  private rpcUrls(): string[] {
    const main = this.env.NEAR_RPC || 'https://test.rpc.fastnear.com';
    const extra = (this.env.NEAR_RPC_FALLBACKS || '').split(',').map((s) => s.trim()).filter(Boolean);
    return [main, ...extra];
  }

  private async send(batch: { job: string; method: JobMethod; args: string; tries: number }[]) {
    if (this.mode() === 'mock') {
      for (const j of batch) this.mark(j.job, 'mock');
      return;
    }
    const signer = KeyPairSigner.fromSecretKey(this.env.NEAR_PRIVATE_KEY as `ed25519:${string}`);
    const contract = this.env.NEAR_ACCOUNT!;
    const calls = batch.map((j) => actions.functionCall(j.method, { ...JSON.parse(j.args), job_id: j.job }, GAS_PER_CALL, 0n));
    let lastErr = '';
    for (const url of this.rpcUrls()) {
      try {
        const account = new Account(contract, new JsonRpcProvider({ url }), signer);
        const res = await account.signAndSendTransaction({ receiverId: contract, actions: calls, throwOnFailure: false });
        const status = res.status as Record<string, unknown>;
        if ('SuccessValue' in status || 'SuccessReceiptId' in status) {
          for (const j of batch) this.mark(j.job, 'done', { tx: res.transaction.hash });
          return;
        }
        // the transaction executed and failed: deterministic, retrying the same batch would fail again
        const err = JSON.stringify(status).slice(0, 500);
        if (err.includes('job_id already used')) {
          if (batch.length > 1) {
            for (const j of batch) this.sql.exec('UPDATE jobs SET single = 1 WHERE job = ?', j.job);
          } else this.mark(batch[0].job, 'done', { tx: res.transaction.hash, err: 'already on chain' });
          return;
        }
        for (const j of batch) this.mark(j.job, 'parked', { tx: res.transaction.hash, err });
        return;
      } catch (e) {
        // network error, timeout, invalid nonce after retries: outcome unknown. The job id makes a resend safe.
        lastErr = String((e as Error)?.message ?? e).slice(0, 300);
      }
    }
    for (const j of batch) this.retry(j.job, j.tries, lastErr);
  }

  async status(): Promise<{ mode: string; counts: Record<string, number>; parked: { job: string; err: string | null }[] }> {
    const counts: Record<string, number> = {};
    for (const r of this.sql.exec<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status')) counts[r.status] = r.n;
    const parked = this.sql
      .exec<{ job: string; err: string | null }>("SELECT job, err FROM jobs WHERE status = 'parked' ORDER BY created DESC LIMIT 20")
      .toArray();
    return { mode: this.mode(), counts, parked };
  }

  /** Receipts for one owner id (for the Rescue Book): job, method, status, tx. */
  async receipts(owner: string): Promise<{ job: string; method: string; status: string; tx: string | null; args: unknown }[]> {
    return this.sql
      .exec<{ job: string; method: string; status: string; tx: string | null; args: string }>(
        "SELECT job, method, status, tx, args FROM jobs WHERE json_extract(args, '$.owner') = ? ORDER BY created",
        owner,
      )
      .toArray()
      .map((r) => ({ ...r, args: JSON.parse(r.args) }));
  }
}
