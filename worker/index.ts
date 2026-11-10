import { DurableObject } from 'cloudflare:workers';
import { b64, decodeText, parseSiws, readSession, signSession, verifySignature } from './auth';
import { Ledger, priceTable, type SpotOwner } from './ledger';
import { Pump } from './pump';
import { Economy, minuteMs } from './economy';
import { Mirror, ownerId } from './mirror';
import { LOGIN_MESSAGE, LOGIN_RECIPIENT, loginNonce, verifyLogin } from './nearlogin';
import { edition, ECONOMY } from '../src/economy';
import { FRENS, GATHER, WORKBENCH, dist, frenById, nodeById } from '../src/valley';
import { CUP, TRADE_ZONE } from '../src/market';
import { serverRpc } from './solana';
import { DUEL, DUEL_MAX_D, PUMP_MARKETS_BY_EDITION, cleanChat, cleanPlayerName, defaultName, inDuelZone, type PumpMarket } from '../src/layout';
import { SPOTS, BLESS, BLESS_FREE_MS, BLESS_PAID_MS, BOUNDS, FREE_SEEKER_MS, LAKE, LANTERN_FREE_MS, LIGHT_COUNT, PETS, SPECIES, WISHES, cleanName } from '../src/layout';

export { Ledger, Pump, Economy, Mirror };

export interface Env {
  HALL: DurableObjectNamespace<Hall>;
  LEDGER: DurableObjectNamespace<Ledger>;
  PUMP: DurableObjectNamespace<Pump>;
  ASSETS?: Fetcher;
  /** Secret for session tokens (.dev.vars locally, `wrangler secret put` in production). */
  SESSION_SECRET?: string;
  SOLANA_CLUSTER: string; // "devnet" for now
  SOLANA_RPC: string; // cluster RPC used to verify tips
  MAINNET_RPC: string; // read-only, for the Seeker Genesis Token check
  /** Helius key (secret). When set, the Worker uses Helius instead of SOLANA_RPC / MAINNET_RPC (public RPC blocks Workers). Never sent to clients. */
  HELIUS_API_KEY?: string;
  TIP_RECIPIENT: string;
  USDC_MINT: string;
  /** SKR (Seeker token) mint; unset = SKR payments off (devnet has no SKR). Mainnet: SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3 */
  SKR_MINT?: string;
  /** devnet only: comma-separated wallets treated as Seeker owners for testing on a normal phone */
  SEEKER_TEST_WALLETS?: string;
  /** how many SKR one USDC of price costs (default 50) */
  SKR_PER_USDC?: string;
  /** Lets scripts/online-test.mjs open many sockets from one machine (?k=...). Secret; unset = off. */
  LOAD_TEST_KEY?: string;
  /** Devnet treasury secret key (base58) that pays for and signs NFT mints. Secret. */
  DEV_NET_SOL?: string;
  /** Mainnet: treasury secret key (base58) for minting; preferred over DEV_NET_SOL. Secret. */
  TREASURY_KEY?: string;
  STONE_COLLECTION?: string;
  /** Founder Cushions (24, Main Hall) NFT collection; unset = cushions not on sale */
  CUSHION_COLLECTION?: string;
  /** prices × this (devnet: 0.01 so tests cost pennies of test SOL); mainnet: unset = 1 */
  PRICE_SCALE?: string;
  TREE_COLLECTION?: string;
  /** Base URL used in NFT metadata links. */
  PUBLIC_URL: string;
  /** Daily World Sit start, UTC "HH:MM" (default 20:00). Set in .dev.vars to test. */
  WORLD_SIT?: string;
  /** 'seeker' (default), 'near' or 'web3'. design/gdd/edition-*.md */
  EDITION?: string;
  /** NEAR edition: Leaves + bag (worker/economy.ts) and the only chain writer (worker/mirror.ts) */
  ECONOMY?: DurableObjectNamespace<Economy>;
  MIRROR?: DurableObjectNamespace<Mirror>;
  /** test hook: one "game minute" in ms (default 60000) */
  MINUTE_MS?: string;
  /** secret used to derive each visitor's NEAR owner id (never sent to clients) */
  OWNER_SECRET?: string;
  NEAR_ACCOUNT?: string;
  NEAR_RPC?: string;
  NEAR_RPC_FALLBACKS?: string;
  NEAR_PRIVATE_KEY?: string;
  NEAR_MIRROR_MODE?: string;
  /** mainnet RPCs for checking NEAR logins (comma-separated; default FastNEAR + near.org) */
  NEAR_MAINNET_RPCS?: string;
}

type SitState = 'idle' | 'sit';

/** Per-connection state, stored on the socket so it survives DO hibernation. */
interface Att {
  id: string;
  ip: string;
  pid: string; // persistent visitor id: private (it unlocks your free items / pets), never shared
  inv: string; // public invite id = hash of pid, used in "sit with me" links
  c: number; // light colour index
  sd: number; // degen character seed (traits are derived from it on every client)
  pt: number; // pet (index into PETS, 0 = none)
  po: number[]; // pets this visitor owns
  bl: number; // blessing from fren (index into BLESS, -1 = none)
  bu: number; // blessing ends (ms)
  x: number;
  z: number;
  ry: number;
  s: SitState;
  since: number; // when the current sit started (ms)
  hello: boolean;
  win: number; // rate-limit window start
  n: number; // messages in window
  ring: number; // last bell/bowl ring (ms)
  addr: string; // signed-in wallet ('' = anonymous)
  g: boolean; // verified Seeker owner -> gold light
  sp: boolean; // supporter (tipped)
  nm: string; // display name (chat, PumpHall board)
  ct: number; // last chat line (ms)
  cw: number; // chat window start (ms)
  cc: number; // chat lines in the window
  lx: string; // last chat line (no copy-paste spam)
  dq: boolean; // open to duels
  dk: string; // current duel id ('' = none)
  dl: number; // its lock time (ms)
  de: number; // its end time (ms)
  dw: number; // duel invite window start (ms)
  dn: number; // invites sent in the window
  hid: number; // hidden ms during the current sit (app in background)
  hs: number; // hidden since (ms, 0 = visible)
  wf: string; // NEAR: fren whose wish this player granted and is now sitting out ('' = none)
  wt: number; // when that wish sit started (ms)
}

const MAX_ROOM = 400; // sockets per hall
const MAX_PER_IP = 8; // stops one machine faking a crowd
const MAX_BYTES = 400;
const MAX_PER_SEC = 30;
const COLORS = LIGHT_COUNT * SPECIES.length; // light colour + character
const BOUND = BOUNDS + 2;
const MAX_SIT_MIN = 180;
const WORLD_WINDOW_MIN = 20; // sits that start within 20 min of World Sit count toward it
const PID_RE = /^[a-z0-9]{8,16}$/;

const petIdx = (v: unknown) => {
  const k = Math.floor(typeof v === 'number' ? v : 0);
  return k >= 0 && k < PETS.length ? k : 0;
};
/** any finite angle → (-π, π] (huge values would overflow to Infinity → null in JSON) */
const angle = (v: number) => (Number.isFinite(v) && Math.abs(v) < 1e6 ? Math.atan2(Math.sin(v), Math.cos(v)) : 0);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const utcDay = () => new Date().toISOString().slice(0, 10);

function clampPos(x: number, z: number): [number, number] {
  const d = Math.hypot(x, z);
  if (d <= BOUND) return [x, z];
  return [(x / d) * BOUND, (z / d) * BOUND];
}

function att(ws: WebSocket): Att | null {
  try {
    return (ws.deserializeAttachment() as Att) ?? null;
  } catch {
    return null;
  }
}

