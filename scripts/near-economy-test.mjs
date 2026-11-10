// NEAR edition: edition gating, sit → Leaves, hidden time, no double pay, daily cap, Mirror queue, audit.
// Design: design/gdd/edition-near.md, design/gdd/leaves-economy.md (Acceptance Criteria).
//
// Start the NEAR Worker with a fast clock (1 game minute = 200 ms) and the mirror in mock mode:
//   npx wrangler dev -c wrangler.near.toml --env-file .dev.vars.near --port 8788 --var MINUTE_MS:200 --var NEAR_MIRROR_MODE:mock
// Then:  node scripts/near-economy-test.mjs [baseUrl] <loadTestKey>
// Live chain check (mirror on testnet, no NEAR_MIRROR_MODE var):  add --live
const args = process.argv.slice(2);
const live = args.includes('--live');
const [BASE = 'http://127.0.0.1:8788', KEY = ''] = args.filter((a) => a !== '--live');
const MIN = 200; // must match --var MINUTE_MS
const room = 't' + Date.now().toString(36);
const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?room=${room}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));
const get = async (p) => {
  const r = await fetch(BASE + p);
  return { status: r.status, body: await r.json().catch(() => null) };
};
function client(pid) {
  const ws = new WebSocket(wsUrl);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  return new Promise((r) => (ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', color: 1, seed: 7, pid, x: 0, z: 17 })); r({ ws, msgs, send: (m) => ws.send(JSON.stringify(m)) }); }));
}
const until = async (msgs, pred, ms = 5000) => {
  for (let t = 0; t < ms; t += 25) {
    const i = msgs.findIndex(pred);
    if (i >= 0) return msgs.splice(i, 1)[0];
    await wait(25);
  }
  return undefined;
};
const sit = async (c, ms, during) => {
  c.send({ t: 'state', s: 'sit' });
  if (during) await during();
  else await wait(ms);
  c.send({ t: 'state', s: 'idle' });
  return until(c.msgs, (m) => m.t === 'leaves');
};
const pid = (p) => p + Date.now().toString(36).slice(-8);

// --- edition gating
const cfg = await get('/api/config');
check(cfg.body?.edition === 'near', 'config says edition near');
for (const p of ['/api/spots', '/api/tip/order', '/api/verify', '/api/me', '/api/rpc']) {
  check((await get(p)).status === 404, `NEAR edition has no ${p}`);
}

// --- sit pays Leaves (welcome 10 on first visit, streak +2 on the first paying sit of the day)
const A = await client(pid('na'));
await wait(300);
check(!!(await until(A.msgs, (m) => m.t === 'welcome')), 'welcome received');
const econ = await until(A.msgs, (m) => m.t === 'econ');
check(econ?.leaves === 10, 'first visit: 10 welcome Leaves on connect', JSON.stringify(econ));
const r1 = await sit(A, 3 * MIN + 80);
check(r1?.minutes === 3, 'a 3-minute sit counts 3 minutes', JSON.stringify(r1));
check(r1?.paid === 3 + 2 && r1?.balance === 15, 'pays 3 + streak 2, balance 15', JSON.stringify(r1));

// --- under MIN_SIT pays nothing
const r2 = await sit(A, MIN / 2);
check(r2?.paid === 0 && r2?.minutes === 0, 'a sit under 1 game minute pays 0', JSON.stringify(r2));

// --- hidden time does not count
const r3 = await sit(A, 0, async () => {
  await wait(2 * MIN);
  A.send({ t: 'vis', h: true });
  await wait(0.8 * MIN); // under the 1-minute limit: subtracted, the sit goes on
  A.send({ t: 'vis', h: false });
  await wait(2 * MIN + 80);
});
check(r3?.minutes === 4 && r3?.paid === 4, '~4.8 minutes with 0.8 hidden pays 4, not 5 (and no second streak)', JSON.stringify(r3));

// --- a long hidden stretch ends the sit at the moment it was hidden
A.send({ t: 'state', s: 'sit' });
await wait(2 * MIN + 80);
A.send({ t: 'vis', h: true });
await wait(1.5 * MIN);
A.send({ t: 'vis', h: false });
const ended = await until(A.msgs, (m) => m.t === 'sitEnded');
const r4 = await until(A.msgs, (m) => m.t === 'leaves');
check(ended?.why === 'hidden' && r4?.minutes === 2, 'hidden longer than 1 game minute ends the sit; only the visible 2 minutes pay', JSON.stringify(r4));

// --- two sessions on one account do not double pay
const pidB = pid('nb');
const B1 = await client(pidB);
const b1Closed = new Promise((r) => B1.ws.addEventListener('close', (e) => r(e.code)));
const B2 = await client(pidB);
await wait(300);
// the same visitor connecting again replaces the old connection (no ghost avatar), with code 4009 so it stays closed
check((await Promise.race([b1Closed, wait(2000).then(() => 'open')])) === 4009, 'a second connection replaces the first (code 4009, no ghost)');
B1.send({ t: 'state', s: 'sit' });
B2.send({ t: 'state', s: 'sit' });
await wait(3 * MIN + 80);
B1.send({ t: 'state', s: 'idle' });
B2.send({ t: 'state', s: 'idle' });
const b1 = await until(B1.msgs, (m) => m.t === 'leaves');
const b2 = await until(B2.msgs, (m) => m.t === 'leaves');
check((b1?.minutes ?? 0) + (b2?.minutes ?? 0) <= 3, 'two devices sitting together are paid once', JSON.stringify([b1?.minutes, b2?.minutes]));

// --- daily sit cap (60): a 62-minute sit pays 60 sit Leaves (+ streak)
const C = await client(pid('nc'));
await wait(300);
const rc = await sit(C, 62 * MIN + 80);
check(rc?.minutes >= 62 && rc?.paid === 60 + 2, 'a 62-minute sit is capped at 60 (+2 streak)', JSON.stringify(rc));
const rc2 = await sit(C, 3 * MIN + 80);
check(rc2?.paid === 0, 'after the cap, more sitting pays 0 today', JSON.stringify(rc2));

// --- blocked socket messages in the NEAR edition
A.send({ t: 'lantern', wish: 0 });
await wait(400);
check(!A.msgs.some((m) => /^lantern/.test(m.t)), 'paid lantern messages are ignored');
// PumpHall plays Bitcoin and NEAR in this edition
const ps = await (await fetch(BASE + '/api/pump/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: 'pumpcheck01', room: 'main' }) })).json();
check(JSON.stringify(Object.keys(ps.markets ?? {}).sort()) === '["BTC","NEAR"]', 'PumpHall markets are Bitcoin and NEAR', JSON.stringify(Object.keys(ps.markets ?? {})));
const gk = ps.markets?.BTC?.next?.k;
const guestPick = await (await fetch(BASE + '/api/pump/pick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: 'pumpguest01', seed: 1, name: 'guest', m: 'BTC', k: gk, dir: 'up', room: 'main' }) })).json();
check(/Log in with NEAR/.test(guestPick.error ?? ''), 'a guest cannot play up/down (login required)', JSON.stringify(guestPick));

// --- /api/near/me and the mirror queue
const pidM = pid('nm');
const M = await client(pidM);
await wait(300);
await sit(M, 1 * MIN + 80);
const me = await get(`/api/near/me?pid=${pidM}`);
check(/^[0-9a-f]{64}$/.test(me.body?.owner ?? ''), 'owner id is a 64-hex implicit account id', me.body?.owner);
check(me.body?.leaves === 10 + 1 + 2 && me.body?.today?.sit === 1, '/api/near/me shows balance and today', JSON.stringify(me.body));
const me2 = await get(`/api/near/me?pid=${pidM}`);
check(me2.body?.owner === me.body?.owner, 'owner id is stable for the same visitor');
check((await get(`/api/near/test-mint?pid=${pidM}`)).status === 404, 'test hook is closed without the key');
if (KEY) {
  const t = await get(`/api/near/test-mint?pid=${pidM}&k=${KEY}&job=1`);
  check(t.body?.added === 1, 'test mint queued');
  const again = await get(`/api/near/test-mint?pid=${pidM}&k=${KEY}&job=1`);
  check(again.body?.added === 0, 'the same job id is not queued twice');
  let rec;
  for (let i = 0; i < (live ? 60 : 20); i++) {
    await wait(live ? 1000 : 250);
    rec = (await get(`/api/near/me?pid=${pidM}`)).body?.receipts?.[0];
    if (rec && rec.status !== 'queued') break;
  }
  if (live) {
    check(rec?.status === 'done' && !!rec?.tx, 'live: the mirror minted on testnet', JSON.stringify(rec));
    const view = await fetch('https://test.rpc.fastnear.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'query',
        params: { request_type: 'call_function', finality: 'final', account_id: cfg.body.nearAccount, method_name: 'nft_tokens_for_owner',
          args_base64: Buffer.from(JSON.stringify({ account_id: me.body.owner })).toString('base64') },
      }),
    }).then((r) => r.json());
    const tokens = JSON.parse(Buffer.from(view.result?.result ?? []).toString() || '[]');
    check(tokens.some((t) => t.owner_id === me.body.owner), 'live: the token is on chain for the derived owner id', JSON.stringify(tokens.map((t) => t.token_id)));
  } else {
    check(rec?.status === 'mock', 'mock mode marks the job mock', JSON.stringify(rec));
  }
  const h = await get('/api/near/health');
  check(h.body?.mirror?.mode === (live ? 'testnet' : 'mock'), `mirror reports mode ${live ? 'testnet' : 'mock'}`);
}

// --- audit: every balance equals its rows; none negative
const audit = await get('/api/near/audit');
check(audit.body?.mismatched === 0 && audit.body?.negative === 0 && audit.body?.accounts >= 4, 'audit: balances equal their rows, none negative', JSON.stringify(audit.body));

for (const c of [A, B1, B2, C, M]) c.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
