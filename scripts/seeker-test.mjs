// Seeker test wallet (devnet): a wallet listed in SEEKER_TEST_WALLETS signs in and gets Seeker treatment.
// Uses the DEV_NET_SOL test wallet from .dev.vars (listed in wrangler.toml). No funds move.
// Usage: node scripts/seeker-test.mjs [baseUrl]
import { readFileSync } from 'node:fs';
import { getUtf8Encoder, signBytes } from '@solana/kit';
import { treasurySigner } from '../worker/core.ts';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const host = new URL(BASE).host;
const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const me = await treasurySigner(vars.DEV_NET_SOL);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const t = (c, n, d = '') => (c ? (ok++, console.log('✔', n, d)) : (bad++, console.log('✘', n, d)));
const post = async (p, b) => (await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify(b) })).json();

const { nonce } = await (await fetch(`${BASE}/api/nonce`)).json();
const msg = getUtf8Encoder().encode(`${host} wants you to sign in with your Solana account:\n${me.address}\n\nSign in to Quiet Hall.\n\nURI: ${BASE}\nVersion: 1\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`);
const sig = await signBytes(me.keyPair.privateKey, msg);
const v = await post('/api/verify', { address: me.address, message: Buffer.from(msg).toString('base64'), signature: Buffer.from(sig).toString('base64') });
t(v.seeker === true && v.testSeeker === true, 'test wallet signs in as a Seeker (test)', JSON.stringify({ seeker: v.seeker, testSeeker: v.testSeeker }));
const m2 = await post('/api/me', { token: v.token });
t(m2.seeker === true && m2.testSeeker === true, '/api/me keeps it');

function client(room, hello) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?room=${room}`);
  const msgs = [];
  ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
  return new Promise((r) => (ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', color: 1, x: 0, z: 17, ...hello })); r({ ws, msgs }); }));
}
const until = async (msgs, p, ms = 4000) => { for (let i = 0; i < ms; i += 50) { const m = msgs.find(p); if (m) return m; await wait(50); } };
const pid = 'sk' + Math.random().toString(36).slice(2, 12);
const room = 't' + Date.now().toString(36);
const a = await client(room, { pid, session: v.token });
const w = await until(a.msgs, (m) => m.t === 'welcome');
t(w?.me.g === true, 'gold light in the hall');
a.ws.send(JSON.stringify({ t: 'bless', f: 0 }));
const bl = await until(a.msgs, (m) => m.t === 'bl' || m.t === 'blessNo');
t(bl?.t === 'bl' && bl.u - Date.now() > 9 * 60000, 'free blessing lasts 10 min (Seeker perk)', bl?.t === 'bl' ? `${Math.round((bl.u - Date.now()) / 60000)} min` : bl?.reason);
a.ws.close();
const s = await client('seeker', { pid: pid + 'x', session: v.token });
const sw = await until(s.msgs, (m) => m.t === 'welcome' || m.t === 'denied');
t(sw?.t === 'welcome' && sw.room === 'seeker', 'can enter the Seeker hall', sw?.t);
s.ws.close();
const anon = await client('seeker', { pid: pid + 'y' });
const aw = await until(anon.msgs, (m) => m.t === 'welcome' || m.t === 'denied');
t(aw?.t === 'denied', 'a normal visitor is still kept out of the Seeker hall');
anon.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
