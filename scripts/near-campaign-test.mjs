// NEAR edition, Sponsored Drops (server): create over MCP with a sponsor key, 'camps' pushed live, server-side reach,
// one pick per drop, goal → completion serial + claim ONLY to that player, guests log in to claim (cclaim),
// Mirror jobs badge-<id>-<serial> and camp-<id>, the supply limit, end_campaign. Plan: Sponsored Drops, Verification.
// Start (mock mirror, mock LLM):
//   npx wrangler dev -c wrangler.near.toml --port 8831 --ip 127.0.0.1 --var NEAR_MIRROR_MODE:mock --var LOAD_TEST_KEY:localkey \
//     --var CAMPAIGN_ADMIN_KEY:localadmin --var LLM_MODE:mock --var MINUTE_MS:200
// Run:  node scripts/near-campaign-test.mjs [baseUrl] <loadTestKey> <campaignAdminKey>
import { createHash } from 'node:crypto';
const [BASE = 'http://127.0.0.1:8831', KEY = '', ADMIN = ''] = process.argv.slice(2);
if (!KEY || !ADMIN) throw new Error('usage: node scripts/near-campaign-test.mjs <baseUrl> <LOAD_TEST_KEY> <CAMPAIGN_ADMIN_KEY>');
const room = `t${Date.now().toString(36)}`;
const wsUrl = `${BASE.replace(/^http/, 'ws')}/ws?room=${room}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));
const get = async (p) => (await fetch(BASE + p)).json();
const pid = (p) => (p + Date.now().toString(36)).slice(0, 16);
const sha = (s) => createHash('sha256').update(s).digest('hex');

// --- the same placement as dropsOf() in src/campaigns.ts (client and server must agree; this is a third copy on purpose)
const ZONES = { valley: { x: 100, z: -90, r: 22 }, court: { x: 0, z: 14, r: 22 }, pump: { x: 0, z: 100, r: 16 }, bazaar: { x: 85, z: 100, r: 15 }, soon: { x: -72, z: 100, r: 20 } };
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function dropsOf(c) {
  const z = ZONES[c.zone], n = c.drop.count, rot = (fnv(c.id) / 0xffffffff) * Math.PI * 2, R = z.r * 0.8, golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const rr = R * Math.sqrt((i + 0.5) / n), a = rot + i * golden;
    return { x: +(z.x + Math.cos(a) * rr).toFixed(2), z: +(z.z + Math.sin(a) * rr).toFixed(2) };
  });
}

// --- MCP helper (JSON replies)
let rpcId = 0;
async function tool(name, args, apiKey) {
  const r = await fetch(`${BASE}/api/near/mcp?k=${KEY}&room=${room}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  });
  const j = await r.json();
  const text = j.result?.content?.[0]?.text;
  return { isError: !!j.result?.isError, data: text ? JSON.parse(text) : null, raw: j };
}
const sponsorKey = async (sponsor, admin = ADMIN) => {
  const r = await fetch(`${BASE}/api/near/sponsor-key`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': admin }, body: JSON.stringify({ sponsor }) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// --- sockets
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
  for (let i = 0; i < ms; i += 20) {
    const k = c.msgs.findIndex((m) => m.t === t && pred(m));
    if (k >= 0) return c.msgs.splice(k, 1)[0];
    await wait(20);
  }
  return undefined;
}
const go = async (c, p) => { c.send({ t: 'move', x: p.x, z: p.z, ry: 0 }); await wait(60); };
const cpick = async (c, id, d, pause = 1050) => { c.send({ t: 'cpick', c: id, d }); const r = await until(c, 'cpicked', (m) => m.c === id); await wait(pause); return r; };
const login = (c) => get(`/api/near/test-link?k=${KEY}&pid=${c.pid}`);

// --- sponsor keys: admin only; MCP tools refuse no key / a bad key
const noAdmin = await sponsorKey('Nobody', 'wrong-admin-key');
check(noAdmin.status === 404, 'a sponsor key cannot be issued without the admin key', JSON.stringify(noAdmin));
const k1 = await sponsorKey('Bonk test');
const k2 = await sponsorKey('Other sponsor');
const SK = k1.body?.key, SK2 = k2.body?.key;
check(/^qhs_[A-Za-z0-9]{32}$/.test(SK ?? '') && SK !== SK2, 'the admin issues sponsor keys (qhs_ + 32 base62)');

const terms = (extra = {}) => ({
  sponsor: { name: 'BONK', emoji: '🐶', color: '#ff9900' },
  zone: 'court',
  drop: { name: 'BONK meme', emoji: '🐶', count: 5 },
  goal: 3,
  reward: { badge: 'Bonk Hunter', claimUrl: 'https://bonk.example.com/claim', code: 'BONK-2026' },
  supply: 1,
  days: 1,
  ...extra,
});
check((await tool('create_campaign', { campaign: terms() })).isError, 'create_campaign with no key is refused');
check((await tool('create_campaign', { campaign: terms() }, 'qhs_' + 'x'.repeat(32))).isError, 'create_campaign with a bad key is refused');

// --- live push: a player in the room sees the new campaign at once
const A = await client(pid('ca'), 0, 30);
const B = await client(pid('cb'), 0, 31);
const created = await tool('create_campaign', { campaign: terms() }, SK);
const C1 = created.data;
check(!created.isError && /^cmp-[a-z0-9]+$/.test(C1?.id) && /^[0-9a-f]{64}$/.test(C1?.configHash), 'a sponsor key creates a campaign (id + configHash)', JSON.stringify(created.raw).slice(0, 300));
const pushA = await until(A, 'camps', (m) => m.list.some((c) => c.id === C1.id));
const pushB = await until(B, 'camps', (m) => m.list.some((c) => c.id === C1.id));
check(!!pushA && !!pushB, 'every player in the room receives camps with it');
const pubC1 = pushA?.list.find((c) => c.id === C1.id);
check(pubC1 && pubC1.reward.hasClaim === true && !JSON.stringify(pushA.list).includes('bonk.example.com') && !JSON.stringify(pushA.list).includes('BONK-2026'), 'the broadcast has no claim link or code');
const all = await get('/api/near/campaigns');
check(all.list.some((c) => c.id === C1.id) && !JSON.stringify(all).includes('BONK-2026'), 'GET /api/near/campaigns lists it, without the code');
// configHash = sha256(canonical terms), recomputable by anyone who has the terms
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const { status: _s, ...t1 } = C1.campaign;
check(sha(JSON.stringify(sortKeys(t1))) === C1.configHash, 'configHash = sha256 of the canonical terms');
const W = await client(pid('cw'), 0, 30);
const welcomeW = W.msgs.find((m) => m.t === 'welcome');
check(welcomeW?.camps?.some((c) => c.id === C1.id), "a newcomer's welcome includes the live campaigns");
W.ws.close();

// --- reach and once-per-drop
const spots = dropsOf({ id: C1.id, zone: 'court', drop: { count: 5 } });
await login(A);
await login(B);
await go(A, { x: spots[0].x + 15, z: spots[0].z + 15 });
const far = await cpick(A, C1.id, 0);
check(far?.ok === false && far.why === 'too far', 'a pick from too far is refused (server position)', JSON.stringify(far));
await go(A, spots[0]);
const p0 = await cpick(A, C1.id, 0);
check(p0?.ok === true && p0.got === 1 && p0.goal === 3 && !p0.done, 'A picks drop 0 (1/3)', JSON.stringify(p0));
const again = await cpick(A, C1.id, 0);
check(again?.ok === false && again.got === 1, 'the same drop twice is refused', JSON.stringify(again));
check((await cpick(A, C1.id, 99))?.ok === false, 'a drop index out of range is refused');
await go(A, spots[1]);
await cpick(A, C1.id, 1, 0);
await go(A, spots[2]);
const fast = await cpick(A, C1.id, 2);
check(fast?.ok === false && fast.why === 'too fast', 'two picks within 1 s are refused', JSON.stringify(fast));

// --- goal: completion serial 1, claim only to A
B.msgs.length = 0;
const done = await cpick(A, C1.id, 2);
check(done?.ok && done.done === true && done.serial === 1 && done.got === 3, 'collecting the goal completes it with serial 1', JSON.stringify(done));
check(done?.claim?.url === 'https://bonk.example.com/claim' && done?.claim?.code === 'BONK-2026' && done?.badge === 'Bonk Hunter', 'the completer gets the badge and the claim link + code', JSON.stringify(done));
await wait(300);
check(!JSON.stringify(B.msgs).includes('BONK-2026') && !JSON.stringify(B.msgs).includes('bonk.example.com'), 'nobody else receives the claim');
await go(A, spots[3]);
const after = await cpick(A, C1.id, 3);
check(after?.ok === false && after.done === true, 'a completer cannot keep picking', JSON.stringify(after));

// --- Mirror jobs: the badge receipt (to A's owner id) and the campaign commit
await wait(1500);
const jobs = (await get(`/api/near/test-jobs?k=${KEY}&ids=badge-${C1.id}-1,camp-${C1.id}`)).jobs;
const jb = jobs.find((j) => j.job === `badge-${C1.id}-1`), jc = jobs.find((j) => j.job === `camp-${C1.id}`);
check(jb?.method === 'mint_badge' && jc?.method === 'commit_campaign', 'Mirror has badge-<id>-1 (mint_badge) and camp-<id> (commit_campaign)', JSON.stringify(jobs));
const meA = await get(`/api/near/me?pid=${A.pid}`);
const rec = meA.receipts.find((r) => r.job === `badge-${C1.id}-1`);
check(rec && rec.args.owner === meA.owner && rec.args.campaign_id === C1.id && rec.args.badge === 'Bonk Hunter' && rec.args.serial === 1, "the badge receipt is in A's receipts with its args", JSON.stringify(rec));

// --- supply: 1 completion only
await go(B, spots[4]);
const bs = await cpick(B, C1.id, 4);
check(bs?.ok === false && /claimed/.test(bs.why), 'supply 1: another player is refused once it is used up', JSON.stringify(bs));

// --- stats
const st = (await tool('get_campaign_stats', { id: C1.id }, SK)).data;
check(st?.picks === 3 && st.players === 1 && st.completions === 1 && st.supplyLeft === 0, 'stats: 3 picks, 1 player, 1 completion, 0 left', JSON.stringify(st));

// --- a guest collects, is asked to log in, and completes with cclaim after logging in
const C2 = (await tool('create_campaign', { campaign: terms({ goal: 2, supply: 5, reward: { badge: 'Bonk Scout', code: 'SCOUT-1' } }) }, SK)).data;
check(!!C2?.id, 'a second campaign (goal 2, supply 5) goes live', JSON.stringify(C2));
await until(A, 'camps', (m) => m.list.some((c) => c.id === C2.id));
const s2 = dropsOf({ id: C2.id, zone: 'court', drop: { count: 5 } });
const G = await client(pid('cg'), s2[0].x, s2[0].z);
await cpick(G, C2.id, 0);
await go(G, s2[1]);
const g2 = await cpick(G, C2.id, 1);
check(g2?.ok === true && g2.got === 2 && g2.done === false && g2.login === true && !g2.claim, 'a guest who reaches the goal is asked to log in (no claim yet)', JSON.stringify(g2));
G.send({ t: 'cclaim', c: C2.id });
const g3 = await until(G, 'cpicked', (m) => m.c === C2.id);
check(g3?.login === true && !g3.done, 'cclaim as a guest still asks to log in', JSON.stringify(g3));
await login(G);
G.send({ t: 'cclaim', c: C2.id });
const g4 = await until(G, 'cpicked', (m) => m.c === C2.id);
check(g4?.d === -1 && g4.done === true && g4.serial === 1 && g4.claim?.code === 'SCOUT-1', 'after login, cclaim completes it (serial 1, claim code)', JSON.stringify(g4));
G.send({ t: 'cclaim', c: C2.id });
const g5 = await until(G, 'cpicked', (m) => m.c === C2.id);
check(g5?.ok === false && g5.done === true && !g5.claim, 'a second cclaim completes nothing', JSON.stringify(g5));
// reconnecting: welcome.cmine restores this player's own progress (and their claim)
G.ws.close();
await wait(200);
const G2 = await client(G.pid, 0, 30);
const wG = G2.msgs.find((m) => m.t === 'welcome');
check(wG?.cmine?.[C2.id]?.serial === 1 && wG.cmine[C2.id].d.length === 2 && wG.cmine[C2.id].claim?.code === 'SCOUT-1', "welcome.cmine has the player's picks and claim", JSON.stringify(wG?.cmine));
const wA = A.msgs.find((m) => m.t === 'welcome');
check(!JSON.stringify(wA ?? {}).includes('SCOUT-1'), "another player's welcome never had the claim");

// --- end_campaign: only its creator; the removal reaches every player
check((await tool('end_campaign', { id: C2.id }, SK2)).isError, 'another sponsor cannot end it');
A.msgs.length = 0;
const end = await tool('end_campaign', { id: C2.id }, SK);
check(!end.isError && end.data?.ended === true, 'the creator ends it');
const gone = await until(A, 'camps', (m) => !m.list.some((c) => c.id === C2.id));
check(!!gone, 'players receive camps without it');
await go(B, s2[2]);
const late = await cpick(B, C2.id, 2);
check(late?.ok === false && /ended/.test(late.why), 'a pick after the end is refused', JSON.stringify(late));
await tool('end_campaign', { id: C1.id }, SK);
check(!(await get('/api/near/campaigns')).list.some((c) => c.id === C1.id || c.id === C2.id), 'ended campaigns leave the public list');

for (const c of [A, B, G2]) c.ws.close();
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
