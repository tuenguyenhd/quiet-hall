// Log in with a NEAR wallet (NEP-413 signed message). design/gdd/edition-near.md (technology map: NEAR accounts).
// 1. The client asks for a challenge: a nonce bound to its visitor id and the time (HMAC, no storage needed).
// 2. The wallet signs { message, nonce, recipient, callbackUrl? } as NEP-413 (no transaction, no fee).
// 3. We check the signature, that the nonce is ours and fresh, and on NEAR that the signing key is a
//    FULL-ACCESS key of that account. Only then is the account linked to the visitor.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const LOGIN_MESSAGE = 'Log in to Quiet Hall (Meme Valley on NEAR). This signature costs nothing and moves no funds.';
export const LOGIN_RECIPIENT = 'quiet-hall-near';
const NONCE_TTL_MS = 10 * 60_000;
const NEP413_TAG = 2 ** 31 + 413;

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('bad base58');
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of s) {
    if (c !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

/** 32-byte nonce: 8 bytes of time + 24 bytes of HMAC(secret, pid + time). Base64. */
export async function loginNonce(secret: string, pid: string, now = Date.now()): Promise<string> {
  const t = new Uint8Array(8);
  new DataView(t.buffer).setBigUint64(0, BigInt(now));
  const mac = (await hmac(secret, `near-login|${pid}|${now}`)).slice(0, 24);
  const out = new Uint8Array(32);
  out.set(t, 0);
  out.set(mac, 8);
  return b64(out);
}

async function checkNonce(secret: string, pid: string, nonceB64: string, now = Date.now()): Promise<Uint8Array | null> {
  let n: Uint8Array;
  try {
    n = unb64(nonceB64);
  } catch {
    return null;
  }
  if (n.length !== 32) return null;
  const at = Number(new DataView(n.buffer, n.byteOffset).getBigUint64(0));
  if (!(now - at >= -60_000 && now - at <= NONCE_TTL_MS)) return null;
  const mac = (await hmac(secret, `near-login|${pid}|${at}`)).slice(0, 24);
  for (let i = 0; i < 24; i++) if (mac[i] !== n[8 + i]) return null;
  return n;
}

/** borsh: u32 LE length + utf8 */
function bString(s: string): Uint8Array {
  const b = enc.encode(s);
  const out = new Uint8Array(4 + b.length);
  new DataView(out.buffer).setUint32(0, b.length, true);
  out.set(b, 4);
  return out;
}

/** sha256( borsh(u32 tag) ++ borsh({ message, nonce[32], recipient, callbackUrl: Option<string> }) ) — NEP-413 */
export function nep413Hash(message: string, nonce: Uint8Array, recipient: string, callbackUrl?: string | null): Uint8Array {
  const tag = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, NEP413_TAG, true);
  const parts = [tag, bString(message), nonce, bString(recipient), callbackUrl ? Uint8Array.of(1, ...bString(callbackUrl)) : Uint8Array.of(0)];
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return sha256(all);
}

const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** Is `publicKey` a FULL-ACCESS key of `accountId`? (view_access_key over RPC, with fallbacks) */
async function isFullAccessKey(rpcs: string[], accountId: string, publicKey: string): Promise<boolean> {
  for (const url of rpcs) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'qh', method: 'query', params: { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey } }),
      });
      const j = (await r.json()) as { result?: { permission?: unknown }; error?: unknown };
      if (j.result) return j.result.permission === 'FullAccess';
      if (j.error) return false; // key or account does not exist
    } catch {
      /* try the next RPC */
    }
  }
  return false;
}

export interface LoginInput {
  pid: string;
  nonce: string;
  accountId: string;
  publicKey: string;
  signature: string;
  callbackUrl?: string;
}

/** Verifies a NEP-413 login. Returns the account id, or a reason it failed. */
export async function verifyLogin(secret: string, rpcs: string[], i: LoginInput): Promise<{ ok: true; accountId: string } | { ok: false; why: string }> {
  if (!ACCOUNT_RE.test(i.accountId) || i.accountId.length < 2 || i.accountId.length > 64) return { ok: false, why: 'bad account id' };
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(i.publicKey)) return { ok: false, why: 'only ed25519 keys are supported' };
  const nonce = await checkNonce(secret, i.pid, i.nonce);
  if (!nonce) return { ok: false, why: 'login expired, try again' };
  let sig: Uint8Array;
  let pk: Uint8Array;
  try {
    sig = unb64(i.signature);
    pk = base58decode(i.publicKey.slice('ed25519:'.length));
  } catch {
    return { ok: false, why: 'bad signature encoding' };
  }
  if (sig.length !== 64 || pk.length !== 32) return { ok: false, why: 'bad signature' };
  // some wallets sign with the callbackUrl in the payload, some without it: accept either
  const candidates = [nep413Hash(LOGIN_MESSAGE, nonce, LOGIN_RECIPIENT, i.callbackUrl), nep413Hash(LOGIN_MESSAGE, nonce, LOGIN_RECIPIENT, null)];
  const good = candidates.some((h) => {
    try {
      return ed25519.verify(sig, h, pk);
    } catch {
      return false;
    }
  });
  if (!good) return { ok: false, why: 'signature does not match' };
  if (!(await isFullAccessKey(rpcs, i.accountId, i.publicKey))) return { ok: false, why: 'that key is not a full-access key of the account' };
  return { ok: true, accountId: i.accountId };
}
