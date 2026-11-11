// NEAR edition, Sponsored Drops MCP server (POST /api/near/mcp): Streamable-HTTP JSON-RPC, SSE and JSON replies,
// sponsor-key auth, prompt → draft with the mock (keyword) drafter, create → list → stats → end, clamping and refusals.
// Start (mock LLM so no paid calls):
//   npx wrangler dev -c wrangler.near.toml --port 8831 --ip 127.0.0.1 --var NEAR_MIRROR_MODE:mock --var LOAD_TEST_KEY:localkey \
//     --var CAMPAIGN_ADMIN_KEY:localadmin --var LLM_MODE:mock
// Run:  node scripts/near-mcp-test.mjs [baseUrl] <campaignAdminKey>
const [BASE = 'http://127.0.0.1:8831', ADMIN = ''] = process.argv.slice(2);
if (!ADMIN) throw new Error('usage: node scripts/near-mcp-test.mjs <baseUrl> <CAMPAIGN_ADMIN_KEY>');
const URL_ = `${BASE}/api/near/mcp`;
let ok = 0, bad = 0;
const check = (c, n, extra = '') => (c ? (ok++, console.log('✔', n)) : (bad++, console.log('✘', n, extra)));
let rid = 0;

/** one JSON-RPC call; sse = ask for text/event-stream like Claude Code / the MCP SDK do */
async function rpc(method, params, { key, sse = true, notify = false } = {}) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: sse ? 'application/json, text/event-stream' : 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(notify ? {} : { id: ++rid }), method, ...(params ? { params } : {}) }),
  });
  const type = r.headers.get('content-type') ?? '';
  const text = await r.text();
  let body = null;
  if (type.includes('text/event-stream')) {
    const line = text.split('\n').find((l) => l.startsWith('data: '));
    body = line ? JSON.parse(line.slice(6)) : null;
  } else if (text) body = JSON.parse(text);
  return { status: r.status, type, text, body };
}
async function call(name, args, key) {
  const r = await rpc('tools/call', { name, arguments: args }, { key });
  const t = r.body?.result?.content?.[0]?.text;
  return { isError: !!r.body?.result?.isError, data: t ? JSON.parse(t) : null, r };
}

// --- a sponsor key (admin route)
const kr = await fetch(`${BASE}/api/near/sponsor-key`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN }, body: JSON.stringify({ sponsor: 'MCP test' }) });
const KEY = (await kr.json()).key;
check(/^qhs_/.test(KEY ?? ''), 'a sponsor key is issued');

// --- protocol
const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
check(init.status === 200 && init.type.includes('text/event-stream') && init.text.startsWith('event: message\ndata: '), 'initialize answers as SSE when the client accepts it');
check(init.body?.result?.protocolVersion === '2025-03-26' && init.body.result.serverInfo?.name === 'Quiet Hall MCP' && init.body.result.capabilities?.tools, 'initialize: protocol 2025-03-26, Quiet Hall MCP, tools capability', JSON.stringify(init.body));
const note = await rpc('notifications/initialized', undefined, { notify: true });
check(note.status === 202 && !note.text, 'notifications/initialized: 202, no body', `${note.status} ${note.text}`);
const listed = await rpc('tools/list', {}, { sse: false });
const tools = listed.body?.result?.tools ?? [];
check(listed.type.includes('application/json'), 'a JSON-only client gets application/json');
const names = ['list_zones', 'draft_campaign_from_prompt', 'create_campaign', 'list_campaigns', 'get_campaign_stats', 'end_campaign'];
check(names.every((n) => tools.some((t) => t.name === n && t.description && t.inputSchema?.type === 'object')), 'tools/list (no key) lists the 6 tools with schemas', JSON.stringify(tools.map((t) => t.name)));
check((await rpc('nope/nothing', {})).body?.error?.code === -32601, 'an unknown method is -32601');
check((await rpc('ping', {})).body?.result !== undefined, 'ping answers');
const getR = await fetch(URL_);
check(getR.status === 405, 'GET is 405 (stateless, no SSE stream)');
const parse = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
check((await parse.json()).error?.code === -32700, 'bad JSON is a parse error');
const huge = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', pad: 'x'.repeat(40_000) }) });
check(huge.status === 413, 'a body over 32 KB is refused', String(huge.status));

// --- auth
const nokey = await call('list_zones', {});
check(nokey.isError && /x-api-key/.test(nokey.data?.error), 'tools/call without a key is an error result', JSON.stringify(nokey.data));
const zones = await call('list_zones', {}, KEY);
check(zones.data?.zones?.length === 5 && zones.data.zones.some((z) => z.id === 'valley' && z.name === 'Meme Valley'), 'list_zones lists the 5 zones', JSON.stringify(zones.data).slice(0, 200));

