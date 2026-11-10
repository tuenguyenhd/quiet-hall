// Log in with NEAR (NEP-413): a real signature from a real testnet account, plus the ways it must fail.
// Uses a local key file (never printed): NEAR_LOGIN_KEYFILE=~/.near-credentials/testnet/<account>.json
// Usage: NEAR_LOGIN_KEYFILE=... node scripts/near-login-test.mjs [baseUrl]
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const file = process.env.NEAR_LOGIN_KEYFILE;
if (!file) throw new Error('set NEAR_LOGIN_KEYFILE to a testnet credentials json');
const cred = JSON.parse(readFileSync(file.replace(/^~/, process.env.HOME), 'utf8'));
// near-cli keeps the account name in the file name: <account>.json
cred.account_id ??= file.split('/').pop().replace(/\.json$/, '');
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58d = (s) => { let n = 0n; for (const c of s) n = n * 58n + BigInt(B58.indexOf(c)); const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const c of s) { if (c !== '1') break; out.unshift(0); } return Uint8Array.from(out); };
const b58e = (u) => { let n = BigInt('0x' + Buffer.from(u).toString('hex')); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of u) { if (b !== 0) break; s = '1' + s; } return s; };
const str = (s) => { const b = Buffer.from(s, 'utf8'); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const nep413 = (message, nonce, recipient, cb) => {
  const tag = Buffer.alloc(4); tag.writeUInt32LE(2 ** 31 + 413);
  return createHash('sha256').update(Buffer.concat([tag, str(message), Buffer.from(nonce), str(recipient), cb ? Buffer.concat([Buffer.from([1]), str(cb)]) : Buffer.from([0])])).digest();
};
const secret = b58d(cred.private_key.replace('ed25519:', '')).slice(0, 32);
const publicKey = 'ed25519:' + b58e(ed25519.getPublicKey(secret));
check(publicKey === cred.public_key, 'derived public key matches the credentials file');

const pid = 'login' + Date.now().toString(36).slice(-8);
const ch = await (await fetch(`${BASE}/api/near/login-nonce?pid=${pid}`)).json();
const nonce = Buffer.from(ch.nonce, 'base64');
const sign = (key, n = nonce, cb) => Buffer.from(ed25519.sign(nep413(ch.message, n, ch.recipient, cb), key)).toString('base64');
const login = (body) => fetch(`${BASE}/api/near/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

// failures first (none may link)
const forged = await login({ network: 'testnet', pid, nonce: ch.nonce, accountId: cred.account_id, publicKey, signature: Buffer.from(randomBytes(64)).toString('base64') });
check(forged.status === 401 && /signature/.test(forged.why), 'a forged signature is refused', JSON.stringify(forged));
const other = await login({ network: 'testnet', pid: 'someoneelse01', nonce: ch.nonce, accountId: cred.account_id, publicKey, signature: sign(secret) });
check(other.status === 401 && /expired/.test(other.why), "another visitor's challenge is refused", JSON.stringify(other));
const stranger = ed25519.utils.randomSecretKey();
const notMine = await login({ network: 'testnet', pid, nonce: ch.nonce, accountId: cred.account_id, publicKey: 'ed25519:' + b58e(ed25519.getPublicKey(stranger)), signature: sign(stranger) });
check(notMine.status === 401 && /full-access/.test(notMine.why), "a valid signature from a key that isn't the account's is refused", JSON.stringify(notMine));

// the real thing: the account's own full-access key, checked on NEAR testnet
const good = await login({ network: 'testnet', pid, nonce: ch.nonce, accountId: cred.account_id, publicKey, signature: sign(secret) });
check(good.ok && good.account === cred.account_id && good.pid === pid && !good.switched, `logged in as ${cred.account_id}`, JSON.stringify(good));
const me = await (await fetch(`${BASE}/api/near/me?pid=${pid}`)).json();
check(me.owner === cred.account_id, 'receipts now go to the NEAR account', me.owner);

// a second device logging in with the same account gets the first visitor id back (progress restored)
const wrongNet = await login({ network: 'mainnet', pid, nonce: ch.nonce, accountId: cred.account_id, publicKey, signature: sign(secret) });
check(wrongNet.status === 401 && /network/.test(wrongNet.why), 'a .testnet account claiming mainnet is refused', JSON.stringify(wrongNet));
const pid2 = 'login2' + Date.now().toString(36).slice(-8);
const ch2 = await (await fetch(`${BASE}/api/near/login-nonce?pid=${pid2}`)).json();
const n2 = Buffer.from(ch2.nonce, 'base64');
const second = await login({ network: 'testnet', pid: pid2, nonce: ch2.nonce, accountId: cred.account_id, publicKey, signature: Buffer.from(ed25519.sign(nep413(ch2.message, n2, ch2.recipient), secret)).toString('base64') });
check(second.ok && second.switched && second.pid === pid, 'a second device gets the original progress back', JSON.stringify(second));

// a signature that included a callbackUrl also verifies
const pid3 = 'login3' + Date.now().toString(36).slice(-8);
const ch3 = await (await fetch(`${BASE}/api/near/login-nonce?pid=${pid3}`)).json();
const cb = 'http://localhost:5174/';
const withCb = await login({ network: 'testnet', pid: pid3, nonce: ch3.nonce, accountId: cred.account_id, publicKey, callbackUrl: cb, signature: Buffer.from(ed25519.sign(nep413(ch3.message, Buffer.from(ch3.nonce, 'base64'), ch3.recipient, cb), secret)).toString('base64') });
check(withCb.ok, 'a signature that includes the callbackUrl verifies', JSON.stringify(withCb));

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
