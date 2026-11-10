// NEAR edition, Meme Valley: personal-stock gathering, reach and speed checks, wishes with co-rescue,
// refund on standing up, crafting, receipts queued for NEAR. Design: design/gdd/meme-valley.md, edition-near.md.
// Start:  npx wrangler dev -c wrangler.near.toml --env-file .dev.vars.near --port 8788 --var MINUTE_MS:200 --var NEAR_MIRROR_MODE:mock
// Run:    node scripts/near-valley-test.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://127.0.0.1:8788';
const MIN = 200;
const room = 'v' + Date.now().toString(36);
const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?room=t${room.slice(-10)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));
const get = async (p) => (await fetch(BASE + p)).json();
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
  for (let i = 0; i < ms; i += 25) {
    const k = c.msgs.findIndex((m) => m.t === t && pred(m));
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(25);
  }
  return undefined;
}
const go = async (c, x, z) => { c.send({ t: 'move', x, z, ry: 0 }); await wait(80); };
const pick = async (c, node) => { c.send({ t: 'pick', node }); const r = await until(c, 'picked'); await wait(1050); return r; };
const me = (c) => get(`/api/near/me?pid=${c.pid}`);

// --- personal stock: A's picks never reduce B's stock
const A = await client(pid('va'), 87, -78);
const B = await client(pid('vb'), 87.5, -78.5);
const a1 = await pick(A, 'gate-rock-1');
check(a1?.ok && a1.item === 'moon_rock' && a1.stock === 3, 'A picks a Moon Rock (stock 4 → 3)', JSON.stringify(a1));
await pick(A, 'gate-rock-1');
const a3 = await pick(A, 'gate-rock-1');
// test clock: 1 game minute = 200 ms, so a 5-minute regrow = 1 s = the pick interval; regrowth keeps up exactly
check(a3?.stock === 3 && a3.picked === 3, 'regrow keeps partial progress: 1 unit per regrow period, stock holds at 3', JSON.stringify(a3));
const b1 = await pick(B, 'gate-rock-1');
check(b1?.ok && b1.stock === 3, "B's stock at the same node is untouched (4 → 3)", JSON.stringify(b1));

// --- reach and speed
await go(B, 60, -60);
B.send({ t: 'pick', node: 'gate-rock-1' });
check((await until(B, 'picked'))?.why === 'too far', 'a pick from 20 m away is refused');
await go(B, 87, -78);
B.send({ t: 'pick', node: 'gate-rock-1' });
B.send({ t: 'pick', node: 'gate-rock-1' });
const f1 = await until(B, 'picked');
const f2 = await until(B, 'picked');
check(f1?.ok && f2?.why === 'too fast', 'two picks within 1 s: the second is refused', JSON.stringify([f1?.ok, f2?.why]));
await wait(1050);

// --- wish with co-rescue: A grants Shibby (2 Moon Rocks + sit 1 game minute); B sits beside and is rescued too
await go(A, 90, -79);
await go(B, 90.8, -80.6);
B.send({ t: 'state', s: 'sit' });
A.send({ t: 'grant', fren: 'shibby' });
const w = await until(A, 'wish');
check(w?.ok && w.until > Date.now() - 1000, 'grant accepted, wish sit started', JSON.stringify(w));
A.send({ t: 'wishDone' });
check(!!(await until(A, 'wishWait')), 'finishing before the minute is refused (server-timed)');
await wait(MIN + 100);
A.send({ t: 'wishDone' });
const ra = await until(A, 'rescued');
const rb = await until(B, 'rescued');
check(ra?.first && ra.serial >= 1 && ra.paid === 10 && ra.helped === 1, 'A rescues Shibby: first, serial, +10 Leaves, helped 1', JSON.stringify(ra));
check(rb?.co && rb.first && rb.serial === ra.serial + 1 && rb.paid === 10, 'B is co-rescued: own serial, +10, no materials', JSON.stringify(rb));
const meA = await me(A);
check(meA.bag?.moon_rock === 1, 'A used 2 of 3 Moon Rocks', JSON.stringify(meA.bag));
const meB = await me(B);
check((meB.bag?.moon_rock ?? 0) === 2, "B's materials are untouched", JSON.stringify(meB.bag));
A.send({ t: 'state', s: 'idle' });
B.send({ t: 'state', s: 'idle' });
await wait(200);
A.send({ t: 'grant', fren: 'shibby' });
check((await until(A, 'wish'))?.why === 'Already helped today.', 'one rescue per fren per day');

// --- standing up before the minute gives the materials back
const C = await client(pid('vc'), 87, -78);
await pick(C, 'gate-rock-1');
await pick(C, 'gate-rock-1');
await go(C, 89.5, -79.5);
C.send({ t: 'grant', fren: 'shibby' });
await until(C, 'wish');
check((await me(C)).bag?.moon_rock === undefined, 'granting takes the 2 Moon Rocks');
C.send({ t: 'state', s: 'idle' });
const cancelled = await until(C, 'wishCancelled');
check(cancelled?.why === 'stood up' && (await me(C)).bag?.moon_rock === 2, 'standing up early returns them', JSON.stringify(cancelled));
C.send({ t: 'grant', fren: 'froggo' });
check((await until(C, 'wish'))?.why === 'too far', 'granting a fren 17 m away is refused');

// --- crafting a Moon Collar (3 Moon Rock + 1 Rug Yarn + 10 Leaves) at the workbench
await go(A, 81, -72);
await pick(A, 'gate-rock-2');
await pick(A, 'gate-rock-2');
await go(A, 78, -82);
await pick(A, 'gate-yarn');
await go(A, 70, -70);
A.send({ t: 'craft', r: 'moon_collar' });
check((await until(A, 'crafted'))?.why === 'too far', 'crafting away from the workbench is refused');
await go(A, 80, -78);
const before = (await me(A)).leaves;
A.send({ t: 'craft', r: 'moon_collar' });
const cr = await until(A, 'crafted');
check(cr?.ok && cr.kind === 'moon_collar' && cr.serial >= 1 && cr.balance === before - 10, 'Moon Collar crafted, 10 Leaves fee', JSON.stringify(cr));
const meA2 = await me(A);
check(meA2.bag?.moon_collar === 1 && !meA2.bag?.moon_rock && !meA2.bag?.rug_yarn, 'materials consumed, collar in the bag', JSON.stringify(meA2.bag));
A.send({ t: 'craft', r: 'moon_collar' });
check((await until(A, 'crafted'))?.why === 'missing', 'a second craft without materials is refused, nothing taken');

// --- receipts queued for NEAR (mock mirror marks them)
await wait(2500);
const book = await get(`/api/near/me?pid=${A.pid}`);
const methods = (book.receipts ?? []).map((r) => r.method).sort();
check(methods.join() === 'mint_drip,mint_fren', 'A has a fren receipt and a drip receipt queued for NEAR', JSON.stringify(book.receipts));
check((book.receipts ?? []).every((r) => r.args.owner === book.owner), 'receipts go to the derived owner id');
A.send({ t: 'book' });
const bk = await until(A, 'book');
check(bk?.frens?.[0]?.fren === 'shibby' && bk.drips?.[0]?.kind === 'moon_collar', 'Rescue Book lists Shibby and the collar', JSON.stringify(bk));

const audit = await get('/api/near/audit');
check(audit.mismatched === 0 && audit.negative === 0, 'audit clean', JSON.stringify(audit));
for (const c of [A, B, C]) c.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
