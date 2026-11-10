// NEAR edition duels: both players must be logged in with NEAR. A guest is offered the login, a guest is never
// challenged (so nobody waits on someone who cannot accept), and two logged-in players can duel on Bitcoin or NEAR.
// Usage: node scripts/near-duel-test.mjs [baseUrl] <loadTestKey>   (the key logs test players in and opens test rooms)
import { PUMP } from '../src/layout.ts';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const KEY = process.argv[3] ?? process.env.LOAD_TEST_KEY ?? '';
if (!KEY) throw new Error('Pass the LOAD_TEST_KEY (arg 2 or env)');
const WS = BASE.replace(/^http/, 'ws');
const room = 't' + Date.now().toString(36);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
let ok = 0, bad = 0;
const t = (c, n, d = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, d)));

async function client(name, x, z, login) {
  const pid = rid();
  if (login) await (await fetch(`${BASE}/api/near/test-link?k=${KEY}&pid=${pid}&account=${name.toLowerCase()}${pid}.testnet`)).json();
  const ws = new WebSocket(`${WS}/ws?room=${room}&k=${encodeURIComponent(KEY)}`);
  const msgs = [];
  ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ t: 'hello', color: 1, seed: 7, x, z, pid, name }));
  const c = { ws, msgs, pid, name, send: (m) => ws.send(JSON.stringify(m)) };
  c.welcome = await until(c, (m) => m.t === 'welcome');
  c.id = c.welcome.you;
  return c;
}
async function until(c, p, ms = 3000) {
  for (let i = 0; i < ms; i += 50) {
    const k = c.msgs.findIndex(p);
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(50);
  }
}

const P = { x: PUMP.x, z: PUMP.z };
const A = await client('Alice', P.x, P.z, true);
const B = await client('Bob', P.x + 1, P.z, true);
const G = await client('Guest', P.x - 1, P.z, false);

// a guest cannot challenge: the reply carries login, so the game shows what logging in unlocks
G.send({ t: 'duel_ask', to: A.id, m: 'BTC', dir: 'up', len: 1 });
const g1 = await until(G, (m) => m.t === 'duel_no');
t(g1?.login === true && /Log in with NEAR/.test(g1?.why), 'a guest cannot challenge (login offered)', JSON.stringify(g1));
t(!(await until(A, (m) => m.t === 'duel_inv', 600)), 'no invite reaches the other player from a guest');

// a logged-in player cannot challenge a guest: told at once, nobody waits
A.send({ t: 'duel_ask', to: G.id, m: 'BTC', dir: 'up', len: 1 });
const a1 = await until(A, (m) => m.t === 'duel_no');
t(/not logged in with NEAR/.test(a1?.why ?? ''), 'challenging a guest is refused at once', JSON.stringify(a1));
t(!(await until(G, (m) => m.t === 'duel_inv', 600)), 'the guest gets no invite they could not accept');

// the old markets are not playable in this edition
A.send({ t: 'duel_ask', to: B.id, m: 'SOL', dir: 'up', len: 1 });
t(/Pick a market/.test((await until(A, (m) => m.t === 'duel_no'))?.why ?? ''), 'SOL is not a duel market in the NEAR edition');

// two logged-in players: Bitcoin duel, invite → accept → on
A.send({ t: 'duel_ask', to: B.id, m: 'BTC', dir: 'up', len: 1 });
const inv = await until(B, (m) => m.t === 'duel_inv');
t(inv?.m === 'BTC' && inv?.dir === 'up', 'a logged-in player challenges another on Bitcoin', JSON.stringify(inv));
B.send({ t: 'duel_ans', id: inv?.id, ok: true });
const onA = await until(A, (m) => m.t === 'duel_on');
const onB = await until(B, (m) => m.t === 'duel_on');
t(!!onA && !!onB, 'accepted: the duel starts for both', JSON.stringify(onA ?? {}));
A.send({ t: 'duel_cancel' });
await wait(300);

// NEAR market works too (after the first duel is dropped)
const C = await client('Cara', P.x, P.z + 1, true);
const D = await client('Dan', P.x + 1, P.z + 1, true);
C.send({ t: 'duel_ask', to: D.id, m: 'NEAR', dir: 'down', len: 1 });
const inv2 = await until(D, (m) => m.t === 'duel_inv');
t(inv2?.m === 'NEAR' && inv2?.dir === 'down', 'a NEAR down duel invite goes through', JSON.stringify(inv2));
D.send({ t: 'duel_ans', id: inv2?.id, ok: false });
t(/not now/.test((await until(C, (m) => m.t === 'duel_no'))?.why ?? ''), 'declining tells the challenger');

// names: a logged-in player picks the name shown instead of their address; it is saved to the account
const setName = (c, name) => fetch(`${BASE}/api/near/name`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: c.pid, name }) }).then((r) => r.json());
t((await setName(G, 'Sneaky'))?.ok === false, 'a guest cannot save a name to an account');
const fake = await setName(A, 'vitalik.near');
t(fake?.ok && !fake.name.includes('.'), 'a name cannot pass as a .near account (dots removed)', JSON.stringify(fake));
t((await setName(A, 'Giga Shibby'))?.name === 'Giga Shibby', 'a logged-in player saves a name');
const who = await (await fetch(`${BASE}/api/near/whoami?pid=${A.pid}`)).json();
t(who.nick === 'Giga Shibby' && who.name === 'Giga Shibby' && who.account.endsWith('.testnet'), 'whoami returns the saved name and the account', JSON.stringify(who));
const A2 = await client('ignored', P.x, P.z - 1, false);
A2.ws.close();
const again = new WebSocket(`${WS}/ws?room=${room}&k=${encodeURIComponent(KEY)}`);
const seen = [];
again.onmessage = (e) => e.data !== 'pong' && seen.push(JSON.parse(e.data));
await new Promise((r) => (again.onopen = r));
again.send(JSON.stringify({ t: 'hello', color: 1, seed: 7, x: P.x, z: P.z - 2, pid: A.pid, name: 'typed in the client' }));
await wait(1200);
t(seen.some((m) => m.t === 'nm' && m.nm === 'Giga Shibby'), 'in the hall the saved name wins over what the client sends', JSON.stringify(seen.filter((m) => m.t === 'nm')));
again.close();

for (const c of [A, B, G, C, D]) c.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