/** Public invite id: first 12 hex chars of SHA-256(pid). Reveals nothing usable about the pid. */
async function inviteId(pid: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('qh-invite:' + pid)));
  return [...h.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const pub = (a: Att) => ({ id: a.id, color: a.c, sd: a.sd, pt: a.pt, ...(a.bu > Date.now() ? { bl: a.bl, bu: a.bu } : {}), x: r2(a.x), z: r2(a.z), ry: r2(a.ry), s: a.s, g: a.g, sp: a.sp, nm: a.nm, dq: a.dq });
const ledger = (env: Env) => env.LEDGER.get(env.LEDGER.idFromName('main'));
const isNear = (env: Env) => edition(env.EDITION) === 'near';
const economy = (env: Env) => env.ECONOMY!.get(env.ECONOMY!.idFromName('main'));
const mirror = (env: Env) => env.MIRROR!.get(env.MIRROR!.idFromName('main'));
/**
 * visitor id → NEAR owner id for receipts: the NEAR account they logged in with, or else an implicit id derived
 * from a server secret (fixed dev secret only when none is configured: mock / local).
 */
const ownerOf = async (env: Env, pid: string) =>
  (env.ECONOMY ? await economy(env).linkedAccount(pid) : null) ?? (await ownerId(env.OWNER_SECRET || 'dev-only-owner-secret', pid));
/** how a NEAR account shows as a player name (implicit 64-hex ids are shortened) */
const nearName = (account: string) => (/^[0-9a-f]{64}$/.test(account) ? `${account.slice(0, 6)}…${account.slice(-4)}` : account.slice(0, 32));
/** NEAR edition: only these API paths exist (edition-near.md: EDITION removes UI *and* routes) */
const NEAR_API = /^\/api\/(health|config|near\/[a-z-]+|pump\/[a-z-]+)$/;
/** NEAR edition: socket messages that belong to Solana / money / prediction features */
const NEAR_BLOCKED_WS = new Set(['spots', 'profile', 'lantern']);
/** socket messages that exist only in the NEAR edition */
const NEAR_ONLY_WS = new Set(['pick', 'grant', 'wishDone', 'craft', 'book', 'trade', 'cupJoin']);
const REACH = GATHER.reach + GATHER.tolerance;
const CO_REACH = GATHER.coRescueRadius + GATHER.tolerance;
/** PumpHall: one board for everyone; "t<id>" rooms are isolated boards for automated tests */
const pumpRoom = (v: unknown) => (typeof v === 'string' && /^t[a-z0-9]{4,16}$/.test(v) ? v : 'main');
const pump = (env: Env, room = 'main') => env.PUMP.get(env.PUMP.idFromName(room));

function cors(req: Request, res: Response) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', req.headers.get('Origin') ?? '*');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'content-type');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (data: unknown, status = 200) => Response.json(data, { status });

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    if (Number(req.headers.get('content-length') ?? 0) > 8000) return {};
    const t = await req.text();
    if (t.length > 8000) return {};
    const j = JSON.parse(t);
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
  const L = ledger(env);
  if (isNear(env) && !NEAR_API.test(path)) return json({ error: 'Not found' }, 404);
  if (path === '/api/health') return json({ ok: true, now: Date.now() });
  if (path === '/api/config') {
    if (isNear(env)) return json({ edition: 'near', nearAccount: env.NEAR_ACCOUNT ?? null, economy: ECONOMY.near });
    return json({ edition: edition(env.EDITION), cluster: env.SOLANA_CLUSTER, rpc: env.SOLANA_RPC, recipient: env.TIP_RECIPIENT, usdcMint: env.USDC_MINT, skrMint: env.SKR_MINT || null });
  }
  if (path.startsWith('/api/near/')) return nearApi(req, env, path);
  if (path === '/api/spots') {
    // owners follow the chain (marketplace sales / transfers); cheap, throttled inside
    await L.syncOwners(new URL(req.url).searchParams.get('refresh') === '1');
    const treasury = !!(env.TREASURY_KEY || env.DEV_NET_SOL);
    const strip = (o: Record<number, SpotOwner>) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { owner: v.owner, name: v.name, line: v.line, asset: v.asset ?? null, until: v.until ?? null }]));
    const solUsd = await L.solUsd();
    return json({
      stone: strip(await L.spots('stone')),
      tree: strip(await L.spots('tree')),
      cushion: strip(await L.spots('cushion')),
      banner: strip(await L.spots('banner')),
      legends: await L.legends(),
      prices: priceTable(env, solUsd),
      solUsd,
      priceScale: Number(env.PRICE_SCALE) > 0 ? Number(env.PRICE_SCALE) : 1,
      // lanterns / blessings / pets / banners need no NFT collection; stones, trees, cushions do
      onSale: treasury && !!env.STONE_COLLECTION && !!env.TREE_COLLECTION,
      sale: { stone: treasury && !!env.STONE_COLLECTION, tree: treasury && !!env.TREE_COLLECTION, cushion: treasury && !!env.CUSHION_COLLECTION, banner: true },
      cluster: env.SOLANA_CLUSTER,
    });
  }
  const meta = /^\/api\/meta\/(stone|tree|cushion)\/(collection|\d+)\.json$/.exec(path);
  if (meta) {
    const kind = meta[1] as 'stone' | 'tree' | 'cushion';
    const info = SPOTS[kind];
    const image = `${env.PUBLIC_URL}/items/${kind}.svg`;
    if (meta[2] === 'collection')
      return json({ name: `Quiet Hall ${info.label}s`, description: `${info.count} ${info.label.toLowerCase()}s in the Quiet Hall (${info.place}), each in a fixed spot.`, image, external_url: 'https://quiet-hall.vercel.app' });
    const n = Number(meta[2]);
    if (!(n < info.count)) return json({ error: 'Not found' }, 404);
    const rec = await L.spot(kind, n);
    return json({
      name: `Quiet Hall ${info.label} #${n + 1}`,
      description: rec ? `${rec.name}: ${rec.line}` : `An unclaimed ${info.label.toLowerCase()} in the Quiet Hall.`,
      image,
      external_url: 'https://quiet-hall.vercel.app',
      attributes: [
        { trait_type: 'Place', value: info.place },
        { trait_type: 'Spot', value: n + 1 },
        ...(rec ? [{ trait_type: 'Name', value: rec.name }, { trait_type: 'Line', value: rec.line }] : []),
      ],
    });
  }
  if (path === '/api/nonce') {
    const nonce = await L.newNonce(ip);
    return nonce ? json({ nonce }) : json({ error: 'Too many requests' }, 429);
  }
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  const body = await readJson(req);

  if (path === '/api/pump/state') {
    // POST so the private visitor id never sits in a URL / log
    return json(await pump(env, pumpRoom(body.room)).state(typeof body.pid === 'string' ? body.pid : ''));
  }
  if (path === '/api/pump/pick') {
    const m = String(body.m ?? '') as PumpMarket;
    if (!PUMP_MARKETS_BY_EDITION[edition(env.EDITION)].includes(m)) return json({ error: 'Unknown market' }, 400);
    const r = await pump(env, pumpRoom(body.room)).pick(String(body.pid ?? ''), ip, body.name, Math.floor(num(body.seed)) >>> 0, m, Math.floor(num(body.k)), body.dir === 'down' ? 'down' : body.dir === 'up' ? 'up' : ('' as never));
    return 'error' in r ? json(r, 400) : json(r);
  }
  if (path === '/api/pump/test-settle') {
    // automated tests only: isolated test boards + the load-test key
    const room = pumpRoom(body.room);
    if (room === 'main' || !env.LOAD_TEST_KEY || body.key !== env.LOAD_TEST_KEY) return json({ error: 'Not found' }, 404);
    return json(await pump(env, room).testSettle(String(body.m) as PumpMarket, Math.floor(num(body.k)), num(body.lock), num(body.close)));
  }
  if (path === '/api/pump/test-duel') {
    // automated tests only (test rooms + the load-test key): settle a duel now, or age players past the new-player window
    const room = pumpRoom(body.room);
    if (room === 'main' || !env.LOAD_TEST_KEY || body.key !== env.LOAD_TEST_KEY) return json({ error: 'Not found' }, 404);
    if (body.age) return json(await pump(env, room).testAgePlayers());
    return json(await pump(env, room).testSettleDuel(String(body.id), num(body.lock), num(body.close), body.rated === true));
  }
  if (path === '/api/verify') {
    // Sign-In-With-Solana: the wallet signed a message containing our one-time nonce and this site's domain.
    if (!env.SESSION_SECRET) return json({ error: 'Server missing SESSION_SECRET' }, 500);
    const addr = String(body.address ?? '');
    let msg: Uint8Array;
    let sig: Uint8Array;
    try {
      msg = b64.dec(String(body.message ?? ''));
      sig = b64.dec(String(body.signature ?? ''));
    } catch {
      return json({ error: 'Bad encoding' }, 400);
    }
    const f = parseSiws(decodeText(msg));
    const origin = req.headers.get('Origin');
    let host = '';
    try {
      host = origin ? new URL(origin).host : '';
    } catch {
      return json({ error: 'Bad origin' }, 400);
    }
    if (!f || f.address !== addr) return json({ error: 'Bad sign-in message' }, 400);
    if (!host || f.domain !== host) return json({ error: 'Sign-in message is for another site' }, 400);
    if (Math.abs(Date.now() - f.issuedAt) > 10 * 60000) return json({ error: 'Sign-in expired, try again' }, 400);
    if (!(await verifySignature(addr, msg, sig))) return json({ error: 'Signature check failed' }, 401);
    if (!(await L.useNonce(f.nonce))) return json({ error: 'Sign-in expired, try again' }, 400);
    const p = await L.profile(addr, true);
    return json({ token: await signSession(env.SESSION_SECRET, addr), address: addr, seeker: p.seeker, testSeeker: !!p.testSeeker, supporter: p.supporter });
  }
  if (path === '/api/me') {
    const addr = await readSession(env.SESSION_SECRET, body.token);
    if (!addr) return json({ error: 'Signed out' }, 401);
    const p = await L.profile(addr, body.recheck === true);
    return json({ address: addr, seeker: p.seeker, testSeeker: !!p.testSeeker, supporter: p.supporter });
  }
  if (path === '/api/tip/order') {
    const payer = await readSession(env.SESSION_SECRET, body.token);
    if ((body.kind === 'stone' || body.kind === 'tree' || body.kind === 'cushion' || body.kind === 'banner') && !payer) return json({ error: 'Sign in first so your name goes on it.' }, 400);
    const o = await L.createOrder(ip, String(body.currency ?? 'SOL'), Number(body.amount), payer, {
      kind: typeof body.kind === 'string' ? body.kind : 'tip',
      spot: Number(body.spot),
      name: typeof body.name === 'string' ? body.name : '',
      line: typeof body.line === 'string' ? body.line : '',
      pet: Number(body.pet),
      pid: typeof body.pid === 'string' ? body.pid : undefined,
    });
    return 'error' in o ? json(o, 400) : json(o);
  }
  if (path === '/api/rpc') {
    // tiny RPC relay for the app (blockhash + send) through the server's RPC key; public mainnet RPC throttles browsers
    const method = body.method;
    if (method !== 'getLatestBlockhash' && method !== 'sendTransaction') return json({ error: 'method not allowed' }, 400);
    if (await L.limitedIp(ip)) return json({ error: 'Too many requests' }, 429);
    const params = Array.isArray(body.params) ? body.params.slice(0, 2) : [];
    if (method === 'sendTransaction' && !(typeof params[0] === 'string' && params[0].length < 2000)) return json({ error: 'bad tx' }, 400);
    const r = await fetch(serverRpc(env, 'cluster'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: typeof body.id === 'number' || (typeof body.id === 'string' && body.id.length < 24) ? body.id : 1, method, params }),
    });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/api/tip/confirm') {
    const r = await L.confirmOrder(String(body.id ?? ''), typeof body.signature === 'string' ? body.signature : undefined);
    return json(r);
  }
  return json({ error: 'Not found' }, 404);
}

