// NEAR edition trading agents: Biscuit's autopilot (login required, joins the Cup, logs every decision with a reason)
// and "bring your own agent" over MCP (player agent keys, policy caps, no sponsor powers).
// Needs a fast clock (MINUTE_MS=200), NEAR_MIRROR_MODE=mock and LLM_MODE=mock (the plain rules decide).
// Usage: node scripts/near-agent-test.mjs [baseUrl] <loadTestKey>

const [BASE = 'http://127.0.0.1:8788', KEY = ''] = process.argv.slice(2);
if (!KEY) throw new Error('pass the LOAD_TEST_KEY');
const MIN = 200;
const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?room=t${Date.now().toString(36)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));
const get = async (p) => (await fetch(BASE + p)).json();
const pid = (p) => (p + Date.now().toString(36)).slice(0, 16);
async function client(id) {
  const ws = new WebSocket(wsUrl);
  const msgs = [];
  ws.onmessage = (e) => e.data !== 'pong' && msgs.push(JSON.parse(e.data));
  await new Promise((r) => (ws.onopen = r));
  const c = { ws, msgs, pid: id, send: (m) => ws.send(JSON.stringify(m)) };
  c.send({ t: 'hello', color: 1, seed: 3, pid: id, x: 0, z: 30 });
  await until(c, 'econ');
  return c;
}
async function until(c, t, pred = () => true, ms = 5000) {
  for (let i = 0; i < ms; i += 20) {
    const k = c.msgs.findIndex((m) => m.t === t && pred(m));
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(20);
  }
}
const sitFor = async (c, mins) => { c.send({ t: 'state', s: 'sit' }); await wait(mins * MIN + 120); c.send({ t: 'state', s: 'idle' }); await until(c, 'leaves'); };
let rid = 0;
async function mcp(key, name, args = {}) {
  const r = await fetch(`${BASE}/api/near/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...(key ? { 'x-api-key': key } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method: 'tools/call', params: { name, arguments: args } }) });
  const j = await r.json();
  const t = j.result?.content?.[0]?.text;
  return { isError: !!j.result?.isError, data: t ? JSON.parse(t) : null };
}

// a guest cannot turn the autopilot on or make an agent key
const G = await client(pid('ag'));
G.send({ t: 'agent', active: true, risk: 'calm' });
const g1 = await until(G, 'agentstat');
check(g1?.ok === false && g1?.login === true && g1?.active === false, 'a guest cannot turn on the autopilot (login offered)', JSON.stringify(g1));
G.send({ t: 'agentkey' });
check((await until(G, 'agentkey'))?.ok === false, 'a guest cannot make an agent key');
G.ws.close();

// a logged-in player who has sat turns Biscuit on
const A = await client(pid('aa'));
await get(`/api/near/test-link?k=${KEY}&pid=${A.pid}`);
await sitFor(A, 1);
A.send({ t: 'agent', active: true, risk: 'calm' });
const a1 = await until(A, 'agentstat');
check(a1?.ok === true && a1.active === true && a1.risk === 'calm', 'a logged-in player turns the autopilot on', JSON.stringify(a1));

// within a few game minutes Biscuit joins the Cup and logs decisions, each with a reason
let st = null;
for (let i = 0; i < 40; i++) {
  A.send({ t: 'agentstat' });
  st = await until(A, 'agentstat');
  if (st?.position && st.log.length >= 2) break;
  await wait(500);
}
check(!!st?.position && st.position.chips > 0, 'Biscuit joined the Market Cup for the player', JSON.stringify(st?.position));
check(st?.log.some((l) => /Joined the Market Cup/.test(l.why)), 'the join is in the activity log');
check(st?.log.length >= 2 && st.log.every((l) => typeof l.why === 'string' && l.why.length > 5 && l.by === 'biscuit'), 'every decision has a reason a player can read', JSON.stringify(st?.log?.slice(0, 3)));

// bring your own agent: a key, shown once
A.send({ t: 'agentkey', label: 'my bot' });
const k = await until(A, 'agentkey');
check(k?.ok === true && /^qha_[A-Za-z0-9]{32}$/.test(k.key), 'a player makes an agent key', JSON.stringify(k)?.slice(0, 80));
const AK = k?.key;

const mk = await mcp(AK, 'get_market');
check(!mk.isError && mk.data.items.length >= 3 && mk.data.items.every((i) => i.ask > i.bid), 'the agent reads the market', JSON.stringify(mk.data)?.slice(0, 120));
const moon = mk.data.items.find((i) => i.item === 'moon_rock');
const tb = await mcp(AK, 'trade', { item: 'moon_rock', side: 'buy', units: 99, reason: 'testing the policy cap' });
const cap = (await mcp(AK, 'get_my_position')).data.policy;
check(!tb.isError && tb.data.done.units <= cap.maxUnits && tb.data.done.chips <= cap.maxChipsPerTrade + 1, `a big buy is clamped by the calm policy (≤ ${cap.maxUnits} units, ≤ ${cap.maxChipsPerTrade} chips)`, JSON.stringify(tb.data));
check(/clamped/.test(tb.data?.clamped ?? ''), 'the agent is told its order was clamped');
await wait(2 * MIN);
const ts = await mcp(AK, 'trade', { item: 'rug_yarn', side: 'sell', units: 3, reason: 'selling what I do not hold' });
check(ts.isError && /holds none|Refused/.test(ts.data.error), 'selling what the player does not hold is refused', JSON.stringify(ts.data));
const pos = await mcp(AK, 'get_my_position');
check(!pos.isError && pos.data.inCup && pos.data.recent.some((l) => l.by === 'agent:my bot' && /policy cap/.test(l.why)), "the player's log shows the agent's trade and reason", JSON.stringify(pos.data)?.slice(0, 160));
A.send({ t: 'agentstat' });
const st2 = await until(A, 'agentstat');
check(st2?.log.some((l) => l.by === 'agent:my bot'), 'the player sees their own agent in the activity log too');

// an agent key has no sponsor powers; bad keys and missing keys are refused
const nc = await mcp(AK, 'create_campaign', { campaign: {} });
check(nc.isError && /sponsor key/.test(nc.data.error), 'an agent key cannot create sponsored drops');
const bk = await mcp('qha_' + 'x'.repeat(32), 'trade', { item: 'moon_rock', side: 'buy', units: 1, reason: 'x' });
check(bk.isError && /player agent key/.test(bk.data.error), 'an unknown agent key is refused');
const nk = await mcp('', 'get_my_position');
check(nk.isError, 'no key: refused');

// off means off
A.send({ t: 'agent', active: false, risk: 'calm' });
check((await until(A, 'agentstat'))?.active === false, 'the autopilot turns off');

A.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
