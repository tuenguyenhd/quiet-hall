// Regression checks for the QA server findings (rate limits, private visitor ids, invite farming, input clamps).
// Usage: node scripts/hardening-test.mjs [baseUrl]   (local only: it uses fresh test rooms)
import { cleanName } from '../src/layout.ts';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS = BASE.replace(/^http/, 'ws');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
let ok = 0, bad = 0;
const t = (c, n, d = '') => (c ? (ok++, console.log('✔', n, d)) : (bad++, console.log('✘', n, d)));
function client(room, hello) {
  const ws = new WebSocket(`${WS}/ws?room=${room}`);
  const msgs = [];
  ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
  return new Promise((r) => (ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', color: 1, seed: 1, x: 0, z: 17, ...hello })); r({ ws, msgs }); }));
}
const until = async (msgs, p, ms = 3000) => { for (let i = 0; i < ms; i += 50) { const m = msgs.find(p); if (m) return m; await wait(50); } };
const room = () => 't' + Date.now().toString(36) + Math.floor(Math.random() * 99);

// 1) rejected messages count toward the 30/s limit
{
  const a = await client(room(), { pid: rid() });
  await until(a.msgs, (m) => m.t === 'welcome');
  for (let i = 0; i < 200; i++) a.ws.send(JSON.stringify({ t: 'pet', k: 3 }));
  await wait(1500);
  const n = a.msgs.filter((m) => m.t === 'petNo').length;
  t(n <= 30, 'petNo spam is rate limited', `${n}/200 answered`);
  a.ws.close();
}
// 2) invite links use a public id; the private pid never leaks, and `with:<pid>` no longer finds the host
{
  const r = room();
  const hostPid = rid();
  const host = await client(r, { pid: hostPid });
  const w = await until(host.msgs, (m) => m.t === 'welcome');
  const inv = w?.me.inv;
  t(/^[0-9a-f]{12}$/.test(inv ?? '') && inv !== hostPid, 'welcome gives a public invite id', inv);
  const f1 = await client(r, { pid: rid(), with: hostPid });
  t(!!(await until(f1.msgs, (m) => m.t === 'friendAway')), 'raw visitor id in a link does not work');
  const f2 = await client(r, { pid: rid(), with: inv });
  t(!!(await until(f2.msgs, (m) => m.t === 'friendHere')), 'public invite id finds the host');
  // invite farming: same network, many fresh pids → counts once
  for (let i = 0; i < 4; i++) { const f = await client(r, { pid: rid(), with: inv }); await until(f.msgs, (m) => m.t === 'friendHere'); f.ws.close(); }
  await wait(500);
  const counts = host.msgs.filter((m) => m.t === 'friend').map((m) => m.invites);
  // ≤ 2: a dual-stack machine reaches Cloudflare over IPv4 and IPv6 (two networks)
  t(Math.max(...counts) <= 2, 'one network counts as one invite', `counts ${counts.join(',')}`);
  // a second hello on the same socket is ignored (no duplicate join)
  const joinsBefore = host.msgs.filter((m) => m.t === 'join').length;
  f2.ws.send(JSON.stringify({ t: 'hello', color: 1, pid: rid(), with: inv }));
  await wait(600);
  t(host.msgs.filter((m) => m.t === 'join').length === joinsBefore, 're-hello ignored');
  for (const c of [host, f1, f2]) c.ws.close();
}
// 3) huge ry is clamped, never null
{
  const r = room();
  const a = await client(r, { pid: rid(), ry: 1e307 });
  const b = await client(r, { pid: rid() });
  const w = await until(b.msgs, (m) => m.t === 'welcome');
  const p = w?.players[0];
  t(p && typeof p.ry === 'number' && Math.abs(p.ry) <= Math.PI + 0.01, 'huge ry clamped', String(p?.ry));
  a.ws.close(); b.ws.close();
}
// 4) free blessing budget is shared across rooms (same visitor, 2 rooms)
{
  const pid = rid();
  const a = await client(room(), { pid });
  await until(a.msgs, (m) => m.t === 'welcome');
  a.ws.send(JSON.stringify({ t: 'bless', f: 0 }));
  const first = await until(a.msgs, (m) => m.t === 'bl' || m.t === 'blessNo');
  const b = await client(room(), { pid });
  await until(b.msgs, (m) => m.t === 'welcome');
  b.ws.send(JSON.stringify({ t: 'bless', f: 0 }));
  const second = await until(b.msgs, (m) => m.t === 'bl' || m.t === 'blessNo');
  t(second?.t === 'blessNo', 'free blessing not refilled by another room', `${first?.t} then ${second?.t}`);
  a.ws.close(); b.ws.close();
}
// 5) names: no split characters, no zalgo stacks
{
  const s = cleanName('a𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇');
  t(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(s), 'name never ends in half a character', JSON.stringify(s));
  t(cleanName('Z' + '́'.repeat(15)).length <= 3, 'zalgo marks trimmed');
}
// 6) HTTP
{
  const meta = await fetch(`${BASE}/api/meta/stone/999999.json`);
  t(meta.status === 404, 'metadata for a stone that does not exist → 404', String(meta.status));
  const v = await fetch(`${BASE}/api/verify`, { method: 'POST', headers: { origin: 'not a url', 'content-type': 'application/json' }, body: '{"address":"x","message":"","signature":""}' });
  t(v.status === 400, 'bad Origin → 400 (not 500)', String(v.status));
}
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
