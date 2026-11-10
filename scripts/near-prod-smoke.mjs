// Production smoke test for the NEAR edition: real clock, no test hooks, real testnet writes.
// Sit 1 minute → Leaves; gather 2 Moon Rocks; grant Shibby's wish while a second player sits beside him;
// after the 1-minute wish sit both are rescued; both rescues must be minted on NEAR to their owner ids.
// Usage: node scripts/near-prod-smoke.mjs https://quiet-hall-near.<account>.workers.dev   (~3–4 minutes)
const BASE = (process.argv[2] ?? '').replace(/\/$/, '');
if (!BASE) throw new Error('usage: node scripts/near-prod-smoke.mjs <url>');
const RPC = 'https://test.rpc.fastnear.com';
const room = 't' + Date.now().toString(36);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));
const get = async (p) => (await fetch(BASE + p)).json();
const pid = (p) => (p + Date.now().toString(36)).slice(0, 16);
async function client(id, x, z) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?room=${room}`);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  const c = { ws, msgs, pid: id, send: (m) => ws.send(JSON.stringify(m)) };
  c.send({ t: 'hello', color: 2, seed: 9, pid: id, x, z });
  await until(c, 'econ', () => true, 15000);
  return c;
}
async function until(c, t, pred = () => true, ms = 10000) {
  for (let i = 0; i < ms; i += 50) {
    const k = c.msgs.findIndex((m) => m.t === t && pred(m));
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(50);
  }
  return undefined;
}
const go = async (c, x, z) => { c.send({ t: 'move', x, z, ry: 0 }); await wait(250); };
async function tokensOf(contract, owner) {
  const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: 'nft_tokens_for_owner', args_base64: Buffer.from(JSON.stringify({ account_id: owner })).toString('base64') } }) })).json();
  return JSON.parse(Buffer.from(r.result?.result ?? []).toString() || '[]');
}

const cfg = await get('/api/config');
check(cfg.edition === 'near' && /\.testnet$/.test(cfg.nearAccount), `edition near, contract ${cfg.nearAccount}`);
const health = await get('/api/near/health');
check(health.mirror?.mode === 'testnet', 'mirror writes to testnet');

const A = await client(pid('pa'), 87, -77);
const B = await client(pid('pb'), 90.8, -80.6);
check(true, 'two players connected (welcome Leaves on connect)');

// a real 1-minute sit (A), while B gathers nothing
console.log('· sitting 61 s…');
A.send({ t: 'state', s: 'sit' });
await wait(61_500);
A.send({ t: 'state', s: 'idle' });
const lv = await until(A, 'leaves');
check(lv?.minutes === 1 && lv.paid >= 1, 'a real minute of sitting pays Leaves', JSON.stringify(lv));

// gather 2 Moon Rocks at the Gate
for (let i = 0; i < 2; i++) {
  A.send({ t: 'pick', node: 'gate-rock-1' });
  const p = await until(A, 'picked');
  check(p?.ok && p.item === 'moon_rock', `pick ${i + 1}: Moon Rock`, JSON.stringify(p));
  await wait(1200);
}

// grant Shibby's wish with B sitting beside him; wait the real minute
await go(A, 89.5, -79);
B.send({ t: 'state', s: 'sit' });
A.send({ t: 'grant', fren: 'shibby' });
const w = await until(A, 'wish');
check(w?.ok, 'wish granted, sitting with Shibby', JSON.stringify(w));
console.log('· wish sit 61 s…');
await wait(Math.max(0, w.until - Date.now()) + 1500);
A.send({ t: 'wishDone' });
const ra = await until(A, 'rescued');
const rb = await until(B, 'rescued');
check(ra?.first && ra.paid === 10, `A rescued Shibby #${ra?.serial}`, JSON.stringify(ra));
check(rb?.co && rb.first, `B co-rescued Shibby #${rb?.serial} without materials`, JSON.stringify(rb));

// receipts on NEAR
console.log('· waiting for the Mirror to mint on testnet…');
let meA, meB;
for (let i = 0; i < 40; i++) {
  await wait(3000);
  meA = await get(`/api/near/me?pid=${A.pid}`);
  meB = await get(`/api/near/me?pid=${B.pid}`);
  if (meA.receipts?.[0]?.status === 'done' && meB.receipts?.[0]?.status === 'done') break;
}
check(meA.receipts?.[0]?.status === 'done' && meA.receipts[0].tx, `A's receipt minted: https://explorer.testnet.near.org/transactions/${meA.receipts?.[0]?.tx}`);
check(meB.receipts?.[0]?.status === 'done', "B's receipt minted");
const ta = await tokensOf(cfg.nearAccount, meA.owner);
const tb = await tokensOf(cfg.nearAccount, meB.owner);
check(ta.some((t) => t.token_id === `fren:shibby:${ra?.serial}`), `on chain: ${meA.owner.slice(0, 8)}… owns fren:shibby:${ra?.serial}`, JSON.stringify(ta.map((t) => t.token_id)));
check(tb.some((t) => t.token_id === `fren:shibby:${rb?.serial}`), `on chain: ${meB.owner.slice(0, 8)}… owns fren:shibby:${rb?.serial}`, JSON.stringify(tb.map((t) => t.token_id)));

// market and Cup state, and the current round's on-chain commitment
const mk = await get('/api/near/market');
check(mk.quotes?.length === 4 && mk.cup?.round, `market quotes + Cup round ${mk.cup?.round}`);
const rnd = await get(`/api/near/round?id=${mk.cup.round}`);
const commit = rnd.chain?.jobs?.find((j) => j.method === 'commit_round');
check(commit?.status === 'done', `round ${mk.cup.round} committed on NEAR: https://explorer.testnet.near.org/transactions/${commit?.tx}`);
const audit = await get('/api/near/audit');
check(audit.mismatched === 0 && audit.negative === 0, 'economy audit clean', JSON.stringify(audit));

A.ws.close();
B.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
