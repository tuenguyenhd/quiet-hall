// Fast-forward economy simulation (NEAR edition): one game day of the Market Cup in about a minute.
// Six players hand their Cup entry to Biscuit's autopilot (calm and bold policies) and four "noise" players trade by
// hand. Nobody scripts the prices: they move only because of these trades, and drift back when trading stops.
// Prints the price board every 2 game hours with Kettle's reasoning, then each agent's result and last decisions.
// Usage: node scripts/near-sim.mjs [baseUrl] <loadTestKey> [gameHours=24]   (run by `npm run sim:near`)
const [BASE = 'http://127.0.0.1:8899', KEY = 'localkey', HOURS = '24'] = process.argv.slice(2);
const MIN = Number(process.env.MINUTE_MS ?? 50);
const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?room=t${Date.now().toString(36)}&k=${encodeURIComponent(KEY)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => (await fetch(BASE + p)).json();
const MX = 85, MZ = 100; // the Market square
async function client(name) {
  const pid = (name.toLowerCase() + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 16);
  const ws = new WebSocket(wsUrl);
  const msgs = [];
  ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = () => j(new Error(`socket refused for ${name}`)))));
  const c = { ws, msgs, pid, name, send: (m) => ws.send(JSON.stringify(m)) };
  c.send({ t: 'hello', color: 1, seed: 3, pid, x: MX, z: MZ, name });
  await until(c, 'econ');
  const l = await get(`/api/near/test-link?k=${KEY}&pid=${pid}`);
  if (!l.account) throw new Error(`could not log ${name} in: ${JSON.stringify(l)}`);
  return c;
}
async function until(c, t, ms = 5000) {
  for (let i = 0; i < ms; i += 20) {
    const k = c.msgs.findIndex((m) => m.t === t);
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(20);
  }
}
const names = { moon_rock: 'Moon Rock', copium_shroom: 'Copium Shroom', rug_yarn: 'Rug Yarn', moon_collar: 'Moon Collar' };
const pad = (s, n) => String(s).padEnd(n);

console.log(`\nQuiet Hall economy simulation: ${HOURS} game hours, 1 game minute = ${MIN} ms\n`);
const agents = await Promise.all(['Ada', 'Bo', 'Cy', 'Dee', 'Eve', 'Fox'].map((n) => client(n)));
const noise = await Promise.all(['n1', 'n2', 'n3', 'n4'].map((n) => client(n)));
// everyone sits one game minute (the Cup's gate), then agents switch Biscuit on
for (const c of [...agents, ...noise]) c.send({ t: 'state', s: 'sit' });
await wait(MIN + 150);
for (const c of [...agents, ...noise]) c.send({ t: 'state', s: 'idle' });
await wait(200);
agents.forEach((c, i) => c.send({ t: 'agent', active: true, risk: i % 2 ? 'bold' : 'calm' }));
console.log(`6 players handed their Cup entry to Biscuit (3 calm, 3 bold). 4 players trade by hand.\n`);

const items = Object.keys(names);
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const total = Number(HOURS) * 60 * MIN;
const t0 = Date.now();
let lastBoard = -1;
console.log('Mid prices in play chips:');
console.log(pad('game time', 11) + items.map((i) => pad(names[i], 16)).join('') + 'Cup entrants');
while (Date.now() - t0 < total) {
  // hand traders: join each round, then make a random small trade (a wave of buying, later a wave of selling)
  for (const c of noise) {
    c.send({ t: 'cupJoin' });
    const hour = (Date.now() - t0) / (60 * MIN);
    const wave = Math.sin(hour / 3) > 0 ? 'buy' : 'sell';
    c.send({ t: 'trade', item: items[Math.floor(rnd() * 3)], side: rnd() < 0.75 ? wave : wave === 'buy' ? 'sell' : 'buy', n: 1 + Math.floor(rnd() * 6), cup: true });
    c.msgs.length = 0;
  }
  for (const c of agents) c.ws.send('ping'); // keep the sockets open
  const hour = Math.floor((Date.now() - t0) / (60 * MIN));
  if (hour % 2 === 0 && hour !== lastBoard) {
    lastBoard = hour;
    const m = await get('/api/near/market');
    console.log(pad(`hour ${hour}`, 11) + items.map((i) => { const q = m.quotes.find((x) => x.item === i); return pad(q.mid.toFixed(2), 16); }).join('') + m.cup.entrants);
  }
  await wait(4 * MIN);
}
const m = await get('/api/near/market');
console.log('\nKettle (the merchant NPC) explains the last prices:');
for (const i of items.slice(0, 3)) console.log(`  ${names[i]}: ${m.why[i]}`);

console.log('\nBiscuit autopilots (each trades one player\'s Cup entry under a spending policy):');
for (const c of agents) {
  c.msgs.length = 0;
  c.send({ t: 'agentstat' });
  const s = await until(c, 'agentstat');
  const trades = s.log.filter((l) => l.action !== 'hold');
  console.log(`  ${pad(c.name, 4)} ${pad(s.risk, 5)} wallet ${s.wallet.slice(0, 8)}…  now ${s.position ? s.position.chips + ' chips ' + JSON.stringify(s.position.bag) : 'between rounds'}`);
  for (const l of (trades.length ? trades : s.log).slice(0, 2)) console.log(`       ${l.action}${l.units ? ` ${l.units} ${names[l.item] ?? l.item}` : ''}: ${l.why}`);
}
const rounds = (await get('/api/near/rounds').catch(() => null))?.rounds;
if (rounds) console.log(`\nRounds settled: ${rounds.filter((r) => r.status === 'settled').length} (each committed on NEAR before it starts, settled after)`);
console.log('\nNo price was scripted: every move above came from a trade, and prices drift back when trading stops.');
for (const c of [...agents, ...noise]) c.ws.close();
process.exit(0);
