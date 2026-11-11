// NEAR edition: Kettle's Living Market + Market Cup. Design: design/gdd/edition-near.md (NEAR economy A–E, Formulas, AC 12–24).
// Start (fast clock, 6-second Cup rounds, mock mirror):
//   npx wrangler dev -c wrangler.near.toml --env-file .dev.vars.near --port 8788 --var MINUTE_MS:200 \
//     --var NEAR_MIRROR_MODE:mock --var CUP_ROUND_MIN:30 --var CUP_JOIN_CLOSE_MIN:5
// Run:  node scripts/near-market-test.mjs [baseUrl] <loadTestKey>
import { createHash } from 'node:crypto';
const [BASE = 'http://127.0.0.1:8788', KEY = ''] = process.argv.slice(2);
const MIN = 200;
const ROUND_MS = 30 * MIN;
const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?room=t${Date.now().toString(36)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));
const get = async (p) => (await fetch(BASE + p)).json();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pid = (p) => (p + Date.now().toString(36)).slice(0, 16);
// the Market square (BAZAAR in src/layout.ts): trading and Cup joins work only here, not in PumpHall (0, 100)
const MX = 85, MZ = 100;
async function client(id, x, z) {
  const ws = new WebSocket(wsUrl);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  await new Promise((r) => (ws.onopen = r));
  const c = { ws, msgs, pid: id, send: (m) => ws.send(JSON.stringify(m)) };
  c.send({ t: 'hello', color: 1, seed: 3, pid: id, x, z });
  await until(c, 'econ');
  return c;
}
async function until(c, t, pred = () => true, ms = 5000) {
  for (let i = 0; i < ms; i += 20) {
    const k = c.msgs.findIndex((m) => m.t === t && pred(m));
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(20);
  }
  return undefined;
}
const go = async (c, x, z) => { c.send({ t: 'move', x, z, ry: 0 }); await wait(60); };
const trade = async (c, item, side, n, cup = false) => { c.send({ t: 'trade', item, side, n, cup }); return until(c, 'traded'); };
const sitFor = async (c, mins) => { c.send({ t: 'state', s: 'sit' }); await wait(mins * MIN + 80); c.send({ t: 'state', s: 'idle' }); return until(c, 'leaves'); };
const me = (c) => get(`/api/near/me?pid=${c.pid}`);
const quote = (q, item) => q.find((x) => x.item === item);

// --- quotes and the zone
const m0 = await get('/api/near/market');
const rock0 = quote(m0.quotes, 'moon_rock');
check(rock0 && rock0.bid < rock0.ask && rock0.ask <= 2 * 3 * 1.1 + 1, 'Moon Rock has a bid below its ask', JSON.stringify(rock0));
if (!KEY) throw new Error('pass the LOAD_TEST_KEY: trading needs a NEAR login, and the test logs its players in with it');
// trading needs a NEAR login: a guest at the stall is refused (and the client shows the login perks)
const G = await client(pid('mg'), MX, MZ);
const gt = await trade(G, 'moon_rock', 'buy', 1);
check(gt?.ok === false && gt?.login === true && /Log in with NEAR/.test(gt?.why), 'a guest cannot trade (login required)', JSON.stringify(gt));
G.send({ t: 'cupJoin' });
const gc = await until(G, 'cupJoined');
check(gc?.ok === false && gc?.login === true, 'a guest cannot join the Market Cup', JSON.stringify(gc));
G.ws.close();
const loginAs = async (c) => {
  const l = await get(`/api/near/test-link?k=${KEY}&pid=${c.pid}`);
  c.bonus = l.bonus;
  return c;
};
const A = await loginAs(await client(pid('ma'), 0, 60));
check(!A.bonus, 'no Leaves bonus on first login (no Leaves in this edition)', String(A.bonus));
const again = await get(`/api/near/test-link?k=${KEY}&pid=${A.pid}`);
check(again.bonus === 0, 'logging in again gives no second bonus', JSON.stringify(again));
check((await trade(A, 'moon_rock', 'buy', 1))?.why?.includes('Market'), 'trading outside the Market is refused');
await go(A, 0, 100);
check((await trade(A, 'moon_rock', 'buy', 1))?.why?.includes('south-east'), 'trading inside PumpHall is refused (the Market has its own place)');
await go(A, MX, MZ - 4);
const B = await loginAs(await client(pid('mb'), MX + 2, MZ - 2));

// --- no Leaves: outside the Cup there is nothing to trade with
const plain = await trade(A, 'moon_rock', 'buy', 2);
check(plain?.ok === false && /Market Cup/.test(plain?.why), 'a plain (Leaves) trade is refused: the Market trades in the Cup only', JSON.stringify(plain));
check((await trade(A, 'moon_rock', 'buy', 999, true))?.ok === false, 'a 999-unit trade is refused');
const C = await loginAs(await client(pid('mc'), MX, MZ));
await sitFor(C, 1);

