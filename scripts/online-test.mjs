// Online join tests (spec 004). Drives WebSocket "bots" against a hall server and checks the messages.
// Usage: node scripts/online-test.mjs [baseUrl] [--crowd N]
//   baseUrl defaults to http://localhost:5173 (Vite dev proxy). Live: https://quiet-hall.ted-233.workers.dev
//   LOAD_TEST_KEY=... lets the crowd test exceed the 8-connections-per-IP limit.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173').replace(/\/$/, '');
const CROWD = Number(args[args.indexOf('--crowd') + 1]) || 0;
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
let KEY = process.env.LOAD_TEST_KEY ?? '';
if (!KEY && IS_LOCAL) {
  try {
    KEY = /LOAD_TEST_KEY=(\w+)/.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))?.[1] ?? '';
  } catch {}
}
const ROOM = `t${Date.now().toString(36)}`; // fresh room for each run ("main"/"seeker" are special)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
}

class Bot {
  constructor(name, { room = ROOM, key = '' } = {}) {
    this.name = name;
    this.room = room;
    this.key = key;
    this.msgs = [];
    this.waiters = [];
  }
  open(hello = {}) {
    return new Promise((resolve, reject) => {
      const q = `room=${this.room}${this.key ? `&k=${this.key}` : ''}`;
      this.ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?${q}`);
      this.ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        const m = JSON.parse(e.data);
        m._at = performance.now();
        this.msgs.push(m);
        for (const w of [...this.waiters]) if (w.pred(m)) w.done(m);
      };
      this.ws.onerror = () => reject(new Error(`${this.name} socket error`));
      this.ws.onclose = (e) => {
        this.closed = e.code;
        resolve(null);
      };
      this.ws.onopen = () => {
        this.send({ t: 'hello', color: 1, x: 0, z: 17, ...hello });
        this.next((m) => m.t === 'welcome' || m.t === 'denied', 5000).then(resolve, reject);
      };
    });
  }
  send(m) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }
  /** Resolves with the first message (already received after `since`, or future) matching pred. */
  next(pred, ms = 4000, since = 0) {
    const hit = this.msgs.slice(since).find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = {
        pred,
        done: (m) => {
          clearTimeout(t);
          this.waiters = this.waiters.filter((x) => x !== w);
          resolve(m);
        },
      };
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error(`${this.name}: timeout`));
      }, ms);
      this.waiters.push(w);
    });
  }
  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}
const ok = (p) => p.then((m) => m, () => null);

console.log(`Hall server: ${BASE}  room: ${ROOM}\n`);

// T002 join
const a = new Bot('A');
const wa = await a.open({ pid: 'hostpid0001' });
check('A gets welcome', wa?.t === 'welcome', `here=${wa?.stats?.here}`);
const b = new Bot('B');
const markA = a.msgs.length;
const wb = await b.open({ pid: 'friendpid01', with: wa?.me?.inv, color: 4, x: -3, z: 12 }); // links carry the public invite id, not the pid
check('B welcome lists A', wb?.players?.length === 1);
const join = await ok(a.next((m) => m.t === 'join', 3000, markA));
check('A sees B join', !!join && join.p.color === 4);
const st = await ok(a.next((m) => m.t === 'stats' && m.here === 2, 3000, markA));
check('here count = 2 for A', !!st);

// T004 invite link
const fh = await ok(b.next((m) => m.t === 'friendHere', 3000));
check('B placed next to host (friendHere)', !!fh && fh.x === 0 && fh.z === 17);
const fr = await ok(a.next((m) => m.t === 'friend', 3000, markA));
check('host told a friend arrived', !!fr, `invites=${fr?.invites}`);
const firstCount = fr?.invites ?? 0;
b.close();
await wait(400);
const b2 = new Bot('B again');
const markA2 = a.msgs.length;
await b2.open({ pid: 'friendpid01', with: wa?.me?.inv });
const fr2 = await ok(a.next((m) => m.t === 'friend', 3000, markA2));
check('same friend not double counted', fr2?.invites === firstCount, `${firstCount} -> ${fr2?.invites}`);

// movement relay + latency
const markB = b2.msgs.length;
const t0 = performance.now();
a.send({ t: 'move', x: 2.5, z: 9.5, ry: 1 });
const mv = await ok(b2.next((m) => m.t === 'm' && m.x === 2.5, 3000, markB));
check('movement relayed', !!mv, mv ? `${Math.round(mv._at - t0)} ms` : '');

// T003 sit / stand
const markS = b2.msgs.length;
a.send({ t: 'state', s: 'sit' });
const s1 = await ok(b2.next((m) => m.t === 's' && m.s === 'sit', 3000, markS));
const c1 = await ok(b2.next((m) => m.t === 'stats' && m.sitting === 1, 3000, markS));
check('sit broadcast + sitting=1', !!s1 && !!c1);
const sitsBefore = c1?.sits ?? 0;
console.log('  …sitting 16 s so it counts');
await wait(16000);
const markS2 = b2.msgs.length;
a.send({ t: 'state', s: 'idle' });
const c2 = await ok(b2.next((m) => m.t === 'stats' && m.sitting === 0, 3000, markS2));
check('stand → sitting=0, sits +1', !!c2 && c2.sits === sitsBefore + 1, `sits ${sitsBefore} -> ${c2?.sits}`);

// emote + ring relay, ring rate limit
const markE = b2.msgs.length;
a.send({ t: 'emote', e: 'bow' });
a.send({ t: 'ring', what: 'bell' });
a.send({ t: 'ring', what: 'bell' }); // second within 5 s must be dropped
await wait(800);
const rings = b2.msgs.slice(markE).filter((m) => m.t === 'ring').length;
check('bow relayed', b2.msgs.slice(markE).some((m) => m.t === 'e' && m.e === 'bow'));
check('bell rate-limited to 1 per 5 s', rings === 1, `${rings} ring(s)`);

// T005 reconnect while sitting
const c = new Bot('C');
await c.open({ pid: 'cpid000001' });
c.send({ t: 'state', s: 'sit' });
await wait(300);
c.close();
await wait(400);
const c2b = new Bot('C reconnect');
const markR = b2.msgs.length;
await c2b.open({ pid: 'cpid000001', s: 'sit' });
const rj = await ok(b2.next((m) => m.t === 'join' && m.p.s === 'sit', 3000, markR));
check('reconnect restores sitting', !!rj);

// T006 Seeker hall gating
const anon = new Bot('anon', { room: 'seeker' });
const den = await anon.open({});
check('anonymous refused from Seeker hall', den?.t === 'denied', den?.reason);

// T007 per-IP limit (local only: one runner = one IP)
if (IS_LOCAL) {
  const extra = [];
  for (let i = 0; i < 9; i++) extra.push(new Bot(`ip${i}`, { room: `${ROOM}i` }));
  const res = await Promise.all(extra.map((x) => x.open({}).catch(() => null)));
  const accepted = res.filter((m) => m?.t === 'welcome').length;
  check('9th connection from one IP refused', accepted === 8, `${accepted} accepted`);
  extra.forEach((x) => x.close());
}

// T008 crowd
const N = CROWD || (KEY ? 30 : 6);
const crowd = [];
for (let i = 0; i < N; i++) crowd.push(new Bot(`c${i}`, { room: `${ROOM}c`, key: KEY }));
const tj = performance.now();
const welcomes = await Promise.all(crowd.map((x, i) => x.open({ color: i % 8, x: (i % 10) - 5, z: Math.floor(i / 10) * 2 }).catch(() => null)));
const joined = welcomes.filter((m) => m?.t === 'welcome').length;
check(`crowd: ${N} joined`, joined === N, `${joined}/${N} in ${Math.round(performance.now() - tj)} ms`);
const lat = [];
const marks = crowd.map((x) => x.msgs.length);
const tStart = performance.now();
let sentAt = new Map();
const timer = setInterval(() => {
  crowd.forEach((x, i) => {
    const v = Math.round((performance.now() - tStart) / 10) / 100 + i;
    sentAt.set(v, performance.now());
    x.send({ t: 'move', x: (i % 10) - 5 + Math.sin(v) * 0.5, z: v % 40, ry: 0 });
  });
}, 125);
await wait(10000);
clearInterval(timer);
await wait(500);
let received = 0;
crowd.forEach((x, i) => {
  for (const m of x.msgs.slice(marks[i])) {
    if (m.t !== 'm') continue;
    received++;
    const s = sentAt.get(m.z);
    if (s) lat.push(m._at - s);
  }
});
lat.sort((p, q) => p - q);
const p95 = lat.length ? Math.round(lat[Math.floor(lat.length * 0.95)]) : -1;
const expected = N * (N - 1) * 80;
check(
  `crowd: moves relayed (8 Hz × ${N} for 10 s)`,
  received > expected * 0.8 && p95 < 1000,
  `${received}/${expected} msgs, ${Math.round(received / 10)}/s, p95 ${p95} ms`,
);
crowd.forEach((x) => x.close());

a.close();
b2.close();
c2b.close();
await wait(300);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
