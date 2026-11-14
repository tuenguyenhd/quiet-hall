// NEAR edition AI companion: Biscuit answers (mock AI), the free daily trial runs out, the AI Pass unlocks more,
// a payment counts once, and a bad transaction hash is refused. Needs LLM_MODE=mock and NEAR_MIRROR_MODE=mock.
// Usage: node scripts/near-companion-test.mjs [baseUrl] <loadTestKey>
import { COMPANION } from '../src/companion.ts';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const KEY = process.argv[3] ?? process.env.LOAD_TEST_KEY ?? '';
if (!KEY) throw new Error('Pass the LOAD_TEST_KEY (arg 2 or env)');
const WS = BASE.replace(/^http/, 'ws');
const room = 't' + Date.now().toString(36);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12).padEnd(10, 'x');
let ok = 0, bad = 0;
const t = (c, n, d = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, d)));

async function client(name) {
  const pid = rid();
  const ws = new WebSocket(`${WS}/ws?room=${room}&k=${encodeURIComponent(KEY)}`);
  const msgs = [];
  ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ t: 'hello', color: 1, seed: 7, x: 0, z: 0, pid, name }));
  const c = { ws, msgs, pid, send: (m) => ws.send(JSON.stringify(m)) };
  await until(c, (m) => m.t === 'welcome');
  return c;
}
async function until(c, p, ms = 4000) {
  for (let i = 0; i < ms; i += 50) {
    const k = c.msgs.findIndex(p);
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(50);
  }
}
const ask = async (c, m) => (c.send({ t: 'petsay', ...m }), until(c, (x) => x.t === 'petsaid'));

const A = await client('Ann');
A.send({ t: 'aistat' });
const s0 = await until(A, (m) => m.t === 'aistat');
t(s0?.left === COMPANION.freePerDay && s0?.pass === 0 && s0?.price === COMPANION.passNear && /\.testnet$/.test(s0?.to ?? ''), 'a new player has the full free trial and a testnet receiver', JSON.stringify(s0));

const r1 = await ask(A, { text: 'hi Biscuit' });
t(r1?.ok && typeof r1.text === 'string' && r1.text.length > 0 && r1.left === COMPANION.freePerDay - 1, 'Biscuit answers and one free chat is used', JSON.stringify(r1));
const r2 = await ask(A, { text: '', tip: true });
t(r2?.ok && /buy|Market|Cup/i.test(r2.text), 'the trading tip uses the market', JSON.stringify(r2));
const r3 = await ask(A, { text: 'x'.repeat(600), hist: [{ u: 'a'.repeat(1200), a: 'b' }, 'junk', null] });
t(r3?.ok, 'long input and junk history are trimmed, not crashed on', JSON.stringify(r3));
const hist3 = Array.from({ length: 3 }, (_, i) => ({ u: 'u'.repeat(200), a: `${i}`.repeat(300) }));
const r3b = await ask(A, { text: 'y'.repeat(240), hist: hist3 });
t(r3b?.ok, 'the largest message the client sends (3 turns of history) gets through', JSON.stringify(r3b));

// the per-minute limit catches a burst before the trial runs out
let limited = null;
for (let i = 0; i < COMPANION.perMinute + 2 && !limited; i++) {
  const r = await ask(A, { text: `msg ${i}` });
  if (!r?.ok && /breath/.test(r?.why ?? '')) limited = r;
}
t(!!limited, 'a burst of messages is rate limited', JSON.stringify(limited));

// a fresh player spends the whole trial (waiting out the minute limit when needed)
const B = await client('Ben');
let used = 0, last = null;
for (let i = 0; i < COMPANION.freePerDay + 3; i++) {
  let r = await ask(B, { text: `hello ${i}` });
  if (!r?.ok && /breath/.test(r?.why ?? '')) {
    await wait(61_000 - (Date.now() % 60_000));
    r = await ask(B, { text: `hello ${i}` });
  }
  if (r?.ok) used++;
  last = r;
  if (r?.needPass) break;
}
t(used === COMPANION.freePerDay, `exactly ${COMPANION.freePerDay} free chats a day`, `used ${used}`);
t(last?.ok === false && last?.needPass === true, 'after the trial, the AI Pass is offered', JSON.stringify(last));

// a malformed hash is refused; a (mock) payment unlocks the Pass, and the same payment can't be used twice
B.send({ t: 'aipass', tx: 'nope', signer: 'ben.testnet' });
t((await until(B, (m) => m.t === 'aipassed'))?.ok === false, 'a malformed transaction hash is refused');
const tx = `mock${Date.now()}`;
B.send({ t: 'aipass', tx, signer: 'ben.testnet' });
const p1 = await until(B, (m) => m.t === 'aipassed');
t(p1?.ok && p1.until > Date.now() + (COMPANION.passDays - 1) * 86_400_000, 'a payment gives the AI Pass for its days', JSON.stringify(p1));
const C = await client('Cat');
C.send({ t: 'aipass', tx, signer: 'ben.testnet' });
t((await until(C, (m) => m.t === 'aipassed'))?.ok === false, 'the same payment cannot be used again');
const r4 = await ask(B, { text: 'still there?' });
t(r4?.ok && r4.pass > Date.now(), 'with the Pass, Biscuit answers again', JSON.stringify(r4));

for (const c of [A, B, C]) c.ws.close();
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