/** NEAR edition API. The visitor id (pid) is the caller's own private id, so reading your own state with it is fine. */
async function nearApi(req: Request, env: Env, path: string): Promise<Response> {
  if (!isNear(env) || !env.ECONOMY || !env.MIRROR) return json({ error: 'Not found' }, 404);
  const q = new URL(req.url).searchParams;
  const pid = q.get('pid') ?? '';
  if (path === '/api/near/health') return json({ ok: true, mirror: await mirror(env).status() });
  if (path === '/api/near/me') {
    if (!PID_RE.test(pid)) return json({ error: 'Bad pid' }, 400);
    const owner = await ownerOf(env, pid);
    return json({ owner, nearAccount: env.NEAR_ACCOUNT ?? null, ...(await economy(env).state(pid)), receipts: await mirror(env).receipts(owner) });
  }
  if (path === '/api/near/whoami') {
    // the welcome card asks this before the player enters: is this visitor logged in with NEAR?
    if (!PID_RE.test(pid)) return json({ error: 'Bad pid' }, 400);
    const account = await economy(env).linkedAccount(pid);
    return json({ account, name: account ? nearName(account) : null });
  }
  if (path === '/api/near/audit') return json(await economy(env).audit());
  if (path === '/api/near/login-nonce') {
    if (!PID_RE.test(pid)) return json({ error: 'Bad pid' }, 400);
    return json({ nonce: await loginNonce(env.SESSION_SECRET || 'dev-only-session-secret', pid), message: LOGIN_MESSAGE, recipient: LOGIN_RECIPIENT });
  }
  if (path === '/api/near/login' && req.method === 'POST') {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const p = String(b.pid ?? '');
    if (!PID_RE.test(p)) return json({ error: 'Bad pid' }, 400);
    const list = (v: string | undefined) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);
    const rpcsFor = {
      testnet: [env.NEAR_RPC || 'https://test.rpc.fastnear.com', ...list(env.NEAR_RPC_FALLBACKS)],
      mainnet: list(env.NEAR_MAINNET_RPCS).length ? list(env.NEAR_MAINNET_RPCS) : ['https://rpc.mainnet.fastnear.com', 'https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org'],
    };
    const v = await verifyLogin(env.SESSION_SECRET || 'dev-only-session-secret', rpcsFor, {
      pid: p,
      network: b.network === 'testnet' ? 'testnet' : 'mainnet',
      nonce: String(b.nonce ?? ''),
      accountId: String(b.accountId ?? ''),
      publicKey: String(b.publicKey ?? ''),
      signature: String(b.signature ?? ''),
      callbackUrl: typeof b.callbackUrl === 'string' ? b.callbackUrl : undefined,
    });
    if (!v.ok) {
      // which wallet failed and how (no keys, no signatures): helps when one wallet's login breaks
      console.log('near login refused', JSON.stringify({ why: v.why, wallet: String(b.wallet ?? '').slice(0, 40), network: b.network, sigLen: String(b.signature ?? '').length, pk: String(b.publicKey ?? '').slice(0, 8) }));
      return json({ ok: false, why: v.why }, 401);
    }
    const r = await economy(env).link(p, v.accountId);
    // switched: this NEAR account already belongs to another visitor id (another device) → the client adopts it
    return json({ ok: true, account: r.account, name: nearName(r.account), pid: r.acct, switched: r.switched, bonus: r.bonus });
  }
  if (path === '/api/near/market') {
    const E = economy(env);
    return json({ quotes: await E.quotes(), history: await E.history(), cup: await E.cupBoard(PID_RE.test(pid) ? pid : undefined) });
  }
  if (path === '/api/near/round') {
    // a round page: anyone can recompute sha256(setup) and sha256(results) and compare with the chain
    const id = q.get('id') ?? '';
    const r = /^[0-9]{8}-[0-9]{6}$/.test(id) ? await economy(env).round(id) : null;
    if (!r) return json({ error: 'No such round' }, 404);
    const jobs = await mirror(env).jobs([`commit-${id}`, `settle-${id}`, `trophy-${id}-1`, `trophy-${id}-2`, `trophy-${id}-3`]);
    // resultsText is the exact text that was hashed; results is the same, parsed
    return json({ ...r, resultsText: r.results, results: r.results ? JSON.parse(r.results) : null, chain: { contract: env.NEAR_ACCOUNT ?? null, jobs } });
  }
  // test hooks: only with the load-test key (unset in production = off)
  const key = q.get('k') ?? '';
  if (!env.LOAD_TEST_KEY || key !== env.LOAD_TEST_KEY) return json({ error: 'Not found' }, 404);
  if (path === '/api/near/test-tick') return json(await economy(env).tick());
  if (path === '/api/near/test-link') {
    // links a made-up account to a visitor, as a verified login would (tests of logged-in play, no wallet)
    if (!PID_RE.test(pid)) return json({ error: 'Bad pid' }, 400);
    return json(await economy(env).link(pid, (q.get('account') ?? `${pid}.testnet`).slice(0, 64)));
  }
  if (path === '/api/near/test-mint') {
    if (!PID_RE.test(pid)) return json({ error: 'Bad pid' }, 400);
    const owner = await ownerOf(env, pid);
    const n = Math.floor(Math.random() * 1e6);
    const job = `test-${pid}-${q.get('job') ?? n}`.slice(0, 64);
    const added = await mirror(env).enqueue([{ job, method: 'mint_fren', args: { owner, species: 'shibby', serial: n } }]);
    return json({ job, owner, added });
  }
  return json({ error: 'Not found' }, 404);
}

