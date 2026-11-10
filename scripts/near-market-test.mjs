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
const A = await client(pid('ma'), 0, 60);
check((await trade(A, 'moon_rock', 'buy', 1))?.why?.includes('Trading Hall'), 'trading outside the Trading Hall is refused');
await go(A, 0, 96);
const B = await client(pid('mb'), 2, 98);

// --- buying moves the price up, everyone sees it; the spread is a sink
const before = (await me(A)).leaves;
const buy = await trade(A, 'moon_rock', 'buy', 2);
check(buy?.ok && buy.total >= 2 && buy.balance === before - buy.total, 'A buys 2 Moon Rocks with Leaves', JSON.stringify(buy));
const seen = await until(B, 'quotes');
check(!!seen && quote(seen.q, 'moon_rock'), 'B sees the new quotes at once');
const sell = await trade(A, 'moon_rock', 'sell', 2);
check(sell?.ok && sell.balance < before, 'buying then selling at once loses Leaves (spread)', JSON.stringify({ before, after: sell?.balance }));
check((await trade(A, 'moon_rock', 'sell', 5))?.why === 'You do not have that many.', 'cannot sell what you do not have');
check((await trade(A, 'moon_rock', 'buy', 999))?.ok === false, 'a 999-unit trade is refused');

// --- 30 net buys push the price up; it decays back toward base with no trades
const C = await client(pid('mc'), 0, 100);
await sitFor(C, 62); // 10 welcome + 60 sit + 2 streak = 72 Leaves
const q1 = quote((await get('/api/near/market')).quotes, 'moon_rock');
await trade(C, 'moon_rock', 'buy', 20);
await trade(C, 'moon_rock', 'buy', 10);
const q2 = quote((await get('/api/near/market')).quotes, 'moon_rock');
check(q2.mid > q1.mid, 'net buying raises the mid price', JSON.stringify([q1.mid, q2.mid]));
await wait(40 * MIN);
const q3 = quote((await get('/api/near/market')).quotes, 'moon_rock');
check(q3.mid < q2.mid, 'with no trades the price drifts back toward base', JSON.stringify([q2.mid, q3.mid]));

// --- daily sell cap (60 Leaves to Kettle a day)
const cBal = (await me(C)).leaves;
await trade(C, 'moon_collar', 'buy', 1);
const s1 = await trade(C, 'moon_collar', 'sell', 1);
await trade(C, 'moon_rock', 'sell', 20);
await trade(C, 'moon_rock', 'sell', 10);
const meC = await me(C);
check((meC.today.market_sell ?? 0) <= 60, 'market sales never pass 60 Leaves a day', JSON.stringify({ sold: meC.today.market_sell, s1, cBal }));

// --- the Market Cup
const D = await client(pid('md'), 0, 100);
D.send({ t: 'cupJoin' });
check((await until(D, 'cupJoined'))?.why?.startsWith('Sit for a minute'), 'joining the Cup needs one paid sit minute');
await go(D, 0, 40);
D.send({ t: 'cupJoin' });
check((await until(D, 'cupJoined'))?.why?.includes('Trading Hall'), 'joining away from the Trading Hall is refused');
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
await go(D, 0, 100);
D.send({ t: 'cupJoin' });
check((await until(D, 'cupJoined'))?.why?.includes('Too many entrants'), 'a 4th entrant from one network address is refused');
check((await trade(D, 'moon_rock', 'buy', 1, true))?.why === 'Join the Cup first.', 'Cup trades need an entry');
const cb = await trade(A, 'copium_shroom', 'buy', 5, true);
check(cb?.ok && cb.chips === 200 - cb.total, 'Cup buy spends chips, not Leaves', JSON.stringify(cb));
check((await trade(A, 'copium_shroom', 'sell', 9, true))?.ok === false, 'cannot sell more than you hold in the Cup');
await trade(B, 'moon_rock', 'buy', 3, true);
const board = await get(`/api/near/market?pid=${A.pid}`);
check(board.cup.round === round && board.cup.entrants === 3 && board.cup.me?.rank >= 1, 'live board shows the round, 3 entrants and my rank', JSON.stringify(board.cup));
check(board.cup.top.every((t) => /^[0-9a-f]{64}$/.test(t.owner)), 'the board shows owner ids, never visitor ids');

// --- settlement after the round ends: Leaves prizes, results hash, commit/settle/trophy jobs
const leavesBefore = await Promise.all([A, B, C].map(async (c) => (await me(c)).leaves));
await wait(Math.max(0, board.cup.end - Date.now()) + 800);
if (KEY) await get(`/api/near/test-tick?k=${KEY}`);
await wait(300);
const r = await get(`/api/near/round?id=${round}`);
check(r.status === 'settled' && r.results?.entries?.length === 3, 'the round settles with 3 entries', JSON.stringify({ status: r.status, n: r.results?.entries?.length }));
check(sha(r.setup) === r.setup_hash, 'sha256(setup) equals the committed setup hash');
check(sha(JSON.stringify(r.results)) === r.results_hash, 'sha256(results file) equals the results hash');
check(JSON.stringify(r.results.entries.map((e) => e.prize)) === '[100,60,60]', 'prizes for 3 entrants: 100, 60, 60', JSON.stringify(r.results.entries));
const leavesAfter = await Promise.all([A, B, C].map(async (c) => (await me(c)).leaves));
const gained = leavesAfter.map((v, i) => v - leavesBefore[i]).sort((a, b) => b - a);
check(JSON.stringify(gained) === '[100,60,60]', 'Leaves prizes paid once each', JSON.stringify(gained));
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
