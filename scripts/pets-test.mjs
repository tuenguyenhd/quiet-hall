// Pets + blessings over the socket. Usage: node scripts/pets-test.mjs [baseUrl]
// Note: free blessings are capped at 3 per network per UTC day, so against a live Worker this passes ~3 runs a day.
const room = 'p' + Date.now().toString(36);
const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const url = `${BASE.replace(/^http/, 'ws')}/ws?room=${room}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function client(pid, pet) {
  const ws = new WebSocket(url);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  return new Promise((r) => (ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', color: 3, seed: 5, pet, pid, x: 0, z: 17 })); r({ ws, msgs }); }));
}
const until = async (msgs, pred, ms = 5000) => {
  for (let t = 0; t < ms; t += 50) {
    const m = msgs.find(pred);
    if (m) return m;
    await wait(50);
  }
  return undefined;
};
let ok = 0, bad = 0;
const check = (c, n) => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n)));
const pidA = 'pa' + Date.now().toString(36);
const a = await client(pidA, 2);
await wait(300);
const b = await client('pb' + Date.now().toString(36), 9);
await wait(400);
const wB = await until(b.msgs, (m) => m.t === 'welcome');
check(wB.players.find((p) => p.pt === 0), 'pet not bought -> shown without pet');
check((await until(a.msgs, (m) => m.t === 'join'))?.p.pt === 0, 'bad pet index clamps to 0');
a.ws.send(JSON.stringify({ t: 'pet', k: 3 }));
check((await until(a.msgs, (m) => m.t === 'petNo'))?.k === 3, 'cannot pick a pet you did not buy');
check(!b.msgs.some((m) => m.t === 'pt'), 'unbought pet not relayed');
check((await until(a.msgs, (m) => m.t === 'welcome'))?.me.pets.length === 0, 'welcome lists owned pets (none)');
a.ws.send(JSON.stringify({ t: 'bless', f: 0 }));
await wait(400);
const bl = await until(b.msgs, (m) => m.t === 'bl');
check(bl && bl.f === 0 && bl.u - Date.now() > 50000 && bl.u - Date.now() < 65000, 'free bless lasts 1 min');
check(a.msgs.some((m) => m.t === 'bl'), 'blessed person gets own bl');
a.ws.send(JSON.stringify({ t: 'bless', f: 1 }));
await wait(300);
check((await until(a.msgs, (m) => m.t === 'blessNo'))?.paid === true, 'second free bless today refused');
a.ws.send(JSON.stringify({ t: 'bless', f: 1, order: 'nope' }));
await wait(300);
await until(a.msgs, (m) => m.t === 'blessNo' && !m.paid);
check(a.msgs.filter((m) => m.t === 'blessNo').length === 2, 'fake paid order refused');
a.ws.send(JSON.stringify({ t: 'emote', e: 'pat' }));
await wait(300);
check(!!(await until(b.msgs, (m) => m.t === 'e' && m.e === 'pat')), 'pat relayed');
a.ws.close();
await wait(300);
const a2 = await client(pidA, 1);
await wait(400);
const w2 = await until(a2.msgs, (m) => m.t === 'welcome');
check(w2?.me.bl === 0 && w2.me.bu > Date.now(), 'blessing survives reconnect');
await until(b.msgs, (m) => m.t === 'join' && m.p.bl === 0);
check(b.msgs.filter((m) => m.t === 'join').at(-1)?.p.bl === 0, 'others see blessing on rejoin');
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