function send(ws: WebSocket, msg: unknown) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* socket closing */
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      // "main" and "seeker" are the real halls; "t<id>" rooms are isolated rooms for automated tests.
      const want = url.searchParams.get('room') ?? 'main';
      const room = want === 'seeker' ? 'seeker' : /^t[a-z0-9]{4,16}$/.test(want) ? want : 'main';
      const fwd = new Request(req);
      fwd.headers.set('X-Room', room);
      return env.HALL.get(env.HALL.idFromName(room)).fetch(fwd);
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
      try {
        return cors(req, await api(req, env, url.pathname));
      } catch (e) {
        return cors(req, json({ error: 'Server error', detail: String(e).slice(0, 200) }, 500));
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

interface Lantern {
  id: string;
  wish: number;
  name: string;
  c: number;
  x: number;
  z: number;
  at: number;
  until: number;
  tier: 'free' | 'lantern24' | 'lantern7d';
}
const LANTERN_MS = { free: LANTERN_FREE_MS, lantern24: 86400000, lantern7d: 7 * 86400000 };
const MAX_LANTERNS = 80;

export class Hall extends DurableObject<Env> {
  /** recent public chat (memory only; sent to newcomers so the box is not empty) */
  private chatLog: { t: 'c'; id: string; n: string; x: string; at: number }[] = [];
  private today = utcDay();
  private minutes = 0;
  private sits = 0;
  private world = 0; // people who joined today's World Sit

  /** Today's World Sit start (ms, UTC). */
  private worldAt(now = Date.now()) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(this.env.WORLD_SIT ?? '20:00');
    const h = m ? Math.min(23, Number(m[1])) : 20;
    const mi = m ? Math.min(59, Number(m[2])) : 0;
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, mi);
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(() => this.loadDay());
  }

  private async loadDay() {
    const d = await this.ctx.storage.get<{ m: number; s: number }>(`day:${this.today}`);
    this.minutes = d?.m ?? 0;
    this.sits = d?.s ?? 0;
    this.world = (await this.ctx.storage.get<number>(`world:${this.today}`)) ?? 0;
  }

  private async rollDay() {
    const d = utcDay();
    if (d !== this.today) {
      this.today = d;
      await this.loadDay();
    }
  }

  /** NEAR edition: Meme Valley actions. Positions and timing are checked here, items and Leaves in the Economy store. */
  private async valley(ws: WebSocket, a: Att, m: Record<string, unknown>, now: number) {
    const E = economy(this.env);
    const minute = minuteMs(this.env.MINUTE_MS);
    switch (m.t) {
      case 'pick': {
        const node = nodeById(m.node);
        if (!node) return;
        if (dist(a, node) > REACH) return send(ws, { t: 'picked', node: node.id, ok: false, why: 'too far' });
        return send(ws, { t: 'picked', node: node.id, ...(await E.pick(a.pid, node.id)) });
      }
      case 'grant': {
        const f = frenById(m.fren);
        if (!f) return;
        if (dist(a, f) > REACH) return send(ws, { t: 'wish', fren: f.id, ok: false, why: 'too far' });
        if (a.wf) return send(ws, { t: 'wish', fren: f.id, ok: false, why: 'You are already sitting with a fren.' });
        const r = await E.startWish(a.pid, f.id);
        if (!r.ok) return send(ws, { t: 'wish', fren: f.id, ...r });
        a.wf = f.id;
        a.wt = now;
        if (a.s !== 'sit') {
          a.s = 'sit';
          a.since = now;
          a.hid = 0;
          a.hs = 0;
          this.broadcast({ t: 's', id: a.id, s: 'sit' }, ws);
        }
        ws.serializeAttachment(a);
        return send(ws, { t: 'wish', fren: f.id, ok: true, until: now + f.sitMin * minute });
      }
      case 'wishDone': {
        const f = frenById(a.wf);
        if (!f) return;
        if (a.s !== 'sit' || now - a.wt < f.sitMin * minute * 0.98 || dist(a, f) > CO_REACH) {
          return send(ws, { t: 'wishWait', fren: f.id, left: Math.max(0, a.wt + f.sitMin * minute - now) });
        }
        // everyone else sitting beside the fren right now is rescued too (co-rescue)
        const co: { pid: string; ws: WebSocket }[] = [];
        for (const w of this.ctx.getWebSockets()) {
          const b = att(w);
          if (w !== ws && b?.hello && b.pid && b.pid !== a.pid && b.s === 'sit' && dist(b, f) <= CO_REACH) co.push({ pid: b.pid, ws: w });
        }
        const results = await E.rescue(a.pid, f.id, co.map((c) => c.pid));
        a.wf = '';
        a.wt = 0;
        ws.serializeAttachment(a);
        const helped = results.filter((r) => r.co).length;
        const jobs = [];
        for (const r of results) {
          const sockets = r.acct === a.pid ? [ws] : co.filter((c) => c.pid === r.acct).map((c) => c.ws);
          for (const w of sockets) {
            send(w, { t: 'rescued', fren: f.id, first: r.first, serial: r.serial, paid: r.paid, co: r.co, helped: r.co ? undefined : helped, pet: f.pet });
            const b = att(w);
            if (b && r.first && !b.po.includes(f.pet)) {
              b.po = [...b.po, f.pet];
              w.serializeAttachment(b);
              send(w, { t: 'pets', pets: b.po, pt: b.pt });
            }
          }
          if (r.first && this.env.MIRROR) {
            jobs.push({ job: `fren-${f.id}-${r.serial}`, method: 'mint_fren' as const, args: { owner: await ownerOf(this.env, r.acct), species: f.id, serial: r.serial } });
          }
        }
        if (jobs.length) await mirror(this.env).enqueue(jobs);
        this.broadcast({ t: 'rescue', fren: f.id, by: a.id, n: results.length });
        return;
      }
      case 'craft': {
        if (dist(a, WORKBENCH) > REACH + 1.5) return send(ws, { t: 'crafted', ok: false, why: 'too far' });
        const r = await E.craft(a.pid, String(m.r ?? ''));
        if (r.ok && r.kind && r.serial && this.env.MIRROR) {
          await mirror(this.env).enqueue([
            { job: `drip-${r.kind}-${r.serial}`, method: 'mint_drip', args: { owner: await ownerOf(this.env, a.pid), kind: r.kind, serial: r.serial } },
          ]);
        }
        return send(ws, { t: 'crafted', ...r });
      }
      case 'trade': {
        if (!(await this.nearLoggedIn(a))) return send(ws, { t: 'traded', ok: false, why: 'Log in with NEAR to buy and sell.', login: true });
        if (dist(a, TRADE_ZONE) > TRADE_ZONE.r) return send(ws, { t: 'traded', ok: false, why: 'Trade at the Market stall in PumpHall.' });
        const side = m.side === 'buy' ? 'buy' : m.side === 'sell' ? 'sell' : null;
        if (!side) return;
        const r = await E.trade(a.pid, String(m.item ?? ''), side, Math.floor(num(m.n, 1)), m.cup === true);
        send(ws, { t: 'traded', item: m.item, side, n: m.n, cup: m.cup === true, ...r });
        // everyone in the room sees the price move at once
        if (r.ok && r.quotes) this.broadcast({ t: 'quotes', q: r.quotes }, ws);
        return;
      }
      case 'cupJoin': {
        if (!(await this.nearLoggedIn(a))) return send(ws, { t: 'cupJoined', ok: false, why: 'Log in with NEAR to join the Market Cup.', login: true });
        if (dist(a, TRADE_ZONE) > TRADE_ZONE.r) return send(ws, { t: 'cupJoined', ok: false, why: 'Join the Cup at the Market stall in PumpHall.' });
        return send(ws, { t: 'cupJoined', ...(await E.cupJoin(a.pid, a.ip)), chips: CUP.chips });
      }
      case 'book': {
        const owner = await ownerOf(this.env, a.pid);
        return send(ws, { t: 'book', owner, ...(await E.book(a.pid)), receipts: this.env.MIRROR ? await mirror(this.env).receipts(owner) : [] });
      }
    }
  }

  /** NEAR edition: has this visitor logged in with a NEAR wallet? */
  private async nearLoggedIn(a: Att): Promise<boolean> {
    return !!(a.pid && this.env.ECONOMY && (await economy(this.env).linkedAccount(a.pid)));
  }

  /** pets this visitor owns: bought ones, plus (NEAR edition) the frens they rescued */
  private async ownedPets(a: Att): Promise<number[]> {
    const bought = await ledger(this.env).ownedPets(a.pid, a.addr);
    if (!isNear(this.env) || !this.env.ECONOMY || !a.pid) return bought;
    const rescued = (await economy(this.env).book(a.pid)).frens.map((f) => frenById(f.fren)?.pet ?? 0).filter((k) => k > 0);
    return [...new Set([...bought, ...rescued])];
  }

  /** the granter stood up, walked away or left before the wish sit finished: materials go back */
  private async cancelWish(ws: WebSocket | null, a: Att, why: string) {
    const fren = a.wf;
    a.wf = '';
    a.wt = 0;
    if (this.env.ECONOMY && a.pid && (await economy(this.env).cancelWish(a.pid, fren)) && ws) send(ws, { t: 'wishCancelled', fren, why });
  }

  /**
   * A sit ended at `end` (server clock). Updates hall stats; in the NEAR edition also pays Leaves for it.
   * The caller sets a.s afterwards. `ws` is null when the socket already closed.
   */
  private async endSit(ws: WebSocket | null, a: Att, end: number) {
    const hidden = a.hid + (a.hs ? Math.max(0, end - a.hs) : 0);
    await this.addSit(Math.max(0, end - a.since - hidden));
    if (isNear(this.env) && this.env.ECONOMY && a.pid && a.since) {
      const r = await economy(this.env).paySit(a.pid, a.since, end, hidden);
      if (ws) send(ws, { t: 'leaves', ...r });
    }
    a.s = 'idle';
    a.since = 0;
    a.hid = 0;
    a.hs = 0;
  }

  private async addSit(ms: number) {
    await this.rollDay();
    const min = Math.min(ms / 60000, MAX_SIT_MIN);
    if (!(min >= 0.25)) return; // ignore accidental taps
    this.minutes += min;
    this.sits += 1;
    await this.ctx.storage.put(`day:${this.today}`, { m: this.minutes, s: this.sits });
  }

  private async maybeWorld(now: number, who: string) {
    await this.rollDay();
    const at = this.worldAt(now);
    if (now >= at && now < at + WORLD_WINDOW_MIN * 60000) {
      const k = `worldp:${this.today}:${who}`;
      if (await this.ctx.storage.get(k)) return; // each visitor counts once per World Sit
      await this.ctx.storage.put(k, 1);
      this.world += 1;
      await this.ctx.storage.put(`world:${this.today}`, this.world);
    }
  }

  private async lanterns(): Promise<Lantern[]> {
    const all = (await this.ctx.storage.get<Lantern[]>('lanterns')) ?? [];
    const now = Date.now();
    const live = all.filter((l) => l.until > now);
    if (live.length !== all.length) await this.ctx.storage.put('lanterns', live);
    return live;
  }

  /** Light a lantern: free (1 per visitor and 3 per network per UTC day, 1 h) or from a paid order. */
  private async lightLantern(ws: WebSocket, a: Att, m: Record<string, unknown>) {
    const wish = Math.floor(num(m.wish, -1));
    if (!(wish >= 0 && wish < WISHES.length)) return;
    const name = cleanName(m.name);
    let tier: Lantern['tier'] = 'free';
    if (typeof m.order === 'string') {
      const t = await ledger(this.env).useLanternOrder(m.order);
      if (!t) return send(ws, { t: 'lanternNo', reason: 'That lantern order is not paid or was already used.' });
      tier = t;
    } else {
      // lanterns are premium only (no free tier since 2026-11-10)
      return send(ws, { t: 'lanternNo', reason: 'Lanterns are a premium item: pick 24 h or 7 days.', paid: true });
    }
    const now = Date.now();
    // float somewhere over the lake (everyone sees the same spot)
    const ang = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * 0.72;
    const l: Lantern = {
      id: crypto.randomUUID().slice(0, 8),
      wish,
      name,
      c: a.c,
      x: r2(LAKE.x + Math.cos(ang) * LAKE.rx * rr),
      z: r2(LAKE.z + Math.sin(ang) * LAKE.rz * rr),
      at: now,
      until: now + LANTERN_MS[tier],
      tier,
    };
    let list = await this.lanterns();
    list.push(l);
    if (list.length > MAX_LANTERNS) {
      // drop the free lanterns that end soonest
      const free = list.filter((x) => x.tier === 'free').sort((p, q) => p.until - q.until);
      const drop = new Set(free.slice(0, list.length - MAX_LANTERNS).map((x) => x.id));
      list = list.filter((x) => !drop.has(x.id));
    }
    await this.ctx.storage.put('lanterns', list);
    this.broadcast({ t: 'lantern', l });
  }

  /** A blessing from a fren: free (1 h, once per visitor per UTC day, 3 per network) or paid (24 h). One at a time; a new one replaces the old. */
  private async bless(ws: WebSocket, a: Att, m: Record<string, unknown>) {
    const f = Math.floor(num(m.f, -1));
    if (!(f >= 0 && f < BLESS.length)) return;
    let ms = BLESS_FREE_MS;
    if (typeof m.order === 'string') {
      if (!(await ledger(this.env).useBlessOrder(m.order))) return send(ws, { t: 'blessNo', reason: 'That blessing order is not paid or was already used.' });
      ms = BLESS_PAID_MS;
    } else {
      if (a.g) ms = FREE_SEEKER_MS; // Seeker perk: longer free taste
      if (!(await ledger(this.env).useFree('bless', a.pid || a.id, a.ip))) {
        return send(ws, { t: 'blessNo', reason: 'You got your free blessing today. Come back tomorrow, or get a 24 h one.', paid: true });
      }
    }
    const now = Date.now();
    // the newest fren's colour; a paid blessing's time is never cut short by a free one
    a.bu = Math.max(now + ms, a.bu > now ? a.bu : 0);
    a.bl = f;
    if (a.pid) await this.ctx.storage.put(`bless:${a.pid}`, { f: a.bl, u: a.bu });
    ws.serializeAttachment(a);
    this.broadcast({ t: 'bl', id: a.id, f: a.bl, u: a.bu });
  }

  // ---------- PvP duels (points only; design/gdd/pvp-prediction-duel.md) ----------
  /** pending invites (memory only: they last 15 s, so losing them on hibernation is fine) */
  private invites = new Map<string, { from: string; to: string; m: PumpMarket; dir: 'up' | 'down'; len: number; at: number }>();
  /** "not now" cooldowns: `${fromPid}>${toPid}` -> until (ms) */
  private noAgain = new Map<string, number>();

  private sockById(id: string) {
    return this.ctx.getWebSockets().find((w) => att(w)?.hello && att(w)?.id === id);
  }

  private pumpRoomName() {
    return pumpRoom(this.room);
  }

  /** why these two can't duel right now ('' = they can) */
  private duelBlock(a: Att, b: Att, now: number) {
    if (!a.pid || !b.pid) return 'Duels need a saved visitor id. Reload the page.';
    if (a.id === b.id || a.pid === b.pid) return "You can't duel yourself.";
    if (!inDuelZone(a.x, a.z) || !inDuelZone(b.x, b.z)) return 'Duels happen in PumpHall only.';
    if (a.s === 'sit' || b.s === 'sit') return 'They are sitting quietly.';
    if (!a.dq || !b.dq) return 'They are not open to duels right now.';
    if ((a.dk && now < a.de + 30000) || (b.dk && now < b.de + 30000)) return 'One of you is already in a duel.';
    if (Math.hypot(a.x - b.x, a.z - b.z) > DUEL_MAX_D) return 'Walk closer to challenge them.';
    return '';
  }

  private async duelAsk(ws: WebSocket, a: Att, m: Record<string, unknown>) {
    const now = Date.now();
    const mk = String(m.m ?? '') as PumpMarket;
    const dir = m.dir === 'up' || m.dir === 'down' ? m.dir : null;
    const len = Math.floor(num(m.len, 1));
    if (!PUMP_MARKETS_BY_EDITION[edition(this.env.EDITION)].includes(mk) || !dir || !DUEL.lens.includes(len)) return send(ws, { t: 'duel_no', why: 'Pick a market and up or down.' });
    if (now - a.dw > 60000) {
      a.dw = now;
      a.dn = 0;
    }
    if (a.dn >= DUEL.invitesPerMin) return send(ws, { t: 'duel_no', why: `Slow down: try again in ${Math.ceil((a.dw + 60000 - now) / 1000)} s.` });
    const to = this.sockById(String(m.to ?? ''));
    const b = to && att(to);
    if (!to || !b) return send(ws, { t: 'duel_no', why: 'They left.' });
    const why = this.duelBlock(a, b, now);
    if (why) return send(ws, { t: 'duel_no', why });
    // NEAR edition: both players must be logged in, so a challenge never waits on someone who cannot accept
    if (isNear(this.env) && !(await this.nearLoggedIn(b))) return send(ws, { t: 'duel_no', why: `${b.nm} has not logged in with NEAR yet, so they cannot duel.` });
    const cool = this.noAgain.get(`${a.pid}>${b.pid}`) ?? 0;
    if (now < cool) return send(ws, { t: 'duel_no', why: 'They said not now. Give them a couple of minutes.' });
    for (const [k, v] of this.invites) if (now - v.at > DUEL.inviteMs || v.from === a.id || v.to === a.id) this.invites.delete(k);
    if ([...this.invites.values()].some((v) => v.to === b.id || v.from === b.id)) return send(ws, { t: 'duel_no', why: 'They are answering another challenge.' });
    a.dn++;
    const id = crypto.randomUUID().slice(0, 8);
    this.invites.set(id, { from: a.id, to: b.id, m: mk, dir, len, at: now });
    const pv = await pump(this.env, this.pumpRoomName()).duelPreview(a.pid, b.pid, a.ip === b.ip);
    send(to, { t: 'duel_inv', id, from: a.id, n: a.nm, m: mk, dir, len, rated: pv.rated, why: pv.why, ms: DUEL.inviteMs });
    send(ws, { t: 'duel_sent', id, to: b.id, n: b.nm, rated: pv.rated, why: pv.why, ms: DUEL.inviteMs });
  }

  private async duelAns(ws: WebSocket, b: Att, m: Record<string, unknown>) {
    const now = Date.now();
    const id = String(m.id ?? '');
    const inv = this.invites.get(id);
    if (!inv || inv.to !== b.id) return send(ws, { t: 'duel_no', why: 'That challenge is gone.' });
    this.invites.delete(id);
    const from = this.sockById(inv.from);
    const a = from && att(from);
    if (!from || !a) return send(ws, { t: 'duel_no', why: 'They left.' });
    if (m.ok !== true) {
      this.noAgain.set(`${a.pid}>${b.pid}`, now + DUEL.reinviteMs);
      if (this.noAgain.size > 500) this.noAgain.clear();
      return send(from, { t: 'duel_no', id, why: `${b.nm} said not now.` });
    }
    if (now - inv.at > DUEL.inviteMs + 2000) {
      send(from, { t: 'duel_no', id, why: 'No answer.' });
      return send(ws, { t: 'duel_no', id, why: 'Too late, that challenge expired.' });
    }
    const why = this.duelBlock(a, b, now);
    if (why) {
      send(from, { t: 'duel_no', id, why });
      return send(ws, { t: 'duel_no', id, why });
    }
    const r = await pump(this.env, this.pumpRoomName()).createDuel({ a: a.pid, an: a.nm, as: a.sd, b: b.pid, bn: b.nm, bs: b.sd, adir: inv.dir, m: inv.m, lenMin: inv.len, sameIp: a.ip === b.ip });
    if ('error' in r) {
      send(from, { t: 'duel_no', id, why: r.error });
      return send(ws, { t: 'duel_no', id, why: r.error });
    }
    for (const [w, x] of [[from, a], [ws, b]] as const) {
      x.dk = r.id;
      x.dl = r.lockAt;
      x.de = r.endAt;
      w.serializeAttachment(x);
    }
    // everyone gets it: the two players run it, people nearby draw the ring between them
    this.broadcast({ t: 'duel_on', id: r.id, a: a.id, an: a.nm, b: b.id, bn: b.nm, m: inv.m, adir: inv.dir, lockAt: r.lockAt, endAt: r.endAt, rated: r.rated });
  }

  /** cancel this player's duel if it hasn't locked yet (sit, leave, ✕). After the lock it always stands. */
  private async duelDrop(a: Att, why: 'sit' | 'left' | 'cancel') {
    for (const [k, v] of this.invites) if (v.from === a.id || v.to === a.id) this.invites.delete(k);
    if (!a.dk || Date.now() >= a.dl) return;
    const id = a.dk;
    const r = await pump(this.env, this.pumpRoomName()).cancelDuel(id, a.pid);
    if (!r.ok) return;
    a.dk = '';
    for (const w of this.ctx.getWebSockets()) {
      const x = att(w);
      if (x?.dk === id) {
        x.dk = '';
        w.serializeAttachment(x);
      }
    }
    this.broadcast({ t: 'duel_off', id, why, by: a.id });
  }

  private live(except?: WebSocket): Att[] {
    const out: Att[] = [];
    for (const w of this.ctx.getWebSockets()) {
      if (w === except) continue;
      const a = att(w);
      if (a?.hello) out.push(a);
    }
    return out;
  }

  private stats(except?: WebSocket) {
    const people = this.live(except);
    return {
      here: people.length,
      sitting: people.filter((p) => p.s === 'sit').length,
      minutes: Math.round(this.minutes),
      sits: this.sits,
      world: this.world,
      worldAt: this.worldAt(),
    };
  }

  private broadcast(msg: unknown, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const w of this.ctx.getWebSockets()) {
      if (w === except || !att(w)?.hello) continue;
      try {
        w.send(data);
      } catch {
        /* ignore */
      }
    }
  }

  private broadcastStats(except?: WebSocket) {
    this.broadcast({ t: 'stats', ...this.stats(except) }, except);
  }

  private room = 'main';

  async fetch(req: Request): Promise<Response> {
    this.room = req.headers.get('X-Room') ?? 'main';
    await this.ctx.storage.put('room', this.room);
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
    const all = this.ctx.getWebSockets();
    if (all.length >= MAX_ROOM) return new Response('Hall is full', { status: 503 });
    const k = new URL(req.url).searchParams.get('k');
    const loadTest = !!this.env.LOAD_TEST_KEY && k === this.env.LOAD_TEST_KEY;
    if (!loadTest && all.filter((w) => att(w)?.ip === ip).length >= MAX_PER_IP) {
      return new Response('Too many connections', { status: 429 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const a: Att = {
      id: crypto.randomUUID().slice(0, 8),
      ip,
      pid: '',
      inv: '',
      c: 0,
      sd: 0,
      pt: 0,
      po: [],
      bl: -1,
      bu: 0,
      x: 0,
      z: 17,
      ry: Math.PI,
      s: 'idle',
      since: 0,
      hello: false,
      win: 0,
      n: 0,
      ring: 0,
      addr: '',
      g: false,
      sp: false,
      nm: '',
      ct: 0,
      cw: 0,
      cc: 0,
      lx: '',
      dq: true,
      dk: '',
      dl: 0,
      de: 0,
      dw: 0,
      dn: 0,
      hid: 0,
      hs: 0,
      wf: '',
      wt: 0,
    };
    server.serializeAttachment(a);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > MAX_BYTES) return;
    const a = att(ws);
    if (!a) return;
    const now = Date.now();
    if (now - a.win > 1000) {
      a.win = now;
      a.n = 0;
    }
    a.n++;
    // save the counter for EVERY message (rejected / unknown ones too), or they would never be limited
    ws.serializeAttachment(a);
    if (a.n > MAX_PER_SEC) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;

    if (isNear(this.env) && typeof m.t === 'string' && (NEAR_BLOCKED_WS.has(m.t) || (m.t === 'bless' && m.order !== undefined))) return;
    if (!isNear(this.env) && typeof m.t === 'string' && NEAR_ONLY_WS.has(m.t)) return;
    if (typeof m.t === 'string' && NEAR_ONLY_WS.has(m.t)) {
      if (!a.hello || !a.pid || !this.env.ECONOMY) return;
      return this.valley(ws, a, m, now);
    }
    switch (m.t) {
      case 'vis': {
        // the app was hidden / shown (backgrounded on a phone). Hidden time does not count toward a sit.
        if (!a.hello) return;
        const hidden = m.h === true;
        if (hidden && !a.hs) a.hs = now;
        else if (!hidden && a.hs) {
          const stretch = now - a.hs;
          const hideStart = a.hs;
          a.hs = 0;
          if (a.s === 'sit') {
            a.hid += stretch;
            // a long hidden stretch ends the sit at the moment the app was hidden
            if (stretch > ECONOMY[edition(this.env.EDITION)].hideEndsSitMin * minuteMs(this.env.MINUTE_MS)) {
              a.hid -= stretch;
              await this.endSit(ws, a, hideStart);
              ws.serializeAttachment(a);
              this.broadcast({ t: 's', id: a.id, s: 'idle' });
              this.broadcast({ t: 'stats', ...this.stats() });
              send(ws, { t: 'sitEnded', why: 'hidden' });
              return;
            }
          }
        }
        ws.serializeAttachment(a);
        return;
      }
      case 'hello': {
        if (a.hello) return; // once per connection (re-hello = fake joins / invite farming)
        a.c = Math.max(0, Math.min(COLORS - 1, Math.floor(num(m.color))));
        a.sd = Math.floor(num(m.seed)) >>> 0;
        [a.x, a.z] = clampPos(num(m.x, 0), num(m.z, 17));
        a.ry = angle(num(m.ry, Math.PI));
        if (m.s === 'sit' && a.s !== 'sit') {
          a.s = 'sit';
          a.since = now;
          a.hid = 0;
          a.hs = 0;
        }
        if (typeof m.pid === 'string' && PID_RE.test(m.pid)) a.pid = m.pid;
        a.dq = m.dq !== false;
        a.nm = cleanPlayerName(m.name) || defaultName(a.sd);
        a.inv = a.pid ? await inviteId(a.pid) : '';
        const b = a.pid ? await this.ctx.storage.get<{ f: number; u: number }>(`bless:${a.pid}`) : undefined;
        [a.bl, a.bu] = b && b.u > now ? [b.f, b.u] : [-1, 0];
        // optional wallet session -> gold light for verified Seeker owners, supporter halo
        const addr = await readSession(this.env.SESSION_SECRET, m.session);
        if (addr) {
          const p = await ledger(this.env).profile(addr);
          a.addr = addr;
          a.g = p.seeker;
          a.sp = p.supporter;
        }
        // pets are bought: only show one this visitor owns
        a.po = await this.ownedPets(a);
        const want = petIdx(m.pet);
        a.pt = a.po.includes(want) ? want : 0;
        const room = (await this.ctx.storage.get<string>('room')) ?? this.room;
        if (room === 'seeker' && !a.g) {
          send(ws, { t: 'denied', reason: 'The Seeker hall is for verified Seeker owners.' });
          ws.close(4003, 'seeker only');
          return;
        }
        const invites = a.pid ? await ledger(this.env).invites(a.pid) : 0;
        a.hello = true;
        ws.serializeAttachment(a);
        await this.rollDay();
        send(ws, {
          t: 'welcome',
          you: a.id,
          now,
          room,
          invites,
          me: { g: a.g, sp: a.sp, bl: a.bl, bu: a.bu, pt: a.pt, pets: a.po, inv: a.inv, petNos: await ledger(this.env).petNumbers(a.pid, a.addr) },
          players: this.live(ws).map(pub),
          lanterns: await this.lanterns(),
          chat: this.chatLog.filter((c) => now - c.at < 30 * 60000),
          stats: this.stats(),
        });
        this.broadcast({ t: 'join', p: pub(a) }, ws);
        if (isNear(this.env) && this.env.ECONOMY && a.pid) {
          const E = economy(this.env);
          const stale = await E.openWish(a.pid);
          if (stale) await E.cancelWish(a.pid, stale);
          await E.touch(a.pid);
          await E.start();
          const account = await E.linkedAccount(a.pid);
          send(ws, { t: 'econ', ...(await E.state(a.pid)), ...(await E.book(a.pid)), near: account });
          if (account) {
            // the name of a logged-in player is their NEAR account, set by the server (players can't type a '.near' name)
            a.nm = nearName(account);
            ws.serializeAttachment(a);
            this.broadcast({ t: 'nm', id: a.id, nm: a.nm });
          }
        }
        // arrived through a friend's "sit with me" link?
        // `with` is the inviter's public invite id (a hash of their visitor id), never the visitor id itself
        if (typeof m.with === 'string' && PID_RE.test(m.with) && m.with !== a.inv) {
          const host = this.ctx.getWebSockets().find((w) => w !== ws && att(w)?.hello && att(w)?.inv === m.with);
          const h = host && att(host);
          if (host && h) {
            send(ws, { t: 'friendHere', id: h.id, x: r2(h.x), z: r2(h.z) });
            const count = a.pid ? await ledger(this.env).recordInvite(h.pid, a.pid, a.ip) : 0;
            send(host, { t: 'friend', id: a.id, invites: count });
          } else send(ws, { t: 'friendAway' });
        }
        this.broadcast({ t: 'stats', ...this.stats() }, ws);
        return;
      }
      case 'move': {
        if (!a.hello) return;
        [a.x, a.z] = clampPos(num(m.x, a.x), num(m.z, a.z));
        a.ry = angle(num(m.ry, a.ry));
        if (a.wf) {
          const f = frenById(a.wf);
          if (f && dist(a, f) > CO_REACH) await this.cancelWish(ws, a, 'walked away');
        }
        ws.serializeAttachment(a);
        this.broadcast({ t: 'm', id: a.id, x: r2(a.x), z: r2(a.z), ry: r2(a.ry) }, ws);
        return;
      }
      case 'state': {
        if (!a.hello) return;
        const s: SitState = m.s === 'sit' ? 'sit' : 'idle';
        if (s === a.s) return;
        if (a.s === 'sit') await this.endSit(ws, a, now);
        if (s === 'idle' && a.wf) await this.cancelWish(ws, a, 'stood up');
        a.s = s;
        a.since = s === 'sit' ? now : 0;
        if (s === 'sit') {
          a.hid = 0;
          a.hs = 0;
        }
        if (s === 'sit') await this.maybeWorld(now, a.pid || a.id);
        if (s === 'sit') await this.duelDrop(a, 'sit'); // a sit cancels a duel that hasn't locked yet
        ws.serializeAttachment(a);
        this.broadcast({ t: 's', id: a.id, s }, ws);
        this.broadcast({ t: 'stats', ...this.stats() });
        return;
      }
      case 'profile': {
        // after signing in or tipping: refresh this person's gold light / supporter halo
        const addr = await readSession(this.env.SESSION_SECRET, m.session);
        if (!addr) return;
        const p = await ledger(this.env).profile(addr);
        a.addr = addr;
        a.g = p.seeker;
        a.sp = p.supporter;
        a.po = await ledger(this.env).ownedPets(a.pid, a.addr); // pets bought with this wallet on another device
        ws.serializeAttachment(a);
        this.broadcast({ t: 'p', id: a.id, g: a.g, sp: a.sp });
        send(ws, { t: 'pets', pets: a.po, pt: a.pt, petNos: await ledger(this.env).petNumbers(a.pid, a.addr) });
        return;
      }
      case 'lantern': {
        if (!a.hello) return;
        await this.lightLantern(ws, a, m);
        return;
      }
      case 'spots': {
        // someone bought a stone or tree: tell everyone to refresh the garden/grove
        if (!a.hello || now - a.ring < 3000) return;
        a.ring = now;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'spots' });
        return;
      }
      case 'pet': {
        // choose / change your pet (free)
        if (!a.hello) return;
        const k = petIdx(m.k);
        if (k === a.pt) return;
        if (k && !a.po.includes(k)) {
          a.po = await this.ownedPets(a); // maybe just bought (or rescued) it
          if (!a.po.includes(k)) return send(ws, { t: 'petNo', k, reason: 'Adopt this pet first.' });
        }
        a.pt = k;
        send(ws, { t: 'pets', pets: a.po, pt: a.pt, petNos: await ledger(this.env).petNumbers(a.pid, a.addr) });
        ws.serializeAttachment(a);
        this.broadcast({ t: 'pt', id: a.id, k }, ws);
        return;
      }
      case 'bless': {
        if (!a.hello) return;
        await this.bless(ws, a, m);
        return;
      }
      case 'emote': {
        if (!a.hello || (m.e !== 'bow' && m.e !== 'greet' && m.e !== 'pat')) return;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'e', id: a.id, e: m.e }, ws);
        return;
      }
      case 'name': {
        if (!a.hello || now - a.ct < 3000) return;
        const nm = cleanPlayerName(m.name) || defaultName(a.sd);
        a.ct = now;
        if (nm === a.nm) return void ws.serializeAttachment(a);
        a.nm = nm;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'nm', id: a.id, nm });
        return;
      }
      case 'chat': {
        if (!a.hello) return;
        const x = cleanChat(m.x);
        if (!x) return;
        // slow mode: 1 line / 1.5 s, 6 lines / 20 s, no repeats within 30 s
        if (now - a.cw > 20000) {
          a.cw = now;
          a.cc = 0;
        }
        if (now - a.ct < 1500 || a.cc >= 6) return send(ws, { t: 'chatNo', reason: 'Slow down a little 🍵' });
        if (x === a.lx && now - a.ct < 30000) return send(ws, { t: 'chatNo', reason: 'You just said that.' });
        a.ct = now;
        a.cc++;
        a.lx = x;
        ws.serializeAttachment(a);
        if (typeof m.to === 'string' && m.to) {
          // whisper: only the two of you see it
          const to = this.ctx.getWebSockets().find((w) => w !== ws && att(w)?.hello && att(w)?.id === m.to);
          const b = to && att(to);
          if (!to || !b) return send(ws, { t: 'chatNo', reason: 'They left.' });
          const c = { t: 'c', id: a.id, n: a.nm, x, w: b.id, wn: b.nm, at: now };
          send(to, c);
          send(ws, c);
          return;
        }
        const c = { t: 'c' as const, id: a.id, n: a.nm, x, at: now };
        this.chatLog.push(c);
        if (this.chatLog.length > 25) this.chatLog.shift();
        this.broadcast(c);
        return;
      }
      case 'dq': {
        if (!a.hello) return;
        a.dq = !!m.on;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'dq', id: a.id, on: a.dq }, ws);
        return;
      }
      case 'duel_ask': {
        if (!a.hello) return;
        if (isNear(this.env) && !(await this.nearLoggedIn(a))) return send(ws, { t: 'duel_no', why: 'Log in with NEAR to duel.', login: true });
        await this.duelAsk(ws, a, m);
        ws.serializeAttachment(a); // keep the invite counter
        return;
      }
      case 'duel_ans': {
        if (!a.hello) return;
        // a guest can always say no; accepting needs a login (guests are not challenged, see duelAsk)
        if (isNear(this.env) && m.ok === true && !(await this.nearLoggedIn(a))) return send(ws, { t: 'duel_no', why: 'Log in with NEAR to duel.', login: true });
        await this.duelAns(ws, a, m);
        return;
      }
      case 'duel_cancel': {
        if (!a.hello) return;
        await this.duelDrop(a, 'cancel');
        ws.serializeAttachment(a);
        return;
      }
      case 'ring': {
        if (!a.hello || now - a.ring < 5000) return;
        a.ring = now;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'ring', id: a.id, what: m.what === 'bowl' ? 'bowl' : 'bell' }, ws);
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.drop(ws);
    try {
      ws.close(1000, 'bye');
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.drop(ws);
  }

  private async drop(ws: WebSocket) {
    const a = att(ws);
    if (!a?.hello) return;
    if (a.s === 'sit') await this.endSit(null, a, a.hs || Date.now());
    if (a.wf) await this.cancelWish(null, a, 'left');
    await this.duelDrop(a, 'left');
    a.hello = false;
    a.s = 'idle';
    try {
      ws.serializeAttachment(a);
    } catch {
      /* closed */
    }
    this.broadcast({ t: 'leave', id: a.id }, ws);
    this.broadcastStats(ws);
  }
}
