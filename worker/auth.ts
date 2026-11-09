// Sign-In-With-Solana verification + small HMAC session tokens (no accounts, no cookies).
import { address, getAddressEncoder } from '@solana/kit';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = {
  enc(bytes: Uint8Array) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  dec(str: string) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};
const b64url = (bytes: Uint8Array) => b64.enc(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => b64.dec(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** token = base64url({a: address, e: expiry}) + "." + base64url(HMAC) */
export async function signSession(secret: string, addr: string, days = 30) {
  const body = b64url(enc.encode(JSON.stringify({ a: addr, e: Date.now() + days * 86400000 })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Returns the wallet address if the token is valid and not expired. */
export async function readSession(secret: string | undefined, token: unknown): Promise<string | null> {
  if (!secret || typeof token !== 'string' || token.length > 400) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const { a, e } = JSON.parse(dec.decode(fromB64url(body))) as { a: string; e: number };
    return typeof a === 'string' && e > Date.now() ? a : null;
  } catch {
    return null;
  }
}

export interface SiwsFields {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: number;
}

/** Parses the fields we rely on from an EIP-4361-style Solana sign-in message. */
export function parseSiws(text: string): SiwsFields | null {
  const lines = text.split('\n');
  const m = /^(.+) wants you to sign in with your Solana account:$/.exec(lines[0] ?? '');
  if (!m) return null;
  const nonce = /\nNonce: ([A-Za-z0-9]+)/.exec(text)?.[1];
  const issued = /\nIssued At: (.+)/.exec(text)?.[1];
  const t = issued ? Date.parse(issued) : NaN;
  if (!nonce || !Number.isFinite(t)) return null;
  return { domain: m[1], address: (lines[1] ?? '').trim(), nonce, issuedAt: t };
}

/** Verifies the ed25519 signature of `message` by the wallet `addr`. */
export async function verifySignature(addr: string, message: Uint8Array, signature: Uint8Array) {
  try {
    const pub = getAddressEncoder().encode(address(addr));
    const key = await crypto.subtle.importKey('raw', new Uint8Array(pub), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, signature, message);
  } catch {
    return false;
  }
}

export const decodeText = (b: Uint8Array) => dec.decode(b);