// --- prompt → draft (mock: keyword parser)
const PROMPT = 'Drop 20 BONK memes 🐶 in Meme Valley, collect 3 for a Bonk Hunter badge, supply 500, claim at https://bonk.example.com/claim';
const dr = await call('draft_campaign_from_prompt', { prompt: PROMPT }, KEY);
const d = dr.data?.draft;
check(!dr.isError && dr.data.source === 'keywords', 'draft_campaign_from_prompt works in mock mode', JSON.stringify(dr.data));
check(d?.zone === 'valley' && d.drop.count === 20 && d.goal === 3 && d.supply === 500 && d.drop.name === 'BONK meme', 'the draft has zone, count, goal, supply and what to collect', JSON.stringify(d));
check(d?.sponsor?.name === 'BONK' && d.reward.badge === 'Bonk Hunter' && d.reward.claimUrl === 'https://bonk.example.com/claim' && d.drop.emoji === '🐶', 'sponsor, badge, claim link and emoji are found', JSON.stringify(d));
check(typeof dr.data?.preview === 'string' && dr.data.preview.includes('Meme Valley') && dr.data.preview.includes('Bonk Hunter'), 'the draft has a readable preview', dr.data?.preview);
check(!d?.id && (await call('list_campaigns', { mine: true }, KEY)).data?.list.length === 0, 'drafting writes nothing');
const dr2 = await call('draft_campaign_from_prompt', { prompt: 'Scatter 8 coffee beans ☕ around the courtyard. Find 2 to earn the "Morning Brew" badge, code: BREW-42', sponsor: 'Kettle Coffee' }, KEY);
check(dr2.data?.draft?.zone === 'court' && dr2.data.draft.sponsor.name === 'Kettle Coffee' && dr2.data.draft.reward.code === 'BREW-42' && dr2.data.draft.reward.badge === 'Morning Brew' && dr2.data.draft.goal === 2, 'a second prompt: courtyard, given sponsor, quoted badge, code', JSON.stringify(dr2.data?.draft));
check((await call('draft_campaign_from_prompt', { prompt: '' }, KEY)).isError, 'an empty prompt is refused');

// --- create → list → stats
const cr = await call('create_campaign', { campaign: d }, KEY);
const id = cr.data?.id;
check(!cr.isError && /^cmp-/.test(id) && /^[0-9a-f]{64}$/.test(cr.data.configHash) && cr.data.link.endsWith('/?at=valley'), 'create_campaign returns id, configHash and a world link', JSON.stringify(cr.data).slice(0, 300));
check(cr.data?.chain?.job === `camp-${id}`, 'the NEAR commit job is named in the result');
const lc = await call('list_campaigns', {}, KEY);
check(lc.data?.list.some((c) => c.id === id && c.reward.hasClaim && !c.reward.claimUrl), 'list_campaigns has it, without the claim link', JSON.stringify(lc.data).slice(0, 200));
const stt = await call('get_campaign_stats', { id }, KEY);
check(stt.data?.picks === 0 && stt.data.players === 0 && stt.data.completions === 0 && stt.data.supplyLeft === 500 && stt.data.live === true, 'get_campaign_stats of a fresh campaign', JSON.stringify(stt.data));
check((await call('get_campaign_stats', { id: 'cmp-nothere' }, KEY)).isError, 'stats of an unknown id is an error');

// --- invalid input: clamped or refused
const big = await call('create_campaign', { campaign: { ...d, drop: { ...d.drop, count: 999 }, goal: 50, supply: 1e9, days: 400, reward: { badge: 'X'.repeat(200), claimUrl: 'http://not-https.example.com' } } }, KEY);
const bc = big.data?.campaign;
check(!big.isError && bc.drop.count === 40 && bc.goal === 10 && bc.supply === 10000 && bc.reward.badge.length === 40 && !bc.reward.claimUrl, 'oversized numbers and text are clamped, an http link is dropped', JSON.stringify(bc));
check(big.data?.notes?.some((n) => /claimUrl/.test(n)) && big.data.notes.some((n) => /drop.count/.test(n)), 'the clamps are explained in notes', JSON.stringify(big.data?.notes));
check(bc && bc.ends - bc.starts <= 30 * 86400000, 'a campaign runs at most 30 days');
check((await call('create_campaign', { campaign: { ...d, zone: 'moon' } }, KEY)).isError, 'an unknown zone is refused');
check((await call('create_campaign', { campaign: { ...d, sponsor: {} } }, KEY)).isError, 'a missing sponsor name is refused');
check((await call('create_campaign', {}, KEY)).isError, 'create without a campaign is refused');
const forged = await call('create_campaign', { campaign: { ...d, id, status: 'ended' } }, KEY);
check(!forged.isError && forged.data.id !== id && forged.data.campaign.status === 'live', 'a caller cannot pick the id (no overwrite) or the status');

// --- end
check((await call('end_campaign', { id: 'cmp-nothere' }, KEY)).isError, 'ending an unknown campaign is an error');
for (const x of [id, big.data?.id, forged.data?.id]) await call('end_campaign', { id: x }, KEY);
const after = await call('list_campaigns', { mine: true }, KEY);
check(after.data?.list.length === 0, 'after end_campaign none of this key is live');
const withEnded = await call('list_campaigns', { mine: true, include_ended: true }, KEY);
check(withEnded.data?.list.length === 3 && withEnded.data.list.every((c) => c.status === 'ended'), 'include_ended lists them as ended');

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
