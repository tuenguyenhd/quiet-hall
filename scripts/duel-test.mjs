// PvP prediction duels: zone + distance checks, invite / decline / cooldown, accept → duel_on with the lock on a
// minute boundary, busy players, cancel before lock, settle → points + Elo, rate limit, copy has no betting words.
// Usage: node scripts/duel-test.mjs [baseUrl] [loadTestKey]   (needs the key: test rooms + settle hook)
import { readFileSync } from 'node:fs';
import { DUEL, PUMP, duelPoints, eloNext } from '../src/layout.ts';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const KEY = process.argv[3] ?? process.env.LOAD_TEST_KEY ?? '';
if (!KEY) throw new Error('Pass the LOAD_TEST_KEY (arg 2 or env)');
const WS = BASE.replace(/^http/, 'ws');
const room = 't' + Date.now().toString(36);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
let ok = 0, bad = 0;
const t = (c, n, d = '') => (c ? (ok++, console.log('✔', n, d)) : (bad++, console.log('✘', n, d)));
const post = async (p, b) => (await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();

async function client(name, x, z) {
  const ws = new WebSocket(`${WS}/ws?room=${room}&k=${encodeURIComponent(KEY)}`);
  const msgs = [];
  const pid = rid();
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
const state = (c) => post('/api/pump/state', { pid: c.pid, room });

const P = { x: PUMP.x, z: PUMP.z };
const A = await client('Alice', P.x, P.z);
const B = await client('Bob', P.x + 1, P.z);
const C = await client('Cara', 0, 14); // courtyard: calm side
const D = await client('Dan', P.x - 1, P.z);

// zone
A.send({ t: 'duel_ask', to: C.id, m: 'SOL', dir: 'up', len: 1 });
t(/PumpHall only/.test((await until(A, (m) => m.t === 'duel_no'))?.why), 'no duels outside PumpHall');
// too far
const F = await client('Fay', P.x + 12, P.z);
A.send({ t: 'duel_ask', to: F.id, m: 'SOL', dir: 'up', len: 1 });
t(/closer/.test((await until(A, (m) => m.t === 'duel_no'))?.why), `server distance check (> ${DUEL.menuR + DUEL.lagTol} m)`);

// invite → decline → cooldown
A.send({ t: 'duel_ask', to: B.id, m: 'SOL', dir: 'up', len: 1 });
const inv = await until(B, (m) => m.t === 'duel_inv');
t(inv && inv.n === 'Alice' && inv.dir === 'up' && inv.m === 'SOL' && inv.rated === false, 'invite reaches the opponent (unrated: same network)', inv && `why=${inv.why}`);
t(!!(await until(A, (m) => m.t === 'duel_sent')), 'challenger gets duel_sent');
B.send({ t: 'duel_ans', id: inv?.id, ok: false });
t(/not now/.test((await until(A, (m) => m.t === 'duel_no'))?.why), 'decline tells the challenger');
A.send({ t: 'duel_ask', to: B.id, m: 'SOL', dir: 'up', len: 1 });
t(/couple of minutes/.test((await until(A, (m) => m.t === 'duel_no'))?.why), 're-invite cooldown after "not now"');

// accept
D.send({ t: 'duel_ask', to: B.id, m: 'SOL', dir: 'up', len: 1 });
const inv2 = await until(B, (m) => m.t === 'duel_inv');
const before = Date.now();
B.send({ t: 'duel_ans', id: inv2?.id, ok: true });
const on = await until(D, (m) => m.t === 'duel_on');
const onB = await until(B, (m) => m.t === 'duel_on');
const onA = await until(A, (m) => m.t === 'duel_on'); // bystanders see it too (ring)
t(on && onB && onA && on.a === D.id && on.b === B.id && on.adir === 'up', 'accept → duel_on for both players and bystanders');
t(on && on.lockAt % 60000 === 0 && on.lockAt - before >= DUEL.leadMs - 1000 && on.lockAt - before <= DUEL.leadMs + 61000 && on.endAt - on.lockAt === 60000, 'lock on a minute boundary ≥ 20 s ahead, 1-min round', on && `lock in ${Math.round((on.lockAt - before) / 1000)} s`);
A.send({ t: 'duel_ask', to: B.id, m: 'SOL', dir: 'down', len: 1 });
await until(A, (m) => m.t === 'duel_no'); // still on cooldown from before: use a fresh challenger
const E = await client('Eve', P.x, P.z + 1);
E.send({ t: 'duel_ask', to: D.id, m: 'SOL', dir: 'down', len: 1 });
t(/already in a duel/.test((await until(E, (m) => m.t === 'duel_no'))?.why), 'one duel at a time');

// settle (forced rated: local tests share one IP) → points + Elo
await post('/api/pump/test-duel', { room, key: KEY, age: true });
await post('/api/pump/test-duel', { room, key: KEY, id: on?.id, lock: 100, close: 101, rated: true });
const sd = await state(D);
const sb = await state(B);
const dd = sd.duels?.find((d) => d.id === on?.id);
const db = sb.duels?.find((d) => d.id === on?.id);
t(dd?.won === 1 && dd.pts === duelPoints(0) && dd.dir === 'up', 'UP side wins on a higher close, +15', JSON.stringify(dd && { won: dd.won, pts: dd.pts }));
t(db?.won === 0 && db.pts === 0 && db.dir === 'down', 'loser gets 0 (never negative), took the opposite side');
t(dd?.r1 === eloNext(1000, 1000, 1, 0) && db?.r1 === eloNext(1000, 1000, 0, 0), 'Elo update', `${dd?.r1} / ${db?.r1}`);
t(sd.duel_board?.[0]?.name === 'Dan' && sd.duel_me?.wpts === 15, 'weekly duel board', JSON.stringify(sd.duel_board?.[0]));
t(eloNext(1000, 1100, 1, 20) === 1015 && eloNext(1100, 1000, 0, 20) === 1085, 'GDD example: 1000 beats 1100 (K 24) → 1015 / 1085');

// cancel before lock
const G = await client('Gus', P.x + 2, P.z + 2);
const H = await client('Hal', P.x + 2.5, P.z + 2);
G.send({ t: 'duel_ask', to: H.id, m: 'SKR', dir: 'down', len: 5 });
const inv3 = await until(H, (m) => m.t === 'duel_inv');
H.send({ t: 'duel_ans', id: inv3?.id, ok: true });
const on3 = await until(G, (m) => m.t === 'duel_on');
t(on3 && on3.endAt - on3.lockAt === 5 * 60000 && on3.m === 'SKR', 'SKR 5-min duel');
G.send({ t: 'state', s: 'sit' }); // a sit before the lock cancels it
const off = await until(H, (m) => m.t === 'duel_off');
t(off?.id === on3?.id && off.why === 'sit', 'sitting before the lock cancels the duel for both');
t(!(await state(H)).duels.some((d) => d.id === on3?.id), 'cancelled duels are not listed');
G.send({ t: 'state', s: 'idle' });
// ✕ on the chip before the lock
const L = await client('Lu', P.x - 3, P.z - 3);
const M = await client('Mo', P.x - 3.5, P.z - 3);
L.send({ t: 'duel_ask', to: M.id, m: 'SOL', dir: 'up', len: 1 });
const inv4 = await until(M, (m) => m.t === 'duel_inv');
M.send({ t: 'duel_ans', id: inv4?.id, ok: true });
const on4 = await until(M, (m) => m.t === 'duel_on');
M.send({ t: 'duel_cancel' });
const off4 = await until(L, (m) => m.t === 'duel_off');
t(on4 && off4?.id === on4.id && off4.why === 'cancel' && off4.by === M.id, '✕ before the lock cancels for both');

// rate limit: 3 invites a minute
const J = await client('Jo', P.x + 3, P.z + 3);
const K = await client('Kai', P.x + 3, P.z + 1);
let sent = 0;
for (const x of [A, E, J, K]) {
  H.send({ t: 'duel_ask', to: x.id, m: 'SOL', dir: 'up', len: 1 });
  if (await until(H, (m) => m.t === 'duel_sent', 1500)) sent++;
}
const slow = await until(H, (m) => m.t === 'duel_no' && /Slow down/.test(m.why), 1500);
t(sent === DUEL.invitesPerMin && !!slow, `rate limit: ${DUEL.invitesPerMin} invites a minute`, `${sent} sent · ${slow?.why}`);

// opting out
B.send({ t: 'dq', on: false });
t((await until(A, (m) => m.t === 'dq'))?.on === false, 'open-to-duels flag is public');
const I = await client('Ivy', P.x + 1, P.z + 1);
I.send({ t: 'duel_ask', to: B.id, m: 'SOL', dir: 'up', len: 1 });
t(/not open/.test((await until(I, (m) => m.t === 'duel_no'))?.why), 'players who opted out cannot be challenged');

// copy: points only, no betting words in the UI
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8') + readFileSync(new URL('../src/duel.ts', import.meta.url), 'utf8');
const words = html.match(/\b(bet|bets|betting|wager\w*|stake[sd]?|pot|odds)\b/gi);
t(!words, 'no betting words in the duel UI', words?.join(','));

for (const c of [A, B, C, D, E, F, G, H, I, J, K, L, M]) c.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