// --- the Market Cup
const D = await loginAs(await client(pid('md'), MX, MZ));
D.send({ t: 'cupJoin' });
check((await until(D, 'cupJoined'))?.why?.startsWith('Sit for a minute'), 'joining the Cup needs one full sit minute');
await go(D, 0, 40);
D.send({ t: 'cupJoin' });
check((await until(D, 'cupJoined'))?.why?.includes('Market'), 'joining away from the Market is refused');
await sitFor(A, 1);
await sitFor(B, 1);
// wait for a fresh round so all three can join before the cut-off
await wait(ROUND_MS - (Date.now() % ROUND_MS) + 150);
const joins = [];
for (const c of [A, B, C]) {
  c.send({ t: 'cupJoin' });
  joins.push(await until(c, 'cupJoined'));
}
check(joins.every((j) => j?.ok && j.chips === 200), 'A, B and C join with 200 chips each', JSON.stringify(joins));
const round = joins[0]?.round;
await sitFor(D, 1);
await go(D, MX, MZ);
D.send({ t: 'cupJoin' });
check((await until(D, 'cupJoined'))?.why?.includes('Too many entrants'), 'a 4th entrant from one network address is refused');
check((await trade(D, 'moon_rock', 'buy', 1, true))?.why === 'Join the Cup first.', 'Cup trades need an entry');
const cb = await trade(A, 'copium_shroom', 'buy', 5, true);
check(cb?.ok && cb.chips === 200 - cb.total, 'Cup buy spends chips', JSON.stringify(cb));
const seen = await until(B, 'quotes');
check(!!seen && quote(seen.q, 'copium_shroom'), 'B sees the new quotes at once');
const q1 = quote((await get('/api/near/market')).quotes, 'moon_rock');
check((await trade(A, 'copium_shroom', 'sell', 9, true))?.ok === false, 'cannot sell more than you hold in the Cup');
await trade(B, 'moon_rock', 'buy', 3, true);
await trade(C, 'moon_rock', 'buy', 10, true);
const q2 = quote((await get('/api/near/market')).quotes, 'moon_rock');
check(q2.mid > q1.mid, 'net buying raises the mid price', JSON.stringify([q1.mid, q2.mid]));
const board = await get(`/api/near/market?pid=${A.pid}`);
check(board.cup.round === round && board.cup.entrants === 3 && board.cup.me?.rank >= 1, 'live board shows the round, 3 entrants and my rank', JSON.stringify(board.cup));
check(board.cup.top.every((t) => ![A, B, C].some((c) => c.pid === t.owner) && (/^[0-9a-f]{64}$/.test(t.owner) || t.owner.endsWith('.testnet'))), 'the board shows NEAR accounts, never visitor ids', JSON.stringify(board.cup.top));

// --- settlement after the round ends: trophies (no Leaves prizes), results hash, commit/settle/trophy jobs
const leavesBefore = await Promise.all([A, B, C].map(async (c) => (await me(c)).leaves));
await wait(Math.max(0, board.cup.end - Date.now()) + 800);
if (KEY) await get(`/api/near/test-tick?k=${KEY}`);
await wait(300);
const r = await get(`/api/near/round?id=${round}`);
check(r.status === 'settled' && r.results?.entries?.length === 3, 'the round settles with 3 entries', JSON.stringify({ status: r.status, n: r.results?.entries?.length }));
check(sha(r.setup) === r.setup_hash, 'sha256(setup) equals the committed setup hash');
check(sha(JSON.stringify(r.results)) === r.results_hash, 'sha256(results file) equals the results hash');
check(JSON.stringify(r.results.entries.map((e) => e.prize)) === '[0,0,0]', 'no Leaves prizes in the results', JSON.stringify(r.results.entries));
const leavesAfter = await Promise.all([A, B, C].map(async (c) => (await me(c)).leaves));
const gained = leavesAfter.map((v, i) => v - leavesBefore[i]).sort((a, b) => b - a);
check(JSON.stringify(gained) === '[0,0,0]', 'nobody is paid Leaves', JSON.stringify(gained));
const q3 = quote((await get('/api/near/market')).quotes, 'moon_rock');
check(q3.mid < q2.mid, 'with no trades the price drifts back toward base', JSON.stringify([q2.mid, q3.mid]));
await wait(2500);
const methods = (r.chain?.jobs ?? []).map((j) => j.method);
const r2 = await get(`/api/near/round?id=${round}`);
const methods2 = (r2.chain?.jobs ?? []).map((j) => `${j.method}:${j.status}`);
check(methods2.filter((x) => x.startsWith('commit_round')).length === 1 && methods2.filter((x) => x.startsWith('settle_round')).length === 1 && methods2.filter((x) => x.startsWith('mint_trophy')).length === 3,
  'commit, settle and 3 trophy jobs queued for NEAR', JSON.stringify({ methods, methods2 }));
if (KEY) {
  const again = await get(`/api/near/test-tick?k=${KEY}`);
  check(!again.settled.includes(round), 'a settled round is never settled twice');
}
const audit = await get('/api/near/audit');
check(audit.mismatched === 0 && audit.negative === 0, 'audit clean', JSON.stringify(audit));
for (const c of [A, B, C, D]) c.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
