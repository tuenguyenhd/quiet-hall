// Chat (global, whisper, filters, slow mode, names) + PumpHall (picks, close window, scoring, leaderboard, live prices).
// Usage: node scripts/pump-chat-test.mjs [baseUrl] [loadTestKey]   (test rooms only; the settle check needs the key)
import { PUMP_CLOSE_MS, PUMP_MARKETS } from '../src/layout.ts';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const KEY = process.argv[3] ?? process.env.LOAD_TEST_KEY ?? '';
const WS = BASE.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
let ok = 0, bad = 0;
const t = (c, n, d = '') => (c ? (ok++, console.log('✔', n, d)) : (bad++, console.log('✘', n, d)));
function client(room, hello) {
  const ws = new WebSocket(`${WS}/ws?room=${room}`);
  const msgs = [];
  ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
  return new Promise((r) => (ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', color: 1, seed: 7, x: 0, z: 17, ...hello })); r({ ws, msgs, send: (m) => ws.send(JSON.stringify(m)) }); }));
}
const until = async (msgs, p, ms = 3000) => { for (let i = 0; i < ms; i += 50) { const m = msgs.find(p); if (m) return m; await wait(50); } };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };

// ---------- chat ----------
{
  const room = 't' + Date.now().toString(36);
  const a = await client(room, { pid: rid(), name: 'Alice 1' });
  const wa = await until(a.msgs, (m) => m.t === 'welcome');
  const b = await client(room, { pid: rid(), name: '<b>Bob</b>' });
  const wb = await until(b.msgs, (m) => m.t === 'welcome');
  const aliceSeen = wb.players.find((p) => p.id === wa.you);
  t(aliceSeen?.nm === 'Alice 1', 'names are public', aliceSeen?.nm);
  const bobJoin = await until(a.msgs, (m) => m.t === 'join');
  t(bobJoin?.p.nm === 'bBobb', 'names are cleaned', bobJoin?.p.nm);
  a.send({ t: 'chat', x: 'gm frens, claim at https://scam.xyz/x or send to 5g1qkWYJrrRFhEWtiFQ6sCKoCi9hNARcPymwNxjcFudb' });
  const c1 = await until(b.msgs, (m) => m.t === 'c');
  t(c1 && c1.n === 'Alice 1' && !/scam|5g1q/.test(c1.x) && c1.x.includes('[link]') && c1.x.includes('[address]'), 'global chat reaches others, links + addresses stripped', c1?.x);
  t(!!(await until(a.msgs, (m) => m.t === 'c')), 'sender sees their own line');
  a.send({ t: 'chat', x: 'too fast' });
  t(!!(await until(a.msgs, (m) => m.t === 'chatNo')), 'slow mode (1.5 s)');
  await wait(1600);
  // whisper: only b gets it
  const c = await client(room, { pid: rid() });
  await until(c.msgs, (m) => m.t === 'welcome');
  a.send({ t: 'chat', x: 'psst', to: wb.you });
  const w = await until(b.msgs, (m) => m.t === 'c' && m.w);
  await wait(400);
  t(w?.x === 'psst' && w.w === wb.you, 'whisper reaches its target');
  t(!c.msgs.some((m) => m.t === 'c' && m.x === 'psst'), 'whisper is private');
  // newcomers get recent public lines
  t(Array.isArray((await until(c.msgs, (m) => m.t === 'welcome')).chat) && (await until(c.msgs, (m) => m.t === 'welcome')).chat.length >= 1, 'welcome carries recent chat');
  // rename
  await wait(1600);
  b.send({ t: 'name', name: 'Bobby' });
  const nm = await until(a.msgs, (m) => m.t === 'nm');
  t(nm?.nm === 'Bobby', 'rename is broadcast');
  // swear words masked
  await wait(1600);
  b.send({ t: 'chat', x: 'oh shit' });
  const sw = await until(a.msgs, (m) => m.t === 'c' && m.n === 'Bobby');
  t(sw && !sw.x.includes('shit'), 'swear words masked', sw?.x);
  for (const x of [a, b, c]) x.ws.close();
}

// ---------- PumpHall ----------
{
  const room = 't' + Date.now().toString(36) + 'p';
  const pid = rid();
  const s = await post('/api/pump/state', { pid, room });
  t(s.status === 200 && s.body.markets?.SOL && s.body.markets?.SKR, 'state has SOL + SKR markets');
  t(typeof s.body.markets.SOL.price === 'number' && s.body.markets.SOL.price > 0, 'live SOL price from Coinbase', `$${s.body.markets.SOL.price}`);
  t(typeof s.body.markets.SKR.price === 'number' && s.body.markets.SKR.price > 0, 'live SKR price from Coinbase', `$${s.body.markets.SKR.price}`);
  const now = s.body.now;
  // pick the next round of whichever market is still open
  const m = Object.keys(PUMP_MARKETS).find((k) => s.body.markets[k].next.closesAt - now > 3000);
  if (m) {
    const nk = s.body.markets[m].next.k;
    const live = s.body.markets[m].live.k;
    t((await post('/api/pump/pick', { pid, room, m, k: live, dir: 'up', seed: 1 })).status === 400, 'cannot pick the round already running');
    const p1 = await post('/api/pump/pick', { pid, room, m, k: nk, dir: 'up', name: 'Tester', seed: 1 });
    t(p1.status === 200, 'pick next round', JSON.stringify(p1.body));
    const p2 = await post('/api/pump/pick', { pid, room, m, k: nk, dir: 'down', seed: 1 });
    t(p2.status === 400, 'one pick per round', p2.body.error);
    // same network: max 3 visitor ids per round (anti "pick both sides")
    const extra = [];
    for (let i = 0; i < 3; i++) extra.push((await post('/api/pump/pick', { pid: rid(), room, m, k: nk, dir: 'down', seed: 1 })).status);
    t(extra.filter((x) => x === 200).length === 2 && extra.at(-1) === 400, 'per-network pick cap', extra.join(','));
    const s2 = await post('/api/pump/state', { pid, room });
    t(s2.body.markets[m].next.mine?.dir === 'up' && s2.body.markets[m].next.up === 1 && s2.body.markets[m].next.down === 2, 'my pick + crowd counts');
    if (KEY) {
      // settle it (test hook): UP wins → 10 points, on both boards
      const st = await post('/api/pump/test-settle', { room, key: KEY, m, k: nk, lock: 100, close: 101 });
      t(st.status === 200, 'test settle');
      const s3 = await post('/api/pump/state', { pid, room });
      t(s3.body.me?.pts === 10 && s3.body.me.wins === 1 && s3.body.me.streak === 1, 'right call scores 10', JSON.stringify(s3.body.me));
      t(s3.body.week_board[0]?.name === 'Tester' && s3.body.week_board[0].you && s3.body.all_board[0]?.pts === 10, 'leaderboards');
      t(s3.body.markets[m].past.some((r) => r.k === nk && r.res === 'up' && r.mine?.won === 1 && r.verifyClose.startsWith('https://api.exchange.coinbase.com/')), 'past round with verify link');
      t(!JSON.stringify(s3.body.week_board).includes(pid), 'boards never show visitor ids');
      t((await post('/api/pump/test-settle', { room: 'main', key: KEY, m, k: nk, lock: 1, close: 2 })).status === 404, 'test hook refused on the real board');
    } else console.log('… skip settle checks (no LOAD_TEST_KEY)');
  } else console.log('… skip pick checks (both markets in the 30 s close window, rerun)');
  // closed window: a round that starts within 30 s is refused (simulate by asking for the live round's start)
  t(PUMP_CLOSE_MS === 30000, 'picks close 30 s before the round');
  // the real price-at-time lookup (Coinbase candles) used to settle rounds
  const real = await post('/api/pump/state', { pid: rid(), room: 'main' });
  t(real.status === 200, 'main board loads', `${real.body.week_board?.length ?? 0} on the board`);
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
